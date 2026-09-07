/**
 * Animation playback for Spine skeletons.
 *
 * Applies Spine 4.x JSON animation timelines (bone transform, slot
 * attachment/color, IK constraints) to a {@link Skeleton} and drives pose
 * evaluation through {@link Skeleton.updateWorldTransform}.
 *
 * Curve interpolation follows Spine exactly: a `curve` array stores cubic
 * bezier control points where the X axis is normalized time [0,1] and the Y
 * axis is the actual keyframe value (value space, not normalized). For 2D
 * timelines (translate/scale/shear) the array holds 8 numbers — the first 4
 * control the X component, the last 4 the Y component.
 */

import type { Skeleton } from './skeleton'
import type { AnimationData } from '../types'

const EPSILON = 1e-6

// ---------------------------------------------------------------------------
// Keyframe helpers
// ---------------------------------------------------------------------------

// Spine JSON timelines are loosely typed; we read fields dynamically.
type RawKeyframe = any

function kfTime(kf: RawKeyframe): number {
  return typeof kf.time === 'number' ? kf.time : 0
}

// ---------------------------------------------------------------------------
// Bézier curve evaluation (Spine-compatible)
// Delegates the parameter solve to @rasenjs/math (bundled into dist by tsup,
// so the standalone viewer copy stays self-contained).
// ---------------------------------------------------------------------------

import { solveCubicBezierX } from '@rasenjs/math'

function bezierY(s: number, v0: number, v1: number, cy1: number, cy2: number): number {
  const oms = 1 - s
  return oms * oms * oms * v0 + 3 * oms * oms * s * cy1 + 3 * oms * s * s * cy2 + s * s * s * v1
}

function evalCurve1D(
  curve: unknown, f: number, v0: number, v1: number, t0: number, t1: number
): number {
  if (curve === undefined) return v0 + (v1 - v0) * f
  if (curve === 'stepped') return v0
  const c = curve as number[]
  if (c.length < 4) return v0 + (v1 - v0) * f
  const span = t1 - t0 || 1
  const ncx1 = (c[0] - t0) / span, ncx2 = (c[2] - t0) / span
  const s = solveCubicBezierX(f, ncx1, ncx2)
  return bezierY(s, v0, v1, c[1], c[3])
}

/** Evaluate the Y-axis of a 2D curve (Spine stores X handles first, then Y). */


// ---------------------------------------------------------------------------
// Scalar / value sampling across keyframes
// ---------------------------------------------------------------------------

/** Interpolated scalar across a keyframe array (using the left keyframe curve). */
function sampleScalar(
  keyframes: RawKeyframe[],
  time: number,
  getVal: (kf: RawKeyframe) => number
): number {
  if (keyframes.length === 0) return 0
  if (keyframes.length === 1) return getVal(keyframes[0])
  const t0 = kfTime(keyframes[0])
  if (time <= t0) return getVal(keyframes[0])
  const tN = kfTime(keyframes[keyframes.length - 1])
  if (time >= tN) return getVal(keyframes[keyframes.length - 1])
  let i = 0
  while (i < keyframes.length - 1 && kfTime(keyframes[i + 1]) <= time) i++
  const a = keyframes[i]
  const b = keyframes[i + 1]
  const ta = kfTime(a)
  const tb = kfTime(b)
  const span = tb - ta
  const f = span <= EPSILON ? 0 : (time - ta) / span
  const va = getVal(a)
  const vb = getVal(b)
  return evalCurve1D(a.curve, f, va, vb, ta, tb)
}

/**
 * Interpolated 2D value (e.g. translate x/y, scale x/y, shear x/y) across a
 * keyframe array. Each axis uses its OWN bezier handles from the left keyframe's
 * `curve` array: X uses indices [0..3], Y uses indices [4..7].
 */
// Per-timeline cache for the X/Y-split keyframes (see sample2D). Merged


/** Step (no interpolation) to the last keyframe with time <= t. */
/** Step function — returns the value of the latest keyframe at or before `time`.
 *  Used for discrete transitions (attachment names, bend directions). */
function sampleStep<T>(keyframes: RawKeyframe[], time: number, getVal: (kf: RawKeyframe) => T): T {
  let result = getVal(keyframes[0])
  for (const kf of keyframes) {
    if (kfTime(kf) <= time) result = getVal(kf)
    else break
  }
  return result
}

/** Parse a spine hex color "RRGGBBAA" into [r,g,b,a] (0-255). */
function parseHexColor(hex: string): [number, number, number, number] {
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
    parseInt(hex.slice(6, 8), 16),
  ]
}

/** Interpolate two hex colors "RRGGBBAA" with optional bezier curve support.
 *  Spine's ColorTimeline applies per-channel linear interpolation between
 *  keyframes, with optional bezier curves on the alpha channel. Without this
 *  the color jumps instantly (step function) → shadows appear/disappear
 *  abruptly instead of fading smoothly. */


// ---------------------------------------------------------------------------
// Timeline application
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Compiled animation cache
// ---------------------------------------------------------------------------
// applyAnimation runs EVERY frame per instance. The raw AnimationData shape
// (loosely typed keyframe objects, Object.keys walks, Map lookups, per-sample
// closures, per-call bezier normalization) costs ~100x the official runtime.
// The compile step below flattens each timeline ONCE per (animation, skeleton)
// into numeric arrays with pre-normalized bezier control points; the per-frame
// path then only touches packed numbers. See opt-plan.md.

