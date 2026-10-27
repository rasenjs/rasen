import { describe, expect, it } from 'vitest'
import { convexHull } from './convex-hull'

/** Hull of the given x/z pairs, as a flat array plus its count. */
function hullOf(points: number[][]): { points: number[]; count: number } {
  const flat = new Float32Array(points.length * 2)
  points.forEach(([x, z], i) => {
    flat[i * 2] = x
    flat[i * 2 + 1] = z
  })
  const out = new Float32Array(points.length * 2)
  const count = convexHull(flat, points.length, out)
  return { points: [...out.subarray(0, count * 2)], count }
}

/** The hull as sorted "x,z" strings, so order does not matter. */
function sortedPairs(points: number[], count: number): string[] {
  const out: string[] = []
  for (let i = 0; i < count; i += 1) out.push(`${points[i * 2]},${points[i * 2 + 1]}`)
  return out.sort()
}

describe('ConvexHull', () => {
  it('keeps only the corners of a square, dropping the interior point', () => {
    const { points, count } = hullOf([[0, 0], [2, 0], [2, 2], [0, 2], [1, 1]])
    expect(count).toBe(4)
    expect(sortedPairs(points, count)).toEqual(['0,0', '0,2', '2,0', '2,2'])
  })

  it('drops collinear points rather than returning them as corners', () => {
    const { count } = hullOf([[0, 0], [1, 0], [2, 0], [2, 2], [0, 2]])
    expect(count).toBe(4)
  })

  it('handles the degenerate cases without allocating or throwing', () => {
    expect(hullOf([]).count).toBe(0)
    expect(hullOf([[3, 4]]).count).toBe(1)
    // Two distinct points are a segment: reported as-is, not as a hull.
    expect(hullOf([[0, 0], [1, 1]]).count).toBe(2)
  })

  it('reuses its scratch across calls, whatever the point count', () => {
    const many = new Float32Array(200 * 2)
    for (let i = 0; i < 200; i += 1) {
      many[i * 2] = Math.cos(i)
      many[i * 2 + 1] = Math.sin(i)
    }
    const bigOut = new Float32Array(400)
    const big = convexHull(many, 200, bigOut)
    expect(big).toBeGreaterThan(3)
    // A smaller call afterwards must still be correct: the scratch only grows.
    const small = new Float32Array([0, 0, 2, 0, 2, 2, 0, 2])
    expect(convexHull(small, 4, new Float32Array(8))).toBe(4)
  })
})
