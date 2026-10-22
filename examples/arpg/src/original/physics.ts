/**
 * `.physics` — the package's **plaintext** 3D meshes.
 *
 * Resurrected's render geometry lives in `.model` files whose bodies are
 * entropy-coded (Oodle/BitKnit2 — see `model.ts` and `tools/verify-model.ts`: 85,423 of
 * 100,588 chunks, 886 MB of 887 MB, and the game's own `main` carries `_oodle0_compr`
 * and `_oodle1_c`), so no vertex or index byte in that tree is readable without Oodle's
 * decompressor. **`.physics` is the exception, and it is the only 3D geometry in the
 * package that can be read at all**: 3,031 files, decoded by this module.
 *
 * It is collision geometry rather than the render mesh — a boulder's collision hull, a
 * terrain patch's, a wall's — and that is stated here rather than glossed: these meshes
 * are what the engine collides with, and they are not what it draws. What they give this
 * project is a real 3D surface whose shape can be rendered and looked at, which is the
 * difference between "the render path is blocked" and "the render path is blocked and
 * here is everything that is not".
 *
 * ## The layout, read off the files
 *
 * ```
 *   0x00  u32  48           header size, constant in 3,031/3,031
 *   0x04  u32  0
 *   0x08  u32  endA         where block A ends and block B begins
 *   0x0c  u32  0
 *   0x10  u32  endB         where block B ends and block C begins
 *   0x14  u32  0
 *   0x18  u32  fillCount    block A's record count
 *   0x1c  u32  vertexCount  block B's record count
 *   0x20  u32  triangleCount  block C's record count
 *   0x24  u32  ?            varies; not the file length, not a count this module needs
 *   0x28  u32  hash         varies with the content
 *   0x2c  u32  0
 *   block A   fillCount   × 32 bytes   — unfilled: no reader here needs it
 *   block B   vertexCount × 16 bytes   — x, y, z as f32 little-endian, then a u32
 *   block C   triangleCount × 32 bytes — v0, v1, v2, n0, n1, n2 as u32 index triples,
 *                                        then `flags` and a `0xffff` terminator
 * ```
 *
 * The three counts and the two block ends agree with each other: `endB + triangleCount *
 * 32` is the file's length in every file that has one, which is what `parsePhysics`
 * checks rather than assumes — a file whose declared counts do not tile its own bytes is
 * reported as a structural failure and not as a mesh.
 *
 * The normal triple in block C is a second, independent description of each face: the
 * three indices it names are the vertices the engine's own normal was computed from.
 * `faceNormal` recomputes it from the winding so a caller that wants one normal per face
 * does not have to choose between two sources; `verify-physics.ts` checks that the
 * recomputed one does not contradict the stored one by more than a rounding step.
 */

