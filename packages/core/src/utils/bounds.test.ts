/**
 * Bounds utilities tests
 */

import { describe, it, expect } from 'vitest'
import {
  boundsIntersect,
  mergeBounds,
  boundsUnion,
  boundsContains,
  boundsContainsPoint,
  boundsArea,
  boundsEqual,
  boundsExpand,
  boundsClone,
  type Bounds
} from './bounds'

describe('boundsIntersect', () => {
  it('should detect overlapping bounds', () => {
    const a: Bounds = { x: 0, y: 0, width: 100, height: 100 }
    const b: Bounds = { x: 50, y: 50, width: 100, height: 100 }
    expect(boundsIntersect(a, b)).toBe(true)
  })

  it('should detect non-overlapping bounds', () => {
    const a: Bounds = { x: 0, y: 0, width: 50, height: 50 }
    const b: Bounds = { x: 100, y: 100, width: 50, height: 50 }
    expect(boundsIntersect(a, b)).toBe(false)
  })

  it('should detect edge-touching bounds as intersecting (conservative)', () => {
    // Edge-touching bounds are considered intersecting for rendering purposes
    // This is conservative but ensures no pixels are missed during redraws
    const a: Bounds = { x: 0, y: 0, width: 50, height: 50 }
    const b: Bounds = { x: 50, y: 0, width: 50, height: 50 }
    expect(boundsIntersect(a, b)).toBe(true)
  })

  it('should detect partial overlap - horizontal', () => {
    const a: Bounds = { x: 0, y: 0, width: 100, height: 50 }
    const b: Bounds = { x: 50, y: 10, width: 100, height: 30 }
    expect(boundsIntersect(a, b)).toBe(true)
  })

  it('should detect partial overlap - vertical', () => {
    const a: Bounds = { x: 0, y: 0, width: 50, height: 100 }
    const b: Bounds = { x: 10, y: 50, width: 30, height: 100 }
    expect(boundsIntersect(a, b)).toBe(true)
  })

  it('should handle animation trail case - moved object', () => {
    // Object moved from (0,0) to (100,0)
    const oldBounds: Bounds = { x: 0, y: 0, width: 50, height: 50 }
    const newBounds: Bounds = { x: 100, y: 0, width: 50, height: 50 }
    const dirtyRegion: Bounds = { x: 0, y: 0, width: 150, height: 50 }
    
    expect(boundsIntersect(oldBounds, dirtyRegion)).toBe(true)
    expect(boundsIntersect(newBounds, dirtyRegion)).toBe(true)
  })
})

describe('mergeBounds', () => {
  it('should return null for empty array', () => {
    expect(mergeBounds([])).toBeNull()
  })

  it('should return single bounds unchanged', () => {
    const bounds: Bounds = { x: 10, y: 20, width: 50, height: 60 }
    const result = mergeBounds([bounds])
    expect(result).toEqual(bounds)
  })

  it('should merge two separate bounds', () => {
    const a: Bounds = { x: 0, y: 0, width: 50, height: 50 }
    const b: Bounds = { x: 100, y: 100, width: 50, height: 50 }
    const result = mergeBounds([a, b])
    
    expect(result).toEqual({
      x: 0,
      y: 0,
      width: 150,
      height: 150
    })
  })

  it('should merge overlapping bounds', () => {
    const a: Bounds = { x: 0, y: 0, width: 100, height: 100 }
    const b: Bounds = { x: 50, y: 50, width: 100, height: 100 }
    const result = mergeBounds([a, b])
    
    expect(result).toEqual({
      x: 0,
      y: 0,
      width: 150,
      height: 150
    })
  })

  it('should merge multiple bounds', () => {
    const bounds: Bounds[] = [
      { x: 0, y: 0, width: 50, height: 50 },
      { x: 100, y: 0, width: 50, height: 50 },
      { x: 50, y: 100, width: 50, height: 50 }
    ]
    const result = mergeBounds(bounds)
    
    expect(result).toEqual({
      x: 0,
      y: 0,
      width: 150,
      height: 150
    })
  })

  it('should handle animation dirty regions', () => {
    // Object moved from (50,50) to (150,150)
    const oldPos: Bounds = { x: 50, y: 50, width: 30, height: 30 }
    const newPos: Bounds = { x: 150, y: 150, width: 30, height: 30 }
    const merged = mergeBounds([oldPos, newPos])
    
    expect(merged).toEqual({
      x: 50,
      y: 50,
      width: 130,
      height: 130
    })
  })
})

describe('boundsUnion', () => {
  it('should calculate union of two bounds', () => {
    const a: Bounds = { x: 0, y: 0, width: 50, height: 50 }
    const b: Bounds = { x: 100, y: 100, width: 50, height: 50 }
    const result = boundsUnion(a, b)
    
    expect(result).toEqual({
      x: 0,
      y: 0,
      width: 150,
      height: 150
    })
  })

  it('should handle overlapping bounds', () => {
    const a: Bounds = { x: 0, y: 0, width: 100, height: 100 }
    const b: Bounds = { x: 50, y: 50, width: 100, height: 100 }
    const result = boundsUnion(a, b)
    
    expect(result).toEqual({
      x: 0,
      y: 0,
      width: 150,
      height: 150
    })
  })
})

