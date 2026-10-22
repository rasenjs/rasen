/**
 * CPU skinning for the 3D actor layer: pose a GR2 skeleton from decoded
 * animation tracks and linear-blend-skin `PartSpec` geometry.
 *
 * ## Matrix conventions (measured, not assumed)
 *
 * Granny stores row-major matrices with the translation in the LAST row
 * (row-vector convention: `v' = v * M`), and quaternions in x, y, z, w order.
 * A `GrannyTransform` composes to `M3 = ScaleShear * Rotation(q)` over the
 * upper 3x3 with the position as the last row, and bone worlds compose as
 * `world = local * parentWorld` (row-major product). This is settled by the
 * bind-pose oracle on the real files (`skinning.test.ts`, `tools/verify-skinning.ts`):
 * every bone's composed bind world times its stored `inverseWorld` is near
 * identity — max residual 4.5e-4 over diablo's 263 bones and 2.0e-5 over
 * amazon's 162 — while the three natural alternatives (non-transposed
 * quaternion matrix, `world = parentWorld * local`, and their combinations)
 * land at residuals of 3.5 to 23.
 *
 * ## Bone-index semantics (measured on diablo's torso model)
 *
 * A mesh's `boneIndices` index into that mesh's own `boneBindings` list — the
 * binding's `boneName` then names the skeleton bone. Evidence: for all three
 * diablo torso meshes the largest index equals `boneBindings.length - 1`
 * exactly (83/84, 32/33, 15/16) while the bindings' skeleton indices span up
 * to 262; 96-99% of weighted vertices fall inside their binding's OBB (in
 * bind-pose bone-local space) versus 3-43% under the "direct skeleton index"
 * reading; and an animated pose (diablo `walk`) skins smoothly only through
 * the bindings (mean triangle-edge distortion 0.05 vs 0.35, worst 1.9 vs 95).
 *
 * ## What is and is not posed
 *
 * Track names match bone names (measured: diablo's clips track all 263 bones
 * by name in one `root` track group; amazon's track 161 of 162). The extra
 * tracks in the files are object/mesh placement tracks (diablo: 18 distinct
 * names like `Diablo_Body`/`diablo_vfxshell`; amazon: 92 like `lshoulder_med`)
 * plus vector and text tracks — none of them are bone transforms and
 * {@link computeBonePose} ignores them. Untracked bones keep their bind pose.
 * Every track group that holds bone tracks has an identity `initialPlacement`
 * (all 122 diablo groups and the amazon `root` group); the 4009 non-identity
 * `initialPlacement`s in the amazon file belong to those mesh/VFX groups and
 * never touch skeletal posing.
 *
 * Curve families: every orientation/position/scale-shear curve in the D2R
 * corpus decodes through `../original/gr2-anim.ts` (18 codecs, all
 * implemented there). No transform track in either `combined.animations`
 * lacks a channel curve. The families gr2-anim does not implement
 * (`DaKeyframes32f`, keyframed `DaK32fC32f`, pre-v7 `old_curve`) occur 0
 * times in these files.
 */

import type { Gr2BoneBinding, Gr2Skeleton, GrannyTransform } from '../original/gr2'
import type { Gr2Animation, Gr2TransformTrack, Gr2VectorTrack } from '../original/gr2-anim'
import { isGr2, loadGr2 } from '../original/gr2'
import { loadGr2Animations } from '../original/gr2-anim'
import { MODEL_ROOT, type PartSpec } from './model'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Per-bone matrices: 16 row-major floats per entry (Granny convention —
 * translation in the last row). Used both for skeleton-bone-indexed poses and
 * for the per-binding matrices {@link skinMesh} takes.
 */
export type Mat4Array = Float32Array

/** A {@link PartSpec} that carries its skin inputs (4 weights + 4 indices). */
export interface SkinnedPart extends PartSpec {
  /** Skin weights, 4 per vertex (raw `u8 / 255` values, renormalized at skin). */
  boneWeights: Float32Array
  /** Skin bone indices, 4 per vertex — into the mesh's `boneBindings` list. */
  boneIndices: Uint8Array
}

// ---------------------------------------------------------------------------
// Row-major matrix helpers (row-vector convention)
// ---------------------------------------------------------------------------

/** `out = a * b` (row-major, apply `a` first), 16 floats per matrix. */
function mulInto(a: ArrayLike<number>, aAt: number, b: ArrayLike<number>, bAt: number, out: Float32Array | Float64Array, outAt: number): void {
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      let sum = 0
      for (let k = 0; k < 4; k += 1) sum += a[aAt + r * 4 + k] * b[bAt + k * 4 + c]
      out[outAt + r * 4 + c] = sum
    }
  }
}

/**
 * Compose one `GrannyTransform` (optionally overridden by a sampled
 * transform track) into a row-major matrix: `M3 = ScaleShear * Rotation(q)`,
 * translation in the last row. Channel overrides fall back to the bind
 * transform's channel when the track omits that curve.
 */
function localMatrix(
  bind: GrannyTransform,
  track: Gr2TransformTrack | undefined,
  tSeconds: number,
  out: Float64Array,
  at: number,
): void {
  const position = track?.position ? track.position.evaluate(tSeconds) : bind.position
  const orientation = track?.orientation ? track.orientation.evaluate(tSeconds) : bind.orientation
  const scaleShear = track?.scaleShear ? track.scaleShear.evaluate(tSeconds) : bind.scaleShear
  composeLocal(position, orientation, scaleShear, out, at)
}

/** Evaluate one bone's local TRS at `t`, falling back to the bind pose. */
function evalLocalTrs(
  bind: GrannyTransform,
  track: Gr2TransformTrack | undefined,
  tSeconds: number,
  out: { position: number[]; orientation: number[]; scaleShear: number[] },
): void {
  const position = track?.position ? track.position.evaluate(tSeconds) : bind.position
  const orientation = track?.orientation ? track.orientation.evaluate(tSeconds) : bind.orientation
  const scaleShear = track?.scaleShear ? track.scaleShear.evaluate(tSeconds) : bind.scaleShear
  for (let i = 0; i < 3; i++) out.position[i] = position[i]
  for (let i = 0; i < 4; i++) out.orientation[i] = orientation[i]
  for (let i = 0; i < 9; i++) out.scaleShear[i] = scaleShear[i]
}

