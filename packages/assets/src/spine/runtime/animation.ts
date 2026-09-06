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
function evalCurve2DY(
  curve: unknown, f: number, v0: number, v1: number, t0: number, t1: number
): number {
  if (curve === undefined) return v0 + (v1 - v0) * f
  if (curve === 'stepped') return v0
  const c = curve as number[]
  if (c.length < 8) return v0 + (v1 - v0) * f
  const span = t1 - t0 || 1
  const ncx1 = (c[4] - t0) / span, ncx2 = (c[6] - t0) / span
  const s = solveCubicBezierX(f, ncx1, ncx2)
  return bezierY(s, v0, v1, c[5], c[7])
}

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
function sample2D(
  keyframes: RawKeyframe[],
  time: number,
  getX: (kf: RawKeyframe) => number,
  getY: (kf: RawKeyframe) => number
): [number, number] {
  if (keyframes.length === 0) return [0, 0]
  // Merged X/Y-split timelines (Spine's TranslateXTimeline/TranslateYTimeline,
  // ScaleX/ScaleY, ShearX/ShearY) interleave X-only and Y-only keyframes. Each
  // axis must be interpolated using ONLY its own keyframes — using the merged
  // array for both axes picks the wrong neighbours (e.g. X sampled between an
  // X keyframe and a Y keyframe) and produces wrong bone positions.
  const hasAxis = keyframes.some((k) => (k as RawKeyframe).axis !== undefined)
  if (hasAxis) {
    const xs = keyframes.filter((k) => (k as RawKeyframe).axis === 'x')
    const ys = keyframes.filter((k) => (k as RawKeyframe).axis === 'y')
    const x = xs.length ? sampleScalar(xs, time, (k) => numOr((k as RawKeyframe).x, 0)) : 0
    const y = ys.length ? sampleScalar(ys, time, (k) => numOr((k as RawKeyframe).y, 0)) : 0
    return [x, y]
  }
  if (keyframes.length === 1) return [getX(keyframes[0]), getY(keyframes[0])]
  const t0 = kfTime(keyframes[0])
  if (time <= t0) return [getX(keyframes[0]), getY(keyframes[0])]
  const tN = kfTime(keyframes[keyframes.length - 1])
  if (time >= tN) return [getX(keyframes[keyframes.length - 1]), getY(keyframes[keyframes.length - 1])]
  let i = 0
  while (i < keyframes.length - 1 && kfTime(keyframes[i + 1]) <= time) i++
  const a = keyframes[i]
  const b = keyframes[i + 1]
  const ta = kfTime(a)
  const tb = kfTime(b)
  const span = tb - ta
  const f = span <= EPSILON ? 0 : (time - ta) / span
  const vax = getX(a)
  const vbx = getX(b)
  const vay = getY(a)
  const vby = getY(b)
  const x = evalCurve1D(a.curve, f, vax, vbx, ta, tb)
  const y = evalCurve2DY(a.curve, f, vay, vby, ta, tb)
  return [x, y]
}

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
function sampleColor(
  keyframes: Array<RawKeyframe & { color?: string; curve?: number[] }>,
  time: number,
  fallback: string
): string {
  if (!keyframes.length) return fallback
  // Before first keyframe → setup value.
  if (time < kfTime(keyframes[0])) return fallback
  // Find surrounding keyframes.
  let i = 0
  while (i < keyframes.length - 1 && kfTime(keyframes[i + 1]) <= time) i++
  const kf0 = keyframes[i]
  const kf1 = keyframes[i + 1]
  if (!kf1 || !kf0.color) return kf0.color ?? fallback
  const c0 = parseHexColor(kf0.color)
  const c1 = parseHexColor(kf1.color)
  const t0 = kfTime(kf0), t1 = kfTime(kf1)
  const span = t1 - t0
  let pct = span > 0 ? (time - t0) / span : 0
  if (kf0.curve) pct = evalCurve1D(kf0.curve, pct, 0, 1, t0, t1)
  const r = Math.round(c0[0] + (c1[0] - c0[0]) * pct)
  const g = Math.round(c0[1] + (c1[1] - c0[1]) * pct)
  const b = Math.round(c0[2] + (c1[2] - c0[2]) * pct)
  const a = Math.round(c0[3] + (c1[3] - c0[3]) * pct)
  return (
    r.toString(16).padStart(2, '0') +
    g.toString(16).padStart(2, '0') +
    b.toString(16).padStart(2, '0') +
    a.toString(16).padStart(2, '0')
  ).toUpperCase()
}

// ---------------------------------------------------------------------------
// Timeline application
// ---------------------------------------------------------------------------