/** One vertex, in the mesh's own space. */
export interface PhysicsVertex {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** One triangle: three vertex indices and the triangle's `flags` word. */
export interface PhysicsTriangle {
  readonly a: number
  readonly b: number
  readonly c: number
  readonly flags: number
}

export interface PhysicsMesh {
  readonly vertices: readonly PhysicsVertex[]
  readonly triangles: readonly PhysicsTriangle[]
  /** Block A's record count. Kept because a caller reporting coverage wants it. */
  readonly fillCount: number
  /** `endB + triangleCount * 32`, which the parser has checked equals the length. */
  readonly byteLength: number
  /** The three counts as the header states them, for a report to quote. */
  readonly header: {
    readonly endA: number
    readonly endB: number
    readonly fillCount: number
    readonly vertexCount: number
    readonly triangleCount: number
  }
  /** The one word this module does not interpret, kept so nothing is silently dropped. */
  readonly hash: number
}

/** Why a `.physics` file is not a mesh, as a value rather than a throw. */
export interface PhysicsFailure {
  readonly ok: false
  readonly reason: 'too-short' | 'bad-header' | 'counts-do-not-tile' | 'index-out-of-range'
  readonly detail: string
}

export type PhysicsResult = ({ ok: true } & PhysicsMesh) | PhysicsFailure

function u32(bytes: Uint8Array, at: number): number {
  return (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
}

function f32(bytes: Uint8Array, at: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat32(at, true)
}

/** The header's size. Checked rather than trusted, because it is the first field a
 *  caller with a wrong assumption would get wrong. */
export const PHYSICS_HEADER_SIZE = 48

/**
 * Decode one `.physics` file.
 *
 * Returns a reason instead of throwing, because "this file is not a mesh" is a fact
 * about the package that a caller reports — the same contract `d2/travel.ts`'s
 * `loadArea` uses for an area it cannot assemble.
 */
export function parsePhysics(bytes: Uint8Array): PhysicsResult {
  if (bytes.length < PHYSICS_HEADER_SIZE) {
    return { ok: false, reason: 'too-short', detail: `${bytes.length} bytes is less than the 48-byte header` }
  }
  const endA = u32(bytes, 0x08)
  const endB = u32(bytes, 0x10)
  const fillCount = u32(bytes, 0x18)
  const vertexCount = u32(bytes, 0x1c)
  const triangleCount = u32(bytes, 0x20)
  const hash = u32(bytes, 0x28)

  const declared = u32(bytes, 0x00)
  if (declared !== PHYSICS_HEADER_SIZE) {
    return {
      ok: false,
      reason: 'bad-header',
      detail: `the header size word is ${declared}, not ${PHYSICS_HEADER_SIZE}`,
    }
  }

  // The counts have to tile the file: block A sits between the header and `endA`, block
  // B between `endA` and `endB`, block C after `endB`, and the three together have to
  // reach the last byte. A file that does not is a file this layout does not describe.
  const expectedA = endA - PHYSICS_HEADER_SIZE
  const expectedB = endB - endA
  const expectedC = bytes.length - endB
  if (expectedA !== fillCount * 32 || expectedB !== vertexCount * 16 || expectedC !== triangleCount * 32) {
    return {
      ok: false,
      reason: 'counts-do-not-tile',
      detail:
        `counts tile ${fillCount * 32}+${vertexCount * 16}+${triangleCount * 32} bytes ` +
        `but the block boundaries give ${expectedA}+${expectedB}+${expectedC} of ${bytes.length}`,
    }
  }

  const vertices: PhysicsVertex[] = []
  for (let i = 0; i < vertexCount; i += 1) {
    const at = endA + i * 16
    vertices.push({ x: f32(bytes, at), y: f32(bytes, at + 4), z: f32(bytes, at + 8) })
  }

  const triangles: PhysicsTriangle[] = []
  for (let t = 0; t < triangleCount; t += 1) {
    const at = endB + t * 32
    const a = u32(bytes, at)
    const b = u32(bytes, at + 4)
    const c = u32(bytes, at + 8)
    if (a >= vertexCount || b >= vertexCount || c >= vertexCount) {
      return {
        ok: false,
        reason: 'index-out-of-range',
        detail: `triangle ${t} names (${a}, ${b}, ${c}) and there are ${vertexCount} vertices`,
      }
    }
    triangles.push({ a, b, c, flags: u32(bytes, at + 24) })
  }

  return {
    ok: true,
    vertices,
    triangles,
    fillCount,
    byteLength: endB + triangleCount * 32,
    header: { endA, endB, fillCount, vertexCount, triangleCount },
    hash,
  }
}

/** A triangle's normal, from its winding. Unit length, or the zero vector for a
 *  degenerate triangle — which real meshes contain and which must not become NaN. */
export function faceNormal(
  mesh: PhysicsMesh,
  triangle: PhysicsTriangle,
): readonly [number, number, number] {
  const p = mesh.vertices[triangle.a]
  const q = mesh.vertices[triangle.b]
  const r = mesh.vertices[triangle.c]
  if (p === undefined || q === undefined || r === undefined) return [0, 0, 0]
  const e1: [number, number, number] = [q.x - p.x, q.y - p.y, q.z - p.z]
  const e2: [number, number, number] = [r.x - p.x, r.y - p.y, r.z - p.z]
  const n: [number, number, number] = [
    e1[1] * e2[2] - e1[2] * e2[1],
    e1[2] * e2[0] - e1[0] * e2[2],
    e1[0] * e2[1] - e1[1] * e2[0],
  ]
  const length = Math.hypot(n[0], n[1], n[2])
  if (!Number.isFinite(length) || length < 1e-12) return [0, 0, 0]
  return [n[0] / length, n[1] / length, n[2] / length]
}

/** The mesh's bounding box, or null for a mesh with no vertices. */
export function physicsBounds(
  mesh: PhysicsMesh,
): { min: readonly [number, number, number]; max: readonly [number, number, number] } | null {
  if (mesh.vertices.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  for (const v of mesh.vertices) {
    if (v.x < minX) minX = v.x
    if (v.y < minY) minY = v.y
    if (v.z < minZ) minZ = v.z
    if (v.x > maxX) maxX = v.x
    if (v.y > maxY) maxY = v.y
    if (v.z > maxZ) maxZ = v.z
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] }
}
