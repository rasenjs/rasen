/**
 * Path constraint solver — distributes bones along a bezier path.
 */

import type { AttachmentData } from '../types'
import type { Slot, PathConstraintRuntime } from './skeleton'
import { DEG2RAD, boneUpdateAppliedTransform } from './skeleton'
// Path constraint solving (ported from Spine's PathConstraint)
// ---------------------------------------------------------------------------

const PathConstraint_NONE = -1
const PathConstraint_BEFORE = -2
const PathConstraint_AFTER = -3
const PathConstraint_epsilon = 1e-5


function computePathWorldVertices(
  attachment: AttachmentData,
  slot: Slot,
  start: number,
  count: number,
  world: number[],
  offset: number,
  stride: number
): void {
  const vertices = attachment.vertices!
  const end = offset + (count >> 1) * stride

  if ((attachment as AttachmentData & { _worldSpaceReady?: boolean })._worldSpaceReady) {
    // Vertices are already in world space — copy directly
    for (let v = start, w = offset; w < end; v += 2, w += stride) {
      world[w] = vertices[v]
      world[w + 1] = vertices[v + 1]
    }
  } else {
    // Non-weighted: flat [x, y, x, y, ...] — transform by target bone
    const bone = slot.bone
    const a = bone.a,
      b = bone.b,
      c = bone.c,
      d = bone.d
    const x = bone.worldX,
      y = bone.worldY
    for (let v = start, w = offset; w < end; v += 2, w += stride) {
      const vx = vertices[v]
      const vy = vertices[v + 1]
      world[w] = vx * a + vy * b + x
      world[w + 1] = vx * c + vy * d + y
    }
  }
}

function pathAddBeforePosition(p: number, temp: number[], i: number, out: number[], o: number): void {
  const x1 = temp[i],
    y1 = temp[i + 1]
  const dx = temp[i + 2] - x1,
    dy = temp[i + 3] - y1
  const r = Math.atan2(dy, dx)
  out[o] = x1 + p * Math.cos(r)
  out[o + 1] = y1 + p * Math.sin(r)
  out[o + 2] = r
}

function pathAddAfterPosition(p: number, temp: number[], i: number, out: number[], o: number): void {
  const x1 = temp[i + 2],
    y1 = temp[i + 3]
  const dx = x1 - temp[i],
    dy = y1 - temp[i + 1]
  const r = Math.atan2(dy, dx)
  out[o] = x1 + p * Math.cos(r)
  out[o + 1] = y1 + p * Math.sin(r)
  out[o + 2] = r
}

function pathAddCurvePosition(
  p: number,
  x1: number,
  y1: number,
  cx1: number,
  cy1: number,
  cx2: number,
  cy2: number,
  x2: number,
  y2: number,
  out: number[],
  o: number,
  tangents: boolean
): void {
  if (p === 0 || isNaN(p)) {
    out[o] = x1
    out[o + 1] = y1
    out[o + 2] = Math.atan2(cy1 - y1, cx1 - x1)
    return
  }
  const tt = p * p,
    ttt = tt * p
  const u = 1 - p,
    uu = u * u,
    uuu = uu * u
  const ut = u * p,
    ut3 = ut * 3,
    uut3 = u * ut3,
    utt3 = ut3 * p
  const x = x1 * uuu + cx1 * uut3 + cx2 * utt3 + x2 * ttt
  const y = y1 * uuu + cy1 * uut3 + cy2 * utt3 + y2 * ttt
  out[o] = x
  out[o + 1] = y
  if (tangents) {
    if (p < 1e-3) out[o + 2] = Math.atan2(cy1 - y1, cx1 - x1)
    else
      out[o + 2] = Math.atan2(
        y - (y1 * uu + cy1 * ut * 2 + cy2 * tt),
        x - (x1 * uu + cx1 * ut * 2 + cx2 * tt)
      )
  }
}

/** Ensure array has at least `size` elements. New slots must be 0 (matching
 *  official Utils.setArraySize default) — undefined would poison position
 *  math with NaN and collapse every bone onto the curve start point. */
