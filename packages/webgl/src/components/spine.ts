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
import { createTexture } from '../utils'
import { getRenderContext } from '../render-context'
import type { GlNode } from '../node'
import type { GlContext } from '../node'
import {
  computeAttachmentWorld,
  computeAttachmentWorldVertices,
  resolveRegionName,
  hitTestSpine,
  type Skeleton,
  type SpineAtlas,
  type AnimationState,
  type AttachmentData,
  type SpineEvent,
  type SpineHit
} from '@rasenjs/spine'

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
function slotColorToRgba(hex: string | undefined, premultiplied: boolean): { r: number; g: number; b: number; a: number } {
  const h = (hex ?? 'FFFFFFFF').padStart(8, '0')
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const a = parseInt(h.slice(6, 8), 16) / 255
  if (premultiplied) return { r: r * a, g: g * a, b: b * a, a }
  return { r, g, b, a }
}

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
  let layoutCache: WeakMap<object, Map<string, { uvs: Float32Array; triangles: number[] }>> = new WeakMap()
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
    const transform = { tx: 0, ty: 0, tz: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }

    let total = 0
    // Iterate drawOrder (not slots): the `draworder` timeline reorders it, and
    // ignoring it paints back parts on top → ghosting / duplicated parts.
    for (const slot of sk.drawOrder) {      const attName = slot.attachment
      if (!attName) continue
      // Resolve the attachment object once per (slot, name) — it is static
      // unless an animation swaps the slot's attachment.
      const cachedSlot = slotAttCache.get(slot)
      let att: unknown
      if (cachedSlot && cachedSlot.name === attName) {
        att = cachedSlot.att
      } else {
        att = sk.findAttachment(slot.data.name, attName)
        slotAttCache.set(slot, { name: attName, att })
      }
      if (!att) continue

      const attData = att as AttachmentData
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
        if (!geo) continue
        layout = { uvs: new Float32Array(geo.uvs), triangles: geo.triangles }
        attLayouts.set(regionKey, layout)
      }

      // Recompute only the world vertices for the current pose.
      if (worldBuf.length < layout.uvs.length) {
        worldBuf = new Float32Array(Math.max(layout.uvs.length, worldBuf.length * 2))
      }
      const vCount = computeAttachmentWorldVertices(attData, slot, sk, at, attName, worldBuf)
      if (!vCount) continue

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
        const EXPAND = 0.6
        const expand = (x: number, y: number): [number, number] => {
          const lx = x - ecx
          const ly = y - ecy
          const len = Math.hypot(lx, ly) || 1
          return [x + (lx / len) * EXPAND, y + (ly / len) * EXPAND]
        }
        const [ex0, ey0] = expand(wx0, wy0)
        const [ex1, ey1] = expand(wx1, wy1)
        const [ex2, ey2] = expand(wx2, wy2)
        const triVerts: Array<{ i: number; x: number; y: number }> = [
          { i: i0, x: ex0, y: ey0 },
          { i: i1, x: ex1, y: ey1 },
          { i: i2, x: ex2, y: ey2 }
        ]
        for (const v of triVerts) {
          // Submit in world space — the RenderContext projection matrix handles
          // pan/zoom/flip. No manual screen-space transform needed.
          vertexBuf[vi++] = v.x
          vertexBuf[vi++] = v.y
          vertexBuf[vi++] = 0
          // Atlas UVs (image-space, top-left origin) are used directly — verified
          // against the official spine-canvas renderer that no V flip is needed
          // (the WebGL texture upload already matches the atlas orientation).
          uvBuf[ui++] = layout.uvs[2 * v.i]
          uvBuf[ui++] = layout.uvs[2 * v.i + 1]
        }
      }
      if (vi === 0) continue
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
    }
    return total
  }

  // Pointer picking: GlNode has no event API, so we attach delegated DOM
  // listeners to the underlying canvas. The listener is created lazily on the
  // first draw (where `gl` is available) and removed on unmount.
  let clickHandler: ((e: PointerEvent) => void) | null = null
  let pickHandler: ((e: PointerEvent) => void) | null = null
  let pickCanvas: HTMLCanvasElement | null = null

  const attachPick = (gl: GlContext): void => {
    if (clickHandler || !gl.canvas) return
    const canvas = gl.canvas as HTMLCanvasElement
    const resolve = (e: PointerEvent): SpineWebglPickEvent | null => {
      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const cam = getRenderContext(gl).camera
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
      const hit = hitTestSpine(sk, at, worldX, worldY)
      return hit ? { ...hit, x: sx, y: sy, worldX, worldY } : null
    }
    clickHandler = (e) => toValue(props.onClick)?.(resolve(e))
    pickHandler = (e) => toValue(props.onPick)?.(resolve(e))
    canvas.addEventListener('click', clickHandler)
    canvas.addEventListener('pointerdown', pickHandler)
    pickCanvas = canvas
  }

  const detachPick = (): void => {
    if (pickCanvas && clickHandler && pickHandler) {
      pickCanvas.removeEventListener('click', clickHandler)
      pickCanvas.removeEventListener('pointerdown', pickHandler)
    }
    clickHandler = null
    pickHandler = null
    pickCanvas = null
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
      toValue(props.skin)
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