interface Compiled1D {
  times: Float64Array
  v: Float64Array
  /** per-segment type: 0 = linear, 1 = stepped, 2 = bezier */
  types: Uint8Array
  /** per bezier segment 4 numbers: [ncx1, cy1, ncx2, cy2] (normalized to f) */
  curves: Float64Array | null
  /** Segment-lookup cache: last sampled time and its bracketing segment. */
  lastTime: number
  lastSeg: number
}

interface Compiled2D {
  /** gate time: before it the whole group keeps setup pose */
  gate: number
  /** same times array shared by both axes (non-axis-split timelines) */
  shared: boolean
  tx: Compiled1D
  ty: Compiled1D
}

interface CompiledSlot {
  slot: any
  /** attachment step timeline: {gate, times, names} | undefined */
  att?: { gate: number; times: Float64Array; names: (string | undefined)[] }
  /** color timeline compiled to numeric channels | undefined */
  color?: {
    gate: number
    times: Float64Array
    r: Float64Array
    g: Float64Array
    b: Float64Array
    a: Float64Array
    types: Uint8Array
    curves: Float64Array | null
  }
}

interface CompiledBone {
  bone: any
  rotate?: { gate: number; ch: Compiled1D; setup: number }
  translate?: { gate: number; ch: Compiled2D; setupX: number; setupY: number }
  scale?: { gate: number; ch: Compiled2D; setupX: number; setupY: number }
  shear?: { gate: number; ch: Compiled2D; setupX: number; setupY: number }
}

interface CompiledDeform {
  slotName: string
  /** attName -> compiled deform (geometry is static per skin) */
  byAttachment: Map<string, {
    deformLength: number
    times: Float64Array
    /** per keyframe vertex offsets (padded to deformLength) */
    verts: Float64Array[]
    types: Uint8Array
    curves: Float64Array | null
    /** reused output buffer — renderer consumes it synchronously each frame */
    out: Float64Array
  }>
}

interface CompiledAnim {
  bones: CompiledBone[]
  slots: CompiledSlot[]
  deform: CompiledDeform[]
  /** skin key used at compile time; rebuild if the skeleton's skin changes */
  skin: string
}

const compileCache = new WeakMap<AnimationData, Map<any, CompiledAnim>>()

function compile1D(kfs: RawKeyframe[], getVal: (kf: RawKeyframe) => number): Compiled1D {
  const n = kfs.length
  const times = new Float64Array(n)
  const v = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    times[i] = kfTime(kfs[i])
    v[i] = getVal(kfs[i])
  }
  const segCount = Math.max(0, n - 1)
  const types = new Uint8Array(segCount)
  let hasBezier = false
  let curves: Float64Array | null = null
  for (let i = 0; i < segCount; i++) {
    const curve = kfs[i].curve
    if (curve === 'stepped') {
      types[i] = 1
    } else if (Array.isArray(curve) && curve.length >= 4) {
      types[i] = 2
      hasBezier = true
    }
  }
  if (hasBezier) {
    curves = new Float64Array(segCount * 4)
    for (let i = 0; i < segCount; i++) {
      if (types[i] !== 2) continue
      const c = kfs[i].curve as number[]
      const span = (times[i + 1] - times[i]) || 1
      curves[i * 4] = (c[0] - times[i]) / span
      curves[i * 4 + 1] = c[1]
      curves[i * 4 + 2] = (c[2] - times[i]) / span
      curves[i * 4 + 3] = c[3]
    }
  }
  return { times, v, types, curves, lastTime: -1, lastSeg: -1 }
}

function compile2D(kfs: RawKeyframe[], fallback = 0): Compiled2D {
  const gate = kfTime(kfs[0])
  // X/Y-split timelines (Spine TranslateXTimeline/Y, ScaleX/Y, ShearX/Y)
  // interleave axis-tagged keyframes; each axis samples ONLY its own kfs.
  let hasAxis = false
  for (const k of kfs) { if (k.axis !== undefined) { hasAxis = true; break } }
  if (hasAxis) {
    const xk: RawKeyframe[] = []
    const yk: RawKeyframe[] = []
    for (const k of kfs) {
      if (k.axis === 'x') xk.push(k)
      else if (k.axis === 'y') yk.push(k)
    }
    return {
      gate,
      shared: false,
      tx: compile1D(xk, (k) => numOr(k.x, fallback)),
      ty: compile1D(yk, (k) => numOr(k.y, fallback))
    }
  }
  const n = kfs.length
  const times = new Float64Array(n)
  const vx = new Float64Array(n)
  const vy = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    times[i] = kfTime(kfs[i])
    vx[i] = numOr(kfs[i].x, fallback)
    vy[i] = numOr(kfs[i].y, fallback)
  }
  const segCount = Math.max(0, n - 1)
  const txTypes = new Uint8Array(segCount)
  const tyTypes = new Uint8Array(segCount)
  let hasBezier = false
  let txCurves: Float64Array | null = null
  let tyCurves: Float64Array | null = null
  for (let i = 0; i < segCount; i++) {
    const curve = kfs[i].curve
    if (curve === 'stepped') {
      txTypes[i] = 1; tyTypes[i] = 1
    } else if (Array.isArray(curve) && curve.length >= 8) {
      // Spine 2D curve: [xcx1, xcy1, xcx2, xcy2, ycx1, ycy1, ycx2, ycy2]
      // in ABSOLUTE time/value space, like evalCurve1D/evalCurve2DY.
      // X axis: evalCurve1D over c[0..3]; Y axis: evalCurve2DY over c[4..7].
      // Mirror the legacy quirk exactly: X requires len >= 4 (true here),
      // Y requires len >= 8 (true here). Note c[0..3] are the X handles.
      txTypes[i] = 2; tyTypes[i] = 2
      hasBezier = true
    } else if (Array.isArray(curve) && curve.length >= 4) {
      // legacy quirk: evalCurve1D treats len>=4 as bezier for X,
      // evalCurve2DY treats len<8 as LINEAR for Y.
      txTypes[i] = 2
      hasBezier = true
    }
  }
  if (hasBezier) {
    txCurves = new Float64Array(segCount * 4)
    for (let i = 0; i < segCount; i++) {
      if (txTypes[i] !== 2) continue
      const c = kfs[i].curve as number[]
      const span = (times[i + 1] - times[i]) || 1
      txCurves[i * 4] = (c[0] - times[i]) / span
      txCurves[i * 4 + 1] = c[1]
      txCurves[i * 4 + 2] = (c[2] - times[i]) / span
      txCurves[i * 4 + 3] = c[3]
    }
    tyCurves = new Float64Array(segCount * 4)
    for (let i = 0; i < segCount; i++) {
      if (tyTypes[i] !== 2) continue
      const c = kfs[i].curve as number[]
      const span = (times[i + 1] - times[i]) || 1
      tyCurves[i * 4] = (c[4] - times[i]) / span
      tyCurves[i * 4 + 1] = c[5]
      tyCurves[i * 4 + 2] = (c[6] - times[i]) / span
      tyCurves[i * 4 + 3] = c[7]
    }
  }
  return {
    gate,
    shared: true,
    tx: { times, v: vx, types: txTypes, curves: txCurves, lastTime: -1, lastSeg: -1 },
    ty: { times, v: vy, types: tyTypes, curves: tyCurves, lastTime: -1, lastSeg: -1 }
  }
}

