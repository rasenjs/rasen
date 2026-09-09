/**
 * Sutherland–Hodgman triangle clipping used by the WebGL Spine renderer —
 * the geometric equivalent of the official SkeletonClipping.clipTriangles
 * for a single convex clip polygon.
 */

import { describe, it, expect } from 'vitest'
import { clipTriangleToPolygon, makePolygonClockwise } from './spine-clip'

/** Unit square [0,1]² wound clockwise (negative shoelace area). */
const CW_SQUARE = [1, 1, 1, 0, 0, 0, 0, 1]

/** Shoelace area of the `[x, y, u, v, ...]` tuple list produced by the clipper. */
function polygonArea(out: number[]): number {
  let area = 0
  const n = out.length / 4
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += out[4 * i] * out[4 * j + 1] - out[4 * j] * out[4 * i + 1]
  }
  return Math.abs(area) / 2
}

describe('makePolygonClockwise', () => {
  it('reverses a counter-clockwise polygon', () => {
    // CCW unit square (positive shoelace area).
    const poly = [0, 0, 1, 0, 1, 1, 0, 1]
    makePolygonClockwise(poly)
    expect(poly).toEqual([0, 1, 1, 1, 1, 0, 0, 0])
  })

  it('leaves a clockwise polygon untouched', () => {
    const poly = [...CW_SQUARE]
    makePolygonClockwise(poly)
    expect(poly).toEqual(CW_SQUARE)
  })
})

describe('clipTriangleToPolygon', () => {
  it('keeps a fully-inside triangle with its corner UVs', () => {
    const out: number[] = []
    clipTriangleToPolygon(
      CW_SQUARE,
      0.2, 0.2, 0, 0,
      0.8, 0.2, 1, 0,
      0.5, 0.8, 0, 1,
      out
    )
    expect(out).toHaveLength(12) // 3 corners × (x, y, u, v)
    // The three emitted points are exactly the triangle's corners.
    const sorted = [0, 1, 2]
      .map((i) => [out[4 * i], out[4 * i + 1]].map((v) => Math.round(v * 1e9) / 1e9))
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    expect(sorted).toEqual([
      [0.2, 0.2],
      [0.5, 0.8],
      [0.8, 0.2]
    ])
    // UVs still map 1:1 to the corners (order follows the emitted points).
    const uvs = [0, 1, 2].map((i) => [out[4 * i + 2], out[4 * i + 3]]).sort(
      (a, b) => a[0] - b[0] || a[1] - b[1]
    )
    expect(uvs).toEqual([
      [0, 0],
      [0, 1],
      [1, 0]
    ])
  })

  it('discards a fully-outside triangle', () => {
    const out: number[] = []
    clipTriangleToPolygon(
      CW_SQUARE,
      2, 2, 0, 0,
      3, 2, 1, 0,
      2.5, 3, 0, 1,
      out
    )
    expect(out).toHaveLength(0)
  })

  it('clips a partially-overlapping triangle to the intersection area', () => {
    // Triangle hanging below the unit square; the true intersection with the
    // square is the triangle (0.5,0) (1,0) (1,1) → area 0.25. The clipper may
    // emit duplicate vertices where an input corner sits exactly on a clip
    // edge — harmless for the fan triangulation, so assert on AREA.
    const out: number[] = []
    clipTriangleToPolygon(
      CW_SQUARE,
      0, -1, 0, 0,
      2, -1, 1, 0,
      1, 1, 0, 1,
      out
    )
    expect(out.length).toBeGreaterThanOrEqual(12) // at least a triangle
    expect(polygonArea(out)).toBeCloseTo(0.25, 9)
    for (let i = 0; i < out.length; i += 4) {
      expect(out[i]).toBeGreaterThanOrEqual(-1e-9)
      expect(out[i]).toBeLessThanOrEqual(1 + 1e-9)
      expect(out[i + 1]).toBeGreaterThanOrEqual(-1e-9)
      expect(out[i + 1]).toBeLessThanOrEqual(1 + 1e-9)
    }
  })

  it('interpolates UVs at clipped points via barycentric coordinates', () => {
    // Triangle (0,0)-(2,0)-(0,1.5) with UVs (0,0)-(1,0)-(0,1); the square cuts
    // the hypotenuse. The clipped point at (1, 0.75) is the midpoint of the
    // B→C edge → barycentric (0, 0.5, 0.5) → UV (0.5, 0.5).
    const out: number[] = []
    clipTriangleToPolygon(
      CW_SQUARE,
      0, 0, 0, 0,
      2, 0, 1, 0,
      0, 1.5, 0, 1,
      out
    )
    // 5 corners: (0,0) (1,0) (1,0.75) (2/3,1) (0,1) — two of them clipped.
    expect(out).toHaveLength(20)
    const uvAtHypotenuse = [out[2 * 4 + 2], out[2 * 4 + 3]] // third point (1, 0.75)
    expect(uvAtHypotenuse[0]).toBeCloseTo(0.5, 9)
    expect(uvAtHypotenuse[1]).toBeCloseTo(0.5, 9)
  })

  it('clips everything away for degenerate clip polygons', () => {
    const out: number[] = []
    // Two-point "polygon" — malformed data; nothing must be emitted.
    clipTriangleToPolygon(
      [0, 0, 1, 1],
      0, 0, 0, 0,
      1, 0, 1, 0,
      0, 1, 0, 1,
      out
    )
    expect(out).toHaveLength(0)
  })
})
