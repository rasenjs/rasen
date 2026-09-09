/**
 * Skeleton runtime — pose evaluation for a normalized {@link SkeletonData}.
 *
 * This is the self-developed core that both Spine and DragonBones share.
 * It computes world transforms for every bone in a pose (setup or animated)
 * and resolves slot attachments. Animation playback and mesh deformation
 * build on top of this in later iterations.
 *
 * Coordinate convention follows Spine: bone local transform is
 * (x, y, rotation in degrees, scaleX, scaleY, shearX, shearY); world
 * transform is composed parent -> child. Y axis points down.
 *
 * This module also bundles the bone math (local↔world transforms) and the
 * IK / transform constraint solvers, which are internal to skeleton pose
 * evaluation. The path constraint solver lives in `./path-solver.ts`
 * because the bezier-distribution logic is large enough to deserve its own
 * file.
 */

import type { SkeletonData, BoneData } from '../types'
import { applyPathConstraint } from './path-solver'

// ---------------------------------------------------------------------------
// Angle conversion constants
// ---------------------------------------------------------------------------

/** Degrees to radians. Internal — used by bone math and the path solver. */
export const DEG2RAD = Math.PI / 180
/** Radians to degrees. Internal — used by the IK solver. */
export const RAD2DEG = 180 / Math.PI

// ---------------------------------------------------------------------------
// Runtime types — Bone, Slot and constraint runtime state.
// Live pose-evaluation data structures; not exported as setup data.
// ---------------------------------------------------------------------------

/** A live bone instance with computed world transform. */
export interface Bone {
  data: BoneData
  parent: Bone | null
  /** Local setup/pose values. */
  x: number
  y: number
  rotation: number
  scaleX: number
  scaleY: number
  shearX: number
  shearY: number
  /** Inheritance mode (Spine `transform` field). */
  transform: import('../types').BoneTransformMode
  /** Setup length (used by IK). */
  length: number
  /** Depth in the bone hierarchy (root = 0). Used to order constraints. */
  depth: number
  /** Child bones (populated after construction). */
  children: Bone[]
  /** Owning skeleton (for skeleton-level scale/position). */
  skeleton: Skeleton
  /** Applied local transform — copied from local at update start, mutated by constraints. */
  ax: number
  ay: number
  arotation: number
  ascaleX: number
  ascaleY: number
  ashearX: number
  ashearY: number
  /** Cache bookkeeping. */
  sorted: boolean
  active: boolean
  /** World transform (computed each update). */
  worldX: number
  worldY: number
  worldRotation: number
  worldScaleX: number
  worldScaleY: number
  /** 2x3 world matrix [a, b, c, d, tx, ty]. */
  a: number
  b: number
  c: number
  d: number
  tx: number
  ty: number
}

/** A live slot instance. */
export interface Slot {
  data: import('../types').SlotData
  bone: Bone
  color: string
  attachment: string | undefined
  /**
   * FFD deform vertex offsets (length = vertexCount*2) for the current pose,
   * or null when the slot is at setup pose / has no deform timeline. The
   * renderer adds these offsets to the local (non-weighted) or world
   * (weighted) vertex positions.
   */
  deform: number[] | Float64Array | null
  /**
   * Current sequence (animated texture frame) index, or -1 to use the
   * attachment's setupIndex. Driven by sequence timelines.
   */
  sequenceIndex: number
}

/** Runtime state for an IK constraint (animated by `ik` timelines). */
export interface IkConstraintRuntime {
  data: import('../types').IkConstraintData
  bones: Bone[]
  target: Bone
  mix: number
  softness: number
  bendPositive: boolean
  /** Spine bendDirection: -1, 0, or 1.  0 = positive (matches official spine). */
  bendDirection: number
  compress: boolean
  stretch: boolean
  /** Whether the constraint is currently active (cache bookkeeping). */
  active: boolean
}

/** Runtime state for a transform constraint (animated by `transform` timelines). */
export interface TransformConstraintRuntime {
  data: import('../types').TransformConstraintData
  bones: Bone[]
  target: Bone
  mixRotate: number
  mixX: number
  mixY: number
  mixScaleX: number
  mixScaleY: number
  mixShearY: number
  /** Whether the constraint is currently active (cache bookkeeping). */
  active: boolean
}

/** Runtime state for a path constraint (animated by `path` timelines). */
export interface PathConstraintRuntime {
  data: import('../types').PathConstraintData
  bones: Bone[]
  target: Slot
  position: number
  spacing: number
  mixRotate: number
  mixX: number
  mixY: number
  /** Spacing values computed each update (length = boneCount or boneCount+1). */
  spaces: number[]
  /** World positions along the path: [x, y, angle, ...] per bone + start. */
  positions: number[]
  /** World-space path vertices (reused across frames). */
  world: number[]
  /** Cumulative arc lengths of bezier segments (constant-speed mode). */
  curves: number[]
  /** Precomputed segment arc lengths from the path attachment. */
  lengths: number[]
  /** Subdivision segment lengths for constant-speed evaluation. */
  segments: number[]
  active: boolean
}

// ---------------------------------------------------------------------------
// Bone transform math — local->world composition shared by the skeleton
// update walk and the constraint solvers.
// ---------------------------------------------------------------------------

/** Compute a bone's world transform from its applied local transform. */
function boneUpdate(bone: Bone): void {
  boneUpdateWorldTransformWith(bone, bone.ax, bone.ay, bone.arotation, bone.ascaleX, bone.ascaleY, bone.ashearX, bone.ashearY)
}

/**
 * Compute the world transform using the parent bone and the specified local
 * transform. The applied transform is set to the specified local transform.
 * Child bones are not updated. Mirrors Spine's `Bone.updateWorldTransformWith`.
 */
