/**
 * Aabb — axis-aligned bounding box helpers (collision, spatial queries).
 *
 * An AABB is defined by its min/max corners. Intersection uses the standard
 * separating-axis test, so it also covers touching/edge cases consistently.
 */

export interface Aabb {
  minX: number
  minY: number
  minZ: number
  maxX: number
  maxY: number
  maxZ: number
}

/** Build an AABB from min/max corners. */
export function aabb(
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): Aabb {
  return { minX, minY, minZ, maxX, maxY, maxZ }
}

/** Do two AABBs overlap (inclusive of touching edges)? */
export function intersectsAabb(a: Aabb, b: Aabb): boolean {
  return (
    a.minX <= b.maxX && a.maxX >= b.minX &&
    a.minY <= b.maxY && a.maxY >= b.minY &&
    a.minZ <= b.maxZ && a.maxZ >= b.minZ
  )
}

/**
 * Do two AABBs overlap strictly (touching edges do NOT count)?
 *
 * Use this for physics/collision: a character standing exactly on a block's
 * top surface shares that boundary, and should not be treated as colliding.
 */
export function overlapsAabb(a: Aabb, b: Aabb): boolean {
  return (
    a.minX < b.maxX && a.maxX > b.minX &&
    a.minY < b.maxY && a.maxY > b.minY &&
    a.minZ < b.maxZ && a.maxZ > b.minZ
  )
}

/** Is the point (x, y, z) inside the AABB (inclusive)? */
export function containsPointAabb(box: Aabb, x: number, y: number, z: number): boolean {
  return (
    x >= box.minX && x <= box.maxX &&
    y >= box.minY && y <= box.maxY &&
    z >= box.minZ && z <= box.maxZ
  )
}