function sample1D(ch: Compiled1D, time: number): number {
  const n = ch.times.length
  if (n === 0) return 0
  if (n === 1) return ch.v[0]
  if (time <= ch.times[0]) return ch.v[0]
  const last = n - 1
  if (time >= ch.times[last]) return ch.v[last]
  // binary search: largest i with times[i] <= time (times sorted ascending)
  // NOTE: a monotonic-lookup cache (lastSeg/lastTime) was benchmarked here and
  // was SLOWER than the plain binary search — timelines have so few keyframes
  // that the search loop is cheaper than the cache bookkeeping.
  let lo = 0
  let hi = last - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1
    if (ch.times[mid] <= time) lo = mid
    else hi = mid - 1
  }
  const ta = ch.times[lo]
  const tb = ch.times[lo + 1]
  const span = tb - ta
  const f = span <= EPSILON ? 0 : (time - ta) / span
  const type = ch.types[lo]
  if (type === 1) return ch.v[lo]
  if (type === 2 && ch.curves) {
    const c = lo * 4
    const s = solveCubicBezierX(f, ch.curves[c], ch.curves[c + 2])
    return bezierY(s, ch.v[lo], ch.v[lo + 1], ch.curves[c + 1], ch.curves[c + 3])
  }
  return ch.v[lo] + (ch.v[lo + 1] - ch.v[lo]) * f
}



function getCompiled(skeleton: Skeleton, anim: AnimationData): CompiledAnim {
  let perSkeleton = compileCache.get(anim)
  if (!perSkeleton) {
    perSkeleton = new Map()
    compileCache.set(anim, perSkeleton)
  }
  let compiled = perSkeleton.get(skeleton)
  if (compiled && compiled.skin === skeleton.skin) return compiled
  compiled = compileAnim(skeleton, anim)
  perSkeleton.set(skeleton, compiled)
  return compiled
}

