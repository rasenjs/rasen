/**
 * Real-data oracles for CPU skinning (`./skinning.ts`), run against the staged
 * D2R samples in `.scratch/gr2`.
 *
 * The central convention oracle is the inverse-bind identity check: a bone
 * chain's composed bind pose times the file's own `inverseWorld` must be
 * identity. It settles every convention doubt at once (matrix layout,
 * quaternion order, `world = local * parentWorld`) — the three natural
 * alternatives give residuals of 3.5 to 23 on these files versus 4.5e-4.
 *
 * A note on "bind pose (t where tracks are at rest)": on these files the clip
 * rest pose is NOT the skeleton bind pose (measured: the closest any diablo
 * clip comes to the skeleton's stored local transforms is 6.5e-1 in matrix
 * elements — `neutral` at t=1.25s), so the rest pose is exercised with an
 * empty track list, which is exactly `computeBonePose`'s "untracked bones are
 * bind pose" path: sampling any t with no tracks must reproduce the original
 * vertices within 1e-3.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadGr2, type Gr2BoneBinding, type Gr2Mesh } from '@rasenjs/assets'
import { loadGr2Animations, type Gr2Animation, type Gr2TransformTrack } from '@rasenjs/assets'
import { buildPart, type PartSpec } from './model'
import {
  boneIndexByName,
  computeBonePose,
  computeBonePoseBlended,
  inverseBindOf,
  matricesForBindings,
  skinMeshInto,
  type SkinnedPart,
} from './skinning'

const GR2 = join(__dirname, '..', '..', '..', '..', '.scratch', 'gr2')

const diabloSkeleton = loadGr2(readFileSync(join(GR2, 'diablo', 'skeleton', 'diablo.skeleton'))).skeletons[0]
const diabloModel = loadGr2(readFileSync(join(GR2, 'diablo', 'torso.model')))
const diabloAnims = loadGr2Animations(readFileSync(join(GR2, 'diablo', 'animation', 'combined.animations')))
const diabloBoneIndex = boneIndexByName(diabloSkeleton)
const diabloInverseBind = inverseBindOf(diabloSkeleton)

function clipNamed(name: string): Gr2Animation {
  const animation = diabloAnims.animations.find((entry) => entry.name === name)
  if (!animation) throw new Error(`test fixture: diablo clip "${name}" is missing`)
  return animation
}

function tracksOf(animation: Gr2Animation): Gr2TransformTrack[] {
  return animation.trackGroups.flatMap((group) => group.transformTracks)
}

function asSkinned(part: PartSpec): SkinnedPart {
  if (!part.boneWeights || !part.boneIndices) throw new Error('test fixture: part lost its skin data')
  return { ...part, boneWeights: part.boneWeights, boneIndices: part.boneIndices }
}

/** The whole mesh as one skinned vertex soup (no triangle expansion). */
function wholeMeshPart(mesh: Gr2Mesh): SkinnedPart {
  if (!mesh.boneWeights || !mesh.boneIndices) throw new Error('test fixture: mesh is not skinned')
  return {
    vertices: mesh.positions,
    uv: new Float32Array(mesh.vertexCount * 2),
    normals: mesh.normals ?? new Float32Array(mesh.vertexCount * 3),
    normalColors: new Float32Array(mesh.vertexCount * 3),
    textureSource: null,
    boneWeights: mesh.boneWeights,
    boneIndices: mesh.boneIndices,
  }
}

function bindingMatrices(mesh: Gr2Mesh, boneWorlds: Float32Array): Float32Array {
  return matricesForBindings(boneWorlds, diabloBoneIndex, mesh.boneBindings)
}

function bindPoseWorlds(): Float32Array {
  return computeBonePose(diabloSkeleton, [], 0)
}

/** Mean and worst triangle-edge distortion between two positions arrays. */
function edgeDistortion(mesh: Gr2Mesh, rest: Float32Array, posed: Float32Array): { mean: number; worst: number } {
  let sum = 0
  let worst = 0
  let edges = 0
  for (let i = 0; i + 2 < mesh.indices.length; i += 3) {
    for (let e = 0; e < 3; e += 1) {
      const a = mesh.indices[i + e]
      const b = mesh.indices[i + ((e + 1) % 3)]
      const restLength = Math.hypot(
        rest[a * 3] - rest[b * 3],
        rest[a * 3 + 1] - rest[b * 3 + 1],
        rest[a * 3 + 2] - rest[b * 3 + 2],
      )
      if (restLength <= 0) continue
      const posedLength = Math.hypot(
        posed[a * 3] - posed[b * 3],
        posed[a * 3 + 1] - posed[b * 3 + 1],
        posed[a * 3 + 2] - posed[b * 3 + 2],
      )
      const delta = Math.abs(posedLength / restLength - 1)
      sum += delta
      worst = Math.max(worst, delta)
      edges += 1
    }
  }
  return { mean: sum / Math.max(1, edges), worst }
}