function applyBoneTimelines(skeleton: Skeleton, anim: AnimationData, time: number): void {
  const bones = anim.bones
  if (!bones) return
  for (const name of Object.keys(bones)) {
    const bone = skeleton.boneMap.get(name)
    if (!bone) continue
    const tl = bones[name]
    // Spine timelines store values RELATIVE to the setup pose. The runtime
    // adds (translate/rotate/shear) or multiplies (scale) the animated delta
    // onto the setup value, rather than replacing it absolutely. Setup values
    // may be undefined when absent, so default them (0, or 1 for scale).
    //
    // Before the first keyframe the bone stays at its setup pose (delta = 0).
    // Applying the first keyframe value here would cause bones to jump.
    if (tl.rotate && tl.rotate.length && time >= kfTime(tl.rotate[0])) {
      bone.rotation = (bone.data.rotation ?? 0) + sampleScalar(tl.rotate, time, (kf) => {
        const v = (kf as RawKeyframe).value
        return typeof v === 'number' ? v : (typeof (kf as RawKeyframe).angle === 'number' ? (kf as RawKeyframe).angle as number : 0)
      })
    }
    if (tl.translate && tl.translate.length && time >= kfTime(tl.translate[0])) {
      const [x, y] = sample2D(tl.translate, time, (kf) => numOr((kf as RawKeyframe).x, 0), (kf) => numOr((kf as RawKeyframe).y, 0))
      bone.x = (bone.data.x ?? 0) + x
      bone.y = (bone.data.y ?? 0) + y
    }
    if (tl.scale && tl.scale.length && time >= kfTime(tl.scale[0])) {
      const [x, y] = sample2D(tl.scale, time, (kf) => numOr((kf as RawKeyframe).x, 1), (kf) => numOr((kf as RawKeyframe).y, 1))
      bone.scaleX = (bone.data.scaleX ?? 1) * x
      bone.scaleY = (bone.data.scaleY ?? 1) * y
    }
    if (tl.shear && tl.shear.length && time >= kfTime(tl.shear[0])) {
      const [x, y] = sample2D(tl.shear, time, (kf) => numOr((kf as RawKeyframe).x, 0), (kf) => numOr((kf as RawKeyframe).y, 0))
      bone.shearX = (bone.data.shearX ?? 0) + x
      bone.shearY = (bone.data.shearY ?? 0) + y
    }
  }
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === 'number' ? v : fallback
}

function applySlotTimelines(skeleton: Skeleton, anim: AnimationData, time: number): void {
  const slots = anim.slots
  if (!slots) return
  for (const name of Object.keys(slots)) {
    const slot = skeleton.slotMap.get(name)
    if (!slot) continue
    const tl = slots[name]
    if (tl.attachment && tl.attachment.length) {
      // Spine steps the attachment to the setup pose (already applied by
      // setToSetupPose) for any time BEFORE the first keyframe. Returning the
      // first keyframe's value here would wrongly show/hide the slot from t=0.
      if (time >= kfTime(tl.attachment[0])) {
        slot.attachment = sampleStep(tl.attachment, time, (kf) => (kf as RawKeyframe).name as string | undefined)
      }
    }
    if (tl.color && tl.color.length) {
      if (time >= kfTime(tl.color[0])) {
        slot.color = sampleColor(tl.color as Array<RawKeyframe & { color?: string; curve?: number[] }>, time, slot.color)
      }
    }
  }
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
  const skinDeform = anim.deform?.[skeleton.skin] ?? anim.deform?.['default']
  if (!skinDeform) {
    for (const slot of skeleton.slots) slot.deform = null
    return
  }
  for (const slot of skeleton.slots) {
    const attName = slot.attachment
    const kfs = attName ? skinDeform[slot.data.name]?.[attName] : undefined
    if (!kfs || kfs.length === 0) {
      slot.deform = null
      continue
    }
    // Deform output length = the attachment's vertex count (Spine sets
    // `deform.length = vertexCount` regardless of which keyframes have data;
    // keyframes with `end==0` mean "setup pose" = all-zero offsets).
    // Deform output length = attachment's totalInfluences * 2 (for weighted)
    // or vertexCount * 2 (= uvs.length, for non-weighted). Matches official:
    // `deformLength = weighted ? vertices.length / 3 * 2 : vertices.length`.
    // For our interleaved format: totalInfluences = (verts.length - uvs.length/2) / 4.
    const att = slot.attachment ? skeleton.findAttachment(slot.data.name, slot.attachment) : undefined
    const attVerts = att && (att as unknown as { vertices?: number[] }).vertices
    const attType = att && (att as unknown as { type?: string }).type
    let deformLength = 0
    if (attVerts) {
      if (attType === 'path') {
        // Path attachments: deform length = vertexCount * 2 (one xy pair per vertex)
        // Path attachment has bones + vertices in interleaved format.
        const attBones = (att as unknown as { bones?: number[] }).bones
        const vCount = (att as unknown as { vertexCount?: number }).vertexCount ?? 0
        if (attBones) {
          // Weighted: deform has vertexCount * 2 entries (official applies per vertex)
          deformLength = vCount * 2
        } else {
          deformLength = attVerts.length // flat xy pairs
        }
      } else {
        const attUvs = (att as unknown as { uvs?: number[] }).uvs
        if (attUvs) {
          const vertexCount = attUvs.length / 2
          const weighted = attVerts.length !== vertexCount * 2
          deformLength = weighted
            ? ((attVerts.length - vertexCount) / 4) * 2  // totalInfluences * 2
            : attVerts.length  // = uvs.length = vertexCount * 2
        }
      }
    }
    if (deformLength === 0) {
      slot.deform = null
      continue
    }
    // Before the first keyframe → setup pose (no deform).
    if (time < kfs[0].time) {
      slot.deform = null
      continue
    }
    // After the last keyframe → hold the final deform.
    const last = kfs[kfs.length - 1]
    if (time >= last.time) {
      const out = new Array<number>(deformLength)
      for (let v = 0; v < deformLength; v++) out[v] = last.vertices?.[v] ?? 0
      slot.deform = out
      continue
    }
    // Find the surrounding keyframes.
    let i = 0
    while (i < kfs.length - 1 && kfs[i + 1].time <= time) i++
    const kf0 = kfs[i]
    const kf1 = kfs[i + 1]
    const t0 = kf0.time
    const t1 = kf1.time
    const span = t1 - t0
    let percent = span > 0 ? (time - t0) / span : 0
    if (kf0.curve) percent = evalCurve1D(kf0.curve, percent, 0, 1, t0, t1)
    const v0 = kf0.vertices
    const v1 = kf1.vertices
    const out = new Array<number>(deformLength)
    for (let v = 0; v < deformLength; v++) {
      const a = v0?.[v] ?? 0
      const b = v1?.[v] ?? 0
      out[v] = a + (b - a) * percent
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