function compileAnim(skeleton: Skeleton, anim: AnimationData): CompiledAnim {
  const out: CompiledAnim = { bones: [], slots: [], deform: [], skin: skeleton.skin }

  if (anim.bones) {
    for (const name of Object.keys(anim.bones)) {
      const bone = skeleton.boneMap.get(name)
      if (!bone) continue
      const tl = anim.bones[name]
      const e: CompiledBone = { bone }
      if (tl.rotate && tl.rotate.length) {
        e.rotate = {
          gate: kfTime(tl.rotate[0]),
          ch: compile1D(tl.rotate, (kf) => {
            const v = kf.value
            return typeof v === 'number' ? v : (typeof kf.angle === 'number' ? kf.angle : 0)
          }),
          setup: bone.data.rotation ?? 0
        }
      }
      if (tl.translate && tl.translate.length) {
        e.translate = {
          gate: kfTime(tl.translate[0]),
          ch: compile2D(tl.translate),
          setupX: bone.data.x ?? 0,
          setupY: bone.data.y ?? 0
        }
      }
      if (tl.scale && tl.scale.length) {
        e.scale = {
          gate: kfTime(tl.scale[0]),
          ch: compile2D(tl.scale, 1),
          setupX: bone.data.scaleX ?? 1,
          setupY: bone.data.scaleY ?? 1
        }
      }
      if (tl.shear && tl.shear.length) {
        e.shear = {
          gate: kfTime(tl.shear[0]),
          ch: compile2D(tl.shear),
          setupX: bone.data.shearX ?? 0,
          setupY: bone.data.shearY ?? 0
        }
      }
      out.bones.push(e)
    }
  }

  if (anim.slots) {
    for (const name of Object.keys(anim.slots)) {
      const slot = skeleton.slotMap.get(name)
      if (!slot) continue
      const tl = anim.slots[name]
      const e: CompiledSlot = { slot }
      if (tl.attachment && tl.attachment.length) {
        const times = new Float64Array(tl.attachment.length)
        const names: (string | undefined)[] = []
        for (let i = 0; i < tl.attachment.length; i++) {
          times[i] = kfTime(tl.attachment[i])
          names.push(tl.attachment[i].name)
        }
        e.att = { gate: times[0], times, names }
      }
      if (tl.color && tl.color.length) {
        const kfs = tl.color as Array<RawKeyframe & { color?: string; curve?: number[] }>
        const n = kfs.length
        const times = new Float64Array(n)
        const r = new Float64Array(n)
        const g = new Float64Array(n)
        const b = new Float64Array(n)
        const a = new Float64Array(n)
        for (let i = 0; i < n; i++) {
          times[i] = kfTime(kfs[i])
          const c = parseHexColor(kfs[i].color ?? 'FFFFFFFF')
          r[i] = c[0]; g[i] = c[1]; b[i] = c[2]; a[i] = c[3]
        }
        const segCount = Math.max(0, n - 1)
        const types = new Uint8Array(segCount)
        let hasBezier = false
        let curves: Float64Array | null = null
        for (let i = 0; i < segCount; i++) {
          const curve = kfs[i].curve
          if (curve === 'stepped') types[i] = 1
          else if (Array.isArray(curve) && curve.length >= 4) { types[i] = 2; hasBezier = true }
        }
        if (hasBezier) {
          curves = new Float64Array(segCount * 4)
          for (let i = 0; i < segCount; i++) {
            if (types[i] !== 2) continue
            const c = kfs[i].curve as number[]
            const span = (times[i + 1] - times[i]) || 1
            curves[i * 4] = (c[0] - times[i]) / span
            curves[i * 4 + 1] = c[1]
            curves[i * 4 + 2] = (c[2] - times[i]) / span
            curves[i * 4 + 3] = c[3]
          }
        }
        e.color = { gate: times[0], times, r, g, b, a, types, curves }
      }
      out.slots.push(e)
    }
  }

  const skinDeform = anim.deform?.[skeleton.skin] ?? anim.deform?.['default']
  if (skinDeform) {
    for (const slotName of Object.keys(skinDeform)) {
      const perAtt = skinDeform[slotName]
      const entry: CompiledDeform = { slotName, byAttachment: new Map() }
      for (const attName of Object.keys(perAtt)) {
        const kfs = perAtt[attName]
        if (!kfs || kfs.length === 0) continue
        // resolve attachment ONCE — geometry is static per skin
        const att = skeleton.findAttachment(slotName, attName) as any
        const attVerts = att?.vertices
        let deformLength = 0
        if (attVerts) {
          if (att.type === 'path') {
            const attBones = att.bones
            const vCount = att.vertexCount ?? 0
            deformLength = attBones ? vCount * 2 : attVerts.length
          } else {
            const attUvs = att.uvs
            if (attUvs) {
              const vertexCount = attUvs.length / 2
              const weighted = attVerts.length !== vertexCount * 2
              deformLength = weighted
                ? ((attVerts.length - vertexCount) / 4) * 2
                : attVerts.length
            }
          }
        }
        if (deformLength === 0) continue
        const n = kfs.length
        const times = new Float64Array(n)
        const verts: Float64Array[] = []
        for (let i = 0; i < n; i++) {
          times[i] = kfs[i].time
          const src: any = kfs[i].vertices
          const padded = new Float64Array(deformLength)
          // keyframe vertices may be SHORTER than deformLength (missing tail =
          // 0) or even sparse (holes) — the legacy path used `?? 0` per index.
          if (src) for (let v = 0; v < deformLength; v++) padded[v] = src[v] ?? 0
          verts.push(padded)
        }
        const segCount = Math.max(0, n - 1)
        const types = new Uint8Array(segCount)
        let hasBezier = false
        let curves: Float64Array | null = null
        for (let i = 0; i < segCount; i++) {
          const curve = kfs[i].curve
          if (curve === 'stepped') types[i] = 1
          else if (Array.isArray(curve) && curve.length >= 4) { types[i] = 2; hasBezier = true }
        }
        if (hasBezier) {
          curves = new Float64Array(segCount * 4)
          for (let i = 0; i < segCount; i++) {
            if (types[i] !== 2) continue
            const c = kfs[i].curve as number[]
            const span = (times[i + 1] - times[i]) || 1
            curves[i * 4] = (c[0] - times[i]) / span
            curves[i * 4 + 1] = c[1]
            curves[i * 4 + 2] = (c[2] - times[i]) / span
            curves[i * 4 + 3] = c[3]
          }
        }
        entry.byAttachment.set(attName, {
          deformLength, times, verts, types, curves,
          out: new Float64Array(deformLength)
        })
      }
      if (entry.byAttachment.size) out.deform.push(entry)
    }
  }

  return out
}

function applyBoneTimelines(skeleton: Skeleton, anim: AnimationData, time: number): void {
  const compiled = getCompiled(skeleton, anim)
  const bones = compiled.bones
  for (let i = 0, n = bones.length; i < n; i++) {
    const e = bones[i]
    const b = e.bone
    const rot = e.rotate
    if (rot && time >= rot.gate) {
      b.rotation = rot.setup + sample1D(rot.ch, time)
    }
    const tr = e.translate
    if (tr && time >= tr.gate) {
      b.x = tr.setupX + sample1D(tr.ch.tx, time)
      b.y = tr.setupY + sample1D(tr.ch.ty, time)
    }
    const sc = e.scale
    if (sc && time >= sc.gate) {
      b.scaleX = sc.setupX * sample1D(sc.ch.tx, time)
      b.scaleY = sc.setupY * sample1D(sc.ch.ty, time)
    }
    const sh = e.shear
    if (sh && time >= sh.gate) {
      b.shearX = sh.setupX + sample1D(sh.ch.tx, time)
      b.shearY = sh.setupY + sample1D(sh.ch.ty, time)
    }
  }
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === 'number' ? v : fallback
}

