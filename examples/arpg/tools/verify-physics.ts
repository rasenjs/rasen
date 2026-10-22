#!/usr/bin/env node
/**
 * Checks every `.physics` mesh in the package, and checks the one thing about them that
 * can be wrong without looking wrong: whether the normals agree.
 *
 * `src/original/physics.ts` decodes the package's **plaintext** 3D meshes — the only 3D
 * geometry in the whole package that is not entropy-coded, since the `.model` render
 * meshes are Oodle/BitKnit2 (see `model.ts`). That is a claim about 3,031 files, so it is
 * checked over all of them, and the answer is reported as it is found: a file whose
 * declared counts do not tile its own bytes is named, not averaged into a percentage.
 *
 * Four things are checked, each a count with its exceptions named:
 *
 * 1. **Every file decodes.** How many of the package's `.physics` files parse to a mesh,
 *    and for those that do not, the reason and the first few by path.
 * 2. **The counts tile the bytes.** `fillCount * 32 + vertexCount * 16 + triangleCount *
 *    32` equals the file's length in every file. This is the layout's own arithmetic and
 *    a file that fails it is a file this reading does not describe.
 * 3. **Every index is in range.** A triangle naming a vertex that does not exist would be
 *    a silent hole in a rendered mesh.
 * 4. **The recomputed normal agrees with the stored one.** Block C carries a normal
 *    triple per triangle as three *indices*, and `faceNormal` recomputes one from the
 *    winding. Two descriptions of the same thing are worth exactly as much as their
 *    agreement, so the angle between them is measured and its distribution reported.
 *    A large disagreement would mean the winding is not consistent with the engine's own
 *    normal direction, which is what a renderer would have to know.
 *
 * Usage:
 *   tsx examples/arpg/tools/verify-physics.ts [<romfs dir>]
 *
 * Needs an extracted copy of the game (`--romfsdir` from hactool), which the repository
 * does not carry. Reads only. Exits 1 when a file fails to decode or an index is out of
 * range.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseManifest, readEntry, type ManifestEntry, type RomfsSource } from '../src/original/romfs'
import { parsePhysics, faceNormal, physicsBounds } from '../src/original/physics'

const HERE = resolve(dirname(fileURLToPath(import.meta.url)))

/** The extracted RomFS, or the default a `hactool --romfsdir` run writes. */
function romfsRoot(): string | null {
  const given = process.argv[2]
  const candidates = [
    given,
    // `tools` -> `arpg` -> `examples` -> the repo root, where `.scratch` lives.
    join(HERE, '..', '..', '..', '.scratch', 'romfs-patch'),
    '/tmp/d2r-all',
    join(process.env.HOME ?? '', 'dm-work/data/switch/3.3.94012/Update/RomFS'),
  ].filter((entry): entry is string => typeof entry === 'string' && entry !== '')
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'data', 'build_manifest.psv'))) return candidate
  }
  return null
}

function directorySource(romfs: string): RomfsSource {
  return {
    readManifest: () => Promise.resolve(readFileSync(join(romfs, 'data', 'build_manifest.psv'), 'utf8')),
    readArchive: (name) => Promise.resolve(new Uint8Array(readFileSync(join(romfs, 'data', name)))),
  }
}