export function boneUpdateWorldTransformWith(
  bone: Bone,
  x: number,
  y: number,
  rotation: number,
  scaleX: number,
  scaleY: number,
  shearX: number,
  shearY: number
): void {
  bone.ax = x
  bone.ay = y
  bone.arotation = rotation
  bone.ascaleX = scaleX
  bone.ascaleY = scaleY
  bone.ashearX = shearX
  bone.ashearY = shearY
  const skeleton = bone.skeleton
  const skX = skeleton.scaleX
  const skY = skeleton.scaleY
  const parent = bone.parent
  if (!parent) {
    const rotationY = rotation + 90 + shearY
    bone.a = Math.cos((rotation + shearX) * DEG2RAD) * scaleX * skX
    bone.b = Math.cos(rotationY * DEG2RAD) * scaleY * skX
    bone.c = Math.sin((rotation + shearX) * DEG2RAD) * scaleX * skY
    bone.d = Math.sin(rotationY * DEG2RAD) * scaleY * skY
    bone.worldX = x * skX + skeleton.x
    bone.worldY = y * skY + skeleton.y
    return
  }
  let pa = parent.a
  let pb = parent.b
  let pc = parent.c
  let pd = parent.d
  bone.worldX = pa * x + pb * y + parent.worldX
  bone.worldY = pc * x + pd * y + parent.worldY
  switch (bone.transform) {
    case 'normal': {
      const rotationY = rotation + 90 + shearY
      const la = Math.cos((rotation + shearX) * DEG2RAD) * scaleX
      const lb = Math.cos(rotationY * DEG2RAD) * scaleY
      const lc = Math.sin((rotation + shearX) * DEG2RAD) * scaleX
      const ld = Math.sin(rotationY * DEG2RAD) * scaleY
      bone.a = pa * la + pb * lc
      bone.b = pa * lb + pb * ld
      bone.c = pc * la + pd * lc
      bone.d = pc * lb + pd * ld
      break
    }
    case 'onlyTranslation': {
      const rotationY = rotation + 90 + shearY
      bone.a = Math.cos((rotation + shearX) * DEG2RAD) * scaleX
      bone.b = Math.cos(rotationY * DEG2RAD) * scaleY
      bone.c = Math.sin((rotation + shearX) * DEG2RAD) * scaleX
      bone.d = Math.sin(rotationY * DEG2RAD) * scaleY
      break
    }
    case 'noRotationOrReflection': {
      let s = pa * pa + pc * pc
      let prx = 0
      if (s > 1e-4) {
        s = Math.abs(pa * pd - pb * pc) / s
        pa /= skX
        pc /= skY
        pb = pc * s
        pd = pa * s
        prx = (Math.atan2(pc, pa) * 180) / Math.PI
      } else {
        pa = 0
        pc = 0
        prx = 90 - (Math.atan2(pd, pb) * 180) / Math.PI
      }
      const rx = rotation + shearX - prx
      const ry = rotation + shearY - prx + 90
      const la = Math.cos(rx * DEG2RAD) * scaleX
      const lb = Math.cos(ry * DEG2RAD) * scaleY
      const lc = Math.sin(rx * DEG2RAD) * scaleX
      const ld = Math.sin(ry * DEG2RAD) * scaleY
      bone.a = pa * la - pb * lc
      bone.b = pa * lb - pb * ld
      bone.c = pc * la + pd * lc
      bone.d = pc * lb + pd * ld
      break
    }
    case 'noScale':
    case 'noScaleOrReflection': {
      const cos = Math.cos(rotation * DEG2RAD)
      const sin = Math.sin(rotation * DEG2RAD)
      let za = (pa * cos + pb * sin) / skX
      let zc = (pc * cos + pd * sin) / skY
      let s = Math.sqrt(za * za + zc * zc)
      if (s > 1e-5) s = 1 / s
      za *= s
      zc *= s
      s = Math.sqrt(za * za + zc * zc)
      if (bone.transform === 'noScale' && pa * pd - pb * pc < 0 !== (skX < 0 !== skY < 0)) s = -s
      const r = Math.PI / 2 + Math.atan2(zc, za)
      const zb = Math.cos(r) * s
      const zd = Math.sin(r) * s
      const la = Math.cos(shearX * DEG2RAD) * scaleX
      const lb = Math.cos((90 + shearY) * DEG2RAD) * scaleY
      const lc = Math.sin(shearX * DEG2RAD) * scaleX
      const ld = Math.sin((90 + shearY) * DEG2RAD) * scaleY
      bone.a = za * la + zb * lc
      bone.b = za * lb + zb * ld
      bone.c = zc * la + zd * lc
      bone.d = zc * lb + zd * ld
      break
    }
  }
  bone.a *= skX
  bone.b *= skX
  bone.c *= skY
  bone.d *= skY
}

/** Transform a local point of `bone` into world coordinates. */
function boneLocalToWorld(bone: Bone, x: number, y: number): { x: number; y: number } {
  return {
    x: x * bone.a + y * bone.b + bone.worldX,
    y: x * bone.c + y * bone.d + bone.worldY,
  }
}

/** Recompute a bone's applied local transform from its current world transform.
 *  Exported for the path constraint solver. */
