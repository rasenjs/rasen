/**
 * A skeletal runtime: bind poses, pose evaluation, and linear-blend skinning.
 *
 * The formats that carry skeletons disagree about almost everything — Granny
 * stores a bind transform per bone plus its inverse world, glTF stores a node
 * tree plus an inverse bind accessor, and a hand-authored rig stores whatever its
 * exporter felt like. What they agree on is what this module takes: a flat bone
 * array whose parents come first, a per-bone local transform in position /
 * quaternion / 3x3 scale-shear, and curves sampled at a time in seconds.
 *
 * The matrix convention is stated once and used everywhere: **row-major, 16
 * floats, row-vector**, so a point is `p * M` and a hierarchy composes as
 * `world = local * parentWorld`. A file format that stores column-major matrices
 * transposes on load, not here.
 *
 * The per-frame path allocates nothing: a mesh's static skin data (normalized
 * weights, the rigid-vertex buckets) is cached per part, the outputs can be a
 * buffer the caller reuses, and the single-bone fast path keeps a retail mesh's
 * rigid vertices off the four-bone blend.
 */

/** A sampled curve: returns `dimension` components at time `t` (seconds). */
export interface Curve {
  evaluate(t: number): ArrayLike<number>
}

/** A bone's bind-pose local transform, in the usual TRS split. */
export interface BoneTransform {
  /** Translation, 3 components. */
  position: ArrayLike<number>
  /** Rotation quaternion as (x, y, z, w), 4 components. */
  orientation: ArrayLike<number>
  /** Row-major 3x3 scale-shear, 9 components. */
  scaleShear: ArrayLike<number>
}

/** One bone of a skeleton, in a flat array ordered parents-first. */
export interface Bone {
  /** The name tracks and bindings address this bone by. */
  name: string
  /** Index of the parent in the same array, or -1 for a root. */
  parentIndex: number
  /** The bind-pose local transform. */
  localTransform: BoneTransform
  /**
   * The bind pose's inverse world matrix (16 floats), when the format stores it.
   *
   * Optional because some formats do not; `inverseBindOf` inverts the bind pose
   * when it is absent.
   */
  inverseWorld?: ArrayLike<number>
}

/** A skeleton: bones ordered so every parent precedes its children. */
export interface Skeleton {
  bones: readonly Bone[]
}

/**
 * One bone's animation at a clip's time.
 *
 * Each channel is optional: a track that omits one falls back to the bone's bind
 * transform for that channel, which is exactly how the retail files encode "this
 * clip only rotates the jaw".
 */
export interface TransformTrack {
  /** The bone this track animates. */
  name: string
  orientation?: Curve
  position?: Curve
  scaleShear?: Curve
}

/** A mesh's reference to a bone, in the mesh's own index space. */
export interface BoneBinding {
  /** The bone's name; `matricesForBindings` maps it into the skeleton's order. */
  boneName: string
}

/**
 * Per-bone matrices are plain `Float32Array`s: 16 row-major floats per entry,
 * translation in the last row. Used both for skeleton-bone-indexed poses and for
 * the per-binding matrices skinning takes.
 */
type Mat4Array = Float32Array

/**
 * The mesh data skinning reads and writes.
 *
 * Deliberately narrow: positions and normals (and the tangent frame and the
 * normals-pass colours when the mesh has them). A renderer's own part type is
 * expected to be a superset, so `skinMeshInto` can hand back the same object
 * shape it was given.
 */
