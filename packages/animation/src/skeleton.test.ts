/**
 * The skeletal runtime, on a hand-built skeleton.
 *
 * The conventions under test are the ones the module states once: row-major
 * 16-float matrices, row-vector (`world = local * parentWorld`), translation in
 * the last row, quaternions as (x, y, z, w).
 */

import { describe, expect, it } from 'vitest'
import {
  boneIndexByName,
  computePose,
  computePoseBlended,
  inverseBindOf,
  matricesForBindings,
  skinMeshInto,
  type Bone,
  type Curve,
  type Skeleton,
  type TransformTrack,
} from './skeleton'

const IDENTITY_QUAT = [0, 0, 0, 1]
const IDENTITY_3X3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]

function bone(name: string, parentIndex: number, position: number[], inverseWorld?: number[]): Bone {
  return {
    name,
    parentIndex,
    localTransform: { position, orientation: IDENTITY_QUAT, scaleShear: IDENTITY_3X3 },
    ...(inverseWorld ? { inverseWorld } : {}),
  }
}

/** A constant curve, so a track can pin a channel without a clip. */
function constant(...values: number[]): Curve {
  return { evaluate: () => values }
}

/** The translation part of a row-major row-vector matrix (the last row). */
function translationOf(m: ArrayLike<number>, at = 0): number[] {
  return [m[at + 12], m[at + 13], m[at + 14]]
}

describe('computePose', () => {
  const skeleton: Skeleton = {
    bones: [bone('root', -1, [0, 0, 0]), bone('hip', 0, [2, 0, 0])],
  }

  it('evaluates the bind pose when there are no tracks', () => {
    const pose = computePose(skeleton, [], 0)
    expect(translationOf(pose, 0)).toEqual([0, 0, 0])
    // Row-vector: the child's local transform applies first, so its translation
    // is added to the parent's world translation.
    expect(translationOf(pose, 16)).toEqual([2, 0, 0])
  })

  it('overrides only the channel a track names', () => {
    const tracks: TransformTrack[] = [{ name: 'hip', position: constant(0, 3, 0) }]
    const pose = computePose(skeleton, tracks, 0)
    expect(translationOf(pose, 16)).toEqual([0, 3, 0])
    // The root keeps its bind pose: a track for one bone never touches another.
    expect(translationOf(pose, 0)).toEqual([0, 0, 0])
  })

  it('composes the parent chain', () => {
    const chained: Skeleton = {
      bones: [bone('a', -1, [1, 0, 0]), bone('b', 0, [2, 0, 0]), bone('c', 1, [4, 0, 0])],
    }
    const pose = computePose(chained, [], 0)
    expect(translationOf(pose, 32)).toEqual([7, 0, 0])
  })

  it('ignores a track whose name matches no bone', () => {
    const pose = computePose(skeleton, [{ name: 'vfx', position: constant(9, 9, 9) }], 0)
    expect(translationOf(pose, 16)).toEqual([2, 0, 0])
  })
})

describe('computePoseBlended', () => {
  it('blends the local pose, so a half-fade lands half way', () => {
    const skeleton: Skeleton = { bones: [bone('root', -1, [0, 0, 0])] }
    const a: TransformTrack[] = [{ name: 'root', position: constant(0, 0, 0) }]
    const b: TransformTrack[] = [{ name: 'root', position: constant(10, 0, 0) }]
    expect(translationOf(computePoseBlended(skeleton, a, 0, b, 0, 0), 0)).toEqual([0, 0, 0])
    expect(translationOf(computePoseBlended(skeleton, a, 0, b, 0, 1), 0)).toEqual([10, 0, 0])
    expect(translationOf(computePoseBlended(skeleton, a, 0, b, 0, 0.5), 0)[0]).toBeCloseTo(5, 6)
  })
})

describe('inverseBindOf', () => {
  it('reads the inverse the file stored', () => {
    const stored = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -3, 0, 0, 1]
    const skeleton: Skeleton = { bones: [bone('root', -1, [3, 0, 0], stored)] }
    expect([...inverseBindOf(skeleton)]).toEqual(stored)
  })

  it('inverts the bind pose when the file does not store one', () => {
    const skeleton: Skeleton = { bones: [bone('root', -1, [3, 2, 1])] }
    expect(translationOf(inverseBindOf(skeleton), 0)).toEqual([-3, -2, -1])
  })

  it('round-trips: bind pose times its inverse is the identity', () => {
    const skeleton: Skeleton = { bones: [bone('root', -1, [3, 2, 1])] }
    const pose = computePose(skeleton, [], 0)
    const inverse = inverseBindOf(skeleton)
    // Row-vector: pose * inverse must be identity.
    for (let r = 0; r < 4; r += 1) {
      for (let c = 0; c < 4; c += 1) {
        let sum = 0
        for (let k = 0; k < 4; k += 1) sum += pose[r * 4 + k] * inverse[k * 4 + c]
        expect(sum).toBeCloseTo(r === c ? 1 : 0, 5)
      }
    }
  })
})

