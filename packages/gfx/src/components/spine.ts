/**
 * WebGL Spine component — renders the whole skeleton as ONE continuous mesh.
 *
 * Unlike the canvas-2d renderer (which clips each attachment's triangles
 * separately and therefore shows dark seams at attachment boundaries against a
 * dark background), WebGL draws every attachment's triangles into a single
 * vertex/UV buffer and submits it in one draw call. There is no per-triangle
 * clipping, so the black rings around mouth/nose/eyes/chest disappear — the
 * same approach nikkeviewer.com uses.
 *
 * The mesh is rebuilt every animation frame (the viewer's tick loop already
 * calls `state.apply()`), flattening shared vertices into a triangle list
 * (the `mesh` component has no index buffer).
 */

import { com, toValue, type Mountable, type HostHooks } from '@rasenjs/core'
import type { PropValue } from '@rasenjs/core'
import { element } from './element'
import { clipTriangleToPolygon, makePolygonClockwise } from './spine-clip'
import { Mat4x4f } from '@rasenjs/math'
import { createTexture } from '../utils'
import { getRenderContext } from '../render-context'
import type { GlNode } from '../node'
import type { GlContext } from '../node'
import {
  computeAttachmentWorld,
  computeAttachmentWorldVertices,
  computeClippingWorld,
  resolveRegionName,
  hitTestSpine,
  type Skeleton,
  type SpineAtlas,
  type AnimationState,
  type AttachmentData,
  type SpineEvent,
  type SpineHit
} from '@rasenjs/assets'

/**
 * Whether the atlas uses premultiplied-alpha blending.
 *
 * Nikke atlases ARE premultiplied alpha (verified: 777.png has rgb<=alpha for
 * ALL ~302k semi-transparent pixels, max(rgb-alpha)=0). The `.atlas` text
 * almost always OMITS the `pma` flag, so we must NOT rely on it being present.
 *
 * NOTE: detecting PMA by drawing the image to a 2D canvas and reading
 * `getImageData` is WRONG — the browser un-premultiplies on readback, so a
 * premultiplied PNG comes back as straight-alpha and the test fails. The only
 * reliable signals are the atlas `pma` flag (when present) or the known fact
 * that Nikke atlases are PMA. So: explicit `pma:false` → straight; everything
 * else (including an omitted flag) → premultiplied, matching the official
 * spine-webgl runtime which forces `premultipliedAlpha=true`.
 */
function isPremultipliedAtlas(at: SpineAtlas | null): boolean {
  const declared = at?.pages[0]?.pma
  return declared !== false
}

/**
 * Convert a Spine slot color (`RRGGBBAA` hex) to a 0..1 RGBA tint.
 *
 * Spine slot colors are straight-alpha. When the atlas is premultiplied alpha
 * the tint's RGB must be premultiplied by its own alpha so the blended fragment
 * stays premultiplied (otherwise alpha-faded parts render too bright / wrong).
 */
const slotColorCache = new Map<string, { r: number; g: number; b: number; a: number }>()

function slotColorToRgba(hex: string | undefined, premultiplied: boolean): { r: number; g: number; b: number; a: number } {
  const h = (hex ?? 'FFFFFFFF').padStart(8, '0')
  const key = (premultiplied ? 'p' : 's') + h
  const cached = slotColorCache.get(key)
  if (cached) return cached
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const a = parseInt(h.slice(6, 8), 16) / 255
  const out = premultiplied ? { r: r * a, g: g * a, b: b * a, a } : { r, g, b, a }
  slotColorCache.set(key, out)
  return out
}

/** Bone overlay color — matches the canvas-2d renderer's
 * `rgba(120, 170, 255, 0.35)` stroke. Straight alpha (submitted with
 * `premultiplied: false` + normal blend ≡ canvas source-over). */
const BONE_COLOR = { r: 120 / 255, g: 170 / 255, b: 255 / 255, a: 0.35 }

// Scratch buffers for the clipped path — module-level so the per-frame hot
// loop allocates nothing (usage is synchronous).
const clipTriV = new Float64Array(6)
const clipTriU = new Float64Array(6)
const clipOut: number[] = []