describe('boundsContains', () => {
  it('should detect full containment', () => {
    const container: Bounds = { x: 0, y: 0, width: 100, height: 100 }
    const inner: Bounds = { x: 25, y: 25, width: 50, height: 50 }
    expect(boundsContains(container, inner)).toBe(true)
  })

  it('should detect non-containment', () => {
    const container: Bounds = { x: 0, y: 0, width: 100, height: 100 }
    const outer: Bounds = { x: 50, y: 50, width: 100, height: 100 }
    expect(boundsContains(container, outer)).toBe(false)
  })

  it('should detect edge case - same size', () => {
    const a: Bounds = { x: 0, y: 0, width: 100, height: 100 }
    const b: Bounds = { x: 0, y: 0, width: 100, height: 100 }
    expect(boundsContains(a, b)).toBe(true)
  })
})

describe('boundsContainsPoint', () => {
  it('should detect point inside bounds', () => {
    const bounds: Bounds = { x: 0, y: 0, width: 100, height: 100 }
    expect(boundsContainsPoint(bounds, 50, 50)).toBe(true)
  })

  it('should detect point outside bounds', () => {
    const bounds: Bounds = { x: 0, y: 0, width: 100, height: 100 }
    expect(boundsContainsPoint(bounds, 150, 150)).toBe(false)
  })

  it('should handle edge points', () => {
    const bounds: Bounds = { x: 0, y: 0, width: 100, height: 100 }
    expect(boundsContainsPoint(bounds, 0, 0)).toBe(true)
    expect(boundsContainsPoint(bounds, 100, 100)).toBe(true)
  })
})

describe('boundsArea', () => {
  it('should calculate area', () => {
    const bounds: Bounds = { x: 0, y: 0, width: 100, height: 50 }
    expect(boundsArea(bounds)).toBe(5000)
  })

  it('should handle zero area', () => {
    const bounds: Bounds = { x: 0, y: 0, width: 0, height: 0 }
    expect(boundsArea(bounds)).toBe(0)
  })
})

describe('boundsEqual', () => {
  it('should detect equal bounds', () => {
    const a: Bounds = { x: 10, y: 20, width: 100, height: 50 }
    const b: Bounds = { x: 10, y: 20, width: 100, height: 50 }
    expect(boundsEqual(a, b)).toBe(true)
  })

  it('should detect unequal bounds', () => {
    const a: Bounds = { x: 10, y: 20, width: 100, height: 50 }
    const b: Bounds = { x: 10, y: 20, width: 101, height: 50 }
    expect(boundsEqual(a, b)).toBe(false)
  })
})

describe('boundsExpand', () => {
  it('should expand bounds by margin', () => {
    const bounds: Bounds = { x: 50, y: 50, width: 100, height: 100 }
    const expanded = boundsExpand(bounds, 10)
    
    expect(expanded).toEqual({
      x: 40,
      y: 40,
      width: 120,
      height: 120
    })
  })

  it('should handle zero margin', () => {
    const bounds: Bounds = { x: 50, y: 50, width: 100, height: 100 }
    const expanded = boundsExpand(bounds, 0)
    
    expect(expanded).toEqual(bounds)
  })

  it('should expand for lineWidth calculations', () => {
    // Common use case: expanding circle bounds to include stroke
    const circleBounds: Bounds = { x: 50, y: 50, width: 100, height: 100 }
    const lineWidth = 5
    const withStroke = boundsExpand(circleBounds, lineWidth / 2)
    
    expect(withStroke).toEqual({
      x: 47.5,
      y: 47.5,
      width: 105,
      height: 105
    })
  })
})

describe('boundsClone', () => {
  it('should create independent copy', () => {
    const original: Bounds = { x: 10, y: 20, width: 100, height: 50 }
    const cloned = boundsClone(original)
    
    expect(cloned).toEqual(original)
    expect(cloned).not.toBe(original)
    
    // Modify clone
    cloned.x = 999
    expect(original.x).toBe(10)
  })
})

describe('integration tests - animation scenarios', () => {
  it('should correctly handle moving circle animation', () => {
    // Circle moves from (100, 100) to (200, 100)
    const circleRadius = 25
    const oldBounds: Bounds = {
      x: 100 - circleRadius,
      y: 100 - circleRadius,
      width: circleRadius * 2,
      height: circleRadius * 2
    }
    const newBounds: Bounds = {
      x: 200 - circleRadius,
      y: 100 - circleRadius,
      width: circleRadius * 2,
      height: circleRadius * 2
    }
    
    // Mark both regions dirty
    const dirtyRegion = mergeBounds([oldBounds, newBounds])
    expect(dirtyRegion).not.toBeNull()
    
    // Both old and new positions should intersect with dirty region
    expect(boundsIntersect(oldBounds, dirtyRegion!)).toBe(true)
    expect(boundsIntersect(newBounds, dirtyRegion!)).toBe(true)
  })

  it('should handle multiple objects moving simultaneously', () => {
    // Multiple circles moving in different directions
    const objects = [
      { old: { x: 0, y: 0, width: 50, height: 50 }, new: { x: 10, y: 0, width: 50, height: 50 } },
      { old: { x: 100, y: 0, width: 50, height: 50 }, new: { x: 90, y: 0, width: 50, height: 50 } },
      { old: { x: 50, y: 100, width: 50, height: 50 }, new: { x: 50, y: 110, width: 50, height: 50 } }
    ]
    
    const dirtyRegions = objects.flatMap(obj => [obj.old, obj.new])
    const mergedDirty = mergeBounds(dirtyRegions)
    
    expect(mergedDirty).not.toBeNull()
    
    // All objects should be detected for redraw
    for (const obj of objects) {
      expect(boundsIntersect(obj.old, mergedDirty!)).toBe(true)
      expect(boundsIntersect(obj.new, mergedDirty!)).toBe(true)
    }
  })
})