/**
 * Compose one local matrix from already-evaluated TRS (row-vector convention:
 * `v' = v * M`, so scale-shear applies first, then orientation, then position).
 */
function composeLocal(
  position: readonly number[],
  orientation: readonly number[],
  scaleShear: readonly number[],
  out: Float64Array,
  at: number,
): void {
  // Row-vector rotation = transpose of the standard column-vector matrix.
  const [qx, qy, qz, qw] = [orientation[0], orientation[1], orientation[2], orientation[3]]
  const r00 = 1 - 2 * (qy * qy + qz * qz)
  const r01 = 2 * (qx * qy + qz * qw)
  const r02 = 2 * (qx * qz - qy * qw)
  const r10 = 2 * (qx * qy - qz * qw)
  const r11 = 1 - 2 * (qx * qx + qz * qz)
  const r12 = 2 * (qy * qz + qx * qw)
  const r20 = 2 * (qx * qz + qy * qw)
  const r21 = 2 * (qy * qz - qx * qw)
  const r22 = 1 - 2 * (qx * qx + qy * qy)

  // M3 = ScaleShear * R (apply scale-shear first, then orientation).
  const s = scaleShear
  const m00 = s[0] * r00 + s[1] * r10 + s[2] * r20
  const m01 = s[0] * r01 + s[1] * r11 + s[2] * r21
  const m02 = s[0] * r02 + s[1] * r12 + s[2] * r22
  const m10 = s[3] * r00 + s[4] * r10 + s[5] * r20
  const m11 = s[3] * r01 + s[4] * r11 + s[5] * r21
  const m12 = s[3] * r02 + s[4] * r12 + s[5] * r22
  const m20 = s[6] * r00 + s[7] * r10 + s[8] * r20
  const m21 = s[6] * r01 + s[7] * r11 + s[8] * r21
  const m22 = s[6] * r02 + s[7] * r12 + s[8] * r22

  out[at + 0] = m00
  out[at + 1] = m01
  out[at + 2] = m02
  out[at + 3] = 0
  out[at + 4] = m10
  out[at + 5] = m11
  out[at + 6] = m12
  out[at + 7] = 0
  out[at + 8] = m20
  out[at + 9] = m21
  out[at + 10] = m22
  out[at + 11] = 0
  out[at + 12] = position[0]
  out[at + 13] = position[1]
  out[at + 14] = position[2]
  out[at + 15] = 1
}

/**
 * Blend two local poses into one matrix: translation and scale-shear lerp,
 * orientation slerps (shortest path). This is what a crossfade between two
 * clips is made of — blending the composed world matrices instead would skew
 * the bones over the fade.
 */
function localMatrixBlended(
  bind: GrannyTransform,
  trackA: Gr2TransformTrack | undefined,
  tA: number,
  trackB: Gr2TransformTrack | undefined,
  tB: number,
  blend: number,
  out: Float64Array,
  at: number,
): void {
  evalLocalTrs(bind, trackA, tA, BLEND_A)
  evalLocalTrs(bind, trackB, tB, BLEND_B)
  for (let i = 0; i < 3; i++) BLEND_P[i] = BLEND_A.position[i] + (BLEND_B.position[i] - BLEND_A.position[i]) * blend
  for (let i = 0; i < 9; i++) {
    BLEND_S[i] = BLEND_A.scaleShear[i] + (BLEND_B.scaleShear[i] - BLEND_A.scaleShear[i]) * blend
  }
  slerp(BLEND_Q, BLEND_A.orientation, BLEND_B.orientation, blend)
  composeLocal(BLEND_P, BLEND_Q, BLEND_S, out, at)
}

/** Scratch for {@link localMatrixBlended} — one pose blend at a time, per frame. */
const BLEND_A = { position: [0, 0, 0], orientation: [0, 0, 0, 1], scaleShear: [1, 0, 0, 0, 1, 0, 0, 0, 1] }
const BLEND_B = { position: [0, 0, 0], orientation: [0, 0, 0, 1], scaleShear: [1, 0, 0, 0, 1, 0, 0, 0, 1] }
const BLEND_P = [0, 0, 0]
const BLEND_Q = [0, 0, 0, 1]
const BLEND_S = [1, 0, 0, 0, 1, 0, 0, 0, 1]

/** Slerp xyzw quaternions along the shortest arc, into `out`. */
function slerp(out: number[], a: readonly number[], b: readonly number[], t: number): void {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
  let bx = b[0]
  let by = b[1]
  let bz = b[2]
  let bw = b[3]
  if (dot < 0) {
    dot = -dot
    bx = -bx
    by = -by
    bz = -bz
    bw = -bw
  }
  // Nearly parallel: lerp instead of dividing by a near-zero sine.
  let s0: number
  let s1: number
  if (dot > 0.9995) {
    s0 = 1 - t
    s1 = t
  } else {
    const theta = Math.acos(Math.min(1, dot))
    const sin = Math.sin(theta)
    s0 = Math.sin((1 - t) * theta) / sin
    s1 = Math.sin(t * theta) / sin
  }
  out[0] = s0 * a[0] + s1 * bx
  out[1] = s0 * a[1] + s1 * by
  out[2] = s0 * a[2] + s1 * bz
  out[3] = s0 * a[3] + s1 * bw
}

// ---------------------------------------------------------------------------
// Posing
// ---------------------------------------------------------------------------

/**
 * The mesh's raw weights, normalized so each vertex's four sum to one.
 *
 * A vertex with no influence at all (all four raw weights zero) keeps four
 * zeros, so its normalized sum is zero and the skinning pass leaves it at
 * its bind position.
 */