export interface SpineWebglProps {
  skeleton: PropValue<Skeleton | null>
  atlas: PropValue<SpineAtlas | null>
  atlasImg: PropValue<HTMLImageElement | null>
  /** All atlas page images, keyed by page file name (multi-page atlases). */
  atlasImgs?: PropValue<Map<string, HTMLImageElement> | null>
  state: PropValue<AnimationState | null>
  /** Animation name to play. Switches when the value changes. */
  animation?: PropValue<string>
  /** Skin name to apply. Switches when the value changes. */
  skin?: PropValue<string>
  /** Whether the current animation loops. Default true. */
  loop?: PropValue<boolean>
  showBones?: PropValue<boolean>
  /** Animation tick — bump to rebuild the mesh each frame. */
  frame: PropValue<number>
  width: PropValue<number>
  height: PropValue<number>
  /**
   * World-space position offset (spine-local origin → world). Defaults to 0 —
   * same convention as the other components. Under a 2D ortho camera only
   * x/y matter; under a 3D camera z places the skeleton in depth.
   */
  x?: PropValue<number>
  y?: PropValue<number>
  z?: PropValue<number>
  /** Skip the renderer's ACES tonemap (match flat reference renderers). */
  skipTonemap?: PropValue<boolean>
  /** Fired for each Spine event-timeline entry as playback passes it. */
  onEvent?: PropValue<(e: SpineEvent) => void>
  /** Fired when the active animation (re)starts. */
  onStart?: PropValue<(e: { name: string }) => void>
  /** Fired when the animation ends (`loop=false`) or at each loop boundary (`loop=true`). */
  onComplete?: PropValue<(e: { name: string; loop: boolean }) => void>
  /** Fired on pointer down — hit-tests the pointer against the posed skeleton. Null when nothing is hit. */
  onPick?: PropValue<(e: SpineWebglPickEvent | null) => void>
  /** Fired on click — hit-tests the pointer against the posed skeleton. Null when nothing is hit. */
  onClick?: PropValue<(e: SpineWebglPickEvent | null) => void>
}

/** Payload delivered to `onPick` / `onClick`. Extends the raw hit with the
 * screen-space and camera-inverted world coordinates of the pointer. */
export interface SpineWebglPickEvent extends SpineHit {
  /** Pointer X in canvas CSS pixels. */
  x: number
  /** Pointer Y in canvas CSS pixels. */
  y: number
  /** World-space X (camera-inverted). */
  worldX: number
  /** World-space Y (camera-inverted, Y-up). */
  worldY: number
}