export function boneUpdateAppliedTransform(bone: Bone): void {
  const parent = bone.parent
  if (!parent) {
    bone.ax = bone.worldX - bone.skeleton.x
    bone.ay = bone.worldY - bone.skeleton.y
    bone.arotation = (Math.atan2(bone.c, bone.a) * 180) / Math.PI
    bone.ascaleX = Math.sqrt(bone.a * bone.a + bone.c * bone.c)
    bone.ascaleY = Math.sqrt(bone.b * bone.b + bone.d * bone.d)
    bone.ashearX = 0
    bone.ashearY = (Math.atan2(bone.a * bone.b + bone.c * bone.d, bone.a * bone.d - bone.b * bone.c) * 180) / Math.PI
    return
  }
  let pa = parent.a
  let pb = parent.b
  let pc = parent.c
  let pd = parent.d
  let pid = 1 / (pa * pd - pb * pc)
  let ia = pd * pid
  let ib = pb * pid
  let ic = pc * pid
  let id = pa * pid
  const dx = bone.worldX - parent.worldX
  const dy = bone.worldY - parent.worldY
  bone.ax = dx * ia - dy * ib
  bone.ay = dy * id - dx * ic
  let ra = 0
  let rb = 0
  let rc = 0
  let rd = 0
  // Spine ≤4.1: skip transformMode handling — always decompose directly.
  // Spine 4.2+: honour transformMode (noScale preserves setup rotation, etc.)
  if (bone.skeleton.useLegacyAppliedTransform || bone.transform === 'normal') {
    // Direct decomposition — same as Spine 4.1 for all transform modes.
    ra = ia * bone.a - ib * bone.c
    rb = ia * bone.b - ib * bone.d
    rc = id * bone.c - ic * bone.a
    rd = id * bone.d - ic * bone.b
  } else if (bone.transform === 'onlyTranslation') {
    ra = bone.a
    rb = bone.b
    rc = bone.c
    rd = bone.d
  } else {
    switch (bone.transform) {
      case 'noRotationOrReflection': {
        const s2 = Math.abs(pa * pd - pb * pc) / (pa * pa + pc * pc)
        const sa = pa / bone.skeleton.scaleX
        const sc = pc / bone.skeleton.scaleY
        pb = -sc * s2 * bone.skeleton.scaleX
        pd = sa * s2 * bone.skeleton.scaleY
        pid = 1 / (pa * pd - pb * pc)
        ia = pd * pid
        ib = pb * pid
        break
      }
      case 'noScale':
      case 'noScaleOrReflection': {
        const cos = Math.cos(bone.rotation * DEG2RAD)
        const sin = Math.sin(bone.rotation * DEG2RAD)
        pa = (pa * cos + pb * sin) / bone.skeleton.scaleX
        pc = (pc * cos + pd * sin) / bone.skeleton.scaleY
        let s = Math.sqrt(pa * pa + pc * pc)
        if (s > 1e-5) s = 1 / s
        pa *= s
        pc *= s
        s = Math.sqrt(pa * pa + pc * pc)
        if (bone.transform === 'noScale' && pid < 0 !== (bone.skeleton.scaleX < 0 !== bone.skeleton.scaleY < 0)) s = -s
        const r = Math.PI / 2 + Math.atan2(pc, pa)
        pb = Math.cos(r) * s
        pd = Math.sin(r) * s
        pid = 1 / (pa * pd - pb * pc)
        ia = pd * pid
        ib = pb * pid
        ic = pc * pid
        id = pa * pid
        break
      }
    }
    ra = ia * bone.a - ib * bone.c
    rb = ia * bone.b - ib * bone.d
    rc = id * bone.c - ic * bone.a
    rd = id * bone.d - ic * bone.b
  }
  bone.ashearX = 0
  bone.ascaleX = Math.sqrt(ra * ra + rc * rc)
  if (bone.ascaleX > 1e-4) {
    const det = ra * rd - rb * rc
    bone.ascaleY = det / bone.ascaleX
    bone.ashearY = (-Math.atan2(ra * rb + rc * rd, det) * 180) / Math.PI
    bone.arotation = (Math.atan2(rc, ra) * 180) / Math.PI
  } else {
    bone.ascaleX = 0
    bone.ascaleY = Math.sqrt(rb * rb + rd * rd)
    bone.ashearY = 0
    bone.arotation = 90 - (Math.atan2(rd, rb) * 180) / Math.PI
  }
}

// ---------------------------------------------------------------------------
// IK constraint solver — 1-bone and 2-bone IK (Spine-compatible).
// ---------------------------------------------------------------------------

function applyIk1(
  bone: Bone,
  targetX: number,
  targetY: number,
  compress: boolean,
  stretch: boolean,
  uniform: boolean,
  alpha: number
): void {
  const p = bone.parent
  if (!p) return
  let pa = p.a
  let pb = p.b
  let pc = p.c
  let pd = p.d
  let rotationIK = -bone.ashearX - bone.arotation
  let tx = 0
  let ty = 0
  const transform = bone.transform
  if (transform === 'onlyTranslation') {
    tx = targetX - bone.worldX
    ty = targetY - bone.worldY
  } else {
    if (transform === 'noRotationOrReflection') {
      const s = Math.abs(pa * pd - pb * pc) / Math.max(1e-4, pa * pa + pc * pc)
      const sa = pa / bone.skeleton.scaleX
      const sc = pc / bone.skeleton.scaleY
      pb = -sc * s * bone.skeleton.scaleX
      pd = sa * s * bone.skeleton.scaleY
      rotationIK += (Math.atan2(sc, sa) * 180) / Math.PI
    }
    const x = targetX - p.worldX
    const y = targetY - p.worldY
    const d = pa * pd - pb * pc
    if (Math.abs(d) <= 1e-4) {
      tx = 0
      ty = 0
    } else {
      tx = (x * pd - y * pb) / d - bone.ax
      ty = (y * pa - x * pc) / d - bone.ay
    }
  }
  rotationIK += (Math.atan2(ty, tx) * 180) / Math.PI
  if (bone.ascaleX < 0) rotationIK += 180
  if (rotationIK > 180) rotationIK -= 360
  else if (rotationIK < -180) rotationIK += 360
  let sx = bone.ascaleX
  let sy = bone.ascaleY
  if (compress || stretch) {
    if (transform === 'noScale' || transform === 'noScaleOrReflection') {
      tx = targetX - bone.worldX
      ty = targetY - bone.worldY
    }
    const b = (bone.data.length ?? 0) * sx
    const dd = Math.sqrt(tx * tx + ty * ty)
    if ((compress && dd < b) || (stretch && dd > b && b > 1e-4)) {
      const s = (dd / b - 1) * alpha + 1
      sx *= s
      if (uniform) sy *= s
    }
  }
  boneUpdateWorldTransformWith(bone, bone.ax, bone.ay, bone.arotation + rotationIK * alpha, sx, sy, bone.ashearX, bone.ashearY)
}

