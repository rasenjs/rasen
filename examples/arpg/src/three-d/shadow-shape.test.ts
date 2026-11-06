import { describe, expect, it } from 'vitest'
import { convexHull } from '@rasenjs/math'
import { buildShadowMesh, PENUMBRA_INSET } from './shadow-shape'

/** A square's four corners, as x/z pairs. */
const SQUARE = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1])

describe('the convex hull', () => {
  it('keeps the corners of a square', () => {
    const out = new Float32Array(16)
    expect(convexHull(SQUARE, 4, out)).toBe(4)
    for (const [x, z] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      const found = Array.from({ length: 4 }, (_, i) => [out[i * 2], out[i * 2 + 1]]).some(
        ([ox, oz]) => ox === x && oz === z,
      )
      expect(found).toBe(true)
    }
  })

  it('drops the points inside the hull', () => {
    const points = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1, 0, 0, 0.5, 0.25])
    const out = new Float32Array(32)
    expect(convexHull(points, 6, out)).toBe(4)
  })

  it('reports a single point as a one-point hull', () => {
    const out = new Float32Array(8)
    expect(convexHull(new Float32Array([3, 4]), 1, out)).toBe(1)
    expect(out[0]).toBe(3)
    expect(out[1]).toBe(4)
  })
})

describe('the shadow mesh', () => {
  const swept = new Float32Array(256)
  const outline = new Float32Array(256)
  const vertices = new Float32Array(256 * 3)
  const uvs = new Float32Array(256 * 2)
  const indices = new Uint16Array(256 * 9)

  it('sweeps the footprint along the sun and keeps the shape', () => {
    const mesh = buildShadowMesh(
      SQUARE,
      4,
      2,
      0,
      0,
      0,
      swept,
      outline,
      vertices,
      uvs,
      indices,
    )
    expect(mesh.outlineCount).toBeGreaterThanOrEqual(4)
    // The outline reaches twice as far along the sweep as the footprint.
    let minX = Infinity
    let maxX = -Infinity
    for (let i = 0; i < mesh.outlineCount; i += 1) {
      minX = Math.min(minX, vertices[(1 + mesh.outlineCount + i) * 3])
      maxX = Math.max(maxX, vertices[(1 + mesh.outlineCount + i) * 3])
    }
    expect(maxX - minX).toBeCloseTo(4, 5)
  })

  it('ramps the penumbra from the core to the edge', () => {
    const mesh = buildShadowMesh(
      SQUARE,
      4,
      2,
      0,
      0,
      0,
      swept,
      outline,
      vertices,
      uvs,
      indices,
    )
    // The centre and the inset outline carry the ramp's full-density end.
    expect(uvs[1]).toBe(1)
    for (let i = 0; i < mesh.outlineCount; i += 1) {
      const inner = 1 + i
      const outer = 1 + mesh.outlineCount + i
      expect(uvs[inner * 2 + 1]).toBe(1)
      expect(uvs[outer * 2 + 1]).toBe(0)
    }
  })

  it('insets the core towards the centre', () => {
    const mesh = buildShadowMesh(
      SQUARE,
      4,
      0,
      0,
      0,
      0,
      swept,
      outline,
      vertices,
      uvs,
      indices,
    )
    // Without a sweep the outline is the footprint, and the core is the same
    // shape scaled towards the centre.
    for (let i = 0; i < mesh.outlineCount; i += 1) {
      const inner = 1 + i
      const outer = 1 + mesh.outlineCount + i
      const dx = vertices[outer * 3] - vertices[inner * 3]
      const dz = vertices[outer * 3 + 2] - vertices[inner * 3 + 2]
      expect(Math.hypot(dx, dz)).toBeGreaterThan(0)
    }
    expect(PENUMBRA_INSET).toBeGreaterThan(0)
    expect(PENUMBRA_INSET).toBeLessThan(1)
  })

  it('emits a closed fan plus a penumbra band', () => {
    const mesh = buildShadowMesh(
      SQUARE,
      4,
      2,
      0,
      0,
      0,
      swept,
      outline,
      vertices,
      uvs,
      indices,
    )
    expect(mesh.vertexCount).toBe(1 + mesh.outlineCount * 2)
    // Three triangles for the core's fan segment and six for the band.
    expect(mesh.indexCount).toBe(mesh.outlineCount * 9)
    for (let i = 0; i < mesh.indexCount; i += 1) {
      expect(indices[i]).toBeLessThan(mesh.vertexCount)
    }
  })

  it('puts the density gradient along the shadow', () => {
    const mesh = buildShadowMesh(
      SQUARE,
      4,
      2,
      0,
      0,
      0,
      swept,
      outline,
      vertices,
      uvs,
      indices,
    )
    // The far end of the cast shadow is further along the sweep than the
    // contact, so its U coordinate is larger.
    let minU = Infinity
    let maxU = -Infinity
    for (let i = 0; i < mesh.outlineCount; i += 1) {
      const u = uvs[(1 + mesh.outlineCount + i) * 2]
      minU = Math.min(minU, u)
      maxU = Math.max(maxU, u)
    }
    expect(maxU).toBeGreaterThan(minU)
    expect(maxU).toBeLessThanOrEqual(1)
    expect(minU).toBeGreaterThanOrEqual(0)
  })
})