describe('boneIndexByName', () => {
  it('maps names to skeleton indices, keeping the first of a duplicate', () => {
    const skeleton: Skeleton = { bones: [bone('a', -1, [0, 0, 0]), bone('a', 0, [0, 0, 0])] }
    expect(boneIndexByName(skeleton).get('a')).toBe(0)
  })
})

describe('matricesForBindings', () => {
  it('reorders into the mesh\'s binding order and identity-fills a missing bone', () => {
    const perBone = new Float32Array(32)
    perBone[16 + 12] = 7 // the second bone's translation
    const out = matricesForBindings(perBone, new Map([['b', 1]]), [
      { boneName: 'b' },
      { boneName: 'nope' },
    ])
    expect(translationOf(out, 0)).toEqual([7, 0, 0])
    // A binding whose name is not in the skeleton gets an identity, never a
    // stale row.
    expect(out[16]).toBe(1)
    expect(out[31]).toBe(1)
    expect(translationOf(out, 16)).toEqual([0, 0, 0])
  })
})

describe('skinMeshInto', () => {
  const part = {
    vertices: new Float32Array([5, 0, 0]),
    normals: new Float32Array([1, 0, 0]),
    boneWeights: new Float32Array([1, 0, 0, 0]),
    boneIndices: new Uint8Array([0, 0, 0, 0]),
    uv: new Float32Array([0, 0]),
  }
  const bindings = [{ boneName: 'root' }]

  it('leaves a vertex where it is under the identity', () => {
    const pose = computePose({ bones: [bone('root', -1, [0, 0, 0])] }, [], 0)
    const skinned = skinMeshInto(part, pose, bindings, inverseBindOf({ bones: [bone('root', -1, [0, 0, 0])] }))
    expect(skinned.vertices[0]).toBeCloseTo(5, 6)
    expect(skinned.normals[0]).toBeCloseTo(1, 6)
    // The fields this module does not own ride along untouched.
    expect(skinned.uv[0]).toBe(0)
  })

  it('moves a vertex with its bone', () => {
    const skeleton: Skeleton = { bones: [bone('root', -1, [0, 0, 0])] }
    const moved: Skeleton = { bones: [bone('root', -1, [2, 0, 0])] }
    const skinned = skinMeshInto(
      part,
      computePose(moved, [], 0),
      bindings,
      inverseBindOf(skeleton),
    )
    expect(skinned.vertices[0]).toBeCloseTo(7, 6)
  })

  it('blends two bones by weight', () => {
    // Bind: both bones at the origin. Pose: the second has travelled 4 units, so
    // a vertex split evenly between them lands at 2.
    const bindSkeleton: Skeleton = {
      bones: [bone('a', -1, [0, 0, 0]), bone('b', -1, [0, 0, 0])],
    }
    const posedSkeleton: Skeleton = {
      bones: [bone('a', -1, [0, 0, 0]), bone('b', -1, [4, 0, 0])],
    }
    const blended = {
      ...part,
      vertices: new Float32Array([0, 0, 0]),
      boneWeights: new Float32Array([0.5, 0.5, 0, 0]),
      boneIndices: new Uint8Array([0, 1, 0, 0]),
    }
    const skinned = skinMeshInto(
      blended,
      computePose(posedSkeleton, [], 0),
      [{ boneName: 'a' }, { boneName: 'b' }],
      inverseBindOf(bindSkeleton),
    )
    expect(skinned.vertices[0]).toBeCloseTo(2, 6)
  })

  it('keeps the bind position for a vertex whose weights sum to zero', () => {
    const skeleton: Skeleton = { bones: [bone('root', -1, [2, 0, 0])] }
    const unweighted = {
      ...part,
      boneWeights: new Float32Array([0, 0, 0, 0]),
    }
    const skinned = skinMeshInto(
      unweighted,
      computePose(skeleton, [], 0),
      bindings,
      inverseBindOf({ bones: [bone('root', -1, [0, 0, 0])] }),
    )
    expect(skinned.vertices[0]).toBeCloseTo(5, 6)
  })
})