/** Apply a 2-bone IK constraint (ported from Spine's IkConstraint.apply2). */
function applyIk2(
  parent: Bone,
  child: Bone,
  targetX: number,
  targetY: number,
  bendDir: number,
  stretch: boolean,
  uniform: boolean,
  softness: number,
  alpha: number
): void {
  let px = parent.ax
  let py = parent.ay
  let psx = parent.ascaleX
  let psy = parent.ascaleY
  let sx = psx
  let sy = psy
  let csx = child.ascaleX
  let os1 = 0
  let os2 = 0
  let s2 = 0
  if (psx < 0) {
    psx = -psx
    os1 = 180
    s2 = -1
  } else {
    os1 = 0
    s2 = 1
  }
  if (psy < 0) {
    psy = -psy
    s2 = -s2
  }
  if (csx < 0) {
    csx = -csx
    os2 = 180
  } else {
    os2 = 0
  }
  const cx = child.ax
  let cy = 0
  let cwx = 0
  let cwy = 0
  let a = parent.a
  let b = parent.b
  let c = parent.c
  let d = parent.d
  const u = Math.abs(psx - psy) <= 1e-4
  if (!u || stretch) {
    cy = 0
    cwx = a * cx + parent.worldX
    cwy = c * cx + parent.worldY
  } else {
    cy = child.ay
    cwx = a * cx + b * cy + parent.worldX
    cwy = c * cx + d * cy + parent.worldY
  }
  const pp = parent.parent
  if (!pp) return
  a = pp.a
  b = pp.b
  c = pp.c
  d = pp.d
  let id = a * d - b * c
  const x = cwx - pp.worldX
  const y = cwy - pp.worldY
  id = Math.abs(id) <= 1e-4 ? 0 : 1 / id
  const dx = (x * d - y * b) * id - px
  const dy = (y * a - x * c) * id - py
  let l1 = Math.sqrt(dx * dx + dy * dy)
  let l2 = (child.data.length ?? 0) * csx
  let a1 = 0
  let a2 = 0
  if (l1 < 1e-4) {
    applyIk1(parent, targetX, targetY, false, stretch, false, alpha)
    boneUpdateWorldTransformWith(child, cx, cy, 0, child.ascaleX, child.ascaleY, child.ashearX, child.ashearY)
    return
  }
  const tx0 = targetX - pp.worldX
  const ty0 = targetY - pp.worldY
  let tx = (tx0 * d - ty0 * b) * id - px
  let ty = (ty0 * a - tx0 * c) * id - py
  let dd = tx * tx + ty * ty
  if (softness !== 0) {
    softness *= psx * (csx + 1) * 0.5
    const td = Math.sqrt(dd)
    const sd = td - l1 - l2 * psx + softness
    if (sd > 0) {
      let p = Math.min(1, sd / (softness * 2)) - 1
      p = (sd - softness * (1 - p * p)) / td
      tx -= p * tx
      ty -= p * ty
      dd = tx * tx + ty * ty
    }
  }
  if (u) {
    l2 *= psx
    let cos = (dd - l1 * l1 - l2 * l2) / (2 * l1 * l2)
    if (cos < -1) {
      cos = -1
      a2 = Math.PI * bendDir
    } else if (cos > 1) {
      cos = 1
      a2 = 0
      if (stretch) {
        const s = (Math.sqrt(dd) / (l1 + l2) - 1) * alpha + 1
        sx *= s
        if (uniform) sy *= s
      }
    } else {
      a2 = Math.acos(cos) * bendDir
    }
    a = l1 + l2 * cos
    b = l2 * Math.sin(a2)
    a1 = Math.atan2(ty * a - tx * b, tx * a + ty * b)
  } else {
    a = psx * l2
    b = psy * l2
    const aa = a * a
    const bb = b * b
    const ta = Math.atan2(ty, tx)
    const c0 = bb * l1 * l1 + aa * dd - aa * bb
    const c1 = -2 * bb * l1
    const c2 = bb - aa
    const disc = c1 * c1 - 4 * c2 * c0
    if (disc >= 0) {
      let q = Math.sqrt(disc)
      if (c1 < 0) q = -q
      q = -(c1 + q) * 0.5
      const r0 = q / c2
      const r1 = c0 / q
      const r = Math.abs(r0) < Math.abs(r1) ? r0 : r1
      const r0sq = dd - r * r
      if (r0sq >= 0) {
        const yy = Math.sqrt(r0sq) * bendDir
        a1 = ta - Math.atan2(yy, r)
        a2 = Math.atan2(yy / psy, (r - l1) / psx)
      } else {
        let minAngle = Math.PI
        let minX = l1 - a
        let minDist = minX * minX
        let minY = 0
        let maxAngle = 0
        let maxX = l1 + a
        let maxDist = maxX * maxX
        let maxY = 0
        const cc = (-a * l1) / (aa - bb)
        if (cc >= -1 && cc <= 1) {
          const ca = Math.acos(cc)
          const cx2 = a * Math.cos(ca) + l1
          const cy2 = b * Math.sin(ca)
          const cd = cx2 * cx2 + cy2 * cy2
          if (cd < minDist) {
            minAngle = ca
            minDist = cd
            minX = cx2
            minY = cy2
          }
          if (cd > maxDist) {
            maxAngle = ca
            maxDist = cd
            maxX = cx2
            maxY = cy2
          }
        }
        if (dd <= (minDist + maxDist) * 0.5) {
          a1 = ta - Math.atan2(minY * bendDir, minX)
          a2 = minAngle * bendDir
        } else {
          a1 = ta - Math.atan2(maxY * bendDir, maxX)
          a2 = maxAngle * bendDir
        }
      }
    } else {
      a1 = ta - Math.atan2(0, l1)
      a2 = 0
    }
  }
  const os = Math.atan2(cy, cx) * s2
  let rotation = parent.arotation
  a1 = (a1 - os) * RAD2DEG + os1 - rotation
  if (a1 > 180) a1 -= 360
  else if (a1 < -180) a1 += 360
  boneUpdateWorldTransformWith(parent, px, py, rotation + a1 * alpha, sx, sy, 0, 0)
  rotation = child.arotation
  a2 = ((a2 + os) * RAD2DEG - child.ashearX) * s2 + os2 - rotation
  if (a2 > 180) a2 -= 360
  else if (a2 < -180) a2 += 360
  boneUpdateWorldTransformWith(child, cx, cy, rotation + a2 * alpha, child.ascaleX, child.ascaleY, child.ashearX, child.ashearY)
}

/** Apply an IK constraint at its position in the update cache. */
function applyIkConstraint(constraint: IkConstraintRuntime): void {
  if (!constraint.active) return
  if (constraint.mix === 0) return
  const target = constraint.target
  const bones = constraint.bones
  switch (bones.length) {
    case 1:
      applyIk1(bones[0], target.worldX, target.worldY, constraint.compress, constraint.stretch, constraint.data.uniform ?? false, constraint.mix)
      break
    case 2:
      applyIk2(bones[0], bones[1], target.worldX, target.worldY, (constraint.bendDirection ?? 0) < 0 ? -1 : 1, constraint.stretch, constraint.data.uniform ?? false, constraint.softness, constraint.mix)
      break
  }
}

// ---------------------------------------------------------------------------
// Transform constraint solver — absolute/relative × world/local variants.
// ---------------------------------------------------------------------------

function applyTransformConstraint(constraint: TransformConstraintRuntime): void {
  if (!constraint.active) return
  if (
    constraint.mixRotate === 0 &&
    constraint.mixX === 0 &&
    constraint.mixY === 0 &&
    constraint.mixScaleX === 0 &&
    constraint.mixScaleY === 0 &&
    constraint.mixShearY === 0
  )
    return
  if (constraint.data.local) {
    if (constraint.data.relative) applyRelativeLocal(constraint)
    else applyAbsoluteLocal(constraint)
  } else {
    if (constraint.data.relative) applyRelativeWorld(constraint)
    else applyAbsoluteWorld(constraint)
  }
}