function normalizeWeights(raw: Float32Array, vertexCount: number): Float32Array {
  const out = new Float32Array(vertexCount * 4)
  for (let v = 0; v < vertexCount; v += 1) {
    const at = v * 4
    const sum = raw[at] + raw[at + 1] + raw[at + 2] + raw[at + 3]
    if (sum > 0) {
      const inverse = 1 / sum
      out[at] = raw[at] * inverse
      out[at + 1] = raw[at + 1] * inverse
      out[at + 2] = raw[at + 2] * inverse
      out[at + 3] = raw[at + 3] * inverse
    }
  }
  return out
}

/**
 * The clip's tracks indexed by bone name — the first track of a name wins.
 *
 * The index is memoized per track LIST (the clip's own array, which the rig
 * caches), because building it costs a map insert per track and the pose is
 * evaluated for every animated actor on every frame. A clip's tracks never
 * change, so the index is built once.
 */
const trackIndexes = new WeakMap<readonly Gr2TransformTrack[], Map<string, Gr2TransformTrack>>()

function trackIndexFor(
  tracks: readonly Gr2TransformTrack[],
): Map<string, Gr2TransformTrack> {
  const cached = trackIndexes.get(tracks)
  if (cached !== undefined) return cached
  const index = new Map<string, Gr2TransformTrack>()
  for (const track of tracks) {
    if (!index.has(track.name)) index.set(track.name, track)
  }
  trackIndexes.set(tracks, index)
  return index
}

/**
 * Sample one animation at `tSeconds` and return the per-bone WORLD matrices
 * (16 row-major floats per skeleton bone, in skeleton order).
 *
 * `tracks` is the clip's transform tracks (all track groups merged; on the
 * real files the names are disjoint across groups). A track whose name matches
 * a bone overrides that bone's bind-pose local transform channel-by-channel;
 * untracked bones keep their bind pose. Non-bone track names (mesh/VFX object
 * placements) match nothing and are ignored.
 */
export function computeBonePose(
  skeleton: Gr2Skeleton,
  tracks: readonly Gr2TransformTrack[],
  tSeconds: number,
): Mat4Array {
  const trackByName = trackIndexFor(tracks)
  const worlds = new Float32Array(skeleton.bones.length * 16)
  const local = new Float64Array(16)
  const composed = new Float64Array(16)
  for (let i = 0; i < skeleton.bones.length; i += 1) {
    const bone = skeleton.bones[i]
    localMatrix(bone.localTransform, trackByName.get(bone.name), tSeconds, local, 0)
    const parent = bone.parentIndex
    if (parent >= 0 && parent < i) {
      // world = local * parentWorld (row-vector: apply local first).
      mulInto(local, 0, worlds, parent * 16, composed, 0)
      worlds.set(composed, i * 16)
    } else {
      worlds.set(local, i * 16)
    }
  }
  return worlds
}

/**
 * Crossfade two clips: every bone's local pose is blended (slerp/lerp) between
 * the two evaluations before composition, so a 0.2 s fade never skews a joint.
 * `blend` is 0 = pure A, 1 = pure B.
 */
export function computeBonePoseBlended(
  skeleton: Gr2Skeleton,
  tracksA: readonly Gr2TransformTrack[],
  tA: number,
  tracksB: readonly Gr2TransformTrack[],
  tB: number,
  blend: number,
): Mat4Array {
  const byNameA = trackIndexFor(tracksA)
  const byNameB = trackIndexFor(tracksB)
  const worlds = new Float32Array(skeleton.bones.length * 16)
  const local = new Float64Array(16)
  const composed = new Float64Array(16)
  for (let i = 0; i < skeleton.bones.length; i += 1) {
    const bone = skeleton.bones[i]
    localMatrixBlended(
      bone.localTransform,
      byNameA.get(bone.name),
      tA,
      byNameB.get(bone.name),
      tB,
      blend,
      local,
      0,
    )
    const parent = bone.parentIndex
    if (parent >= 0 && parent < i) {
      mulInto(local, 0, worlds, parent * 16, composed, 0)
      worlds.set(composed, i * 16)
    } else {
      worlds.set(local, i * 16)
    }
  }
  return worlds
}

/**
 * The mesh's inverse bind matrices in skeleton order (16 row-major floats per
 * bone), straight from each bone's stored `inverseWorld`.
 */
export function inverseBindOf(skeleton: Gr2Skeleton): Mat4Array {
  const out = new Float32Array(skeleton.bones.length * 16)
  for (let i = 0; i < skeleton.bones.length; i += 1) {
    out.set(skeleton.bones[i].inverseWorld, i * 16)
  }
  return out
}

/** `bone name -> skeleton bone index`. */
export function boneIndexOf(skeleton: Gr2Skeleton): Map<string, number> {
  const index = new Map<string, number>()
  skeleton.bones.forEach((bone, i) => {
    if (!index.has(bone.name)) index.set(bone.name, i)
  })
  return index
}

/**
 * Reorder per-skeleton-bone matrices (16 floats per bone) into a mesh's
 * `boneBindings` order — the index space `boneIndices` uses. A binding whose
 * name is not in the skeleton maps to an identity row (and never contributes:
 * its vertices' weights are zero on the real files whenever it occurs).
 */
export function matricesForBindings(
  perBone: Float32Array,
  boneIndex: ReadonlyMap<string, number>,
  boneBindings: readonly Gr2BoneBinding[],
  out?: Float32Array,
): Mat4Array {
  const target = out ?? new Float32Array(boneBindings.length * 16)
  for (let b = 0; b < boneBindings.length; b += 1) {
    const row = boneIndex.get(boneBindings[b].boneName)
    if (row === undefined || (row + 1) * 16 > perBone.length) {
      target[b * 16] = 1
      target[b * 16 + 5] = 1
      target[b * 16 + 10] = 1
      target[b * 16 + 15] = 1
      continue
    }
    target.set(perBone.subarray(row * 16, row * 16 + 16), b * 16)
  }
  return target
}

// ---------------------------------------------------------------------------
// Skinning
// ---------------------------------------------------------------------------