function applySlotTimelines(skeleton: Skeleton, anim: AnimationData, time: number): void {
  const compiled = getCompiled(skeleton, anim)
  const slots = compiled.slots
  for (let i = 0, n = slots.length; i < n; i++) {
    const e = slots[i]
    const slot = e.slot
    if (e.att && time >= e.att.gate) {
      // step: last keyframe with time <= time
      const times = e.att.times
      let lo = 0
      let hi = times.length - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >>> 1
        if (times[mid] <= time) lo = mid
        else hi = mid - 1
      }
      slot.attachment = e.att.names[lo]
    }
    const color = e.color
    if (color && time >= color.gate) {
      slot.color = sampleCompiledColor(color, time)
    }
  }
}

function sampleCompiledColor(
  color: NonNullable<CompiledSlot['color']>,
  time: number
): string {
  const times = color.times
  const n = times.length
  if (n === 1) return toHexColor(color.r[0], color.g[0], color.b[0], color.a[0])
  // CRITICAL: clamp/short-circuit at endpoints.
  //
  // Binary search below returns the largest i with times[i] <= time. For
  // time < times[0] the search still returns lo = 0, which would give a
  // NEGATIVE pct and overflow lerp() past 0xFF into multi-character hex
  // (e.g. `FFFFFF9F6` — reproduced on c412 arm_l1 at t < first kf 0.867s).
  // For time > times[n-1] the search returns kf0 = n-2 with pct > 1 and
  // the same overflow. The official Spine ColorTimeline guards with an
  // early-return; here we mimic that with explicit endpoint handling so any
  // future regression (shifted gates, off-by-one) can never produce
  // garbage colors.
  let kf0: number
  if (time <= times[0]) {
    kf0 = 0
  } else if (time >= times[n - 1]) {
    kf0 = n - 2
  } else {
    let lo = 0
    let hi = n - 2
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1
      if (times[mid] <= time) lo = mid
      else hi = mid - 1
    }
    kf0 = lo
  }
  const t0 = times[kf0]
  const t1 = times[kf0 + 1]
  const span = t1 - t0
  let pct = span > 0 ? (time - t0) / span : 0
  if (pct < 0) pct = 0
  else if (pct > 1) pct = 1
  const type = color.types[kf0]
  if (type === 1) {
    pct = 0
  } else if (type === 2 && color.curves) {
    // Original: pct = evalCurve1D(kf0.curve, pct, 0, 1, t0, t1) — bezier in
    // unit value space with Y handles cy1 = curves[c+1], cy2 = curves[c+3].
    const c = kf0 * 4
    const s = solveCubicBezierX(pct, color.curves[c], color.curves[c + 2])
    const oms = 1 - s
    pct = 3 * oms * oms * s * color.curves[c + 1] + 3 * oms * s * s * color.curves[c + 3] + s * s * s
  }
  const r = Math.round(color.r[kf0] + (color.r[kf0 + 1] - color.r[kf0]) * pct)
  const g = Math.round(color.g[kf0] + (color.g[kf0 + 1] - color.g[kf0]) * pct)
  const b = Math.round(color.b[kf0] + (color.b[kf0 + 1] - color.b[kf0]) * pct)
  const a = Math.round(color.a[kf0] + (color.a[kf0 + 1] - color.a[kf0]) * pct)
  return toHexColor(r, g, b, a)
}

function toHexColor(r: number, g: number, b: number, a: number): string {
  return (
    r.toString(16).padStart(2, '0') +
    g.toString(16).padStart(2, '0') +
    b.toString(16).padStart(2, '0') +
    a.toString(16).padStart(2, '0')
  ).toUpperCase()
}

/**
 * Apply the `draworder` timeline: reorder {@link Skeleton.drawOrder} relative
 * to the setup order. Mirrors Spine's `DrawOrderTimeline.apply` EXACTLY — the
 * offsets are expanded into a full draw-order-to-setup-index array (official
 * `SkeletonBinary` algorithm) and then assigned positionally. A naive
 * splice-per-offset approach is WRONG when multiple offsets interact: moving
 * one slot shifts the array, so later offsets land at the wrong index (visible
 * as wrong stacking order / duplicated "ghost" parts, e.g. eyes).
 */
function applyDrawOrder(skeleton: Skeleton, anim: AnimationData, time: number): void {
  const draworder = anim.draworder
  if (!draworder || draworder.length === 0) return
  if (time < kfTime(draworder[0])) return
  // Last keyframe with time <= `time`.
  let frame = draworder[0]
  for (const d of draworder) {
    if (d.time <= time) frame = d
    else break
  }
  const slots = skeleton.slots
  const slotCount = slots.length
  const drawOrder = skeleton.drawOrder
  // Build the full draw-order-to-setup-index array (official algorithm).
  const order = new Array<number>(slotCount).fill(-1)
  const unchanged: number[] = []
  let originalIndex = 0
  const offsets = frame.offsets ?? []
  for (const off of offsets) {
    const slotIndex = slots.findIndex((s) => s.data.name === off.slot)
    if (slotIndex === -1) continue
    while (originalIndex !== slotIndex) unchanged.push(originalIndex++)
    order[slotIndex + off.offset] = slotIndex
    originalIndex++
  }
  while (originalIndex < slotCount) unchanged.push(originalIndex++)
  let unchangedIndex = unchanged.length
  for (let i = slotCount - 1; i >= 0; i--) {
    if (order[i] === -1) order[i] = unchanged[--unchangedIndex]
  }
  for (let i = 0; i < slotCount; i++) drawOrder[i] = slots[order[i]]
}