describe('inverse-bind identity (convention oracle on the real diablo skeleton)', () => {
  it('every bone\'s bind world times its inverseWorld is identity within 1e-3', () => {
    const worlds = bindPoseWorlds()
    let worst = 0
    for (let i = 0; i < diabloSkeleton.bones.length; i += 1) {
      const inverse = diabloSkeleton.bones[i].inverseWorld
      for (let r = 0; r < 4; r += 1) {
        for (let c = 0; c < 4; c += 1) {
          let product = 0
          for (let k = 0; k < 4; k += 1) product += worlds[i * 16 + r * 4 + k] * inverse[k * 4 + c]
          worst = Math.max(worst, Math.abs(product - (r === c ? 1 : 0)))
        }
      }
    }
    // Measured residual on this file: 4.5e-4 (float32 `inverseWorld` storage).
    expect(worst).toBeLessThan(1e-3)
    expect(worst).toBeGreaterThan(0) // it is a real residual, not a stub
  })

  it('bind pose does not depend on the sampled time when no tracks are given', () => {
    const atZero = computeBonePose(diabloSkeleton, [], 0)
    const atLate = computeBonePose(diabloSkeleton, [], 12.5)
    expect(Array.from(atLate)).toEqual(Array.from(atZero))
  })
})

describe('bind-pose skinning reproduces the original vertices', () => {
  it('skins back within 1e-3 for every diablo torso mesh', () => {
    const worlds = bindPoseWorlds()
    for (const mesh of diabloModel.meshes) {
      const part = wholeMeshPart(mesh)
      const skinned = skinMeshInto(part, bindingMatrices(mesh, worlds), mesh.boneBindings, bindingMatrices(mesh, diabloInverseBind))
      let worst = 0
      for (let i = 0; i < part.vertices.length; i += 1) {
        worst = Math.max(worst, Math.abs(skinned.vertices[i] - part.vertices[i]))
      }
      // Measured worst across the three meshes: 4.6e-4.
      expect(worst, `mesh ${mesh.name}`).toBeLessThan(1e-3)
    }
  })

  it('keeps de-indexed group parts aligned with their skin inputs', () => {
    const mesh = diabloModel.meshes[0]
    const group = mesh.groups[0]
    const part = asSkinned(buildPart(mesh, group, null))
    const skinned = skinMeshInto(part, bindingMatrices(mesh, bindPoseWorlds()), mesh.boneBindings, bindingMatrices(mesh, diabloInverseBind))
    let worst = 0
    for (let i = 0; i < part.vertices.length; i += 1) {
      worst = Math.max(worst, Math.abs(skinned.vertices[i] - part.vertices[i]))
    }
    expect(worst).toBeLessThan(1e-3)
  })
})

describe('weight handling', () => {
  /** Two bindings: row 0 identity, row 1 translated +10 in x. */
  const boneBindings = [
    { boneName: 'a', obbMin: [0, 0, 0] as [number, number, number], obbMax: [0, 0, 0] as [number, number, number] },
    { boneName: 'b', obbMin: [0, 0, 0] as [number, number, number], obbMax: [0, 0, 0] as [number, number, number] },
  ]
  // Both bones bound at the origin (identity inverse bind); the animated pose
  // leaves bone a in place and moves bone b by +10 in x.
  const inverseBind = new Float32Array(32)
  inverseBind.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], 0)
  inverseBind.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], 16)
  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
  const translated = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 0, 1])
  const boneMatrices = new Float32Array(32)
  boneMatrices.set(identity, 0)
  boneMatrices.set(translated, 16)

  function partWith(weights: number[], indices: number[]): SkinnedPart {
    return {
      vertices: new Float32Array([0, 0, 0]),
      uv: new Float32Array(2),
      normals: new Float32Array([0, 0, 1]),
      normalColors: new Float32Array(3),
      textureSource: null,
      boneWeights: new Float32Array(weights),
      boneIndices: new Uint8Array(indices),
    }
  }

  it('renormalizes weights so a partial sum still blends fully', () => {
    // Raw [0.25, 0.25] sums to 0.5; renormalized the vertex lands at x = 5
    // (half of the +10 translation), not the unnormalized 2.5.
    const skinned = skinMeshInto(partWith([0.25, 0.25, 0, 0], [0, 1, 0, 0]), boneMatrices, boneBindings, inverseBind)
    expect(skinned.vertices[0]).toBeCloseTo(5, 6)
  })

  it('blends all four influences', () => {
    const skinned = skinMeshInto(partWith([0.1, 0.2, 0.3, 0.4], [1, 1, 1, 0]), boneMatrices, boneBindings, inverseBind)
    // 0.6 of the x = 10 bone (weights 0.1 + 0.2 + 0.3), 0.4 of the static one.
    expect(skinned.vertices[0]).toBeCloseTo(6, 6)
  })

  it('leaves a zero-weight vertex at its bind position', () => {
    const part = partWith([0, 0, 0, 0], [1, 1, 1, 1])
    part.vertices[0] = 3
    const skinned = skinMeshInto(part, boneMatrices, boneBindings, inverseBind)
    expect(skinned.vertices[0]).toBe(3)
    expect(Array.from(skinned.normals)).toEqual([0, 0, 1])
  })

  it('produces unit normals after deformation', () => {
    const skinned = skinMeshInto(partWith([0.5, 0.5, 0, 0], [0, 1, 0, 0]), boneMatrices, boneBindings, inverseBind)
    const length = Math.hypot(skinned.normals[0], skinned.normals[1], skinned.normals[2])
    expect(length).toBeCloseTo(1, 5)
  })
})