function pathEnsureArray(arr: number[], size: number): number[] {
  if (arr.length >= size) return arr
  return new Array(size).fill(0)
}

/** Compute world positions along the path for each bone spacing. */
function computeWorldPositions(
  constraint: PathConstraintRuntime,
  path: AttachmentData,
  spacesCount: number,
  tangents: boolean
): number[] {
  const target = constraint.target
  let position = constraint.position
  const spaces = constraint.spaces
  const out = pathEnsureArray(constraint.positions, spacesCount * 3 + 2)
  constraint.positions = out
  const closed = path.closed ?? false
  // For weighted path attachments, vertices[] has flat vx,vy,weight format
  // which is shorter than the flat x,y format. Use vertexCount * 2 for the
  // actual vertex count (same as official worldVerticesLength).
  const vCount = path.vertexCount ?? path.vertices!.length / 2
  const verticesLength = vCount * 2
  let curveCount = verticesLength / 6
  let prevCurve = PathConstraint_NONE

  if (!(path.constantSpeed ?? false)) {
    // ---- Non-constant speed: use precomputed segment arc lengths ----
    const lengths = path.lengths!
    curveCount -= closed ? 1 : 2
    const pathLength = lengths[curveCount]

    let multiplier = 1
    if (constraint.data.spacingMode === 'percent') multiplier = pathLength

    if (constraint.data.positionMode === 'percent') position *= pathLength

    const world = pathEnsureArray(constraint.world, 8)
    constraint.world = world

    for (let i = 0, o = 0, curve = 0; i < spacesCount; i++, o += 3) {
      const space = spaces[i] * multiplier
      position += space
      let p = position

      if (closed) {
        p %= pathLength
        if (p < 0) p += pathLength
        curve = 0
      } else if (p < 0) {
        if (prevCurve !== PathConstraint_BEFORE) {
          prevCurve = PathConstraint_BEFORE
          computePathWorldVertices(path, target, 2, 4, world, 0, 2)
        }
        pathAddBeforePosition(p, world, 0, out, o)
        continue
      } else if (p > pathLength) {
        if (prevCurve !== PathConstraint_AFTER) {
          prevCurve = PathConstraint_AFTER
          computePathWorldVertices(path, target, verticesLength - 6, 4, world, 0, 2)
        }
        pathAddAfterPosition(p - pathLength, world, 0, out, o)
        continue
      }

      for (;;) {
        const length = lengths[curve]
        if (p > length) {
          curve++
          continue
        }
        if (curve === 0) p /= length
        else {
          const prev = lengths[curve - 1]
          p = (p - prev) / (length - prev)
        }
        break
      }

      if (curve !== prevCurve) {
        prevCurve = curve
        if (closed && curve === curveCount) {
          computePathWorldVertices(path, target, verticesLength - 4, 4, world, 0, 2)
          computePathWorldVertices(path, target, 0, 4, world, 4, 2)
        } else {
          computePathWorldVertices(path, target, curve * 6 + 2, 8, world, 0, 2)
        }
      }

      pathAddCurvePosition(
        p,
        world[0],
        world[1],
        world[2],
        world[3],
        world[4],
        world[5],
        world[6],
        world[7],
        out,
        o,
        tangents || (i > 0 && space === 0)
      )
    }
    return out
  }

  // ---- Constant speed: subdivide beziers to compute uniform arc lengths ----
  if (closed) {
    const vl = verticesLength + 2
    const w = pathEnsureArray(constraint.world, vl)
    constraint.world = w
    computePathWorldVertices(path, target, 2, vl - 4, w, 0, 2)
    computePathWorldVertices(path, target, 0, 2, w, vl - 4, 2)
    w[vl - 2] = w[0]
    w[vl - 1] = w[1]
  } else {
    curveCount--
    const vl = verticesLength - 4
    const w = pathEnsureArray(constraint.world, vl)
    constraint.world = w
    computePathWorldVertices(path, target, 2, vl, w, 0, 2)
  }

  const worldArr = constraint.world
  const curves = pathEnsureArray(constraint.curves, curveCount)
  constraint.curves = curves

  let pathLength = 0
  let x1 = worldArr[0],
    y1 = worldArr[1]
  let cx1 = 0,
    cy1 = 0,
    cx2 = 0,
    cy2 = 0,
    x2 = 0,
    y2 = 0
  let tmpx = 0,
    tmpy = 0
  let dddfx = 0,
    dddfy = 0,
    ddfx = 0,
    ddfy = 0,
    dfx = 0,
    dfy = 0

  for (let i = 0, w = 2; i < curveCount; i++, w += 6) {
    cx1 = worldArr[w]
    cy1 = worldArr[w + 1]
    cx2 = worldArr[w + 2]
    cy2 = worldArr[w + 3]
    x2 = worldArr[w + 4]
    y2 = worldArr[w + 5]
    tmpx = (x1 - cx1 * 2 + cx2) * 0.1875
    tmpy = (y1 - cy1 * 2 + cy2) * 0.1875
    dddfx = ((cx1 - cx2) * 3 - x1 + x2) * 0.09375
    dddfy = ((cy1 - cy2) * 3 - y1 + y2) * 0.09375
    ddfx = tmpx * 2 + dddfx
    ddfy = tmpy * 2 + dddfy
    dfx = (cx1 - x1) * 0.75 + tmpx + dddfx * 0.16666667
    dfy = (cy1 - y1) * 0.75 + tmpy + dddfy * 0.16666667
    pathLength += Math.sqrt(dfx * dfx + dfy * dfy)
    dfx += ddfx
    dfy += ddfy
    ddfx += dddfx
    ddfy += dddfy
    pathLength += Math.sqrt(dfx * dfx + dfy * dfy)
    dfx += ddfx
    dfy += ddfy
    pathLength += Math.sqrt(dfx * dfx + dfy * dfy)
    dfx += ddfx + dddfx
    dfy += ddfy + dddfy
    pathLength += Math.sqrt(dfx * dfx + dfy * dfy)
    curves[i] = pathLength
    x1 = x2
    y1 = y2
  }

  if (constraint.data.positionMode === 'percent') position *= pathLength

  let multiplier = 1
  switch (constraint.data.spacingMode) {
    case 'percent':
      multiplier = pathLength
      break
    default:
      multiplier = 1
  }

  const segments = pathEnsureArray(constraint.segments, 10)
  constraint.segments = segments
  let curveLength = 0

  for (let i = 0, o = 0, curve = 0, segment = 0; i < spacesCount; i++, o += 3) {
    const space = spaces[i] * multiplier
    position += space
    let p = position

    if (closed) {
      p %= pathLength
      if (p < 0) p += pathLength
      curve = 0
    } else if (p < 0) {
      pathAddBeforePosition(p, worldArr, 0, out, o)
      continue
    } else if (p > pathLength) {
      pathAddAfterPosition(p - pathLength, worldArr, worldArr.length - 4, out, o)
      continue
    }

    for (;;) {
      const length = curves[curve]
      if (p > length) {
        curve++
        continue
      }
      if (curve === 0) p /= length
      else {
        const prev = curves[curve - 1]
        p = (p - prev) / (length - prev)
      }
      break
    }

    if (curve !== prevCurve) {
      prevCurve = curve
      let ii = curve * 6
      x1 = worldArr[ii]
      y1 = worldArr[ii + 1]
      cx1 = worldArr[ii + 2]
      cy1 = worldArr[ii + 3]
      cx2 = worldArr[ii + 4]
      cy2 = worldArr[ii + 5]
      x2 = worldArr[ii + 6]
      y2 = worldArr[ii + 7]
      tmpx = (x1 - cx1 * 2 + cx2) * 0.03
      tmpy = (y1 - cy1 * 2 + cy2) * 0.03
      dddfx = ((cx1 - cx2) * 3 - x1 + x2) * 6e-3
      dddfy = ((cy1 - cy2) * 3 - y1 + y2) * 6e-3
      ddfx = tmpx * 2 + dddfx
      ddfy = tmpy * 2 + dddfy
      dfx = (cx1 - x1) * 0.3 + tmpx + dddfx * 0.16666667
      dfy = (cy1 - y1) * 0.3 + tmpy + dddfy * 0.16666667
      curveLength = Math.sqrt(dfx * dfx + dfy * dfy)
      segments[0] = curveLength
      for (ii = 1; ii < 8; ii++) {
        dfx += ddfx
        dfy += ddfy
        ddfx += dddfx
        ddfy += dddfy
        curveLength += Math.sqrt(dfx * dfx + dfy * dfy)
        segments[ii] = curveLength
      }
      dfx += ddfx
      dfy += ddfy
      curveLength += Math.sqrt(dfx * dfx + dfy * dfy)
      segments[8] = curveLength
      dfx += ddfx + dddfx
      dfy += ddfy + dddfy
      curveLength += Math.sqrt(dfx * dfx + dfy * dfy)
      segments[9] = curveLength
      segment = 0
    }

    p *= curveLength
    for (;;) {
      const length = segments[segment]
      if (p > length) {
        segment++
        continue
      }
      if (segment === 0) p /= length
      else {
        const prev = segments[segment - 1]
        p = segment + (p - prev) / (length - prev)
      }
      break
    }

    pathAddCurvePosition(
      p * 0.1,
      x1,
      y1,
      cx1,
      cy1,
      cx2,
      cy2,
      x2,
      y2,
      out,
      o,
      tangents || (i > 0 && space === 0)
    )
  }

  return out
}

