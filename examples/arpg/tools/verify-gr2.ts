/**
 * verify-gr2 — decode real Granny GR2 files from the extracted package and
 * check the invariants the renderer relies on.
 *
 *   npx tsx tools/verify-gr2.ts [file-or-directory ...]
 *
 * With no arguments it checks the samples preserved under `.scratch/gr2`
 * (diablo + amazon) and `.scratch/model-probe`. Every file must decode, every
 * index must stay inside its vertex array, positions must be finite, decoded
 * extremes must reproduce the `bbMin`/`bbMax` the file itself stores (this is
 * what proves the position dequantization), bone weights must stay in [0, 1],
 * skeleton parent indices must be in range, and every string must be
 * printable ASCII. Exits non-zero on any failure.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { loadGr2, type Gr2File } from '../src/original/gr2'

const HERE = new URL('.', import.meta.url).pathname
const SAMPLES = [
  join(HERE, '..', '..', '..', '.scratch', 'gr2'),
  join(HERE, '..', '..', '..', '.scratch', 'model-probe'),
]

const GR2_SUFFIXES = ['.model', '.skeleton', '.animations', '.gr2']

function collect(path: string, out: string[]): void {
  const stat = statSync(path, { throwIfNoEntry: false })
  if (!stat) return
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) collect(join(path, entry), out)
    return
  }
  if (GR2_SUFFIXES.some((suffix) => path.endsWith(suffix))) out.push(path)
}

function printable(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (code < 0x20 || code > 0x7e) return false
  }
  return true
}

interface Failure {
  file: string
  reason: string
}

function check(path: string, failures: Failure[]): string {
  const bytes = new Uint8Array(readFileSync(path))
  let file: Gr2File
  try {
    file = loadGr2(bytes)
  } catch (error) {
    failures.push({ file: path, reason: `decode failed: ${(error as Error).message}` })
    return `decode failed`
  }

  const problems: string[] = []
  let triangles = 0
  for (const mesh of file.meshes) {
    triangles += mesh.indices.length / 3
    let maxIndex = 0
    for (const index of mesh.indices) if (index > maxIndex) maxIndex = index
    if (maxIndex >= mesh.vertexCount) {
      problems.push(`mesh "${mesh.name}" index ${maxIndex} >= ${mesh.vertexCount} vertices`)
    }
    if (mesh.positions.length !== mesh.vertexCount * 3) {
      problems.push(`mesh "${mesh.name}" position count ${mesh.positions.length} != 3 * ${mesh.vertexCount}`)
    }
    for (let i = 0; i < mesh.positions.length; i += 1) {
      if (!Number.isFinite(mesh.positions[i])) {
        problems.push(`mesh "${mesh.name}" has a non-finite position`)
        break
      }
    }
    // The dequantization oracle: decoded extremes reproduce the file's own
    // box. `bbMin` matches the decoded minimum exactly; `bbMax` matches the
    // decoded maximum clamped to zero — the exporter stores
    // `max(decodedMax, 0)` (17 of 156 components across the samples are
    // clamped this way; measured by tools/verify-gr2.ts).
    if (mesh.bbMin && mesh.bbMax) {
      const lo = [Infinity, Infinity, Infinity]
      const hi = [-Infinity, -Infinity, -Infinity]
      for (let i = 0; i < mesh.positions.length; i += 3) {
        for (let c = 0; c < 3; c += 1) {
          if (mesh.positions[i + c] < lo[c]) lo[c] = mesh.positions[i + c]
          if (mesh.positions[i + c] > hi[c]) hi[c] = mesh.positions[i + c]
        }
      }
      for (let c = 0; c < 3; c += 1) {
        const scale = Math.max(1, Math.abs(mesh.bbMax[c] - mesh.bbMin[c]))
        const expectedMax = Math.max(hi[c], 0)
        if (Math.abs(lo[c] - mesh.bbMin[c]) / scale > 2e-3 || Math.abs(expectedMax - mesh.bbMax[c]) / scale > 2e-3) {
          problems.push(
            `mesh "${mesh.name}" decoded box [${lo.map((x) => x.toFixed(2))}]..[${hi.map((x) => x.toFixed(2))}] ` +
              `does not reproduce bbMin/bbMax [${mesh.bbMin.map((x) => x.toFixed(2))}]..[${mesh.bbMax.map((x) => x.toFixed(2))}]`,
          )
        }
      }
    }
    if (mesh.boneWeights) {
      for (let i = 0; i < mesh.boneWeights.length; i += 1) {
        if (mesh.boneWeights[i] < 0 || mesh.boneWeights[i] > 1) {
          problems.push(`mesh "${mesh.name}" has a weight outside [0, 1]`)
          break
        }
      }
    }
    for (const group of mesh.groups) {
      const end = (group.triFirst + group.triCount) * 3
      if (end > mesh.indices.length) {
        problems.push(`mesh "${mesh.name}" group ends at index ${end} > ${mesh.indices.length}`)
      }
    }
    if (!printable(mesh.name)) problems.push(`mesh name is not printable ASCII`)
    if (mesh.materialBindings.some((index) => index >= file.materials.length && index >= 0)) {
      problems.push(`mesh "${mesh.name}" binds a material index past the material list`)
    }
    for (const binding of mesh.boneBindings) {
      if (!printable(binding.boneName)) problems.push(`bone binding name is not printable ASCII`)
    }
  }

  for (const skeleton of file.skeletons) {
    skeleton.bones.forEach((bone, index) => {
      if (bone.parentIndex < -1 || bone.parentIndex >= skeleton.bones.length) {
        problems.push(`bone ${index} ("${bone.name}") has parent index ${bone.parentIndex}`)
      }
      if (bone.parentIndex === index) problems.push(`bone ${index} ("${bone.name}") parents itself`)
      if (!printable(bone.name)) problems.push(`bone ${index} name is not printable ASCII`)
    })
  }

  for (const texture of file.textures) {
    if (!printable(texture.fromFileName)) problems.push(`texture path is not printable ASCII`)
  }
  if (!printable(file.fromFileName)) problems.push(`FromFileName is not printable ASCII`)

  for (const reason of problems) failures.push({ file: path, reason })
  return (
    `meshes ${file.meshes.length} (${triangles} tris), skeletons ${file.skeletons.length} ` +
    `(${file.skeletons.reduce((a, s) => a + s.bones.length, 0)} bones), ` +
    `materials ${file.materials.length}, textures ${file.textures.length}, ` +
    `fixups ${file.fixupsApplied.reduce((a, b) => a + b, 0)}`
  )
}

function main(): void {
  const args = process.argv.slice(2)
  const paths: string[] = []
  for (const arg of args.length > 0 ? args : SAMPLES) collect(arg, paths)
  paths.sort()

  const failures: Failure[] = []
  let checked = 0
  for (const path of paths) {
    const stat = statSync(path, { throwIfNoEntry: false })
    if (!stat || stat.size > 8 * 1024 * 1024) continue
    checked += 1
    const before = failures.length
    const summary = check(path, failures)
    const name = path.replace(/^.*\/\.scratch\//, '.scratch/')
    process.stdout.write(`${failures.length === before ? 'OK  ' : 'FAIL'} ${name} — ${summary}\n`)
  }

  if (failures.length > 0) {
    process.stdout.write(`\n${failures.length} failure(s):\n`)
    for (const failure of failures) process.stdout.write(`  ${failure.file}: ${failure.reason}\n`)
  }
  process.stdout.write(`\nverify-gr2: ${checked} files checked, ${failures.length} failure(s)\n`)
  process.exit(failures.length > 0 ? 1 : 0)
}

main()