function applyIkTimelines(skeleton: Skeleton, anim: AnimationData, time: number): void {
  const ik = anim.ik
  if (!ik) return
  for (const name of Object.keys(ik)) {
    const constraint = skeleton.ikConstraints.find((c) => c.data.name === name)
    if (!constraint) continue
    const kfs = ik[name]
    if (!kfs || kfs.length === 0) continue
    // Skip if time is before the first keyframe — use setup pose values.
    if (time < kfTime(kfs[0])) continue
    if (kfs.some((k) => (k as RawKeyframe).mix !== undefined)) {
      constraint.mix = sampleScalar(kfs, time, (k) => numOr((k as RawKeyframe).mix, constraint.mix))
    }
    if (kfs.some((k) => (k as RawKeyframe).softness !== undefined)) {
      constraint.softness = sampleScalar(kfs, time, (k) => numOr((k as RawKeyframe).softness, constraint.softness))
    }
    if (kfs.some((k) => (k as RawKeyframe).bendPositive !== undefined)) {
      constraint.bendPositive = sampleStep(kfs, time, (k) => (k as RawKeyframe).bendPositive as boolean)
    }
    if (kfs.some((k) => (k as RawKeyframe).bendDirection !== undefined)) {
      constraint.bendDirection = sampleStep(kfs, time, (k) => (k as RawKeyframe).bendDirection as number)
      constraint.bendPositive = constraint.bendDirection >= 0
    }
  }
}

function applyTransformTimelines(skeleton: Skeleton, anim: AnimationData, time: number): void {
  const transform = anim.transform
  if (!transform) return
  for (const name of Object.keys(transform)) {
    const constraint = skeleton.transformConstraints.find((c) => c.data.name === name)
    if (!constraint) continue
    const kfs = transform[name]
    if (!kfs || kfs.length === 0) continue
    if (time < kfTime(kfs[0])) continue
    if (kfs.some((k) => (k as RawKeyframe).mixRotate !== undefined)) {
      constraint.mixRotate = sampleScalar(kfs, time, (k) => numOr((k as RawKeyframe).mixRotate, constraint.mixRotate))
    }
    if (kfs.some((k) => (k as RawKeyframe).mixX !== undefined)) {
      constraint.mixX = sampleScalar(kfs, time, (k) => numOr((k as RawKeyframe).mixX, constraint.mixX))
    }
    if (kfs.some((k) => (k as RawKeyframe).mixY !== undefined)) {
      constraint.mixY = sampleScalar(kfs, time, (k) => numOr((k as RawKeyframe).mixY, constraint.mixY))
    }
    if (kfs.some((k) => (k as RawKeyframe).mixScaleX !== undefined)) {
      constraint.mixScaleX = sampleScalar(kfs, time, (k) => numOr((k as RawKeyframe).mixScaleX, constraint.mixScaleX))
    }
    if (kfs.some((k) => (k as RawKeyframe).mixScaleY !== undefined)) {
      constraint.mixScaleY = sampleScalar(kfs, time, (k) => numOr((k as RawKeyframe).mixScaleY, constraint.mixScaleY))
    }
    if (kfs.some((k) => (k as RawKeyframe).mixShearY !== undefined)) {
      constraint.mixShearY = sampleScalar(kfs, time, (k) => numOr((k as RawKeyframe).mixShearY, constraint.mixShearY))
    }
  }
}

// ---------------------------------------------------------------------------
// Path constraint timelines
// ---------------------------------------------------------------------------

function applyPathTimelines(skeleton: Skeleton, anim: AnimationData, time: number): void {
  const path = anim.path
  if (!path) return
  for (const constraintName of Object.keys(path)) {
    const constraint = skeleton.pathConstraints.find((c) => c.data.name === constraintName)
    if (!constraint) continue
    const timelines = path[constraintName]
    if (!timelines) continue
    if (timelines.position && timelines.position.length && time >= kfTime(timelines.position[0])) {
      constraint.position = sampleScalar(timelines.position, time, (k) => numOr((k as RawKeyframe).position, constraint.position))
    }
    if (timelines.spacing && timelines.spacing.length && time >= kfTime(timelines.spacing[0])) {
      constraint.spacing = sampleScalar(timelines.spacing, time, (k) => numOr((k as RawKeyframe).spacing, constraint.spacing))
    }
    if (timelines.mix && timelines.mix.length && time >= kfTime(timelines.mix[0])) {
      constraint.mixRotate = sampleScalar(timelines.mix, time, (k) => numOr((k as RawKeyframe).mixRotate ?? (k as RawKeyframe).rotateMix, constraint.mixRotate))
      constraint.mixX = sampleScalar(timelines.mix, time, (k) => numOr((k as RawKeyframe).mixX ?? (k as RawKeyframe).translateMix, constraint.mixX))
      constraint.mixY = sampleScalar(timelines.mix, time, (k) => numOr((k as RawKeyframe).mixY ?? (k as RawKeyframe).translateMix, constraint.mixY))
    }
  }
}

// ---------------------------------------------------------------------------
// IK constraint solving now lives in skeleton.ts (applyIk1/applyIk2/
// applyIkConstraint) and is applied inside Skeleton.updateWorldTransform via
// the Spine update-cache ordering (see Skeleton.updateCache).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Deform (FFD) timelines
// ---------------------------------------------------------------------------

