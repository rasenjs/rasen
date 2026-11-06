/**
 * The example's rig loader: staged Granny skeletons and clip sets, keyed by model.
 *
 * The mechanism lives in `@rasenjs/animation` (`skeleton.ts`): pose evaluation,
 * inverse-bind matrices, binding reorder and the skinning pass. What stays here is
 * what belongs to this game — where the staged files are, how a clip's authored
 * ground pace is measured, and the cache that keeps one rig per character.
 */

import {
  boneIndexByName,
  computePose,
  computePoseBlended,
  inverseBindOf,
  matricesForBindings,
  skinMeshInto,
  type SkinnedMeshPart,
} from '@rasenjs/animation'
import type { Gr2BoneBinding, Gr2Skeleton } from '@rasenjs/assets'
import type { Gr2Animation, Gr2TransformTrack, Gr2VectorTrack } from '@rasenjs/assets'
import { isGr2, loadGr2 } from '@rasenjs/assets'
import { loadGr2Animations } from '@rasenjs/assets'
import { MODEL_ROOT, type PartSpec } from './model'

/**
 * A part of this game's models that carries its skin inputs.
 *
 * The package's `SkinnedMeshPart` is the narrow contract skinning reads; a
 * `PartSpec` adds the UVs, the texture channels and the material the renderer
 * needs, and `skinMeshInto` hands that shape straight back.
 */
export interface SkinnedPart extends PartSpec, SkinnedMeshPart {
  boneWeights: Float32Array
  boneIndices: Uint8Array
}

export {
  computePose as computeBonePose,
  computePoseBlended as computeBonePoseBlended,
  boneIndexByName,
  inverseBindOf,
  matricesForBindings,
  skinMeshInto,
}

/** Per-bone matrices: 16 row-major floats per bone. */
export type Mat4Array = Float32Array

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
    boneIndex: boneIndexByName(skeleton),
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
 * Skin one loaded part against a rig pose (convenience over {@link skinMeshInto}):
 * reorders the per-bone world matrices into the part's binding space and
 * returns the part unchanged when it carries no skin data.
 */
export function skinPartWithRig(part: PartSpec, rig: AnimationRig, boneWorlds: Mat4Array): PartSpec {
  return skinPartWithRigInto(part, rig, boneWorlds, undefined, undefined)
}

/** The output buffers one drawn instance keeps for its skinning pass. */
export type SkinOutput = {
  skin: Float32Array
  vertices: Float32Array
  normals: Float32Array
  tangents?: Float32Array
}

/**
 * The per-part matrices: reordered into the
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
 * Skin one loaded part against a rig pose, reusing the caller's buffers.
 *
 * The two reordered matrix sets are written in place; the geometry goes into
 * `out`. The caller keeps one set per drawn instance — two actors can share one
 * part object, so the outputs must not be shared — and hands the same ones back
 * every frame, so a frame allocates nothing.
 */
export function skinPartWithRigInto(
  part: PartSpec,
  rig: AnimationRig,
  boneWorlds: Mat4Array,
  out: SkinOutput | undefined,
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
    { ...part, boneWeights, boneIndices } as SkinnedPart,
    world,
    boneBindings,
    inverseBind,
    out,
  )
}