function applyAbsoluteWorld(constraint: TransformConstraintRuntime): void {
  const mixRotate = constraint.mixRotate
  const mixX = constraint.mixX
  const mixY = constraint.mixY
  const mixScaleX = constraint.mixScaleX
  const mixScaleY = constraint.mixScaleY
  const mixShearY = constraint.mixShearY
  const translate = mixX !== 0 || mixY !== 0
  const target = constraint.target
  const ta = target.a
  const tb = target.b
  const tc = target.c
  const td = target.d
  const degRadReflect = ta * td - tb * tc > 0 ? DEG2RAD : -DEG2RAD
  const offsetRotation = (constraint.data.offsetRotation ?? 0) * degRadReflect
  const offsetShearY = (constraint.data.offsetShearY ?? 0) * degRadReflect
  const bones = constraint.bones
  for (let i = 0, n = bones.length; i < n; i++) {
    const bone = bones[i]
    if (mixRotate !== 0) {
      const a = bone.a
      const b = bone.b
      const c = bone.c
      const d = bone.d
      let r = Math.atan2(tc, ta) - Math.atan2(c, a) + offsetRotation
      if (r > Math.PI) r -= Math.PI * 2
      else if (r < -Math.PI) r += Math.PI * 2
      r *= mixRotate
      const cos = Math.cos(r)
      const sin = Math.sin(r)
      bone.a = cos * a - sin * c
      bone.b = cos * b - sin * d
      bone.c = sin * a + cos * c
      bone.d = sin * b + cos * d
    }
    if (translate) {
      const temp = boneLocalToWorld(target, constraint.data.offsetX ?? 0, constraint.data.offsetY ?? 0)
      bone.worldX += (temp.x - bone.worldX) * mixX
      bone.worldY += (temp.y - bone.worldY) * mixY
    }
    if (mixScaleX !== 0) {
      let s = Math.sqrt(bone.a * bone.a + bone.c * bone.c)
      if (s !== 0) s = (s + (Math.sqrt(ta * ta + tc * tc) - s + (constraint.data.offsetScaleX ?? 0)) * mixScaleX) / s
      bone.a *= s
      bone.c *= s
    }
    if (mixScaleY !== 0) {
      let s = Math.sqrt(bone.b * bone.b + bone.d * bone.d)
      if (s !== 0) s = (s + (Math.sqrt(tb * tb + td * td) - s + (constraint.data.offsetScaleY ?? 0)) * mixScaleY) / s
      bone.b *= s
      bone.d *= s
    }
    if (mixShearY > 0) {
      const b = bone.b
      const d = bone.d
      const by = Math.atan2(d, b)
      let r = Math.atan2(td, tb) - Math.atan2(tc, ta) - (by - Math.atan2(bone.c, bone.a))
      if (r > Math.PI) r -= Math.PI * 2
      else if (r < -Math.PI) r += Math.PI * 2
      r = by + (r + offsetShearY) * mixShearY
      const s = Math.sqrt(b * b + d * d)
      bone.b = Math.cos(r) * s
      bone.d = Math.sin(r) * s
    }
    boneUpdateAppliedTransform(bone)
  }
}

function applyRelativeWorld(constraint: TransformConstraintRuntime): void {
  const mixRotate = constraint.mixRotate
  const mixX = constraint.mixX
  const mixY = constraint.mixY
  const mixScaleX = constraint.mixScaleX
  const mixScaleY = constraint.mixScaleY
  const mixShearY = constraint.mixShearY
  const translate = mixX !== 0 || mixY !== 0
  const target = constraint.target
  const ta = target.a
  const tb = target.b
  const tc = target.c
  const td = target.d
  const degRadReflect = ta * td - tb * tc > 0 ? DEG2RAD : -DEG2RAD
  const offsetRotation = (constraint.data.offsetRotation ?? 0) * degRadReflect
  const offsetShearY = (constraint.data.offsetShearY ?? 0) * degRadReflect
  const bones = constraint.bones
  for (let i = 0, n = bones.length; i < n; i++) {
    const bone = bones[i]
    if (mixRotate !== 0) {
      const a = bone.a
      const b = bone.b
      const c = bone.c
      const d = bone.d
      let r = Math.atan2(tc, ta) + offsetRotation
      if (r > Math.PI) r -= Math.PI * 2
      else if (r < -Math.PI) r += Math.PI * 2
      r *= mixRotate
      const cos = Math.cos(r)
      const sin = Math.sin(r)
      bone.a = cos * a - sin * c
      bone.b = cos * b - sin * d
      bone.c = sin * a + cos * c
      bone.d = sin * b + cos * d
    }
    if (translate) {
      const temp = boneLocalToWorld(target, constraint.data.offsetX ?? 0, constraint.data.offsetY ?? 0)
      bone.worldX += temp.x * mixX
      bone.worldY += temp.y * mixY
    }
    if (mixScaleX !== 0) {
      const s = (Math.sqrt(ta * ta + tc * tc) - 1 + (constraint.data.offsetScaleX ?? 0)) * mixScaleX + 1
      bone.a *= s
      bone.c *= s
    }
    if (mixScaleY !== 0) {
      const s = (Math.sqrt(tb * tb + td * td) - 1 + (constraint.data.offsetScaleY ?? 0)) * mixScaleY + 1
      bone.b *= s
      bone.d *= s
    }
    if (mixShearY > 0) {
      let r = Math.atan2(td, tb) - Math.atan2(tc, ta)
      if (r > Math.PI) r -= Math.PI * 2
      else if (r < -Math.PI) r += Math.PI * 2
      const b = bone.b
      const d = bone.d
      r = Math.atan2(d, b) + (r - Math.PI / 2 + offsetShearY) * mixShearY
      const s = Math.sqrt(b * b + d * d)
      bone.b = Math.cos(r) * s
      bone.d = Math.sin(r) * s
    }
    boneUpdateAppliedTransform(bone)
  }
}

