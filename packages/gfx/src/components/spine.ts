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
import { Mat4x4f } from '@rasenjs/math'
import { createTexture } from '../utils'
import { getRenderContext } from '../render-context'
import type { GlNode } from '../node'
import type { GlContext } from '../node'
import {
  computeAttachmentWorld,
  computeAttachmentWorldVertices,
  computeClippingWorld,
  getSequenceRegionName,
  resolveRegionName,
  resolveRegionTarget,
  hitTestSpine,
  clipTriangleToPolygon,
  makePolygonClockwise,
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
 * Resolve a slot's tint as 0..1 RGBA.
 *
 * Reads the runtime's numeric side-channel (slot.colorN — written by
 * setToSetupPose / color timelines, official-style numeric colors) when
 * present; falls back to parsing the hex string. Memoized PER SLOT via
 * WeakMap with string-identity check: static slots (the vast majority —
 * color timelines are rare) hit with zero string work. The previous
 * string-keyed Map allocated a fresh concat key + padStart + string hash
 * on every one of the 30k+ calls/frame. Animated slots miss (the runtime
 * writes a new hex string each frame) and re-resolve — same cost as
 * before, but only for the few slots that animate their tint.
 *
 * Spine slot colors are straight-alpha. When the atlas is premultiplied
 * alpha the tint's RGB must be premultiplied by its own alpha so the
 * blended fragment stays premultiplied (otherwise alpha-faded parts render
 * too bright / wrong).
 */
interface SlotColorSource {
  color: string
  colorN?: Float32Array
}
const slotColorMemo = new WeakMap<object, { hex: string; premul: boolean; out: { r: number; g: number; b: number; a: number } }>()

function slotColorToRgba(slot: SlotColorSource, premultiplied: boolean): { r: number; g: number; b: number; a: number } {
  const hex = slot.color
  const hit = slotColorMemo.get(slot)
  if (hit && hit.hex === hex && hit.premul === premultiplied) return hit.out
  let r: number, g: number, b: number, a: number
  const n = slot.colorN
  if (n) {
    r = n[0]; g = n[1]; b = n[2]; a = n[3]
  } else {
    const h = hex.length === 8 ? hex : hex.padStart(8, '0')
    r = parseInt(h.slice(0, 2), 16) / 255
    g = parseInt(h.slice(2, 4), 16) / 255
    b = parseInt(h.slice(4, 6), 16) / 255
    a = parseInt(h.slice(6, 8), 16) / 255
  }
  const out = premultiplied ? { r: r * a, g: g * a, b: b * a, a } : { r, g, b, a }
  slotColorMemo.set(slot, { hex, premul: premultiplied, out })
  return out
}