/**
 * Apply FFD (deform) timelines. For each slot whose current attachment has a
 * deform timeline in the active skin, interpolate the vertex offset array and
 * store it on `slot.deform`. The renderer adds these offsets to the local
 * (non-weighted) or world (weighted) vertex positions. Slots with no matching
 * timeline (or before the first keyframe) get `null` → setup pose.
 */
function applyDeformTimelines(skeleton: Skeleton, anim: AnimationData, time: number): void {
  // NOTE: setToSetupPose() (called by applyAnimation just before this) already
  // resets EVERY slot.deform to null — the original loop's per-slot null
  // writes for timeline-less slots are therefore redundant here.
  const compiled = getCompiled(skeleton, anim)
  const entries = compiled.deform
  if (!entries.length) return
  for (const entry of entries) {
    const slot = skeleton.slotMap.get(entry.slotName)
    if (!slot) continue
    const attName = slot.attachment
    const compiled2 = attName ? entry.byAttachment.get(attName) : undefined
    if (!compiled2) {
      slot.deform = null
      continue
    }
    const times = compiled2.times
    const n = times.length
    // Before first keyframe → setup (no deform).
    if (time < times[0]) {
      slot.deform = null
      continue
    }
    const out = compiled2.out
    // After the last keyframe → hold the final deform.
    if (time >= times[n - 1]) {
      const lastVerts = compiled2.verts[n - 1]
      for (let v = 0; v < compiled2.deformLength; v++) out[v] = lastVerts[v]
      slot.deform = out
      continue
    }
    // binary search: largest i with times[i] <= time (times sorted ascending)
    let lo = 0
    let hi = n - 2
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1
      if (times[mid] <= time) lo = mid
      else hi = mid - 1
    }
    const t0 = times[lo]
    const t1 = times[lo + 1]
    const span = t1 - t0
    let percent = span > 0 ? (time - t0) / span : 0
    const type = compiled2.types[lo]
    if (type === 1) percent = 0
    else if (type === 2 && compiled2.curves) {
      const c = lo * 4
      const s = solveCubicBezierX(percent, compiled2.curves[c], compiled2.curves[c + 2])
      const oms = 1 - s
      percent = oms * oms * oms * 0 + 3 * oms * oms * s * compiled2.curves[c + 1] + 3 * oms * s * s * compiled2.curves[c + 3] + s * s * s
    }
    const v0 = compiled2.verts[lo]
    const v1 = compiled2.verts[lo + 1]
    for (let v = 0; v < compiled2.deformLength; v++) {
      out[v] = v0[v] + (v1[v] - v0[v]) * percent
    }
    slot.deform = out
  }
}

// ---------------------------------------------------------------------------
// Sequence (animated texture frame) timelines
// ---------------------------------------------------------------------------

/**
 * Apply Spine 4.1+ sequence timelines. For each slot whose current attachment
 * has a sequence timeline in the active skin, compute the current frame index
 * and store it on `slot.sequenceIndex` (matching official `SequenceTimeline`).
 * The renderer resolves the frame's atlas region from this index. Slots with no
 * matching timeline (or before the first keyframe) get -1 → setupIndex.
 */