/**
 * Linear-blend-skin one part and return a NEW `PartSpec` (positions, normals
 * and the normals-pass colors transformed; uv and texture carried over).
 *
 * - `boneMatrices` and `inverseBind` hold 16 row-major floats per entry of
 *   `boneBindings` (i.e. the mesh's own bone-index space): the current world
 *   matrix and the inverse bind matrix of the bone each binding names.
 * - `part.boneIndices` index `boneBindings` (the measured semantics above).
 * - Weights are renormalized to sum to 1 (the stored `u8 / 255` values already
 *   sum to 1 within 5e-8 on the real files; the renormalization makes the
 *   contract exact). A vertex whose four weights sum to zero keeps its bind
 *   position and normal.
 * - Normals transform by the blended upper 3x3 and are renormalized. Exact
 *   inverse-transpose skinning is only needed for scaled/sheared bones; every
 *   bind scale-shear in both real skeletons is identity (measured), so the
 *   blended 3x3 is the rotation blend.
 */
export function skinMesh(
  part: SkinnedPart,
  boneMatrices: Mat4Array,
  boneBindings: readonly Gr2BoneBinding[],
  inverseBind: Mat4Array,
): PartSpec {
  return skinMeshInto(part, boneMatrices, boneBindings, inverseBind, undefined)
}

/**
 * The reusable buffers one part's skinning pass writes into.
 *
 * Skinning runs for every animated part on every frame, and the geometry it
 * produces is the same SIZE every time (only the pose changes). Allocating
 * four typed arrays per part per frame was the single largest cost in the
 * frame — the profile put `skinMesh` at 31% — and the garbage it left behind
 * showed up as 4% of the frame in the collector.
 *
 * A scratch carries the buffers for ONE part; the caller keeps one per part
 * and hands the same one back every frame.
 */
export interface SkinScratch {
  /**
   * Per-binding skin matrices: S = inverseBind * world.
   *
   * Float32, not Float64: the matrix is read once per vertex per influenced
   * bone, so its width is the dominant memory traffic of the skinning pass,
   * and Float32 is what the GPU would use anyway.
   */
  skin: Float32Array
  /** The skinned positions. */
  vertices: Float32Array
  /** The skinned normals. */
  normals: Float32Array
  /**
   * The skinned tangents, 4 per vertex (xyz + the handedness sign in w).
   *
   * The tangent has to be skinned with the same bone blend as the normal:
   * a stale tangent turns the normal map into a fixed texture that no longer
   * follows the surface, which is exactly the "the lighting does not work"
   * look the tangent frame is supposed to fix.
   */
  tangents?: Float32Array
  /**
   * The weights, already normalized to sum to one.
   *
   * The stored weights are static (they belong to the mesh, not the pose), so
   * the renormalization is done ONCE per part rather than per frame. It used
   * to be a division per influenced bone per vertex — a divide in the
   * innermost loop of the frame's hottest code.
   */
  weights: Float32Array
  /**
   * The vertices whose blend is a SINGLE bone, and the binding each uses.
   *
   * A large share of a retail mesh is rigid: one bone, weight one. For those
   * the blend loop is pure overhead — three extra matrix reads and three
   * multiply-adds per channel, per vertex — so they are bucketed once per part
   * and take a straight matrix transform instead. The result is identical:
   * normalization makes a lone surviving weight exactly 1.
   */
  single: Int32Array
  /** The binding of each entry in {@link single}. */
  singleBinding: Int32Array
  /** The vertices that need the general blend (2..4 bones, or none at all). */
  multi: Int32Array
  /**
   * The normals packed as RGB in [0, 1] (the "show normals" pass).
   *
   * Only the debug view reads this, so it is allocated on demand: the PBR
   * character material takes the normals themselves. Computing it for every
   * vertex was a third of the skinning pass's writes.
   */
  normalColors?: Float32Array
}

/** The scratch buffers one part needs: sized from its vertex and binding counts. */
export function skinScratchFor(
  part: SkinnedPart,
  boneBindings: readonly Gr2BoneBinding[],
): SkinScratch {
  const vertexCount = part.vertices.length / 3
  const weights = new Float32Array(vertexCount * 4)
  const raw = part.boneWeights
  for (let v = 0; v < vertexCount; v += 1) {
    let sum = 0
    for (let k = 0; k < 4; k += 1) sum += raw[v * 4 + k]
    if (sum > 0) {
      const inverse = 1 / sum
      for (let k = 0; k < 4; k += 1) weights[v * 4 + k] = raw[v * 4 + k] * inverse
    }
  }

  // Bucket the vertices by how many bones actually move them. This is static
  // information about the mesh, so it is computed once here rather than
  // re-discovered inside the per-frame loop.
  const bindCount = boneBindings.length
  const singleList: number[] = []
  const singleBinding: number[] = []
  const multiList: number[] = []
  const indices = part.boneIndices
  for (let v = 0; v < vertexCount; v += 1) {
    const at = v * 4
    let influences = 0
    let only = -1
    for (let k = 0; k < 4; k += 1) {
      if (weights[at + k] > 0) {
        influences += 1
        only = k
      }
    }
    if (influences === 1) {
      const binding = indices[at + only]
      if (binding < bindCount) {
        singleList.push(v)
        singleBinding.push(binding)
        continue
      }
    }
    multiList.push(v)
  }

  return {
    skin: new Float32Array(boneBindings.length * 16),
    vertices: new Float32Array(part.vertices.length),
    normals: new Float32Array(part.normals.length),
    tangents: part.tangents ? new Float32Array(part.tangents.length) : undefined,
    weights,
    single: Int32Array.from(singleList),
    singleBinding: Int32Array.from(singleBinding),
    multi: Int32Array.from(multiList),
  }
}

/**
 * Linear-blend-skin one part into `scratch`'s buffers (or fresh ones when it
 * is omitted), and return the part carrying them.
 *
 * The returned part's arrays are the scratch's, so the caller must not hold
 * two poses of the same part at once. That is exactly what the actor layer
 * does: it keeps one scratch per part and re-skins it in place each frame.
 */