export const spine = com((props: SpineWebglProps): Mountable<GlNode> => {
  // Rebuild the single continuous mesh every animation frame. The pose is
  // already applied by the viewer's tick loop (state.apply()), so we just
  // flatten every attachment's triangles into one vertex/UV buffer.
  //
  // Performance: UVs and triangles are STATIC per attachment, so they are
  // cached once per attachment; every frame only the world vertices are
  // recomputed (computeAttachmentWorldVertices) into a reused buffer. This
  // avoids the ~6.7ms/frame of UV remapping + array allocations that made the
  // first version lag badly.
  // attachment object → (regionKey → layout). Different slots can share the
  // same region name but have completely different mesh geometry (e.g.
  // Hair_f_5 and Hair_f_3 both resolve to "vesti/Hair_f_3" but have 38 vs 26
  // UVs). Using the attachment object as the primary cache key ensures each
  // slot's unique geometry is preserved. The secondary regionKey handles
  // Spine 4.1+ sequence attachments that swap atlas regions per frame.
  let vertexBuf = new Float32Array(0)
  let uvBuf = new Float32Array(0)
  let worldBuf = new Float32Array(0)
  let boneBuf = new Float32Array(0)
  // Model matrix for the (x, y, z) position props + the key it was built for.
  // Identity until a non-zero position is set (see buildGeometry).
  let posTransform = new Mat4x4f()
  let lastPosKey = '0|0|0'
  // verts: reusable [x, y, 0] triplet buffer for the indexed submission — one
  // per (attachment, region) layout, refilled every frame. addShape stores the
  // array REFERENCE and flush reads it before the next draw overwrites it
  // (each attachment is visited once per frame), so no per-frame copy is
  // needed. UVs and triangles are shared static arrays from the same layout.
  let layoutCache: WeakMap<object, Map<string, { uvs: Float32Array; triangles: number[]; verts: Float32Array }>> = new WeakMap()
  // slot → { attachmentName, attachment } — avoids findAttachment every frame.
  const slotAttCache = new Map<object, { name: string; att: unknown }>()
  // page file name → WebGL texture (multi-page atlases).
  const pageTextureCache = new Map<string, WebGLTexture>()
  let lastSkeleton: Skeleton | null = null

  // Build the flattened triangle list and submit one draw call per slot so
  // each slot's tint/alpha (animated by `color` timelines) and the `draworder`
  // layering are respected. Returns the total vertex count drawn (0 = empty).
  const buildGeometry = (gl: GlContext): number => {
    const sk = toValue(props.skeleton) as Skeleton | null
    const at = toValue(props.atlas) as SpineAtlas | null
    const img = toValue(props.atlasImg) as HTMLImageElement | null
    const pageImgs = toValue(props.atlasImgs) as Map<string, HTMLImageElement> | null
    if (!sk || !at || !img) return 0

    // Apply animation prop to state
    const st = toValue(props.state) as AnimationState | null
    const animName = toValue(props.animation)
    if (st && animName && st.animationNames.includes(animName)) {
      // Only switch if the current animation is different
      if (st.currentAnimation !== animName) {
        const loop = toValue(props.loop) !== false
        st.setAnimation(animName, loop)
      }
    }

    // Surface animation lifecycle + event-timeline callbacks.
    if (st) {
      st.onEvent = toValue(props.onEvent) ?? undefined
      st.onStart = toValue(props.onStart) ?? undefined
      st.onComplete = toValue(props.onComplete) ?? undefined
    }

    // Apply skin prop
    const skinName = toValue(props.skin)
    if (skinName && sk.data.skins.some(s => s.name === skinName)) {
      if (skinName !== sk.skin) {
        sk.skin = skinName
      }
    }

    // New skeleton → drop the per-attachment layout cache.
    if (sk !== lastSkeleton) {
      // WeakMap has no .clear() — reassign to a fresh instance.
      layoutCache = new WeakMap()
      slotAttCache.clear()
      pageTextureCache.clear()
      lastSkeleton = sk
    }

    // Camera is canvas-level (<canvas camera={...}>): the projection matrix in
    // the batch renderer maps world → screen. This component submits raw
    // world-space vertices and knows nothing about pan/zoom/fit.
    const renderContext = getRenderContext(gl)

    // Resolve the WebGL texture for an atlas page file name. Multi-page
    // atlases need one texture per page; the primary page is `img`.
    const textureForPage = (pageName: string): WebGLTexture => {
      const cached = pageTextureCache.get(pageName)
      if (cached) return cached
      const pageImg = pageImgs?.get(pageName) ?? img
      const tex = createTexture(gl, pageImg, { minFilter: 0x2601, magFilter: 0x2601 })
      pageTextureCache.set(pageName, tex)
      return tex
    }
    const texture = textureForPage(at.pages[0]?.name ?? '')
    // Nikke atlases are premultiplied alpha but the .atlas text omits the
    // `pma` flag, so `isPremultipliedAtlas` defaults to true (only an explicit
    // `pma:false` uses straight-alpha blending). Premultiplied data MUST use
    // premultiplied-alpha blending or semi-transparent edges (eye sockets,
    // mouth, chest) render as dark fringes.
    const premultiplied = isPremultipliedAtlas(at)
    const skip = toValue(props.skipTonemap) === true
    // Model transform: world offset (x, y, z). addShape stores the matrix
    // REFERENCE and reads it at flush time, so a changed position builds a
    // fresh instance instead of mutating the batched one. The default (0,0,0)
    // reuses one identity instance — zero allocations in the common path
    // (30k+ addShape calls per frame at 200 instances).
    const px = toValue(props.x) ?? 0
    const py = toValue(props.y) ?? 0
    const pz = toValue(props.z) ?? 0
    const posKey = px + '|' + py + '|' + pz
    if (posKey !== lastPosKey) {
      const m = new Mat4x4f()
      m.source[12] = px
      m.source[13] = py
      m.source[14] = pz
      posTransform = m
      lastPosKey = posKey
    }
    const transform = posTransform

    let total = 0
    // Spine clipping (official SkeletonClipping semantics) — same contract as
    // the canvas-2d renderer: a `clipping` attachment starts a clip that cuts
    // every subsequent drawable slot in draw order until the end slot has been
    // drawn (the end slot itself IS clipped — the reset happens after it
    // draws). Only one clip may be active; a nested clip is ignored.
    let clipPoly: number[] | null = null
    let clipEndSlotName: string | null = null
    // Iterate drawOrder (not slots): the `draworder` timeline reorders it, and
    // ignoring it paints back parts on top → ghosting / duplicated parts.
    for (const slot of sk.drawOrder) {
      const attName = slot.attachment
      // Resolve the attachment object once per (slot, name) — it is static
      // unless an animation swaps the slot's attachment.
      const cachedSlot = slotAttCache.get(slot)
      let att: unknown = null
      if (attName) {
        if (cachedSlot && cachedSlot.name === attName) {
          att = cachedSlot.att
        } else {
          att = sk.findAttachment(slot.data.name, attName)
          slotAttCache.set(slot, { name: attName, att })
        }
      }
      const attData = att as AttachmentData | null

      if (attData && attData.type === 'clipping') {
        // Official clipStart: ignore a nested clip while one is active.
        if (!clipPoly) {
          clipPoly = computeClippingWorld(attData, slot, sk)
          if (clipPoly) makePolygonClockwise(clipPoly)
          clipEndSlotName = clipPoly ? attData.end ?? null : null
        }
        continue
      }

      // clipEndWithSlot: evaluated for every non-clip slot, drawable or not.
      const endClip = clipPoly !== null && slot.data.name === clipEndSlotName

      if (!attName || !attData) {
        if (endClip) {
          clipPoly = null
          clipEndSlotName = null
        }
        continue
      }

      // Cached static layout (atlas-space UVs + triangles) for this attachment.
      // Two-level key: attachment object identity (unique per slot) → region
      // name (for sequence animations that swap regions per frame). This
      // prevents cross-contamination when two slots share the same region
      // name but have different mesh geometry (e.g. Hair_f_5 / Hair_f_3).
      const regionKey = resolveRegionName(attData, slot, sk)
      let attLayouts = layoutCache.get(attData as object)
      if (!attLayouts) {
        attLayouts = new Map()
        layoutCache.set(attData as object, attLayouts)
      }
      let layout = attLayouts.get(regionKey)
      if (!layout) {
        const geo = computeAttachmentWorld(attData, slot, sk, at, attName)
        if (geo) {
          layout = { uvs: new Float32Array(geo.uvs), triangles: geo.triangles, verts: new Float32Array(0) }
          attLayouts.set(regionKey, layout)
        }
      }
      if (!layout) {
        if (endClip) {
          clipPoly = null
          clipEndSlotName = null
        }
        continue
      }

      // Recompute only the world vertices for the current pose.
      if (worldBuf.length < layout.uvs.length) {
        worldBuf = new Float32Array(Math.max(layout.uvs.length, worldBuf.length * 2))
      }
      const vCount = computeAttachmentWorldVertices(attData, slot, sk, at, attName, worldBuf)
      if (!vCount) {
        if (endClip) {
          clipPoly = null
          clipEndSlotName = null
        }
        continue
      }

      // Unclipped path — indexed submission: unique world vertices + the
      // cached triangle table. Adjacent triangles share edges through the
      // index buffer, so the rasterizer's fill rule seals seams WITHOUT the
      // per-triangle centroid expansion the old non-indexed path needed
      // (that expansion cost a sqrt per vertex and 3× the transform/upload
      // volume). The batch renderer joins per-item index lists and draws
      // drawElements (WebGL2); WebGL1 expands the indices back into a flat
      // triangle list inside the batch transform loop.
      if (clipPoly === null) {
        const nVerts = layout.uvs.length / 2
        const needV = nVerts * 3
        // nVerts is static per layout — allocate exactly once, reuse forever.
        if (layout.verts.length !== needV) {
          layout.verts = new Float32Array(needV)
        }
        const verts = layout.verts
        for (let v = 0; v < nVerts; v++) {
          verts[v * 3] = worldBuf[2 * v]
          verts[v * 3 + 1] = worldBuf[2 * v + 1]
          verts[v * 3 + 2] = 0
        }
        // Per-slot tint/alpha (animated by `color` timelines). For a PMA atlas
        // the straight-alpha slot color must be premultiplied so the blended
        // result stays premultiplied (otherwise faded parts render too bright).
        const color = slotColorToRgba(slot.color, premultiplied)
        // Multi-page atlas: pick the texture for this attachment's region page.
        const region = at.regions[regionKey]
        const slotTexture = region ? textureForPage(region.page) : texture
        // Spine blend mode (additive/multiply/screen effects — e.g. aura, foot
        // glow, gun muzzle — must not render with normal alpha blending).
        const blendMode = slot.data.blend ?? 'normal'
        renderContext.addShape(
          'spine',
          verts,
          color,
          transform,
          layout.uvs,
          slotTexture,
          undefined,
          undefined,
          undefined,
          undefined,
          skip ? true : undefined,
          premultiplied,
          blendMode,
          layout.triangles
        )
        total += nVerts

        if (endClip) {
          clipPoly = null
          clipEndSlotName = null
        }
        continue
      }

      // Clipped path (rare): expand corners, clip against the active clip
      // polygon (Sutherland–Hodgman) and emit the resulting polygon as a
      // triangle fan. Clipped triangles share no vertices, so this stays a
      // flat non-indexed submission.
      let vi = 0
      let ui = 0
      const needV = layout.triangles.length * 3
      const needU = layout.triangles.length * 2
      if (vertexBuf.length < needV) {
        vertexBuf = new Float32Array(Math.max(needV, vertexBuf.length * 2))
      }
      if (uvBuf.length < needU) {
        uvBuf = new Float32Array(Math.max(needU, uvBuf.length * 2))
      }
      for (let t = 0; t < layout.triangles.length; t += 3) {
        const i0 = layout.triangles[t]
        const i1 = layout.triangles[t + 1]
        const i2 = layout.triangles[t + 2]
        // Expand the world triangle outward from its centroid by a sub-pixel
        // amount so adjacent triangles (and overlay sub-meshes such as the
        // blush) overlap instead of leaving a gap that shows through as a
        // thin line. UVs stay tied to the original vertex index, so no foreign
        // texels are sampled — only the drawn area grows, hiding the seam.
        const wx0 = worldBuf[2 * i0]
        const wy0 = worldBuf[2 * i0 + 1]
        const wx1 = worldBuf[2 * i1]
        const wy1 = worldBuf[2 * i1 + 1]
        const wx2 = worldBuf[2 * i2]
        const wy2 = worldBuf[2 * i2 + 1]
        const ecx = (wx0 + wx1 + wx2) / 3
        const ecy = (wy0 + wy1 + wy2) / 3
        // Centroid expansion WITHOUT per-triangle allocations: the previous
        // version allocated a closure + 2 tuple arrays + an object array per
        // triangle (~7 allocations x ~900k triangles/frame at 200 instances).
        // hypot is also 3-4x slower than sqrt; expand offset formula identical.
        const EXPAND = 0.6
        // Expand the corners outward from the centroid, then clip the
        // triangle against the active clip polygon (Sutherland–Hodgman) and
        // emit the resulting polygon as a triangle fan. The clip bounds the
        // output, so the seam-hiding expansion is harmless here.
        for (let k = 0; k < 3; k++) {
          const idx = k === 0 ? i0 : k === 1 ? i1 : i2
          const px = worldBuf[2 * idx]
          const py = worldBuf[2 * idx + 1]
          const lx = px - ecx
          const ly = py - ecy
          const len = Math.sqrt(lx * lx + ly * ly) || 1
          clipTriV[k * 2] = px + (lx / len) * EXPAND
          clipTriV[k * 2 + 1] = py + (ly / len) * EXPAND
          clipTriU[k * 2] = layout.uvs[2 * idx]
          clipTriU[k * 2 + 1] = layout.uvs[2 * idx + 1]
        }
        clipTriangleToPolygon(
          clipPoly,
          clipTriV[0], clipTriV[1], clipTriU[0], clipTriU[1],
          clipTriV[2], clipTriV[3], clipTriU[2], clipTriU[3],
          clipTriV[4], clipTriV[5], clipTriU[4], clipTriU[5],
          clipOut
        )
        const corners = clipOut.length >> 2
        for (let f = 1; f + 1 < corners; f++) {
          // Grow the output buffers as needed — clipping can add vertices.
          if (vertexBuf.length < vi + 9) {
            const cap = Math.max(vi + 9, vertexBuf.length * 2)
            const nb = new Float32Array(cap)
            nb.set(vertexBuf.subarray(0, vi))
            vertexBuf = nb
          }
          if (uvBuf.length < ui + 6) {
            const cap = Math.max(ui + 6, uvBuf.length * 2)
            const nb = new Float32Array(cap)
            nb.set(uvBuf.subarray(0, ui))
            uvBuf = nb
          }
          for (let k = 0; k < 3; k++) {
            const ci = k === 0 ? 0 : k === 1 ? f : f + 1
            vertexBuf[vi++] = clipOut[4 * ci]
            vertexBuf[vi++] = clipOut[4 * ci + 1]
            vertexBuf[vi++] = 0
            uvBuf[ui++] = clipOut[4 * ci + 2]
            uvBuf[ui++] = clipOut[4 * ci + 3]
          }
        }
      }
      if (vi === 0) {
        if (endClip) {
          clipPoly = null
          clipEndSlotName = null
        }
        continue
      }
      // Per-slot tint/alpha (animated by `color` timelines). For a PMA atlas
      // the straight-alpha slot color must be premultiplied so the blended
      // result stays premultiplied (otherwise faded parts render too bright).
      const color = slotColorToRgba(slot.color, premultiplied)
      // Multi-page atlas: pick the texture for this attachment's region page.
      const region = at.regions[regionKey]
      const slotTexture = region ? textureForPage(region.page) : texture
      // Spine blend mode (additive/multiply/screen effects — e.g. aura, foot
      // glow, gun muzzle — must not render with normal alpha blending).
      const blendMode = slot.data.blend ?? 'normal'
      renderContext.addShape(
        'spine',
        vertexBuf.slice(0, vi),
        color,
        transform,
        uvBuf.slice(0, ui),
        slotTexture,
        undefined,
        undefined,
        undefined,
        undefined,
        skip ? true : undefined,
        premultiplied,
        blendMode
      )
      total += vi / 3

      if (endClip) {
        clipPoly = null
        clipEndSlotName = null
      }
    }

    // Bone debug overlay (showBones) — same contract as the canvas-2d
    // renderer: one segment per bone from its world origin along its rotated
    // length (the a/c matrix columns), 1 spine-local unit wide (so screen
    // width tracks camera zoom, like the canvas stroke's lineWidth=1 in the
    // scaled space), rgba(120,170,255,0.35). Submitted AFTER the mesh so it
    // draws on top (painter order under the 2D ortho camera). Zero-length
    // leaf bones draw nothing, exactly like a canvas stroke would.
    if (toValue(props.showBones) === true) {
      const HALF_W = 0.5
      if (boneBuf.length < sk.bones.length * 18) {
        boneBuf = new Float32Array(sk.bones.length * 18)
      }
      let bi = 0
      for (const bone of sk.bones) {
        const len = bone.data.length ?? 0
        const dx = bone.a * len
        const dy = bone.c * len
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < 1e-6) continue
        const x0 = bone.worldX
        const y0 = bone.worldY
        const x1 = x0 + dx
        const y1 = y0 + dy
        const hx = (-dy / d) * HALF_W
        const hy = (dx / d) * HALF_W
        boneBuf[bi++] = x0 - hx; boneBuf[bi++] = y0 - hy; boneBuf[bi++] = 0
        boneBuf[bi++] = x1 - hx; boneBuf[bi++] = y1 - hy; boneBuf[bi++] = 0
        boneBuf[bi++] = x1 + hx; boneBuf[bi++] = y1 + hy; boneBuf[bi++] = 0
        boneBuf[bi++] = x0 - hx; boneBuf[bi++] = y0 - hy; boneBuf[bi++] = 0
        boneBuf[bi++] = x1 + hx; boneBuf[bi++] = y1 + hy; boneBuf[bi++] = 0
        boneBuf[bi++] = x0 + hx; boneBuf[bi++] = y0 + hy; boneBuf[bi++] = 0
      }
      if (bi > 0) {
        renderContext.addShape(
          'spine-bones',
          boneBuf.slice(0, bi),
          BONE_COLOR,
          transform,
          undefined, // uv — solid color path (u_useTexture = 0)
          undefined, // texture
          undefined, // vertexColors
          undefined, // depthWrite
          undefined, // normals
          undefined, // layer
          skip ? true : undefined,
          false, // straight-alpha color + normal blend ≡ canvas source-over @ 0.35
          'normal'
        )
        total += bi / 3
      }
    }
    return total
  }

  // Pointer picking — same contract as canvas-2d: the component registers a
  // PURE handler on the RenderContext (no DOM event API here); the host
  // adapter owns native listeners, translates to canvas-local CSS coordinates
  // and feeds rc.dispatchPointer. Registered lazily on the first draw (where
  // `gl` is available); unregistered on unmount.
  let unregisterPick: (() => void) | null = null

  const attachPick = (gl: GlContext): void => {
    if (unregisterPick) return
    const rc = getRenderContext(gl)
    const resolve = (sx: number, sy: number): SpineWebglPickEvent | null => {
      const cam = rc.camera
      const W = toValue(props.width) as number
      const H = toValue(props.height) as number
      const Z = cam?.zoom ?? 1
      const CX = cam?.x ?? 0
      const CY = cam?.y ?? 0
      // Inverse of the 2D ortho camera: world = (screen - size/2)/zoom + pan.
      const worldX = (sx - W / 2) / Z + CX
      const worldY = -(sy - H / 2) / Z + CY
      const sk = toValue(props.skeleton) as Skeleton | null
      const at = toValue(props.atlas) as SpineAtlas | null
      if (!sk || !at) return null
      // Hit-test in spine-local space: undo the component's world offset.
      const px = toValue(props.x) ?? 0
      const py = toValue(props.y) ?? 0
      const hit = hitTestSpine(sk, at, worldX - px, worldY - py)
      return hit ? { ...hit, x: sx, y: sy, worldX, worldY } : null
    }
    unregisterPick = rc.addPointerHandler((type, x, y) => {
      const hit = resolve(x, y)
      if (type === 'click') toValue(props.onClick)?.(hit)
      else toValue(props.onPick)?.(hit)
      // Consumed: this component claims all pointer events for its canvas
      // (matching the canvas-2d `hit: () => true` behaviour).
      return true
    })
  }

  const detachPick = (): void => {
    unregisterPick?.()
    unregisterPick = null
  }

  const mountable = element({
    getBounds: () => null, // full redraw

    draw: (gl) => {
      buildGeometry(gl)
      attachPick(gl)
    },

    // core's toValue tracks the Vue refs (proven by the canvas-2d renderer), so
    // `frame` changes trigger a redraw every animation frame.
    deps: () => [
      toValue(props.frame),
      toValue(props.skeleton),
      toValue(props.atlas),
      toValue(props.atlasImg),
      toValue(props.atlasImgs),
      toValue(props.animation),
      toValue(props.skin),
      toValue(props.x),
      toValue(props.y),
      toValue(props.z)
    ]
  })

  return (node: GlNode, hooks: HostHooks<GlNode> | undefined) => {
    const unmount = mountable(node, hooks)
    return () => {
      detachPick()
      unmount?.()
    }
  }
})