import { describe, expect, it } from 'vitest'
import { mergeOutlines, type GroundOutline } from './ground-outline'

/** An outline with the given hull points and height. */
function outline(points: number[][], top: number): GroundOutline {
  const flat = new Float32Array(points.length * 2)
  points.forEach(([x, z], i) => {
    flat[i * 2] = x
    flat[i * 2 + 1] = z
  })
  return { points: flat, top }
}

const BOX = [[-0.7, -0.4], [0.7, -0.4], [0.7, 0.4], [-0.7, 0.4]]

describe('merging an actor\'s part outlines', () => {
  it('builds one footprint from several parts and takes the tallest height', () => {
    // The legs give the footprint; the head gives the height the shadow reaches.
    const merged = mergeOutlines([outline(BOX, 4.34), outline([], 7.17)])
    expect(merged.count).toBe(4)
    expect(merged.top).toBeCloseTo(7.17, 5)
  })

  it('takes the union of two parts that do not overlap', () => {
    const left = outline([[-0.6, -0.2], [-0.2, -0.2], [-0.2, 0.2], [-0.6, 0.2]], 1)
    const right = outline([[0.2, -0.2], [0.6, -0.2], [0.6, 0.2], [0.2, 0.2]], 1)
    const merged = mergeOutlines([left, right])
    expect(merged.count).toBe(4)
    let minX = Infinity
    let maxX = -Infinity
    for (let i = 0; i < merged.count; i += 1) {
      minX = Math.min(minX, merged.points[i * 2])
      maxX = Math.max(maxX, merged.points[i * 2])
    }
    // The hull spans both boxes.
    expect(minX).toBeCloseTo(-0.6, 5)
    expect(maxX).toBeCloseTo(0.6, 5)
  })

  it('reports no footprint when nothing has one, but keeps the height', () => {
    const merged = mergeOutlines([outline([], 2.5)])
    expect(merged.count).toBe(0)
    expect(merged.top).toBeCloseTo(2.5, 5)
    expect(mergeOutlines([]).top).toBe(0)
  })

  it('ignores the parts that have not loaded yet', () => {
    const merged = mergeOutlines([undefined, outline(BOX, 3), undefined])
    expect(merged.count).toBe(4)
    expect(merged.top).toBeCloseTo(3, 5)
  })
})