export function skinMeshInto(
  part: SkinnedPart,
  boneMatrices: Mat4Array,
  boneBindings: readonly Gr2BoneBinding[],
  inverseBind: Mat4Array,
  scratch: SkinScratch | undefined,
): PartSpec {
  const bindCount = boneBindings.length
  if (boneMatrices.length < bindCount * 16) {
    throw new Error('skinning: boneMatrices has fewer entries than boneBindings')
  }
  if (inverseBind.length < bindCount * 16) {
    throw new Error('skinning: inverseBind has fewer entries than boneBindings')
  }

  // Per-binding skin matrices: S = inverseBind * world (row-vector: bind-space
  // first, then the animated world). Computed once per part per frame.
  const skin = scratch?.skin ?? new Float32Array(bindCount * 16)
  for (let b = 0; b < bindCount; b += 1) {
    mulInto(inverseBind, b * 16, boneMatrices, b * 16, skin, b * 16)
  }

  const vertexCount = part.vertices.length / 3
  const vertices = scratch?.vertices ?? new Float32Array(part.vertices.length)
  const normals = scratch?.normals ?? new Float32Array(part.normals.length)
  // The tangent frame, when the mesh ships one. It is skinned with the same
  // bone blend as the normal: a tangent left in bind space would turn the
  // normal map into a texture that no longer follows the surface.
  const sourceTangents = part.tangents
  const tangents = sourceTangents
    ? (scratch?.tangents ?? new Float32Array(sourceTangents.length))
    : undefined
  // The normalized weights. The caller precomputes them (the mesh's weights
  // are static) and hands them over in the scratch; without a scratch they
  // are normalized here. Either way the loop below reads ONE array, so the
  // "which weights am I using" decision is made once per part instead of
  // once per bone per vertex.
  const weights = scratch?.weights ?? normalizeWeights(part.boneWeights, vertexCount)
  // The normals-as-colours are only read by the debug "show normals" pass.
  const normalColors = scratch?.normalColors
  const wantNormalColors = normalColors !== undefined

  // Every array this loop reads is hoisted into a local before the loop
  // starts. The part is a plain object whose fields are megamorphic to the
  // JIT (the loader builds one shape per model), so a `part.vertices[i]` read
  // inside the loop is a dictionary lookup per access — with 12 accesses per
  // vertex over ~250k vertices a frame, that dominated the profile. The
  // locals are plain typed-array references, so the accesses are direct.
  const srcVertices = part.vertices
  const srcNormals = part.normals
  const srcIndices = part.boneIndices
  // `Math.hypot` is a variadic builtin that cannot be inlined by V8 and
  // guards against overflow; measured here it costs 13x a plain
  // `Math.sqrt` of the sum of squares. The vectors are unit-ish skinning
  // blends, so the overflow guard is not needed.
  const sqrt = Math.sqrt

  // The rigid vertices first: one bone, weight one, so the blend reduces to a
  // single matrix transform. On the retail meshes this is the majority of a
  // character's vertices, and it is the difference between two matrix reads per
  // vertex and eight.
  const singleList = scratch?.single
  const singleBindings = scratch?.singleBinding
  if (singleList !== undefined && singleBindings !== undefined) {
    for (let i = 0; i < singleList.length; i += 1) {
      const v = singleList[i]
      const v3 = v * 3
      const v4 = v * 4
      const px = srcVertices[v3]
      const py = srcVertices[v3 + 1]
      const pz = srcVertices[v3 + 2]
      const nx = srcNormals[v3]
      const ny = srcNormals[v3 + 1]
      const nz = srcNormals[v3 + 2]
      const at = singleBindings[i] * 16
      vertices[v3] = px * skin[at] + py * skin[at + 4] + pz * skin[at + 8] + skin[at + 12]
      vertices[v3 + 1] = px * skin[at + 1] + py * skin[at + 5] + pz * skin[at + 9] + skin[at + 13]
      vertices[v3 + 2] = px * skin[at + 2] + py * skin[at + 6] + pz * skin[at + 10] + skin[at + 14]
      let tnx = nx * skin[at] + ny * skin[at + 4] + nz * skin[at + 8]
      let tny = nx * skin[at + 1] + ny * skin[at + 5] + nz * skin[at + 9]
      let tnz = nx * skin[at + 2] + ny * skin[at + 6] + nz * skin[at + 10]
      const length = sqrt(tnx * tnx + tny * tny + tnz * tnz)
      if (length > 1e-12) {
        const inv = 1 / length
        tnx *= inv
        tny *= inv
        tnz *= inv
      }
      normals[v3] = tnx
      normals[v3 + 1] = tny
      normals[v3 + 2] = tnz
      if (tangents !== undefined && sourceTangents !== undefined) {
        const gx = sourceTangents[v4]
        const gy = sourceTangents[v4 + 1]
        const gz = sourceTangents[v4 + 2]
        const btx = gx * skin[at] + gy * skin[at + 4] + gz * skin[at + 8]
        const bty = gx * skin[at + 1] + gy * skin[at + 5] + gz * skin[at + 9]
        const btz = gx * skin[at + 2] + gy * skin[at + 6] + gz * skin[at + 10]
        const tlength = sqrt(btx * btx + bty * bty + btz * btz)
        const tinv = tlength > 1e-12 ? 1 / tlength : 0
        tangents[v4] = btx * tinv
        tangents[v4 + 1] = bty * tinv
        tangents[v4 + 2] = btz * tinv
        tangents[v4 + 3] = sourceTangents[v4 + 3]
      }
      if (wantNormalColors) {
        normalColors[v3] = normals[v3] * 0.5 + 0.5
        normalColors[v3 + 1] = normals[v3 + 1] * 0.5 + 0.5
        normalColors[v3 + 2] = normals[v3 + 2] * 0.5 + 0.5
      }
    }
  }

  // The rest need the blend. Without a scratch the buckets are unknown and every
  // vertex goes through here — the pre-bucketing behaviour.
  const multiList = scratch?.multi
  const loopCount = multiList === undefined ? vertexCount : multiList.length
  for (let i = 0; i < loopCount; i += 1) {
    const v = multiList === undefined ? i : multiList[i]
    const v3 = v * 3
    const v4 = v * 4
    const px = srcVertices[v3]
    const py = srcVertices[v3 + 1]
    const pz = srcVertices[v3 + 2]
    const nx = srcNormals[v3]
    const ny = srcNormals[v3 + 1]
    const nz = srcNormals[v3 + 2]

    // The weights, normalized to sum to one. A vertex whose four weights sum
    // to zero has no influence and keeps its bind position.
    const weightSum = weights[v4] + weights[v4 + 1] + weights[v4 + 2] + weights[v4 + 3]

    if (weightSum <= 0) {
      vertices[v3] = px
      vertices[v3 + 1] = py
      vertices[v3 + 2] = pz
      normals[v3] = nx
      normals[v3 + 1] = ny
      normals[v3 + 2] = nz
      if (tangents !== undefined && sourceTangents !== undefined) {
        tangents[v4] = sourceTangents[v4]
        tangents[v4 + 1] = sourceTangents[v4 + 1]
        tangents[v4 + 2] = sourceTangents[v4 + 2]
        tangents[v4 + 3] = sourceTangents[v4 + 3]
      }
    } else {
      let tx = 0
      let ty = 0
      let tz = 0
      let tnx = 0
      let tny = 0
      let tnz = 0
      // The tangent rides the same blend: it is a direction, so only the
      // rotation part of the skin matrix applies to it.
      let btx = 0
      let bty = 0
      let btz = 0
      // The tangent's own source components, read once per vertex rather than
      // once per bone.
      const gx = sourceTangents === undefined ? 0 : sourceTangents[v4]
      const gy = sourceTangents === undefined ? 0 : sourceTangents[v4 + 1]
      const gz = sourceTangents === undefined ? 0 : sourceTangents[v4 + 2]
      for (let k = 0; k < 4; k += 1) {
        const weight = weights[v4 + k]
        if (weight <= 0) continue
        const binding = srcIndices[v4 + k]
        if (binding >= bindCount) continue
        const at = binding * 16
        tx += weight * (px * skin[at] + py * skin[at + 4] + pz * skin[at + 8] + skin[at + 12])
        ty += weight * (px * skin[at + 1] + py * skin[at + 5] + pz * skin[at + 9] + skin[at + 13])
        tz += weight * (px * skin[at + 2] + py * skin[at + 6] + pz * skin[at + 10] + skin[at + 14])
        tnx += weight * (nx * skin[at] + ny * skin[at + 4] + nz * skin[at + 8])
        tny += weight * (nx * skin[at + 1] + ny * skin[at + 5] + nz * skin[at + 9])
        tnz += weight * (nx * skin[at + 2] + ny * skin[at + 6] + nz * skin[at + 10])
        if (sourceTangents !== undefined) {
          btx += weight * (gx * skin[at] + gy * skin[at + 4] + gz * skin[at + 8])
          bty += weight * (gx * skin[at + 1] + gy * skin[at + 5] + gz * skin[at + 9])
          btz += weight * (gx * skin[at + 2] + gy * skin[at + 6] + gz * skin[at + 10])
        }
      }
      vertices[v3] = tx
      vertices[v3 + 1] = ty
      vertices[v3 + 2] = tz
      const length = sqrt(tnx * tnx + tny * tny + tnz * tnz)
      if (length > 1e-12) {
        const inv = 1 / length
        tnx *= inv
        tny *= inv
        tnz *= inv
      }
      normals[v3] = tnx
      normals[v3 + 1] = tny
      normals[v3 + 2] = tnz
      if (tangents !== undefined && sourceTangents !== undefined) {
        const tlength = sqrt(btx * btx + bty * bty + btz * btz)
        const tinv = tlength > 1e-12 ? 1 / tlength : 0
        tangents[v4] = btx * tinv
        tangents[v4 + 1] = bty * tinv
        tangents[v4 + 2] = btz * tinv
        // The handedness sign is a property of the UV layout, not of the
        // pose: it survives the skinning untouched.
        tangents[v4 + 3] = sourceTangents[v4 + 3]
      }
    }
    if (wantNormalColors) {
      normalColors[v3] = normals[v3] * 0.5 + 0.5
      normalColors[v3 + 1] = normals[v3 + 1] * 0.5 + 0.5
      normalColors[v3 + 2] = normals[v3 + 2] * 0.5 + 0.5
    }
  }

  return {
    // Spread first: the texture channels (`normalSource`/`ormSource`) and the
    // rest of the part ride along — a skinned part is the same part deformed.
    ...part,
    vertices,
    uv: part.uv,
    normals,
    // The skinned tangent frame, when the mesh ships one.
    ...(tangents !== undefined ? { tangents } : {}),
    // The debug view's normals-as-colours: only present when they were
    // computed, so a caller that wants them asks for them.
    ...(wantNormalColors ? { normalColors } : {}),
    textureSource: part.textureSource,
  }
}

