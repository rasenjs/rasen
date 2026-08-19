import { describe, expect, it } from 'vitest'
import { aabb, containsPointAabb, intersectsAabb, overlapsAabb } from './aabb'

describe('intersectsAabb', () => {
  it('detects overlapping boxes', () => {
    const a = aabb(0, 0, 0, 2, 2, 2)
    const b = aabb(1, 1, 1, 3, 3, 3)
    expect(intersectsAabb(a, b)).toBe(true)
  })

  it('detects disjoint boxes', () => {
    const a = aabb(0, 0, 0, 1, 1, 1)
    const b = aabb(2, 0, 0, 3, 1, 1)
    expect(intersectsAabb(a, b)).toBe(false)
  })

  it('treats touching edges as intersecting', () => {
    const a = aabb(0, 0, 0, 1, 1, 1)
    const b = aabb(1, 0, 0, 2, 1, 1)
    expect(intersectsAabb(a, b)).toBe(true)
  })

  it('is symmetric', () => {
    const a = aabb(0, 0, 0, 2, 2, 2)
    const b = aabb(1, 1, 1, 3, 3, 3)
    expect(intersectsAabb(b, a)).toBe(true)
  })
})

describe('overlapsAabb', () => {
  it('detects strict overlap', () => {
    const a = aabb(0, 0, 0, 2, 2, 2)
    const b = aabb(1, 1, 1, 3, 3, 3)
    expect(overlapsAabb(a, b)).toBe(true)
  })

  it('does NOT count touching edges (standing on a block)', () => {
    const block = aabb(0, 0, 0, 1, 1, 1)
    const feetOnTop = aabb(0.2, 1, 0.2, 0.8, 2, 0.8) // bottom exactly at block top
    expect(intersectsAabb(feetOnTop, block)).toBe(true) // inclusive yes…
    expect(overlapsAabb(feetOnTop, block)).toBe(false) // …but strict no
  })

  it('rejects disjoint boxes', () => {
    const a = aabb(0, 0, 0, 1, 1, 1)
    const b = aabb(2, 0, 0, 3, 1, 1)
    expect(overlapsAabb(a, b)).toBe(false)
  })
})

describe('containsPointAabb', () => {
  it('contains points inside the box', () => {
    const box = aabb(0, 0, 0, 2, 2, 2)
    expect(containsPointAabb(box, 1, 1, 1)).toBe(true)
    expect(containsPointAabb(box, 0, 2, 0)).toBe(true) // on the edge
  })

  it('rejects points outside', () => {
    const box = aabb(0, 0, 0, 2, 2, 2)
    expect(containsPointAabb(box, 3, 1, 1)).toBe(false)
    expect(containsPointAabb(box, 1, -1, 1)).toBe(false)
  })
})
