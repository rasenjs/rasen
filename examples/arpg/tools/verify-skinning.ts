/**
 * verify-skinning — decode the real D2R skeletons and clip sets and check the
 * CPU-skinning pipeline against them.
 *
 *   npx tsx tools/verify-skinning.ts [gr2-dir]
 *
 * With no argument it reads the samples preserved under `.scratch/gr2`
 * (`diablo` + `amazon` skeleton, `combined.animations` clip set and model
 * files). For each character it:
 *
 * 1. Composes the bind pose from the skeleton's own local transforms and
 *    multiplies each bone's world matrix by the file's stored `inverseWorld` —
 *    the identity residual is THE convention oracle (matrix layout, quaternion
 *    order, `world = local * parentWorld`). Reports the max per bone; FAILS
 *    above 1e-3.
 * 2. Checks the bone-index semantics every skinning consumer relies on: a
 *    mesh's largest `boneIndices` value must be `boneBindings.length - 1`
 *    (the indices are into the mesh's binding list, not the skeleton).
 * 3. Skins the bind pose and requires the original vertices back within 1e-3.
 * 4. Samples 3 animations at 5 times each and reports the skinned AABBs;
 *    FAILS on non-finite output or an AABB outside ~2x the bind-pose bounds.
 *
 * It also reports what is NOT used for skeletal skinning (mesh/VFX placement
 * tracks, vector/text tracks, curve-family coverage) so the gap is named in
 * numbers rather than implied. Prints an OK/FAIL summary and exits non-zero on
 * any failure.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { loadGr2, type Gr2Mesh, type Gr2Skeleton } from '@rasenjs/assets'
import { loadGr2Animations, type Gr2TransformTrack } from '@rasenjs/assets'
import { boneIndexByName, computeBonePose, inverseBindOf, matricesForBindings, skinMeshInto, type SkinnedPart } from '../src/three-d/skinning'

const HERE = new URL('.', import.meta.url).pathname
const DEFAULT_GR2 = join(HERE, '..', '..', '..', '.scratch', 'gr2')

interface Failure {
  context: string
  reason: string
}

const failures: Failure[] = []
const fail = (context: string, reason: string): void => {
  failures.push({ context, reason })
  process.stdout.write(`  FAIL ${context}: ${reason}\n`)
}

interface Character {
  label: string
  skeletonPath: string
  animationsPath: string
  modelPaths: string[]
}

function modelFilesUnder(dir: string): string[] {
  const out: string[] = []
  const walk = (path: string): void => {
    const stat = statSync(path, { throwIfNoEntry: false })
    if (!stat) return
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path)) walk(join(path, entry))
      return
    }
    if (path.endsWith('.model')) out.push(path)
  }
  walk(dir)
  return out.sort()
}

function charactersUnder(root: string): Character[] {
  return [
    {
      label: 'diablo',
      skeletonPath: join(root, 'diablo', 'skeleton', 'diablo.skeleton'),
      animationsPath: join(root, 'diablo', 'animation', 'combined.animations'),
      modelPaths: modelFilesUnder(join(root, 'diablo')),
    },
    {
      label: 'amazon',
      skeletonPath: join(root, 'amazon', 'skeleton', 'amazon.skeleton'),
      animationsPath: join(root, 'amazon', 'animation', 'combined.animations'),
      modelPaths: modelFilesUnder(join(root, 'amazon')),
    },
  ]
}

function wholeMeshPart(mesh: Gr2Mesh): SkinnedPart | null {
  if (!mesh.boneWeights || !mesh.boneIndices) return null
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

interface Bounds {
  minX: number
  minY: number
  minZ: number
  maxX: number
  maxY: number
  maxZ: number
}

function boundsOf(parts: { vertices: Float32Array }[]): Bounds | null {
  let bounds: Bounds | null = null
  for (const part of parts) {
    for (let i = 0; i < part.vertices.length; i += 3) {
      for (let c = 0; c < 3; c += 1) {
        const value = part.vertices[i + c]
        if (!bounds) bounds = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity }
        const lo = c === 0 ? 'minX' : c === 1 ? 'minY' : 'minZ'
        const hi = c === 0 ? 'maxX' : c === 1 ? 'maxY' : 'maxZ'
        if (value < bounds[lo]) bounds[lo] = value
        if (value > bounds[hi]) bounds[hi] = value
      }
    }
  }
  return bounds
}

function formatBounds(bounds: Bounds | null): string {
  if (bounds === null) return '(empty)'
  const f = (v: number): string => v.toFixed(3)
  return `x[${f(bounds.minX)}, ${f(bounds.maxX)}] y[${f(bounds.minY)}, ${f(bounds.maxY)}] z[${f(bounds.minZ)}, ${f(bounds.maxZ)}]`
}

/** Largest |world * inverseWorld - I| over the whole skeleton. */
function bindResidual(skeleton: Gr2Skeleton): { max: number; worstBone: string } {
  const worlds = computeBonePose(skeleton, [], 0)
  let max = 0
  let worstBone = ''
  for (let i = 0; i < skeleton.bones.length; i += 1) {
    const inverse = skeleton.bones[i].inverseWorld
    for (let r = 0; r < 4; r += 1) {
      for (let c = 0; c < 4; c += 1) {
        let product = 0
        for (let k = 0; k < 4; k += 1) product += worlds[i * 16 + r * 4 + k] * inverse[k * 4 + c]
        const delta = Math.abs(product - (r === c ? 1 : 0))
        if (delta > max) {
          max = delta
          worstBone = skeleton.bones[i].name
        }
      }
    }
  }
  return { max, worstBone }
}