// ---------------------------------------------------------------------------
// Runtime rig loading (browser side)
// ---------------------------------------------------------------------------

/** One character's staged skeleton + clip set, by {@link MODEL_SOURCES} id. */
export interface RigSource {
  /** Character key ('diablo' | 'amazon'); also the animation-set cache key. */
  id: string
  skeletonUrls: string[]
  animationUrls: string[]
}

/**
 * Where the staged samples put each character's skeleton and clip set, under
 * {@link MODEL_ROOT} (mirrored there by `tools/copy-gr2-samples.ts`). Keyed by
 * the MODEL_SOURCES prefix of a model id.
 */
const RIG_SOURCES: Record<string, RigSource> = {
  // Town NPCs — same shape, staged by tools/stage-npc-models.ts and the
  // animation pass. `rogue1` rides the shared `navi` rig (its unit definition
  // wires that skeleton). Unknown clip names in a set fall back to bind pose
  // in the layer, so a missing fidget never breaks a character.
  ...Object.fromEntries(
    ['gheed', 'akara', 'kashya', 'charsi', 'warriv1', 'navi'].map((id) => [
      id,
      {
        id,
        skeletonUrls: [`data/hd/character/npc/${id}/skeleton/${id}.skeleton`],
        animationUrls: [`data/hd/character/npc/${id}/animation/combined.animations`],
      },
    ]),
  ),
  rogue1: {
    id: 'rogue1',
    skeletonUrls: ['data/hd/character/npc/navi/skeleton/navi.skeleton'],
    animationUrls: ['data/hd/character/npc/navi/animation/combined.animations'],
  },
  // Monsters the game spawns: their own skeleton + `combined.animations`
  // (bare clip names — `attack1`, `walk`, `skill1`, …; the state machine's
  // prefix chain lands on them). Keyed by the MODEL_SOURCES prefix of a model
  // id (`skeleton1-head` → here), same as the players and NPCs.
  ...Object.fromEntries(
    ['skeleton1', 'zombie1', 'brute2'].map((id) => [
      id,
      {
        id,
        skeletonUrls: [`data/hd/character/enemy/${id}/skeleton/${id}.skeleton`],
        animationUrls: [`data/hd/character/enemy/${id}/animation/combined.animations`],
      },
    ]),
  ),
  diablo: {
    id: 'diablo',
    skeletonUrls: ['data/hd/character/enemy/diablo/skeleton/diablo.skeleton'],
    animationUrls: ['data/hd/character/enemy/diablo/animation/combined.animations'],
  },
  amazon: {
    id: 'amazon',
    skeletonUrls: ['data/hd/character/player/amazon/skeleton/amazon.skeleton'],
    animationUrls: ['data/hd/character/player/amazon/animation/combined.animations'],
  },
}