function applyAbsoluteLocal(constraint: TransformConstraintRuntime): void {
  const mixRotate = constraint.mixRotate
  const mixX = constraint.mixX
  const mixY = constraint.mixY
  const mixScaleX = constraint.mixScaleX
  const mixScaleY = constraint.mixScaleY
  const mixShearY = constraint.mixShearY
  const target = constraint.target
  const bones = constraint.bones
  for (let i = 0, n = bones.length; i < n; i++) {
    const bone = bones[i]
    let rotation = bone.arotation
    if (mixRotate !== 0) {
      let r = target.arotation - rotation + (constraint.data.offsetRotation ?? 0)
      r -= (16384 - ((16384.499999999996 - r / 360) | 0)) * 360
      rotation += r * mixRotate
    }
    let x = bone.ax
    let y = bone.ay
    x += (target.ax - x + (constraint.data.offsetX ?? 0)) * mixX
    y += (target.ay - y + (constraint.data.offsetY ?? 0)) * mixY
    let scaleX = bone.ascaleX
    let scaleY = bone.ascaleY
    if (mixScaleX !== 0 && scaleX !== 0)
      scaleX = (scaleX + (target.ascaleX - scaleX + (constraint.data.offsetScaleX ?? 0)) * mixScaleX) / scaleX
    if (mixScaleY !== 0 && scaleY !== 0)
      scaleY = (scaleY + (target.ascaleY - scaleY + (constraint.data.offsetScaleY ?? 0)) * mixScaleY) / scaleY
    let shearY = bone.ashearY
    if (mixShearY !== 0) {
      let r = target.ashearY - shearY + (constraint.data.offsetShearY ?? 0)
      r -= (16384 - ((16384.499999999996 - r / 360) | 0)) * 360
      shearY += r * mixShearY
    }
    boneUpdateWorldTransformWith(bone, x, y, rotation, scaleX, scaleY, bone.ashearX, shearY)
  }
}

function applyRelativeLocal(constraint: TransformConstraintRuntime): void {
  const mixRotate = constraint.mixRotate
  const mixX = constraint.mixX
  const mixY = constraint.mixY
  const mixScaleX = constraint.mixScaleX
  const mixScaleY = constraint.mixScaleY
  const mixShearY = constraint.mixShearY
  const target = constraint.target
  const bones = constraint.bones
  for (let i = 0, n = bones.length; i < n; i++) {
    const bone = bones[i]
    const rotation = bone.arotation + (target.arotation + (constraint.data.offsetRotation ?? 0)) * mixRotate
    const x = bone.ax + (target.ax + (constraint.data.offsetX ?? 0)) * mixX
    const y = bone.ay + (target.ay + (constraint.data.offsetY ?? 0)) * mixY
    const scaleX = bone.ascaleX * ((target.ascaleX - 1 + (constraint.data.offsetScaleX ?? 0)) * mixScaleX + 1)
    const scaleY = bone.ascaleY * ((target.ascaleY - 1 + (constraint.data.offsetScaleY ?? 0)) * mixScaleY + 1)
    const shearY = bone.ashearY + (target.ashearY + (constraint.data.offsetShearY ?? 0)) * mixShearY
    boneUpdateWorldTransformWith(bone, x, y, rotation, scaleX, scaleY, bone.ashearX, shearY)
  }
}

// ---------------------------------------------------------------------------
// Skeleton class — live runtime with bone hierarchy, slot attachments,
// IK/transform/path constraints and update cache.
// ---------------------------------------------------------------------------

function makeBone(data: BoneData, parent: Bone | null, skeleton: Skeleton): Bone {
  return {
    data,
    parent,
    children: [],
    skeleton,
    x: data.x ?? 0,
    y: data.y ?? 0,
    rotation: data.rotation ?? 0,
    scaleX: data.scaleX ?? 1,
    scaleY: data.scaleY ?? 1,
    shearX: data.shearX ?? 0,
    shearY: data.shearY ?? 0,
    transform: data.transform ?? 'normal',
    length: data.length ?? 0,
    depth: 0,
    ax: 0,
    ay: 0,
    arotation: 0,
    ascaleX: 0,
    ascaleY: 0,
    ashearX: 0,
    ashearY: 0,
    sorted: false,
    active: true,
    worldX: 0,
    worldY: 0,
    worldRotation: 0,
    worldScaleX: 1,
    worldScaleY: 1,
    a: 1,
    b: 0,
    c: 0,
    d: 1,
    tx: 0,
    ty: 0,
  }
}

/**
 * Live skeleton instance.
 */
export class Skeleton {
  readonly data: SkeletonData
  readonly bones: Bone[]
  readonly slots: Slot[]
  /**
   * Slots in the order they should be drawn. Starts as a copy of {@link slots}
   * (setup order) and is reordered by the `draworder` animation timeline. The
   * renderer must iterate this array, not {@link slots}, or layering (and
   * therefore "ghosting"/duplicated parts) will be wrong.
   */
  drawOrder: Slot[]
  readonly boneMap: Map<string, Bone>
  readonly slotMap: Map<string, Slot>
  /** Runtime IK constraints (animated by `ik` timelines). */
  readonly ikConstraints: IkConstraintRuntime[]
  /** Runtime transform constraints (animated by `transform` timelines). */
  readonly transformConstraints: TransformConstraintRuntime[]
  /** Runtime path constraints (animated by `path` timelines). */
  readonly pathConstraints: PathConstraintRuntime[]
  /** Active skin name (default skin is "default"). */
  skin: string
  /**
   * Additional skins layered on top of `skin` (official Spine `addSkin`
   * semantics). NIKKE models keep accessory parts (e.g. c810's wingman pod)
   * in a separate skin that must be combined with the default one. Lookup
   * order: `skin`, then `extraSkins` in order, then the "default" skin.
   * Assign once — the animation compile cache compares by reference.
   */
  extraSkins: string[] = []
  /** Skeleton-level transform (Spine defaults: scale 1, position 0). */
  scaleX = 1
  scaleY = 1
  x = 0
  y = 0
  /** Ordered list of bones + IK constraints to update (Spine update cache). */
  /**
   * Flattened update cache. Entries are tag-dispatched (NOT closures) —
   * closures cost megamorphic calls and an object allocation per entry.
   * kind: 0 = bone update, 1 = IK constraint, 2 = transform constraint,
   *       3 = path constraint
   */
  private _updateCache: Array<{ kind: 0 | 1 | 2 | 3; bone?: Bone; ik?: IkConstraintRuntime; tc?: TransformConstraintRuntime; pc?: PathConstraintRuntime }> = []
  /**
   * When true, `updateAppliedTransform` uses the Spine 4.1 behaviour: it
   * always decomposes the world matrix without the `transformMode` switch
   * introduced in Spine 4.2.  Automatically detected from `data.version`;
   * can be overridden for edge cases.
   */
  useLegacyAppliedTransform = false