async function main(): Promise<number> {
  const romfs = romfsRoot()
  if (romfs === null) {
    console.error(
      'verify-physics: no extracted RomFS found. Pass one, or extract it with\n' +
        '  hactool -k keys.txt -t nca --basenca=<base>.nca --romfsdir=<dir> <patch>.nca',
    )
    return 1
  }

  const source = directorySource(romfs)
  const entries: ManifestEntry[] = parseManifest(await source.readManifest())
  const physics = entries.filter((entry) => entry.path.endsWith('.physics'))
  console.log(`verify-physics: ${physics.length} .physics files under ${romfs}`)
  if (physics.length === 0) {
    console.error('verify-physics: the manifest lists no .physics file')
    return 1
  }

  let decoded = 0
  let vertices = 0
  let triangles = 0
  let empty = 0
  const failures: string[] = []
  /** The angle between the stored normal and the recomputed one, in degrees. */
  const angles: number[] = []
  let noStoredNormal = 0
  let degenerate = 0
  const bounds: Array<{ span: number; path: string }> = []

  for (const entry of physics) {
    let mesh
    try {
      const bytes = await readEntry(source, entry)
      const result = parsePhysics(bytes)
      if (!result.ok) {
        failures.push(`${entry.path}: ${result.reason} — ${result.detail}`)
        continue
      }
      mesh = result
    } catch (error) {
      failures.push(`${entry.path}: read failed — ${String(error)}`)
      continue
    }
    decoded += 1
    vertices += mesh.vertices.length
    triangles += mesh.triangles.length
    if (mesh.vertices.length === 0 || mesh.triangles.length === 0) empty += 1

    const box = physicsBounds(mesh)
    if (box !== null) {
      const span = Math.hypot(
        box.max[0] - box.min[0],
        box.max[1] - box.min[1],
        box.max[2] - box.min[2],
      )
      bounds.push({ span, path: entry.path })
    }

    // The stored normal: three more indices into the same vertex list, read straight out
    // of the triangle record's tail. `parsePhysics` does not expose them because nothing
    // in the app needs them; reading them here keeps the claim in this tool's own hands.
    const bytes = await readEntry(source, entry)
    const endB = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0x10, true)
    for (let t = 0; t < mesh.triangles.length; t += 1) {
      const at = endB + t * 32
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const n0 = view.getUint32(at + 12, true)
      const n1 = view.getUint32(at + 16, true)
      const n2 = view.getUint32(at + 20, true)
      const triangle = mesh.triangles[t]
      const normal = faceNormal(mesh, triangle)
      const length = Math.hypot(normal[0], normal[1], normal[2])
      if (length < 0.5) {
        degenerate += 1
        continue
      }
      if (n0 >= mesh.vertices.length || n1 >= mesh.vertices.length || n2 >= mesh.vertices.length) {
        noStoredNormal += 1
        continue
      }
      // The stored triple's own normal, the same cross product the engine's would be.
      const p = mesh.vertices[n0]
      const q = mesh.vertices[n1]
      const r = mesh.vertices[n2]
      const e1 = [q.x - p.x, q.y - p.y, q.z - p.z]
      const e2 = [r.x - p.x, r.y - p.y, r.z - p.z]
      const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
      const crossLength = Math.hypot(cross[0], cross[1], cross[2])
      if (!Number.isFinite(crossLength) || crossLength < 1e-9) {
        degenerate += 1
        continue
      }
      const dot =
        (normal[0] * cross[0] + normal[1] * cross[1] + normal[2] * cross[2]) / crossLength
      const clamped = Math.max(-1, Math.min(1, dot))
      angles.push((Math.acos(clamped) * 180) / Math.PI)
    }
  }

  console.log(
    `meshes: ${decoded}/${physics.length} decoded, ${vertices} vertices, ${triangles} triangles, ` +
      `${empty} with no geometry, ${failures.length} failed`,
  )
  for (const failure of failures.slice(0, 8)) console.log(`  ! ${failure}`)
  if (failures.length > 8) console.log(`  … and ${failures.length - 8} more`)

  if (bounds.length > 0) {
    bounds.sort((a, b) => a.span - b.span)
    const smallest = bounds[0]
    const largest = bounds[bounds.length - 1]
    console.log(
      `extent: smallest ${smallest.span.toFixed(2)} (${smallest.path.split('/').slice(-2).join('/')}), ` +
        `largest ${largest.span.toFixed(2)} (${largest.path.split('/').slice(-2).join('/')})`,
    )
  }

  angles.sort((a, b) => a - b)
  if (angles.length > 0) {
    const at = (q: number): number => angles[Math.min(angles.length - 1, Math.floor(angles.length * q))]
    const near = angles.filter((a) => a <= 5).length
    console.log(
      `normals: ${angles.length} triangles compared, ${((near / angles.length) * 100).toFixed(1)}% within 5 deg; ` +
        `median ${at(0.5).toFixed(2)}, p90 ${at(0.9).toFixed(2)}, max ${angles[angles.length - 1].toFixed(2)}`,
    )
    if (noStoredNormal > 0) console.log(`  ${noStoredNormal} triangles name a stored normal out of range`)
    if (degenerate > 0) console.log(`  ${degenerate} triangles are degenerate (zero area on one side)`)
  }

  if (failures.length > 0) {
    console.log('verify-physics: FAIL')
    return 1
  }
  console.log('verify-physics: OK — every mesh tiles its own bytes, every index is in range')
  return 0
}

process.exit(await main())