/** `modelKey` → rig id ('amazon-torso' → 'amazon', 'diablo-torso' → 'diablo'). */
export function rigKeyForModel(modelKey: string): string | null {
  for (const id of Object.keys(RIG_SOURCES)) {
    if (modelKey === id || modelKey.startsWith(`${id}-`)) return id
  }
  return null
}

/** A decoded skeleton + clip set ready for {@link computeBonePose}. */
export interface AnimationRig {
  skeleton: Gr2Skeleton
  /** `bone name -> skeleton bone index`. */
  boneIndex: ReadonlyMap<string, number>
  /** Inverse bind matrices, 16 floats per skeleton bone. */
  inverseBind: Mat4Array
  /** Clips by name (the `Animations` root of the character's clip set). */
  animations: ReadonlyMap<string, Gr2Animation>
  /**
   * The clip's transform tracks with ALL its track groups merged (the groups
   * are disjoint by name on the real files), or null when the clip is absent.
   * Cached per clip.
   */
  tracksFor(clipName: string): readonly Gr2TransformTrack[] | null
  /**
   * The clip's authored ground pace: the rate its planted foot slides backward
   * through model space, in model units per clip-second — 0 when the clip does
   * not walk (idle, attacks) or carries no foot targets.
   *
   * Every retail HD locomotion clip is a treadmill: the root bone's travel over
   * a full cycle is exactly 0.000 in x, y and z, and the planted foot slides
   * backward at a constant rate instead. That rate IS the ground speed the clip
   * was authored for, so advancing the clip's clock by `distance / pace` makes
   * the planted foot exactly stationary in the world. Measured from the clip's
   * own `L_IK_position*` foot-target tracks (the retail foot-planting rig), so
   * it needs no per-character table. Cached per clip.
   */
  paceFor(clipName: string): number
}

const rigCache = new Map<string, Promise<AnimationRig | null>>()

/**
 * The treadmill rate of one clip, measured from its own foot-target tracks.
 *
 * Every retail HD locomotion clip steps in place: the root bone's travel over a
 * full cycle is exactly 0.000, and the planted foot slides backward instead.
 * The clips ship the retail foot-planting rig — `L_IK_positionY` (foot height)
 * and `L_IK_positionZ` (its forward position) in the root track group — so the
 * rate can be read from the data rather than tabulated per character: while the
 * foot is at ground level its forward coordinate marches backward at a constant
 * rate, and that rate is the ground speed the clip was authored for.
 *
 * Returns 0 when the clip has no foot targets or no sustained backward slide
 * (idle poses, attacks: the feet stay put and there is nothing to match).
 */
function paceOfClip(animation: Gr2Animation): number {
  let height: Gr2VectorTrack | undefined
  let forward: Gr2VectorTrack | undefined
  for (const group of animation.trackGroups) {
    for (const track of group.vectorTracks) {
      if (track.curve === undefined) continue
      if (track.name === 'L_IK_positionY') height = track
      else if (track.name === 'L_IK_positionZ') forward = track
    }
  }
  const heightCurve = height?.curve
  const forwardCurve = forward?.curve
  if (heightCurve === undefined || forwardCurve === undefined) return 0
  if (!(animation.duration > 0)) return 0

  // A clip is sampled at a fixed rate and the foot is "down" wherever its
  // target sits within a band above the clip's own lowest point — the same
  // contact test a footstep detector uses, and independent of the model scale.
  const samples = 48
  const dt = animation.duration / samples
  const ys: number[] = []
  const zs: number[] = []
  for (let i = 0; i <= samples; i += 1) {
    const t = Math.min(animation.duration, i * dt)
    ys.push(heightCurve.evaluate(t)[0] ?? 0)
    zs.push(forwardCurve.evaluate(t)[0] ?? 0)
  }
  const lowest = Math.min(...ys)
  const rates: number[] = []
  for (let i = 1; i < ys.length; i += 1) {
    const down = ys[i] <= lowest + 0.15 && ys[i - 1] <= lowest + 0.15
    if (!down) continue
    const rate = (zs[i] - zs[i - 1]) / dt
    if (rate < 0) rates.push(-rate)
  }
  // A stride is a sustained slide; a couple of samples is noise on a foot that
  // is only passing through the band.
  if (rates.length < 4) return 0
  rates.sort((a, b) => a - b)
  return rates[Math.floor(rates.length / 2)]
}