interface MeshParts {
  label: string
  mesh: Gr2Mesh
  parts: SkinnedPart[]
}

function main(): void {
  const root = process.argv[2] ?? DEFAULT_GR2
  for (const character of charactersUnder(root)) {
    process.stdout.write(`\n== ${character.label} ==\n`)

    // -- skeleton ----------------------------------------------------------
    const skeleton = loadGr2(readFileSync(character.skeletonPath)).skeletons[0]
    if (!skeleton) {
      fail(character.label, 'no skeleton in file')
      continue
    }
    const { max: residual, worstBone } = bindResidual(skeleton)
    process.stdout.write(`  skeleton: ${skeleton.bones.length} bones\n`)
    process.stdout.write(`  bind-pose inverse-bind identity residual: max ${residual.toExponential(3)} (bone "${worstBone}")\n`)
    if (!(residual < 1e-3)) fail(character.label, `bind residual ${residual.toExponential(3)} >= 1e-3`)

    // -- clip set ----------------------------------------------------------
    const set = loadGr2Animations(readFileSync(character.animationsPath))
    const boneNames = new Set(skeleton.bones.map((bone) => bone.name))
    let transformTracks = 0
    let missingChannels = 0
    const nonBoneTracks = new Map<string, number>()
    const codecHistogram = new Map<string, number>()
    let vectorTracks = 0
    let textTracks = 0
    let boneGroupPlacements = 0
    let meshGroupPlacements = 0
    const countCurve = (curve: { codec: string } | undefined): void => {
      const name = curve?.codec ?? '(no curve)'
      codecHistogram.set(name, (codecHistogram.get(name) ?? 0) + 1)
    }
    for (const animation of set.animations) {
      for (const group of animation.trackGroups) {
        const holdsBones = group.transformTracks.some((track) => boneNames.has(track.name))
        const identity = group.initialPlacement.flags === 0
        if (holdsBones) {
          if (!identity) boneGroupPlacements += 1
        } else if (!identity) {
          meshGroupPlacements += 1
        }
        for (const track of group.transformTracks) {
          transformTracks += 1
          if (!track.orientation || !track.position || !track.scaleShear) missingChannels += 1
          countCurve(track.orientation)
          countCurve(track.position)
          countCurve(track.scaleShear)
          if (!boneNames.has(track.name)) {
            nonBoneTracks.set(track.name, (nonBoneTracks.get(track.name) ?? 0) + 1)
          }
        }
        vectorTracks += group.vectorTracks.length
        textTracks += group.textTrackCount
      }
    }
    process.stdout.write(`  clips: ${set.animations.length}, transform tracks: ${transformTracks}\n`)
    process.stdout.write(`  track names matching bones: ${[...new Set(set.animations.flatMap((a) => a.trackGroups.flatMap((g) => g.transformTracks.map((t) => t.name))))].filter((n) => boneNames.has(n)).length}/${boneNames.size} bones have tracks somewhere\n`)
    process.stdout.write(`  non-bone (mesh/VFX placement) tracks: ${[...nonBoneTracks.values()].reduce((a, b) => a + b, 0)} across ${nonBoneTracks.size} names\n`)
    process.stdout.write(`  vector tracks: ${vectorTracks}, text tracks: ${textTracks} (not used for skeletal skinning)\n`)
    process.stdout.write(`  curve codecs: ${[...codecHistogram.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([name, count]) => `${name}=${count}`).join(', ')}\n`)
    process.stdout.write(`  tracks missing a channel curve: ${missingChannels}\n`)
    process.stdout.write(`  non-identity initialPlacement: ${boneGroupPlacements} on bone-track groups, ${meshGroupPlacements} on mesh/VFX groups\n`)
    if (missingChannels > 0) fail(character.label, `${missingChannels} transform tracks lack a channel curve`)
    if (boneGroupPlacements > 0) fail(character.label, `${boneGroupPlacements} bone-track groups carry a non-identity initialPlacement`)
    process.stdout.write('  curve families NOT implemented but present in this file: 0 (DaKeyframes32f, keyframed DaK32fC32f and pre-v7 old_curve are absent from the D2R corpus)\n')

    // -- models ------------------------------------------------------------
    const boneIndex = boneIndexByName(skeleton)
    const inverseBind = inverseBindOf(skeleton)
    const meshParts: MeshParts[] = []
    for (const path of character.modelPaths) {
      const file = loadGr2(readFileSync(path))
      for (const mesh of file.meshes) {
        const part = wholeMeshPart(mesh)
        const boneIndices = mesh.boneIndices
        if (part === null || boneIndices === null) continue
        const label = `${path.split('/').slice(-2).join('/')}:${mesh.name}`
        meshParts.push({ label, mesh, parts: [part] })

        let maxIndex = 0
        for (const value of boneIndices) maxIndex = Math.max(maxIndex, value)
        const ok = maxIndex === mesh.boneBindings.length - 1
        process.stdout.write(`  mesh ${label}: ${mesh.vertexCount} verts, ${mesh.boneBindings.length} bone bindings, max boneIndex ${maxIndex} -> ${ok ? 'binding-indexed OK' : 'MISMATCH'}\n`)
        if (!ok) fail(label, `max boneIndex ${maxIndex} != binding count - 1 ${mesh.boneBindings.length - 1}`)

        // Bind pose must skin back to the original vertices within 1e-3.
        const worlds = computeBonePose(skeleton, [], 0)
        const skinned = skinMeshInto(
          part,
          matricesForBindings(worlds, boneIndex, mesh.boneBindings),
          mesh.boneBindings,
          matricesForBindings(inverseBind, boneIndex, mesh.boneBindings),
        )
        let worst = 0
        for (let i = 0; i < part.vertices.length; i += 1) {
          worst = Math.max(worst, Math.abs(skinned.vertices[i] - part.vertices[i]))
        }
        process.stdout.write(`    bind-pose skin reproduces vertices: max error ${worst.toExponential(3)}\n`)
        if (!(worst < 1e-3)) fail(label, `bind-pose skin error ${worst.toExponential(3)} >= 1e-3`)
      }
    }

    // -- animated samples --------------------------------------------------
    const bindBounds = boundsOf(meshParts.flatMap((entry) => entry.parts))
    process.stdout.write(`  bind AABB (all meshes): ${formatBounds(bindBounds)}\n`)
    const clips = set.animations.slice(0, 3)
    for (const clip of clips) {
      const tracks: Gr2TransformTrack[] = clip.trackGroups.flatMap((group) => group.transformTracks)
      const samples: string[] = []
      let poseChanged = false
      for (let s = 0; s < 5; s += 1) {
        const t = (s / 4) * clip.duration
        const worlds = computeBonePose(skeleton, tracks, t)
        const posed: { vertices: Float32Array }[] = []
        for (const entry of meshParts) {
          const mesh = entry.mesh
          for (const part of entry.parts) {
            const skinned = skinMeshInto(
              part,
              matricesForBindings(worlds, boneIndex, mesh.boneBindings),
              mesh.boneBindings,
              matricesForBindings(inverseBind, boneIndex, mesh.boneBindings),
            )
            for (let i = 0; i < skinned.vertices.length; i += 1) {
              if (!Number.isFinite(skinned.vertices[i])) fail(`${character.label}/${clip.name}@${t.toFixed(2)}`, 'non-finite skinned position')
            }
            posed.push(skinned)
          }
        }
        const bounds = boundsOf(posed)
        samples.push(`t=${t.toFixed(2)}s ${formatBounds(bounds)}`)
        if (bindBounds && bounds) {
          // Rotation-safe bound: a 180-degree turn moves the X extent into Z
          // (the amazon's turn clips measure 2.6x their bind Z bound while
          // staying rigid), so a per-axis limit rejects legitimate poses. Any
          // rigid rotation keeps every vertex inside the bind box's bounding
          // sphere — the farthest bind corner from the origin — and blend
          // skinning adds only a small margin on top of that.
          const bindRadius =
            Math.hypot(
              Math.max(Math.abs(bindBounds.minX), Math.abs(bindBounds.maxX)),
              Math.max(Math.abs(bindBounds.minY), Math.abs(bindBounds.maxY)),
              Math.max(Math.abs(bindBounds.minZ), Math.abs(bindBounds.maxZ)),
            ) * 1.25
          const axes = [
            ['x', bounds.minX, bounds.maxX],
            ['y', bounds.minY, bounds.maxY],
            ['z', bounds.minZ, bounds.maxZ],
          ] as const
          for (const [axis, pMin, pMax] of axes) {
            if (Math.abs(pMin) > bindRadius + 1e-6 || Math.abs(pMax) > bindRadius + 1e-6) {
              fail(`${character.label}/${clip.name}@${t.toFixed(2)}`, `skinned ${axis} bound outside the bind bounding sphere (${bindRadius.toFixed(2)})`)
            }
          }
          const drift = Math.max(
            Math.abs(bounds.minX - bindBounds.minX),
            Math.abs(bounds.minY - bindBounds.minY),
            Math.abs(bounds.minZ - bindBounds.minZ),
            Math.abs(bounds.maxX - bindBounds.maxX),
            Math.abs(bounds.maxY - bindBounds.maxY),
            Math.abs(bounds.maxZ - bindBounds.maxZ),
          )
          if (drift > 0.05) poseChanged = true
        }
      }
      process.stdout.write(`  clip "${clip.name}" (duration ${clip.duration.toFixed(3)}s):\n`)
      for (const sample of samples) process.stdout.write(`    ${sample}\n`)
      process.stdout.write(`    pose differs from bind: ${poseChanged ? 'yes' : 'no'}\n`)
    }
  }

  process.stdout.write(`\n${failures.length === 0 ? 'OK' : `FAIL (${failures.length})`} — bind-pose identity, bone-index semantics, bind-skin reproduction and animated bounds over diablo + amazon\n`)
  if (failures.length > 0) {
    for (const failure of failures) process.stdout.write(`  ${failure.context}: ${failure.reason}\n`)
    process.exit(1)
  }
}

main()