function applySequenceTimelines(skeleton: Skeleton, anim: AnimationData, time: number): void {
  const skinSequence = anim.sequence?.[skeleton.skin] ?? anim.sequence?.['default']
  if (!skinSequence) {
    for (const slot of skeleton.slots) slot.sequenceIndex = -1
    return
  }
  for (const slot of skeleton.slots) {
    const attName = slot.attachment
    const kfs = attName ? skinSequence[slot.data.name]?.[attName] : undefined
    if (!kfs || kfs.length === 0) {
      slot.sequenceIndex = -1
      continue
    }
    // Before the first keyframe → setup pose (sequenceIndex = -1 → setupIndex).
    if (time < kfs[0].time) {
      slot.sequenceIndex = -1
      continue
    }
    // Last keyframe with time <= `time`.
    let i = 0
    while (i < kfs.length - 1 && kfs[i + 1].time <= time) i++
    const kf = kfs[i]
    const before = kf.time
    const mode = kf.mode
    let index = kf.index
    const delay = kf.delay
    // Frame count comes from the attachment's sequence metadata.
    const att = slot.attachment ? skeleton.findAttachment(slot.data.name, slot.attachment) : undefined
    const seq = att && (att as unknown as { sequence?: { count: number } }).sequence
    const count = seq ? seq.count : index + 1
    if (mode !== 0) {
      index += Math.floor((time - before) / delay + 1e-5)
      switch (mode) {
        case 1: // once
          index = Math.min(count - 1, index)
          break
        case 2: // loop
          index %= count
          break
        case 3: { // pingpong
          const n = (count << 1) - 2
          index = n === 0 ? 0 : index % n
          if (index >= count) index = n - index
          break
        }
        case 4: // onceReverse
          index = Math.max(count - 1 - index, 0)
          break
        case 5: // loopReverse
          index = count - 1 - (index % count)
          break
        case 6: { // pingpongReverse
          const n = (count << 1) - 2
          index = n === 0 ? 0 : (index + count - 1) % n
          if (index >= count) index = n - index
          break
        }
      }
    }
    slot.sequenceIndex = index
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Compute the duration (seconds) of an animation from its timelines. */
export function getAnimationDuration(anim: AnimationData): number {
  // Cached: this used to be called EVERY apply() frame and the full
  // timeline scan alone accounted for ~22% of total pose-solve time.
  if (typeof anim.duration === 'number') return anim.duration
  let max = 0
  const scan = (arr?: RawKeyframe[]): void => {
    if (!arr) return
    for (const kf of arr) max = Math.max(max, kfTime(kf))
  }
  if (anim.bones) {
    for (const tl of Object.values(anim.bones)) {
      scan(tl.rotate)
      scan(tl.translate)
      scan(tl.scale)
      scan(tl.shear)
    }
  }
  if (anim.slots) {
    for (const tl of Object.values(anim.slots)) {
      scan(tl.attachment)
      scan(tl.color)
    }
  }
  if (anim.ik) for (const kfs of Object.values(anim.ik)) scan(kfs)
  if (anim.transform) for (const kfs of Object.values(anim.transform)) scan(kfs)
  if (anim.path) for (const sub of Object.values(anim.path)) for (const kfs of Object.values(sub)) scan(kfs)
  if (anim.events) for (const e of anim.events) max = Math.max(max, typeof e.time === 'number' ? e.time : 0)
  if (anim.draworder) for (const d of anim.draworder) max = Math.max(max, typeof d.time === 'number' ? d.time : 0)
  anim.duration = max
  return max
}

/**
 * Apply an animation to a skeleton at a given time.
 *
 * Resets to the setup pose, applies bone/slot/IK timelines, recomputes the
 * world transform, then solves IK constraints (which mutate bone local
 * rotations) and recomputes the world transform once more.
 */
export function applyAnimation(skeleton: Skeleton, anim: AnimationData, time: number, loop: boolean): void {
  skeleton.setToSetupPose()
  const duration = getAnimationDuration(anim)
  const t = loop && duration > 0 ? time % duration : time
  applyBoneTimelines(skeleton, anim, t)
  applySlotTimelines(skeleton, anim, t)
  applyDeformTimelines(skeleton, anim, t)
  applySequenceTimelines(skeleton, anim, t)
  applyIkTimelines(skeleton, anim, t)
  applyTransformTimelines(skeleton, anim, t)
  applyPathTimelines(skeleton, anim, t)
  applyDrawOrder(skeleton, anim, t)
  // IK + transform constraints are applied inside updateWorldTransform via the
  // Spine update-cache ordering (see Skeleton.updateCache).
  skeleton.updateWorldTransform()
}

/**
 * Minimal animation state machine. Holds a single active track and advances
 * its time; call {@link apply} each frame to pose the skeleton.
 */
/** A Spine event-timeline entry fired during playback. */
export interface SpineEvent {
  /** Time (seconds) within the animation at which the event fires. */
  time: number
  /** Event name (maps to a Spine EventData). */
  name: string
  int?: number
  float?: number
  string?: string
  volume?: number
  balance?: number
}

export class AnimationState {
  readonly skeleton: Skeleton
  private current: { name: string; anim: AnimationData; time: number; loop: boolean } | null = null
  private firedEvents = new Set<number>()
  private completed = false
  /** Fired for each Spine event-timeline entry as playback passes it. */
  onEvent?: (e: SpineEvent) => void
  /** Fired when the active animation (re)starts. */
  onStart?: (e: { name: string }) => void
  /** Fired when the animation ends (`loop=false`) or at each loop boundary (`loop=true`). */
  onComplete?: (e: { name: string; loop: boolean }) => void

  constructor(skeleton: Skeleton) {
    this.skeleton = skeleton
  }

  /** Names of all animations available on the skeleton. */
  get animationNames(): string[] {
    return Object.keys(this.skeleton.data.animations)
  }

  /** Start playing an animation. Pass `loop=false` for one-shot clips. */
  setAnimation(name: string, loop = true): void {
    const anim = this.skeleton.data.animations[name]
    if (!anim) return
    const switching = !this.current || this.current.name !== name
    this.current = { name, anim, time: 0, loop }
    this.firedEvents.clear()
    this.completed = false
    if (switching) this.onStart?.({ name })
  }

  /** Currently playing animation name, or null. */
  get currentAnimation(): string | null {
    return this.current?.name ?? null
  }

  /** Advance the active animation by `delta` seconds. */
  update(delta: number): void {
    if (!this.current) return
    const dur = getAnimationDuration(this.current.anim)
    if (dur <= 0) return
    const prev = this.current.time
    this.current.time += delta
    if (this.current.loop) {
      if (this.current.time >= dur) {
        this.onComplete?.({ name: this.current.name, loop: true })
        this.firedEvents.clear()
      }
      this.current.time = this.current.time % dur
      this.fireEvents(prev, this.current.time, dur)
    } else if (this.current.time >= dur) {
      this.current.time = dur
      if (!this.completed) {
        this.completed = true
        this.fireEvents(prev, dur, dur)
        this.onComplete?.({ name: this.current.name, loop: false })
      }
    } else {
      this.fireEvents(prev, this.current.time, dur)
    }
  }

  private fireEvents(prev: number, cur: number, dur: number): void {
    const anim = this.current?.anim
    if (!anim?.events?.length) return
    const loop = this.current!.loop
    for (let i = 0; i < anim.events.length; i++) {
      if (this.firedEvents.has(i)) continue
      const t = anim.events[i].time
      // Loop wrap: events in (prev, dur] ∪ [0, cur].
      const hit = loop
        ? (t > prev && t <= dur) || (t >= 0 && t <= cur)
        : t > prev && t <= cur
      if (hit) {
        this.firedEvents.add(i)
        this.onEvent?.(anim.events[i])
      }
    }
  }

  /** Pose the skeleton for the current animation time. */
  apply(): void {
    if (!this.current) {
      this.skeleton.setToSetupPose()
      this.skeleton.updateWorldTransform()
      return
    }
    applyAnimation(this.skeleton, this.current.anim, this.current.time, this.current.loop)
  }
}
