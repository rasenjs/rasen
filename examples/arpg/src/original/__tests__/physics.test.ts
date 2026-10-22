/**
 * The `.physics` decoder, against meshes built here rather than against the package.
 *
 * `tools/verify-physics.ts` checks all 3,031 real files; these cases pin the reading
 * itself, so a change to the layout fails here rather than only in a run that needs an
 * extracted copy of the game.
 */

import { describe, expect, it } from 'vitest'
import { PHYSICS_HEADER_SIZE, faceNormal, parsePhysics, physicsBounds } from '../physics'

/** Build a `.physics` file: one quad, four vertices, two triangles. */
function quad(
  vertices: ReadonlyArray<readonly [number, number, number]>,
  triangles: ReadonlyArray<readonly [number, number, number]>,
  overrides: { fillCount?: number; endA?: number; endB?: number; hash?: number } = {},
): Uint8Array {
  const fill = overrides.fillCount ?? 0
  const endA = overrides.endA ?? PHYSICS_HEADER_SIZE + fill * 32
  const endB = overrides.endB ?? endA + vertices.length * 16
  const size = endB + triangles.length * 32
  const bytes = new Uint8Array(size)
  const view = new DataView(bytes.buffer)
  view.setUint32(0x00, PHYSICS_HEADER_SIZE, true)
  view.setUint32(0x04, 0, true)
  view.setUint32(0x08, endA, true)
  view.setUint32(0x0c, 0, true)
  view.setUint32(0x10, endB, true)
  view.setUint32(0x14, 0, true)
  view.setUint32(0x18, fill, true)
  view.setUint32(0x1c, vertices.length, true)
  view.setUint32(0x20, triangles.length, true)
  view.setUint32(0x24, 0, true)
  view.setUint32(0x28, overrides.hash ?? 0x1234, true)
  view.setUint32(0x2c, 0, true)
  vertices.forEach((v, i) => {
    const at = endA + i * 16
    view.setFloat32(at, v[0], true)
    view.setFloat32(at + 4, v[1], true)
    view.setFloat32(at + 8, v[2], true)
  })
  triangles.forEach((t, i) => {
    const at = endB + i * 32
    view.setUint32(at, t[0], true)
    view.setUint32(at + 4, t[1], true)
    view.setUint32(at + 8, t[2], true)
    view.setUint32(at + 12, t[0], true)
    view.setUint32(at + 16, t[1], true)
    view.setUint32(at + 20, t[2], true)
    view.setUint32(at + 24, 0, true)
    view.setUint32(at + 28, 0xffff, true)
  })
  return bytes
}

/** A unit quad in the z = 0 plane, wound counter-clockwise seen from +z. */
const SQUARE: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
]
const SQUARE_TRIANGLES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [0, 2, 3],
]

describe('parsePhysics', () => {
  it('reads the vertices and triangles of a mesh', () => {
    const result = parsePhysics(quad(SQUARE, SQUARE_TRIANGLES))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.vertices).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: 0, y: 1, z: 0 },
    ])
    expect(result.triangles.map((t) => [t.a, t.b, t.c])).toEqual([
      [0, 1, 2],
      [0, 2, 3],
    ])
    expect(result.header.vertexCount).toBe(4)
    expect(result.header.triangleCount).toBe(2)
  })

  it('reports the counting words it does not interpret instead of dropping them', () => {
    const result = parsePhysics(quad(SQUARE, SQUARE_TRIANGLES, { hash: 0xdeadbeef, fillCount: 2 }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.hash).toBe(0xdeadbeef)
    expect(result.fillCount).toBe(2)
  })

  it('refuses trailing bytes, because every real file tiles exactly', () => {
    // The strictness is the point: a file whose counts do not reach the last byte is a
    // file this layout does not describe, and accepting the slack would hide a wrong
    // reading of the header. It is also what the data does — `verify-physics` decodes all
    // 3,031 files in the package with 0 failures, so none of them carries padding.
    const bytes = quad(SQUARE, SQUARE_TRIANGLES)
    const padded = new Uint8Array(bytes.length + 8)
    padded.set(bytes)
    const result = parsePhysics(padded)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('counts-do-not-tile')
    // And with no padding it reports the length it consumed, which is the file's.
    const exact = parsePhysics(bytes)
    expect(exact.ok).toBe(true)
    if (!exact.ok) return
    expect(exact.byteLength).toBe(bytes.length)
  })

  it('refuses a file whose counts do not tile its own bytes', () => {
    // `endB` moved two bytes later than block B actually ends: block C's stride can no
    // longer reach the end of the file.
    const bytes = quad(SQUARE, SQUARE_TRIANGLES)
    new DataView(bytes.buffer).setUint32(0x10, PHYSICS_HEADER_SIZE + 4 * 16 + 2, true)
    const result = parsePhysics(bytes)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('counts-do-not-tile')
  })

  it('refuses a triangle that names a vertex past the end', () => {
    const bytes = quad(SQUARE, [[0, 1, 9]])
    const result = parsePhysics(bytes)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('index-out-of-range')
    expect(result.detail).toContain('9')
  })

  it('refuses a short file and a header that is not 48 bytes', () => {
    const short = parsePhysics(new Uint8Array(12))
    expect(short.ok).toBe(false)
    if (!short.ok) expect(short.reason).toBe('too-short')

    const bytes = quad(SQUARE, SQUARE_TRIANGLES)
    new DataView(bytes.buffer).setUint32(0x00, 40, true)
    const wrong = parsePhysics(bytes)
    expect(wrong.ok).toBe(false)
    if (!wrong.ok) expect(wrong.reason).toBe('bad-header')
  })

  it('accepts a mesh with no triangles', () => {
    // A glyph or a trigger volume is a real thing in the package and it has no faces.
    const result = parsePhysics(quad(SQUARE, []))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.triangles).toEqual([])
    expect(result.vertices).toHaveLength(4)
  })
})

describe('faceNormal', () => {
  it('points the way the winding says', () => {
    const result = parsePhysics(quad(SQUARE, SQUARE_TRIANGLES))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const normal = faceNormal(result, result.triangles[0])
    // Counter-clockwise seen from +z, so the normal is +z.
    expect(normal[0]).toBeCloseTo(0, 6)
    expect(normal[1]).toBeCloseTo(0, 6)
    expect(normal[2]).toBeCloseTo(1, 6)
  })

  it('flips with the winding', () => {
    const result = parsePhysics(quad(SQUARE, [[0, 2, 1]]))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(faceNormal(result, result.triangles[0])[2]).toBeCloseTo(-1, 6)
  })

  it('is the zero vector rather than NaN for a degenerate triangle', () => {
    // Three colinear points: the cross product vanishes and a renderer has to be able to
    // tell "no normal" from a normal, which NaN cannot express.
    const flat: ReadonlyArray<readonly [number, number, number]> = [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ]
    const result = parsePhysics(quad(flat, [[0, 1, 2]]))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(faceNormal(result, result.triangles[0])).toEqual([0, 0, 0])
  })
})

describe('physicsBounds', () => {
  it('measures the mesh', () => {
    const result = parsePhysics(quad(SQUARE, SQUARE_TRIANGLES))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const box = physicsBounds(result)
    expect(box).not.toBeNull()
    expect(box?.min).toEqual([0, 0, 0])
    expect(box?.max).toEqual([1, 1, 0])
  })

  it('is null for a mesh with no vertices', () => {
    const result = parsePhysics(quad([], []))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(physicsBounds(result)).toBeNull()
  })
})