describe('deformed pose (diablo "walk" at t = 0.3s)', () => {
  const worlds = computeBonePose(diabloSkeleton, tracksOf(clipNamed('walk')), 0.3)

  it('differs from bind pose but stays finite and near the mesh bounds', () => {
    const mesh = diabloModel.meshes[0]
    const part = wholeMeshPart(mesh)
    const skinned = skinMeshInto(part, bindingMatrices(mesh, worlds), mesh.boneBindings, bindingMatrices(mesh, diabloInverseBind))

    let moved = 0
    for (let i = 0; i < part.vertices.length; i += 1) moved = Math.max(moved, Math.abs(skinned.vertices[i] - part.vertices[i]))
    expect(moved).toBeGreaterThan(0.1)

    // ~2x the bind-pose bounds per axis (the file's bbMax carries the exporter's
    // clamp-to-zero quirk, so the bounds are taken from the vertices themselves).
    const extent = [0, 1, 2].map(() => 0)
    for (let v = 0; v < mesh.vertexCount; v += 1) {
      for (let c = 0; c < 3; c += 1) extent[c] = Math.max(extent[c], Math.abs(mesh.positions[v * 3 + c]))
    }
    for (let v = 0; v < mesh.vertexCount; v += 1) {
      for (let c = 0; c < 3; c += 1) {
        const value = skinned.vertices[v * 3 + c]
        expect(Number.isFinite(value)).toBe(true)
        expect(Math.abs(value), `vertex ${v} axis ${c}`).toBeLessThanOrEqual(2 * extent[c] + 1e-6)
      }
      for (let c = 0; c < 3; c += 1) expect(Number.isFinite(skinned.normals[v * 3 + c])).toBe(true)
    }
  })
})

describe('bone-index semantics (measured verdict: indices are into boneBindings)', () => {
  const meshes = diabloModel.meshes

  it('every mesh\'s largest bone index is its binding count minus one', () => {
    for (const mesh of meshes) {
      if (!mesh.boneIndices) continue
      let maxIndex = 0
      for (const value of mesh.boneIndices) maxIndex = Math.max(maxIndex, value)
      // The direct-skeleton-index reading is impossible: the bindings' names
      // map to skeleton indices up to 262 while these meshes stop at 83.
      expect(maxIndex, `mesh ${mesh.name}`).toBe(mesh.boneBindings.length - 1)
    }
  })

  it('the binding reading skins smoothly; the skeleton reading does not', () => {
    const mesh = meshes[0]
    const part = wholeMeshPart(mesh)
    const worlds = computeBonePose(diabloSkeleton, tracksOf(clipNamed('walk')), 0.3)

    // Correct: index -> boneBindings row (matrices re-ordered per binding).
    const smooth = skinMeshInto(part, bindingMatrices(mesh, worlds), mesh.boneBindings, bindingMatrices(mesh, diabloInverseBind))

    // Wrong: index -> skeleton bone row, matrices left in skeleton order.
    const wrongPart = part
    const wrong = skinMeshInto(
      wrongPart,
      worlds,
      diabloSkeleton.bones.map((bone) => ({ boneName: bone.name, obbMin: [0, 0, 0] as [number, number, number], obbMax: [0, 0, 0] as [number, number, number] })),
      diabloInverseBind
)

    const good = edgeDistortion(mesh, part.vertices, smooth.vertices)
    const bad = edgeDistortion(mesh, part.vertices, wrong.vertices)
    // Measured: binding reading mean 0.05 / worst 1.9; skeleton reading mean
    // 0.35 / worst 95.
    expect(good.mean).toBeLessThan(0.15)
    expect(bad.mean).toBeGreaterThan(0.25)
    expect(good.mean).toBeLessThan(bad.mean)
    expect(good.worst).toBeLessThan(bad.worst)
  })
})