// Per-slot packed RGBA8 stream memo — static slots (constant color) hit with
// zero per-vertex expansion; animated slots (colorN) refill in place when the
// color changes, avoiding per-frame reallocation. Used by the fast-lane
// (beginMesh/endMesh) path to fill m.col in one Uint8Array copy.
// `version` bumps on every content refill so callers can skip re-copying an
// UNCHANGED stream into staging (the copy is only needed when the content or
// the staging base moved).
let packedStreamVersion = 0
const packedStreamMemo = new WeakMap<object, { hex: string; premul: boolean; nVerts: number; stream: Uint8Array; version: number }>()
function packedColorStream(slot: SlotColorSource, premul: boolean, nVerts: number): { stream: Uint8Array; version: number } {
  const hex = slot.color
  const hit = packedStreamMemo.get(slot)
  if (hit && hit.hex === hex && hit.premul === premul && hit.nVerts === nVerts) return hit
  // Reuse the existing buffer when the vertex count matches (animated slot
  // refill) — avoids a fresh Uint8Array allocation per frame.
  const stream = hit && hit.nVerts === nVerts ? hit.stream : new Uint8Array(nVerts * 4)
  const c = slotColorToRgba(slot, premul)
  const r8 = Math.round(c.r * 255)
  const g8 = Math.round(c.g * 255)
  const b8 = Math.round(c.b * 255)
  const a8 = Math.round(c.a * 255)
  for (let i = 0; i < nVerts; i++) {
    const o = i * 4
    stream[o] = r8
    stream[o + 1] = g8
    stream[o + 2] = b8
    stream[o + 3] = a8
  }
  const entry = { hex, premul, nVerts, stream, version: ++packedStreamVersion }
  packedStreamMemo.set(slot, entry)
  return entry
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
  let boneBuf = new Float32Array(0)
  // Model matrix for the (x, y, z) position props + the key it was built for.
  // Identity until a non-zero position is set (see buildGeometry).
  let posTransform = new Mat4x4f()
  let lastPosKey = '0|0|0'
  // Per-layout reusable [x, y, 0] triplet buffer (3 floats/vertex). computeAttachmentWorldVertices
  // writes straight into it with outStride=3, eliminating the per-frame copy from a 2-float
  // staging buffer (was ~2250 vertex writes × 200 instances = 450k/frame). addShape stores the
  // array REFERENCE and flush reads it before the next draw overwrites it (each attachment is
  // visited once per frame). UVs and triangles are shared static arrays from the same layout.
  // Cached static per-attachment draw data: atlas-space UVs + triangle list,
  // plus the vBase-offseted Uint32 index cache (rebuilt only when the staging
  // base moves — steady state: identical every frame → skip).
  type AttachmentLayout = {
    uvs: Float32Array
    triangles: number[]
    idxU32?: Uint32Array
    idxLastVBase?: number
    idxLastIBase?: number
    /** Staging-copy markers: the uv stream and the offseted index stream are
     * STATIC per layout — once copied into the shared staging at vBase/iBase
     * they stay valid until the base moves or another attachment takes the
     * range (checked against vBaseLedger). Skips ~21MB/frame of redundant
     * TypedArray.set at 200 instances. */
    uvStagedVBase?: number
    idxStagedVBase?: number
    idxStagedIBase?: number
  }
  // Per-attachment submission cache entry — everything STATIC about drawing
  // one attachment (see subCache below) plus the staged-color marker.
  type SubEntry = {
    target: AttachmentData
    seq: boolean
    /** Non-seq: resolved once at first draw. Seq: re-resolved per frame. */
    regionKey: string
    /** Non-seq: the single layout (null = not drawable). */
    layout: AttachmentLayout | null
    /** Non-seq: page texture (null = fall back to the default texture). */
    texture: WebGLTexture | null
    resolved: boolean
    /** Staged-color marker: the packed RGBA8 stream is static per slot —
     * once copied into staging at colStagedVBase with colVersion it stays
     * valid until the slot color changes (version bump) or the base moves.
     * colHex/colPremul mirror the stream's inputs so the steady-state path
     * skips the packedColorStream call entirely (one string compare). */
    colStream?: Uint8Array
    colVersion?: number
    colStagedVBase?: number
    colHex?: string
    colPremul?: boolean
    /** The staging vBase this sub's uv/index/color streams were last written
     * at. Ownership requires this to still equal the current vBase: a clipped
     * attachment reserves staging (advancing the watermark) without taking a
     * submission slot, so a sub can hold the same slot index while the base
     * shifts underneath it. */
    stagedVBase?: number
  }
  let layoutCache: WeakMap<object, Map<string, AttachmentLayout>> = new WeakMap()
  // slot → { attachmentName, attachment } — avoids findAttachment every frame.
  const slotAttCache = new Map<object, { name: string; att: unknown }>()
  // page file name → WebGL texture (multi-page atlases).
  const pageTextureCache = new Map<string, WebGLTexture>()
  let lastSkeleton: Skeleton | null = null
  // Per-attachment submission cache — everything STATIC about drawing one
  // attachment, resolved once and reused every frame: the region-naming
  // attachment (linkedmesh → parent skin search), its sequence flag, and for
  // static attachments the resolved regionKey + layout + page texture. Skips
  // per frame at high instance counts: the linkedmesh skin search, the
  // string-keyed layout Map lookup, the atlas regions lookup, and the page
  // texture lookup. Sequence attachments re-resolve their region per frame
  // (their layouts stay in the two-level layoutCache so each region's
  // geometry is still built once).
  let subCache: WeakMap<object, SubEntry> = new WeakMap()
  // Staging-range ownership, tracked POSITIONALLY: `prevSubs[k]` is the sub
  // that occupied submission slot k on the previous frame. A sub owns its
  // staged uv/index/color bytes iff it still occupies the same slot as last
  // frame (steady state: always true → every static copy is skipped).
  //
  // Why not a Map<vBase, SubEntry>: the ledger is touched twice per sealed
  // mesh per frame (181 attachments x 200 instances = 36.2k get+set per
  // frame), and measured 1.63 ms/frame versus 0.30 ms for this positional
  // form — a 1.3 ms/frame difference, i.e. a third of the whole render gap.
  //
  // Why positional identity is CORRECT where a per-sub (seq, vBase) memo is
  // not: if attachment A is hidden for a frame, the attachments after it shift
  // down and one of them takes A's vBase range. A's own memo would still claim
  // that range, so A would wrongly skip re-staging on its return. Comparing
  // the occupant of the SLOT catches it, because the slot's previous occupant
  // was the other attachment.
  let prevSubs: (SubEntry | undefined)[] = []
  /** Slot index into prevSubs for the frame currently being built. */
  let seq = 0
  /** Number of submissions recorded last frame (tails are dropped). */
  let prevCount = 0

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
      subCache = new WeakMap()
      prevSubs = []
      seq = 0
      prevCount = 0
      slotAttCache.clear()
      pageTextureCache.clear()
      lastSkeleton = sk
    }
    // Drop the previous frame's tail so a removed attachment cannot leave a
    // stale occupant behind its position, then start recording this frame.
    prevSubs.length = prevCount
    seq = 0

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

      // Per-attachment submission cache (see subCache): resolve the static
      // draw data once, reuse every frame. Sequence attachments re-resolve
      // their region per frame through the two-level layoutCache.
      let sub = subCache.get(attData as object)
      if (!sub) {
        sub = {
          target: resolveRegionTarget(attData, slot, sk),
          seq: false,
          regionKey: resolveRegionName(attData, slot, sk),
          layout: null,
          texture: null,
          resolved: false
        }
        sub.seq = !!sub.target.sequence
        subCache.set(attData as object, sub)
      }
      let regionKey: string
      let layout: AttachmentLayout | null
      let slotTexture: WebGLTexture | null
      if (sub.seq) {
        // Sequence-driven region swap — re-resolve per frame. Layouts stay
        // in the two-level cache so each region's geometry is built once.
        regionKey = getSequenceRegionName(sub.target, slot.sequenceIndex)
        let attLayouts = layoutCache.get(attData as object)
        if (!attLayouts) {
          attLayouts = new Map()
          layoutCache.set(attData as object, attLayouts)
        }
        layout = attLayouts.get(regionKey) ?? null
        if (!layout) {
          const geo = computeAttachmentWorld(attData, slot, sk, at, attName)
          if (geo) {
            layout = { uvs: new Float32Array(geo.uvs), triangles: geo.triangles, idxLastVBase: -1, idxLastIBase: -1 }
            attLayouts.set(regionKey, layout)
          }
        }
        const region = at.regions[regionKey]
        slotTexture = region ? textureForPage(region.page) : texture
      } else {
        if (!sub.resolved) {
          let attLayouts = layoutCache.get(attData as object)
          if (!attLayouts) {
            attLayouts = new Map()
            layoutCache.set(attData as object, attLayouts)
          }
          let l = attLayouts.get(sub.regionKey) ?? null
          if (!l) {
            const geo = computeAttachmentWorld(attData, slot, sk, at, attName)
            if (geo) {
              l = { uvs: new Float32Array(geo.uvs), triangles: geo.triangles, idxLastVBase: -1, idxLastIBase: -1 }
              attLayouts.set(sub.regionKey, l)
            }
          }
          const region = at.regions[sub.regionKey]
          sub.texture = region ? textureForPage(region.page) : texture
          sub.layout = l
          sub.resolved = true
        }
        regionKey = sub.regionKey
        layout = sub.layout
        slotTexture = sub.texture
      }
      if (!layout) {
        if (endClip) {
          clipPoly = null
          clipEndSlotName = null
        }
        continue
      }

      // Recompute only the world vertices for the current pose — written
      // STRAIGHT into the batch renderer's shared staging buffer (fast lane,
      // Phase 2): beginMesh reserves a vertex/index range, the world-transform
      // loop fills positions in in, uv/color/index are filled with one
      // memcpy each from per-layout caches. This eliminates the intermediate
      // layout.verts buffer AND the per-vertex re-copy pass in drawGroup.
      const nVerts = layout.uvs.length / 2
      const triCount = layout.triangles.length
      const m = renderContext.beginMesh(nVerts, triCount)
      if (!m) {
        // No batch renderer (headless/test env) — nothing to submit.
        if (endClip) {
          clipPoly = null
          clipEndSlotName = null
        }
        continue
      }
      const vCount = computeAttachmentWorldVertices(attData, slot, sk, at, attName, m.pos, 3, m.vBase * 3)
      if (!vCount) {
        // Release the unused reservation by simply not sealing it: the
        // watermark has advanced, but flush() resets it — the gap is
        // harmless because legacy/next reservations never read it.
        if (endClip) {
          clipPoly = null
          clipEndSlotName = null
        }
        continue
      }
      // Staging contract: world-space positions. computeAttachmentWorldVertices
      // emits skeleton-space vertices — add this instance's translation in
      // place (3 adds/vertex; cheaper than the legacy full-matrix pass).
      if (px !== 0 || py !== 0 || pz !== 0) {
        const base = m.vBase * 3
        for (let i = 0; i < vCount; i++) {
          const o = base + i * 3
          m.pos[o] += px
          m.pos[o + 1] += py
          m.pos[o + 2] += pz
        }
      }
      // Unclipped path — fast-lane indexed submission. Adjacent triangles
      // share edges through the index buffer, so the rasterizer's fill rule
      // seals seams WITHOUT any centroid expansion (official parity).
      if (clipPoly === null) {
        // Steady state: the same attachment lands at the same vBase/iBase
        // every frame (deterministic draw order → identical watermark
        // assignments), and the uv/index/color streams are STATIC — the
        // staging already holds this exact content, so the copies are
        // skipped. Ownership needs BOTH the same submission slot as last frame
        // (prevSubs, catches attachments appearing/disappearing) AND the same
        // staged vBase (catches a clipped neighbour shifting the watermark).
        // Positions are recomputed every frame (the pose changed) and always
        // written.
        const owned = prevSubs[seq] === sub && sub.stagedVBase === m.vBase
        prevSubs[seq] = sub
        seq++
        // uv: one memcpy from the layout's static atlas-space stream.
        if (!owned || layout.uvStagedVBase !== m.vBase) {
          m.uv.set(layout.uvs, m.vBase * 2)
          layout.uvStagedVBase = m.vBase
        }
        // indices: vBase-offseted Uint32 per layout — rewritten only when the
        // staging base moved (steady state: identical every frame → skip).
        if (layout.idxLastVBase !== m.vBase || layout.idxLastIBase !== m.iBase) {
          let u32 = layout.idxU32
          if (!u32 || u32.length !== triCount) u32 = layout.idxU32 = new Uint32Array(triCount)
          const tris = layout.triangles
          for (let i = 0; i < triCount; i++) u32[i] = tris[i] + m.vBase
          layout.idxLastVBase = m.vBase
          layout.idxLastIBase = m.iBase
        }
        if (!owned || layout.idxStagedVBase !== m.vBase || layout.idxStagedIBase !== m.iBase) {
          m.idx.set(layout.idxU32!, m.iBase)
          layout.idxStagedVBase = m.vBase
          layout.idxStagedIBase = m.iBase
        }
        // color: per-slot packed RGBA8 stream. Steady state (same hex, same
        // premul, same base, owned range): skip BOTH the packedColorStream
        // call and the staging copy — one string compare detects any color
        // timeline change (the same detector the stream memo uses).
        const hex = slot.color
        if (!owned || sub.colHex !== hex || sub.colPremul !== premultiplied || sub.colStagedVBase !== m.vBase) {
          const packed = packedColorStream(slot, premultiplied, nVerts)
          m.col.set(packed.stream, m.vBase * 4)
          sub.colStream = packed.stream
          sub.colVersion = packed.version
          sub.colStagedVBase = m.vBase
          sub.colHex = hex
          sub.colPremul = premultiplied
          // Any staging write re-stamps the base: uv/index were staged alongside.
          sub.stagedVBase = m.vBase
        }

        // Multi-page atlas texture + blend mode resolved above (sub-cache).
        // Spine blend mode (additive/multiply/screen effects — e.g. aura, foot
        // glow, gun muzzle — must not render with normal alpha blending).
        const blendMode = slot.data.blend ?? 'normal'
        renderContext.endMesh(m, nVerts, triCount, slotTexture, blendMode, premultiplied, skip === true)
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
      const triVertCap = layout.triangles.length * 3
      const triUvCap = layout.triangles.length * 2
      if (vertexBuf.length < triVertCap) {
        vertexBuf = new Float32Array(Math.max(triVertCap, vertexBuf.length * 2))
      }
      if (uvBuf.length < triUvCap) {
        uvBuf = new Float32Array(Math.max(triUvCap, uvBuf.length * 2))
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
        // World vertices live in m.pos at [vBase*3 ..] (filled by
        // computeAttachmentWorldVertices outStride=3 + outBase=vBase*3 above).
        const wv = m.vBase * 3
        const wx0 = m.pos[wv + 3 * i0]
        const wy0 = m.pos[wv + 3 * i0 + 1]
        const wx1 = m.pos[wv + 3 * i1]
        const wy1 = m.pos[wv + 3 * i1 + 1]
        const wx2 = m.pos[wv + 3 * i2]
        const wy2 = m.pos[wv + 3 * i2 + 1]
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
          const px = m.pos[wv + 3 * idx]
          const py = m.pos[wv + 3 * idx + 1]
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
      const color = slotColorToRgba(slot, premultiplied)
      // Multi-page atlas texture + blend mode resolved above (sub-cache).
      // Spine blend mode (additive/multiply/screen effects — e.g. aura, foot
      // glow, gun muzzle — must not render with normal alpha blending).
      const blendMode = slot.data.blend ?? 'normal'
      renderContext.addShape(
        'spine',
        vertexBuf.subarray(0, vi),
        color,
        transform,
        uvBuf.subarray(0, ui),
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
    // Record how many submissions this frame saw; the next frame truncates
    // prevSubs to this length before it starts recording.
    prevCount = seq

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
          boneBuf.subarray(0, bi),
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