/** Apply a path constraint at its position in the update cache. */
export function applyPathConstraint(constraint: PathConstraintRuntime): void {
  if (!constraint.active) return

  const slot = constraint.target
  const attName = slot.attachment
  if (!attName) return
  const skeleton = slot.bone.skeleton
  const attachment = skeleton.findAttachment(slot.data.name, attName)
  if (!attachment || attachment.type !== 'path') return

  const mixRotate = constraint.mixRotate
  const mixX = constraint.mixX
  const mixY = constraint.mixY
  if (mixRotate === 0 && mixX === 0 && mixY === 0) return

  // For weighted path attachments, pre-compute world-space vertices into a
  // flat [x,y,x,y,...] buffer. This lets computeWorldPositions use the same
  // non-weighted indexing path.
  const savedVertices = attachment.vertices
  const savedBones = attachment.bones
  if (attachment.bones) {
    const bonesArr = attachment.bones
    const verts = attachment.vertices!
    const vCount = attachment.vertexCount ?? 0
    const deform = slot.deform
    const flat = new Array<number>(vCount * 2)
    let b = 0
    let fi = 0
    for (let vi = 0; vi < vCount; vi++) {
      const boneCount = bonesArr[fi++]
      let wx = 0, wy = 0
      for (let j = 0; j < boneCount; j++) {
        const boneIdx = bonesArr[fi++]
        // Apply FFD deform offsets (matching official VertexAttachment.computeWorldVertices)
        const vx = verts[b++] + (deform ? deform[vi * 2] : 0)
        const vy = verts[b++] + (deform ? deform[vi * 2 + 1] : 0)
        const weight = verts[b++]
        const bb = skeleton.bones[boneIdx]
        if (!bb) continue
        wx += (vx * bb.a + vy * bb.b + bb.worldX) * weight
        wy += (vx * bb.c + vy * bb.d + bb.worldY) * weight
      }
      flat[vi * 2] = wx
      flat[vi * 2 + 1] = wy
    }
    // Temporarily replace vertices with flat world-space coords and mark as
    // pre-computed so computePathWorldVertices copies without target bone transform.
    const ext = attachment as AttachmentData & { _worldSpaceReady?: boolean }
    ext.vertices = flat
    ext.bones = undefined
    ext._worldSpaceReady = true
  }

  const data = constraint.data
  const tangents = data.rotateMode === 'tangent'
  const scale = data.rotateMode === 'chainScale'
  const bones = constraint.bones
  const boneCount = bones.length
  const spacesCount = tangents ? boneCount : boneCount + 1

  let spaces = constraint.spaces
  spaces = constraint.spaces = pathEnsureArray(spaces, spacesCount)
  constraint.spaces = spaces

  let lengths: number[] = []
  if (scale) {
    lengths = constraint.lengths = pathEnsureArray(constraint.lengths, boneCount)
    constraint.lengths = lengths
  }

  const spacing = constraint.spacing

  // Compute spaces based on spacingMode.
  switch (data.spacingMode) {
    case 'percent': {
      if (scale) {
        for (let i = 0, n = spacesCount - 1; i < n; i++) {
          const bone = bones[i]
          const setupLength = bone.data.length ?? 0
          if (setupLength < PathConstraint_epsilon) {
            lengths[i] = 0
          } else {
            const bx = setupLength * bone.a
            const by = setupLength * bone.c
            lengths[i] = Math.sqrt(bx * bx + by * by)
          }
        }
      }
      for (let i = 1; i < spacesCount; i++) spaces[i] = spacing
      break
    }
    default: {
      const lengthSpacing = data.spacingMode === 'length'
      for (let i = 0, n = spacesCount - 1; i < n; ) {
        const bone = bones[i]
        const setupLength = bone.data.length ?? 0
        if (setupLength < PathConstraint_epsilon) {
          if (scale) lengths[i] = 0
          spaces[++i] = spacing
        } else {
          const bx = setupLength * bone.a
          const by = setupLength * bone.c
          const length = Math.sqrt(bx * bx + by * by)
          if (scale) lengths[i] = length
          spaces[++i] = (lengthSpacing ? setupLength + spacing : spacing) * length / setupLength
        }
      }
    }
  }

  // Compute world positions along the path.
  const positions = computeWorldPositions(constraint, attachment, spacesCount, tangents)

  let boneX = positions[0]
  let boneY = positions[1]
  let offsetRotation = data.rotation ?? 0
  let tip = false

  if (offsetRotation === 0) {
    tip = data.rotateMode === 'chain'
  } else {
    tip = false
    const p = constraint.target.bone
    offsetRotation *= p.a * p.d - p.b * p.c > 0 ? DEG2RAD : -DEG2RAD
  }

  for (let i = 0, p = 3; i < boneCount; i++, p += 3) {
    const bone = bones[i]
    bone.worldX += (boneX - bone.worldX) * mixX
    bone.worldY += (boneY - bone.worldY) * mixY

    const x = positions[p]
    const y = positions[p + 1]
    const dx = x - boneX
    const dy = y - boneY

    if (scale) {
      const len = lengths[i]
      if (len !== 0) {
        const s = (Math.sqrt(dx * dx + dy * dy) / len - 1) * mixRotate + 1
        bone.a *= s
        bone.c *= s
      }
    }

    boneX = x
    boneY = y

    if (mixRotate > 0) {
      const a = bone.a,
        b = bone.b,
        c = bone.c,
        d = bone.d
      let r = 0,
        cos = 0,
        sin = 0
      if (tangents) {
        r = positions[p - 1]
      } else if (spaces[i + 1] === 0) {
        r = positions[p + 2]
      } else {
        r = Math.atan2(dy, dx)
      }
      r -= Math.atan2(c, a)
      if (tip) {
        cos = Math.cos(r)
        sin = Math.sin(r)
        const len = bone.data.length ?? 0
        boneX += (len * (cos * a - sin * c) - dx) * mixRotate
        boneY += (len * (sin * a + cos * c) - dy) * mixRotate
      } else {
        r += offsetRotation
      }
      if (r > Math.PI) r -= Math.PI * 2
      else if (r < -Math.PI) r += Math.PI * 2
      r *= mixRotate
      cos = Math.cos(r)
      sin = Math.sin(r)
      bone.a = cos * a - sin * c
      bone.b = cos * b - sin * d
      bone.c = sin * a + cos * c
      bone.d = sin * b + cos * d
    }

    boneUpdateAppliedTransform(bone)
  }

  // Restore original path attachment data (undo temporary flat substitution)
  if (savedBones) {
    const ext = attachment as AttachmentData & { _worldSpaceReady?: boolean }
    ext.vertices = savedVertices
    ext.bones = savedBones
    ext._worldSpaceReady = false
  }
}

/** Apply a transform constraint at its position in the update cache. */