  constructor(data: SkeletonData, skin = 'default') {
    this.data = data
    this.skin = skin
    this.bones = []
    this.slots = []
    this.drawOrder = []
    this.boneMap = new Map()
    this.slotMap = new Map()
    this.ikConstraints = []
    this.transformConstraints = []
    this.pathConstraints = []

    // Auto-detect spine version for `updateAppliedTransform` behaviour.
    // Spine ≤4.1 always decomposes the world matrix; 4.2+ adds
    // `transformMode` handling that preserves setup rotation for noScale etc.
    const v = data.version ?? ''
    const major = parseInt(v) || 0
    const minor = parseInt(v.split('.')[1] || '0') || 0
    this.useLegacyAppliedTransform = major < 4 || (major === 4 && minor < 2)

    // Bones must be ordered parent-before-child in both formats.
    for (const bd of data.bones) {
      const parent = bd.parent ? this.boneMap.get(bd.parent) ?? null : null
      const bone = makeBone(bd, parent, this)
      bone.depth = parent ? parent.depth + 1 : 0
      this.bones.push(bone)
      this.boneMap.set(bd.name, bone)
    }
    // Populate child lists for cache sorting.
    for (const bone of this.bones) {
      if (bone.parent) bone.parent.children.push(bone)
    }
    for (const sd of data.slots) {
      const bone = this.boneMap.get(sd.bone)
      if (!bone) continue
      const slot: Slot = {
        data: sd,
        bone,
        color: sd.color ?? 'FFFFFFFF',
        attachment: sd.attachment,
        deform: null,
        sequenceIndex: -1,
      }
      this.slots.push(slot)
      this.slotMap.set(sd.name, slot)
    }
    // Draw order starts as the setup order; the `draworder` timeline reorders it.
    this.drawOrder = this.slots.slice()
    // Build runtime IK constraints from setup data.
    for (const cd of data.ik ?? []) {
      const bones = cd.bones
        .map((n) => this.boneMap.get(n))
        .filter((b): b is Bone => b !== undefined)
      const target = this.boneMap.get(cd.target)
      if (!target || bones.length === 0) continue
      this.ikConstraints.push({
        data: cd,
        bones,
        target,
        mix: cd.mix ?? 1,
        softness: cd.softness ?? 0,
        bendPositive: cd.bendPositive ?? true,
        bendDirection: cd.bendDirection ?? 0,
        compress: cd.compress ?? false,
        stretch: cd.stretch ?? false,
        active: true,
      })
    }
    // Build runtime transform constraints from setup data.
    for (const cd of data.transform ?? []) {
      const bones = cd.bones
        .map((n) => this.boneMap.get(n))
        .filter((b): b is Bone => b !== undefined)
      const target = this.boneMap.get(cd.target)
      if (!target || bones.length === 0) continue
      this.transformConstraints.push({
        data: cd,
        bones,
        target,
        mixRotate: cd.mixRotate ?? 0,
        mixX: cd.mixX ?? 0,
        mixY: cd.mixY ?? 0,
        mixScaleX: cd.mixScaleX ?? 0,
        mixScaleY: cd.mixScaleY ?? 0,
        mixShearY: cd.mixShearY ?? 0,
        active: true,
      })
    }
    // Build runtime path constraints from setup data.
    for (const cd of data.path ?? []) {
      const bones = cd.bones
        .map((n) => this.boneMap.get(n))
        .filter((b): b is Bone => b !== undefined)
      const target = cd.target ? this.slotMap.get(cd.target) : undefined
      if (!target || bones.length === 0) continue
      this.pathConstraints.push({
        data: cd,
        bones,
        target,
        position: cd.position ?? 0,
        spacing: cd.spacing ?? 0,
        mixRotate: cd.mixRotate ?? cd.rotateMix ?? 0,
        mixX: cd.mixX ?? cd.translateMix ?? 0,
        mixY: cd.mixY ?? cd.translateMix ?? 0,
        spaces: [],
        positions: [],
        world: [],
        curves: [],
        lengths: [],
        segments: [],
        active: true,
      })
    }
    this.updateCache()
    this.updateWorldTransform()
  }

  /**
   * Reset every bone to its setup pose and every slot to its setup
   * attachment/color. Also resets IK constraints to their setup values so an
   * animation can be applied cleanly on top.
   */
  setToSetupPose(): void {
    const bones = this.bones
    for (let i = 0, n = bones.length; i < n; i++) {
      const bone = bones[i]
      const d = bone.data
      bone.x = d.x ?? 0
      bone.y = d.y ?? 0
      bone.rotation = d.rotation ?? 0
      bone.scaleX = d.scaleX ?? 1
      bone.scaleY = d.scaleY ?? 1
      bone.shearX = d.shearX ?? 0
      bone.shearY = d.shearY ?? 0
    }
    const slots = this.slots
    for (let i = 0, n = slots.length; i < n; i++) {
      const slot = slots[i]
      slot.attachment = slot.data.attachment
      slot.color = slot.data.color ?? 'FFFFFFFF'
      slot.deform = null
      slot.sequenceIndex = -1
    }
    // Restore the setup draw order; the `draworder` timeline reorders it.
    this.drawOrder = this.slots.slice()
    const iks = this.ikConstraints
    for (let i = 0, n = iks.length; i < n; i++) {
      const ik = iks[i]
      const d = ik.data
      ik.mix = d.mix ?? 1
      ik.softness = d.softness ?? 0
      ik.bendPositive = d.bendPositive ?? true
      ik.bendDirection = d.bendDirection ?? 0
      ik.compress = d.compress ?? false
      ik.stretch = d.stretch ?? false
    }
    const tcs = this.transformConstraints
    for (let i = 0, n = tcs.length; i < n; i++) {
      const tc = tcs[i]
      const d = tc.data
      tc.mixRotate = d.mixRotate ?? 0
      tc.mixX = d.mixX ?? 0
      tc.mixY = d.mixY ?? 0
      tc.mixScaleX = d.mixScaleX ?? 0
      tc.mixScaleY = d.mixScaleY ?? 0
      tc.mixShearY = d.mixShearY ?? 0
    }
    const pcs = this.pathConstraints
    for (let i = 0, n = pcs.length; i < n; i++) {
      const pc = pcs[i]
      const d = pc.data
      pc.position = d.position ?? 0
      pc.spacing = d.spacing ?? 0
      pc.mixRotate = d.mixRotate ?? d.rotateMix ?? 0
      pc.mixX = d.mixX ?? d.translateMix ?? 0
      pc.mixY = d.mixY ?? d.translateMix ?? 0
    }
  }

