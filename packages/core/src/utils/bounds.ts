/**
 * Bounds utilities - shared between canvas-2d and webgl
 * 
 * Provides utilities for:
 * - Bounds intersection detection
 * - Dirty region merging
 * - Bounds operations
 */

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Check if two bounds intersect
 * 
 * @param a First bounds
 * @param b Second bounds
 * @returns true if bounds intersect, false otherwise
 * 
 * @example
 * ```ts
 * const a = { x: 0, y: 0, width: 100, height: 100 }
 * const b = { x: 50, y: 50, width: 100, height: 100 }
 * boundsIntersect(a, b) // true
 * ```
 */
export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  )
}

/**
 * Merge multiple bounds into a single bounding box
 * 
 * @param regions Array of bounds to merge
 * @returns Merged bounds, or null if array is empty
 * 
 * @example
 * ```ts
 * const regions = [
 *   { x: 0, y: 0, width: 50, height: 50 },
 *   { x: 100, y: 100, width: 50, height: 50 }
 * ]
 * mergeBounds(regions) // { x: 0, y: 0, width: 150, height: 150 }
 * ```
 */
export function mergeBounds(regions: Bounds[]): Bounds | null {
  if (regions.length === 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const region of regions) {
    minX = Math.min(minX, region.x)
    minY = Math.min(minY, region.y)
    maxX = Math.max(maxX, region.x + region.width)
    maxY = Math.max(maxY, region.y + region.height)
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

/**
 * Calculate union of two bounds
 * Returns the smallest bounds that contains both input bounds
 * 
 * @param a First bounds
 * @param b Second bounds
 * @returns Union bounds
 */
export function boundsUnion(a: Bounds, b: Bounds): Bounds {
  const minX = Math.min(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxX = Math.max(a.x + a.width, b.x + b.width)
  const maxY = Math.max(a.y + a.height, b.y + b.height)

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

/**
 * Check if bounds a contains bounds b
 * 
 * @param a Container bounds
 * @param b Contained bounds
 * @returns true if a completely contains b
 */
export function boundsContains(a: Bounds, b: Bounds): boolean {
  return (
    b.x >= a.x &&
    b.y >= a.y &&
    b.x + b.width <= a.x + a.width &&
    b.y + b.height <= a.y + a.height
  )
}

/**
 * Check if a point is inside bounds
 * 
 * @param bounds Bounds to check
 * @param x Point x coordinate
 * @param y Point y coordinate
 * @returns true if point is inside bounds
 */
export function boundsContainsPoint(bounds: Bounds, x: number, y: number): boolean {
  return (
    x >= bounds.x &&
    x <= bounds.x + bounds.width &&
    y >= bounds.y &&
    y <= bounds.y + bounds.height
  )
}

/**
 * Calculate the area of bounds
 * 
 * @param bounds Bounds to calculate area for
 * @returns Area in square pixels
 */
export function boundsArea(bounds: Bounds): number {
  return bounds.width * bounds.height
}

/**
 * Check if two bounds are equal
 * 
 * @param a First bounds
 * @param b Second bounds
 * @returns true if bounds are equal
 */
export function boundsEqual(a: Bounds, b: Bounds): boolean {
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height
  )
}

/**
 * Expand bounds by a margin
 * 
 * @param bounds Bounds to expand
 * @param margin Margin to add on all sides
 * @returns Expanded bounds
 */
export function boundsExpand(bounds: Bounds, margin: number): Bounds {
  return {
    x: bounds.x - margin,
    y: bounds.y - margin,
    width: bounds.width + margin * 2,
    height: bounds.height + margin * 2
  }
}

/**
 * Clone bounds object
 * 
 * @param bounds Bounds to clone
 * @returns New bounds object with same values
 */
export function boundsClone(bounds: Bounds): Bounds {
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height
  }
}