describe('crossfade blending', () => {
  const walk = tracksOf(clipNamed('walk'))
  const attack = tracksOf(clipNamed('attack1'))

  it('degenerates to the two endpoints', () => {
    const a = computeBonePose(diabloSkeleton, walk, 0.37)
    const b = computeBonePose(diabloSkeleton, attack, 0.11)
    const atA = computeBonePoseBlended(diabloSkeleton, walk, 0.37, attack, 0.11, 0)
    const atB = computeBonePoseBlended(diabloSkeleton, walk, 0.37, attack, 0.11, 1)
    for (let i = 0; i < a.length; i += 1) {
      expect(atA[i]).toBeCloseTo(a[i], 4)
      expect(atB[i]).toBeCloseTo(b[i], 4)
    }
  })

  it('lands between the two poses at the midpoint', () => {
    const a = computeBonePose(diabloSkeleton, walk, 0.37)
    const b = computeBonePose(diabloSkeleton, attack, 0.11)
    const mid = computeBonePoseBlended(diabloSkeleton, walk, 0.37, attack, 0.11, 0.5)
    let between = 0
    for (let i = 0; i < a.length; i += 1) {
      expect(Number.isFinite(mid[i])).toBe(true)
      const lo = Math.min(a[i], b[i])
      const hi = Math.max(a[i], b[i])
      if (mid[i] > lo + 1e-5 && mid[i] < hi - 1e-5) between += 1
    }
    // A real blend: strictly inside the endpoint range somewhere.
    expect(between).toBeGreaterThan(0)
  })
})

describe('tangent skinning (the normal map follows the surface)', () => {
  it('carries the model\'s tangent frame through the skinning pass', () => {
    const mesh = diabloModel.meshes[0]
    const group = mesh.groups[0]
    const part = asSkinned(buildPart(mesh, group, null))
    // The real files ship tangents; without them the normal map would be
    // lit against a fixed frame while the surface moves under it.
    expect(part.tangents).toBeDefined()
    const source = part.tangents!
    const skinned = skinMeshInto(part,
      bindingMatrices(mesh, bindPoseWorlds()),
      mesh.boneBindings,
      bindingMatrices(mesh, diabloInverseBind)
)
    const tangent = skinned.tangents
    expect(tangent).toBeDefined()
    expect(tangent!.length).toBe(source.length)
    // The handedness is a property of the UV layout, not of the pose.
    for (let i = 0; i < source.length / 4; i += 1) {
      expect(tangent![i * 4 + 3]).toBe(source[i * 4 + 3])
    }
    // The tangent stays a unit direction.
    for (let i = 0; i < tangent!.length / 4; i += 1) {
      const length = Math.hypot(tangent![i * 4], tangent![i * 4 + 1], tangent![i * 4 + 2])
      expect(length).toBeCloseTo(1, 3)
    }
  })

  it('rotates the tangent with the bone it follows', () => {
    // One binding, a 90° turn about Y: the tangent has to turn with it.
    const part: SkinnedPart = {
      vertices: new Float32Array([0, 0, 0]),
      uv: new Float32Array([0, 0]),
      normals: new Float32Array([0, 1, 0]),
      normalColors: new Float32Array(3),
      tangents: new Float32Array([1, 0, 0, 1]),
      textureSource: null,
      boneWeights: new Float32Array([1, 0, 0, 0]),
      boneIndices: new Uint8Array([0, 0, 0, 0]),
    }
    const bindings: Gr2BoneBinding[] = [
      { boneName: 'torso', obbMin: [0, 0, 0], obbMax: [1, 1, 1] },
    ]
    const rotate = new Float32Array(16)
    // A rotation of 90° about Y, row-major, applied as the bone's world.
    rotate[0] = 0
    rotate[2] = 1
    rotate[8] = -1
    rotate[10] = 0
    rotate[5] = 1
    rotate[15] = 1
    const inverse = new Float32Array(16)
    inverse[0] = 1
    inverse[5] = 1
    inverse[10] = 1
    inverse[15] = 1
    const skinned = skinMeshInto(part, rotate, bindings, inverse)
    const tangent = skinned.tangents!
    // (1, 0, 0) turned 90° about Y is (0, 0, -1).
    expect(Math.abs(tangent[0])).toBeLessThan(1e-5)
    expect(Math.abs(tangent[2])).toBeCloseTo(1, 4)
  })
})