  /**
   * Recompute every bone's world transform from local values, then apply all
   * IK constraints following Spine's update-cache ordering. Bones are updated
   * parent-before-child; each constraint runs right after the bones it
   * affects, so descendants computed later pick up the solved transform
   * while earlier ones keep their pre-constraint pose.
   *
   * Matrix layout follows Spine exactly so that the standard mapping
   * `worldX = localX * a + localY * b + bone.worldX`,
   * `worldY = localX * c + localY * d + bone.worldY` holds. This is what
   * `boneLocalToWorld` / `RegionAttachment.computeWorldVertices` rely on.
   */
  updateWorldTransform(): void {
    // Prepass: copy bone.x/y/rotation/... into the applied fields (ax, ay,
    // …). boneUpdate reads these via boneUpdateWorldTransformWith; the IK /
    // transform / path constraint passes also rely on bone.ax as the
    // "unconstrained target" they subtract from to compute the IK offset.
    // Without this prepass, after `new Skeleton()` bone.ax would still be
    // its makeBone default (0) and every bone's worldX would collapse to 0
    // (test: integration > builds a skeleton and evaluates a finite world
    // transform for every bone).
    const bones = this.bones
    for (let i = 0, n = bones.length; i < n; i++) {
      const bone = bones[i]
      bone.ax = bone.x
      bone.ay = bone.y
      bone.arotation = bone.rotation
      bone.ascaleX = bone.scaleX
      bone.ascaleY = bone.scaleY
      bone.ashearX = bone.shearX
      bone.ashearY = bone.shearY
    }
    const updateCache = this._updateCache
    for (let i = 0, n = updateCache.length; i < n; i++) {
      const e = updateCache[i]
      switch (e.kind) {
        case 0: boneUpdate(e.bone!); break
        case 1: applyIkConstraint(e.ik!); break
        case 2: applyTransformConstraint(e.tc!); break
        case 3: applyPathConstraint(e.pc!); break
      }
    }
  }

  /** Build the update cache (bones + constraints in topological order). */
  updateCache(): void {
    const updateCache: Array<{
      kind: 0 | 1 | 2 | 3
      bone?: Bone
      ik?: IkConstraintRuntime
      tc?: TransformConstraintRuntime
      pc?: PathConstraintRuntime
    }> = []
    this._updateCache = updateCache
    const bones = this.bones
    for (const bone of bones) {
      bone.sorted = bone.data.skin ?? false
      bone.active = !bone.sorted
    }
    // IK + transform + path constraints are placed into the cache by
    // ascending `order` (matching Spine's updateCache walk).
    type Tagged = { kind: 'ik' | 'transform' | 'path'; c: IkConstraintRuntime | TransformConstraintRuntime | PathConstraintRuntime }
    const all: Tagged[] = []
    for (const c of this.ikConstraints) all.push({ kind: 'ik', c })
    for (const c of this.transformConstraints) all.push({ kind: 'transform', c })
    for (const c of this.pathConstraints) all.push({ kind: 'path', c })
    all.sort((a, b) => (a.c.data.order ?? 0) - (b.c.data.order ?? 0))
    for (const t of all) {
      if (t.kind === 'ik') this.sortIkConstraint(t.c as IkConstraintRuntime)
      else if (t.kind === 'transform') this.sortTransformConstraint(t.c as TransformConstraintRuntime)
      else this.sortPathConstraint(t.c as PathConstraintRuntime)
    }
    for (const bone of bones) this.sortBone(bone)
  }

  private sortTransformConstraint(constraint: TransformConstraintRuntime): void {
    constraint.active = true
    this.sortBone(constraint.target)
    const constrained = constraint.bones
    const boneCount = constrained.length
    if (constraint.data.local) {
      for (let i = 0; i < boneCount; i++) {
        const child = constrained[i]
        this.sortBone(child.parent)
        this.sortBone(child)
      }
    } else {
      for (let i = 0; i < boneCount; i++) this.sortBone(constrained[i])
    }
    this._updateCache.push({ kind: 2, tc: constraint })
    for (let i = 0; i < boneCount; i++) this.sortReset(constrained[i].children)
    for (let i = 0; i < boneCount; i++) constrained[i].sorted = true
  }

  private sortPathConstraint(constraint: PathConstraintRuntime): void {
    constraint.active = true
    this.sortBone(constraint.target.bone)
    const constrained = constraint.bones
    const boneCount = constrained.length
    for (let i = 0; i < boneCount; i++) this.sortBone(constrained[i])
    this._updateCache.push({ kind: 3, pc: constraint })
    for (let i = 0; i < boneCount; i++) this.sortReset(constrained[i].children)
    for (let i = 0; i < boneCount; i++) constrained[i].sorted = true
  }

  private sortIkConstraint(constraint: IkConstraintRuntime): void {
    constraint.active = true
    const target = constraint.target
    this.sortBone(target)
    const constrained = constraint.bones
    const parent = constrained[0]
    this.sortBone(parent)
    if (constrained.length === 1) {
      this._updateCache.push({ kind: 1, ik: constraint })
      this.sortReset(parent.children)
    } else {
      const child = constrained[constrained.length - 1]
      this.sortBone(child)
      this._updateCache.push({ kind: 1, ik: constraint })
      this.sortReset(parent.children)
      child.sorted = true
    }
  }

  private sortBone(bone: Bone | null): void {
    if (!bone || bone.sorted) return
    const parent = bone.parent
    if (parent) this.sortBone(parent)
    bone.sorted = true
    this._updateCache.push({ kind: 0, bone })
  }

  private sortReset(bones: Bone[]): void {
    for (const bone of bones) {
      if (!bone.active) continue
      if (bone.sorted) this.sortReset(bone.children)
      bone.sorted = false
    }
  }

  /** Find an attachment for a slot under the active skins (falls back to default). */
  findAttachment(slotName: string, attachmentName: string): import('../types').AttachmentData | undefined {
    const def = this.data.skins.find((s) => s.name === 'default')
    const lookup = (s?: import('../types').SkinData) => s?.attachments[slotName]?.[attachmentName]
    const found = lookup(this.data.skins.find((s) => s.name === this.skin))
    if (found) return found
    for (const name of this.extraSkins) {
      const att = lookup(this.data.skins.find((s) => s.name === name))
      if (att) return att
    }
    return lookup(def)
  }
}