async function fetchFirst(urls: string[]): Promise<Uint8Array | null> {
  for (const url of urls) {
    try {
      const res = await fetch(MODEL_ROOT + url)
      if (!res.ok) continue
      const bytes = new Uint8Array(await res.arrayBuffer())
      // A dev server's SPA fallback answers a missing asset with 200 and the
      // page markup — a 200 is not a game file until the magic says so.
      if (isGr2(bytes)) return bytes
    } catch {
      // Server refused the fetch — treat as absent and try the next layout.
    }
  }
  return null
}

/**
 * Load (and cache) one character's skeleton + animation set for a
 * {@link MODEL_SOURCES} model id. Returns null when either file is not staged
 * (the actor layer then keeps bind pose).
 */
export function loadAnimationRig(modelKey: string): Promise<AnimationRig | null> {
  const key = rigKeyForModel(modelKey)
  if (key === null) return Promise.resolve(null)
  let cached = rigCache.get(key)
  if (!cached) {
    cached = loadRigUncached(key)
    rigCache.set(key, cached)
  }
  return cached
}

async function loadRigUncached(key: string): Promise<AnimationRig | null> {
  const source = RIG_SOURCES[key]
  const [skeletonBytes, animationBytes] = await Promise.all([
    fetchFirst(source.skeletonUrls),
    fetchFirst(source.animationUrls),
  ])
  if (skeletonBytes === null || animationBytes === null) return null

  const file = loadGr2(skeletonBytes)
  const skeleton = file.skeletons[0]
  if (!skeleton) return null
  const set = loadGr2Animations(animationBytes)

  const animations = new Map<string, Gr2Animation>()
  for (const animation of set.animations) {
    if (!animations.has(animation.name)) animations.set(animation.name, animation)
  }
  const trackCache = new Map<string, readonly Gr2TransformTrack[] | null>()
  const paceCache = new Map<string, number>()
  return {
    skeleton,
    boneIndex: boneIndexOf(skeleton),
    inverseBind: inverseBindOf(skeleton),
    animations,
    tracksFor(clipName: string): readonly Gr2TransformTrack[] | null {
      let tracks = trackCache.get(clipName)
      if (tracks === undefined) {
        const animation = animations.get(clipName)
        tracks = animation === undefined ? null : animation.trackGroups.flatMap((group) => group.transformTracks)
        trackCache.set(clipName, tracks)
      }
      return tracks
    },
    paceFor(clipName: string): number {
      let pace = paceCache.get(clipName)
      if (pace === undefined) {
        const animation = animations.get(clipName)
        pace = animation === undefined ? 0 : paceOfClip(animation)
        paceCache.set(clipName, pace)
      }
      return pace
    },
  }
}

/**
 * Skin one loaded part against a rig pose (convenience over {@link skinMesh}):
 * reorders the per-bone world matrices into the part's binding space and
 * returns the part unchanged when it carries no skin data.
 */
export function skinPartWithRig(part: PartSpec, rig: AnimationRig, boneWorlds: Mat4Array): PartSpec {
  return skinPartWithRigInto(part, rig, boneWorlds, undefined, undefined)
}

/**
 * The reusable buffers one part's skinning pass needs, beyond the geometry
 * {@link SkinScratch} covers: the per-binding matrices reordered into the
 * part's binding space, and the inverse bind matrices in the same space.
 *
 * The inverse bind matrices do NOT change from frame to frame — they are the
 * part's rest pose — so they are computed once per part and reused. The
 * world matrices change every frame and are rewritten in place.
 */
export interface BindingScratch {
  /** The pose, reordered into the part's binding space. */
  world: Float32Array
  /** The inverse bind pose, in the part's binding space (constant). */
  inverseBind: Float32Array
  /** True once `inverseBind` has been filled. */
  inverseBindReady: boolean
}

/** The binding scratch one part needs. */
export function bindingScratchFor(boneBindings: readonly Gr2BoneBinding[]): BindingScratch {
  return {
    world: new Float32Array(boneBindings.length * 16),
    inverseBind: new Float32Array(boneBindings.length * 16),
    inverseBindReady: false,
  }
}

/**
 * Skin one loaded part against a rig pose, reusing `scratch` and
 * `bindings` when they are given.
 *
 * The two reordered matrix sets are written in place; the geometry goes into
 * `scratch` (see {@link SkinScratch}). The caller keeps one pair per part and
 * hands the same ones back every frame, so a frame allocates nothing.
 */
export function skinPartWithRigInto(
  part: PartSpec,
  rig: AnimationRig,
  boneWorlds: Mat4Array,
  scratch: SkinScratch | undefined,
  bindings: BindingScratch | undefined,
): PartSpec {
  const boneWeights = part.boneWeights
  const boneIndices = part.boneIndices
  const boneBindings = part.boneBindings
  if (!boneWeights || !boneIndices || !boneBindings || boneBindings.length === 0) return part
  let world: Float32Array
  let inverseBind: Float32Array
  if (bindings !== undefined) {
    world = bindings.world
    inverseBind = bindings.inverseBind
    if (!bindings.inverseBindReady) {
      matricesForBindings(rig.inverseBind, rig.boneIndex, boneBindings, inverseBind)
      bindings.inverseBindReady = true
    }
    matricesForBindings(boneWorlds, rig.boneIndex, boneBindings, world)
  } else {
    world = matricesForBindings(boneWorlds, rig.boneIndex, boneBindings)
    inverseBind = matricesForBindings(rig.inverseBind, rig.boneIndex, boneBindings)
  }
  return skinMeshInto(
    { ...part, boneWeights, boneIndices },
    world,
    boneBindings,
    inverseBind,
    scratch,
  )
}