export interface SkinnedMeshPart {
  /** Vertex positions, 3 floats per vertex. */
  vertices: Float32Array
  /** Vertex normals, 3 floats per vertex. */
  normals: Float32Array
  /** The mesh's tangent frame, 4 floats per vertex (xyz + handedness). */
  tangents?: Float32Array
  /** Normals-as-colours, 3 floats per vertex, when the debug pass wants them. */
  normalColors?: Float32Array
  /** Skin weights, 4 per vertex. */
  boneWeights: Float32Array
  /** Skin bone indices, 4 per vertex — indices into the mesh's bindings. */
  boneIndices: Uint8Array | Uint16Array
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
 * Compose one `BoneTransform` (optionally overridden by a sampled
 * transform track) into a row-major matrix: `M3 = ScaleShear * Rotation(q)`,
 * translation in the last row. Channel overrides fall back to the bind
 * transform's channel when the track omits that curve.
 */
function localMatrix(
  bind: BoneTransform,
  track: TransformTrack | undefined,
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
  bind: BoneTransform,
  track: TransformTrack | undefined,
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
  position: ArrayLike<number>,
  orientation: ArrayLike<number>,
  scaleShear: ArrayLike<number>,
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
  bind: BoneTransform,
  trackA: TransformTrack | undefined,
  tA: number,
  trackB: TransformTrack | undefined,
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
 * The clip's tracks indexed by bone name — the first track of a name wins.
 *
 * The index is memoized per track LIST (the clip's own array, which the rig
 * caches), because building it costs a map insert per track and the pose is
 * evaluated for every animated actor on every frame. A clip's tracks never
 * change, so the index is built once.
 */
const trackIndexes = new WeakMap<readonly TransformTrack[], Map<string, TransformTrack>>()

function trackIndexFor(
  tracks: readonly TransformTrack[],
): Map<string, TransformTrack> {
  const cached = trackIndexes.get(tracks)
  if (cached !== undefined) return cached
  const index = new Map<string, TransformTrack>()
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
export function computePose(
  skeleton: Skeleton,
  tracks: readonly TransformTrack[],
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
export function computePoseBlended(
  skeleton: Skeleton,
  tracksA: readonly TransformTrack[],
  tA: number,
  tracksB: readonly TransformTrack[],
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
export function inverseBindOf(skeleton: Skeleton): Mat4Array {
  const out = new Float32Array(skeleton.bones.length * 16)
  const worlds = computePose(skeleton, [], 0)
  for (let i = 0; i < skeleton.bones.length; i += 1) {
    const stored = skeleton.bones[i].inverseWorld
    if (stored !== undefined && stored.length >= 16) {
      out.set(stored, i * 16)
      continue
    }
    // The format did not store it: invert the bind pose, which is the same matrix.
    invertAffineInto(worlds, i * 16, out, i * 16)
  }
  return out
}

/** `out = the inverse of a row-vector affine matrix`, 16 floats each. */
function invertAffineInto(
  m: ArrayLike<number>,
  at: number,
  out: Float32Array,
  outAt: number,
): void {
  // Rotation/scale part: invert the 3x3.
  const a = m[at]
  const b = m[at + 1]
  const c = m[at + 2]
  const d = m[at + 4]
  const e = m[at + 5]
  const f = m[at + 6]
  const g = m[at + 8]
  const h = m[at + 9]
  const i = m[at + 10]
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
  const invDet = Math.abs(det) > 1e-12 ? 1 / det : 0
  const r0 = (e * i - f * h) * invDet
  const r1 = (c * h - b * i) * invDet
  const r2 = (b * f - c * e) * invDet
  const r3 = (f * g - d * i) * invDet
  const r4 = (a * i - c * g) * invDet
  const r5 = (c * d - a * f) * invDet
  const r6 = (d * h - e * g) * invDet
  const r7 = (b * g - a * h) * invDet
  const r8 = (a * e - b * d) * invDet
  // Row-vector translation lives in the last row; invert as `-t * R^-1`.
  const tx = m[at + 12]
  const ty = m[at + 13]
  const tz = m[at + 14]
  out[outAt] = r0
  out[outAt + 1] = r1
  out[outAt + 2] = r2
  out[outAt + 3] = 0
  out[outAt + 4] = r3
  out[outAt + 5] = r4
  out[outAt + 6] = r5
  out[outAt + 7] = 0
  out[outAt + 8] = r6
  out[outAt + 9] = r7
  out[outAt + 10] = r8
  out[outAt + 11] = 0
  out[outAt + 12] = -(tx * r0 + ty * r3 + tz * r6)
  out[outAt + 13] = -(tx * r1 + ty * r4 + tz * r7)
  out[outAt + 14] = -(tx * r2 + ty * r5 + tz * r8)
  out[outAt + 15] = 1
}

/** A map from bone name to skeleton index (the first bone wins on a duplicate). */
export function boneIndexByName(skeleton: Skeleton): Map<string, number> {
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
  boneBindings: readonly BoneBinding[],
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
 * What belongs to the mesh rather than to a pose: the normalized weights and the
 * rigid-vertex buckets.
 *
 * These are shared by every instance drawn from the same mesh, so they are cached
 * per part. The OUTPUT buffers are not here — two actors can share one mesh, and
 * a shared output would let one actor's pose overwrite the other's.
 */
interface StaticSkin {
  /** The weights, already normalized to sum to one (done once per mesh). */
  weights: Float32Array
  /** The vertices whose blend is a single bone. */
  single: Int32Array
  /** The binding of each entry in {@link single}. */
  singleBinding: Int32Array
  /** The vertices that need the general blend (2..4 bones, or none at all). */
  multi: Int32Array
}

const partStatics = new WeakMap<object, StaticSkin>()

/** The mesh's own skin data, built once and shared by every instance of it. */
function staticsForPart(part: SkinnedMeshPart, bindCount: number): StaticSkin {
  const cached = partStatics.get(part)
  if (cached !== undefined) return cached
  const statics = staticSkinFor(part, bindCount)
  partStatics.set(part, statics)
  return statics
}

function staticSkinFor(part: SkinnedMeshPart, bindCount: number): StaticSkin {
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
/**
 * Linear-blend-skin one part into a new object of the same shape.
 *
 * The per-part scratch (normalized weights, the rigid-vertex buckets, the output
 * buffers) is cached inside this module, keyed by the part, so a caller only says
 * which part and which pose. A part's weights are static — they belong to the
 * mesh, not the pose — and renormalizing them per frame was a divide in the
 * innermost loop of the frame's hottest code.
 *
 * `boneMatrices` and `inverseBind` hold 16 row-major floats per entry of
 * `boneBindings`: the current world matrix and the inverse bind matrix of the
 * bone each binding names. A vertex whose four weights sum to zero keeps its bind
 * position and normal, which is what makes an unrigged part skinnable by
 * accident rather than by crash.
 */
export function skinMeshInto<Part extends SkinnedMeshPart>(
  part: Part,
  boneMatrices: Mat4Array,
  boneBindings: readonly BoneBinding[],
  inverseBind: Mat4Array,
  out?: {
    skin?: Float32Array
    vertices?: Float32Array
    normals?: Float32Array
    tangents?: Float32Array
  },
): Part {
  const bindCount = boneBindings.length
  if (boneMatrices.length < bindCount * 16) {
    throw new Error('skinning: boneMatrices has fewer entries than boneBindings')
  }
  const statics = staticsForPart(part, bindCount)
  if (inverseBind.length < bindCount * 16) {
    throw new Error('skinning: inverseBind has fewer entries than boneBindings')
  }

  // Per-binding skin matrices: S = inverseBind * world (row-vector: bind-space
  // first, then the animated world). Computed once per part per frame.
  // The outputs: one actor's copy of the mesh. Passing `out` keeps a long-lived
  // buffer per drawn instance; leaving it out allocates, which is right for a
  // one-shot read (`inverseBindOf`, a lab page).
  const skin = out?.skin ?? new Float32Array(bindCount * 16)
  for (let b = 0; b < bindCount; b += 1) {
    mulInto(inverseBind, b * 16, boneMatrices, b * 16, skin, b * 16)
  }

  const vertices = out?.vertices ?? new Float32Array(part.vertices.length)
  const normals = out?.normals ?? new Float32Array(part.normals.length)
  // The tangent frame, when the mesh ships one. It is skinned with the same
  // bone blend as the normal: a tangent left in bind space would turn the
  // normal map into a texture that no longer follows the surface.
  const sourceTangents = part.tangents
  const tangents = sourceTangents ? (out?.tangents ?? new Float32Array(sourceTangents.length)) : undefined
  // The normalized weights belong to the mesh, so they are computed once and
  // cached; the loop below therefore reads ONE array, which makes the "which
  // weights am I using" decision once per part rather than once per bone per
  // vertex.
  const weights = statics.weights
  // The normals-as-colours are only read by the debug "show normals" pass, and
  // only allocated when the part carries the channel.
  const normalColors = part.normalColors === undefined ? undefined : new Float32Array(part.normalColors.length)
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
  const singleList = statics.single
  const singleBindings = statics.singleBinding
  {
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

  // The rest need the general blend.
  const multiList = statics.multi
  const loopCount = multiList.length
  for (let i = 0; i < loopCount; i += 1) {
    const v = multiList[i]
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
    // Spread first: every field this module does not own — the UVs, the texture
    // channels, a material handle — rides along untouched. A skinned part is the
    // same part deformed.
    ...part,
    vertices,
    normals,
    // The skinned tangent frame, when the mesh ships one.
    ...(tangents !== undefined ? { tangents } : {}),
    // The debug view's normals-as-colours: only present when they were computed,
    // so a caller that wants them asks for them.
    ...(wantNormalColors ? { normalColors } : {}),
  } as Part
}

