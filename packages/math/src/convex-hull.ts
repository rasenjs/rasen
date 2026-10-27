/**
 * A 2D convex hull (Andrew's monotone chain) over x/z point pairs.
 *
 * A cast shadow's shape is the hull of the points where a model meets the floor,
 * swept along the light, and a footprint's outline is the hull of the same points
 * without the sweep — so the operation runs once per part per frame. It is
 * therefore written to allocate nothing: the caller owns the output buffer, and
 * the two scratch arrays are reused across calls and only grown when a call needs
 * more room.
 *
 * Collinear points are dropped (`cross <= 0`), so the hull keeps only the extreme
 * corners — a smaller outline to transform and to fan.
 */

/** The scratch: reused across calls, grown on demand. */
let order = new Int32Array(0)
let stack = new Int32Array(0)

function ensureCapacity(capacity: number): void {
  const needed = Math.max(capacity, 1)
  if (order.length < needed) order = new Int32Array(needed)
  if (stack.length < needed + 1) stack = new Int32Array(needed + 1)
}

/** Whether the point at `index` sorts before (x, z). */
function before(points: Float32Array, index: number, x: number, z: number): boolean {
  const px = points[index * 2]
  const pz = points[index * 2 + 1]
  return px > x || (px === x && pz > z)
}

/** The 2D cross product of (b - a) x (c - a) over the x/z plane. */
function cross(points: Float32Array, a: number, b: number, c: number): number {
  const ax = points[a * 2]
  const az = points[a * 2 + 1]
  const bx = points[b * 2]
  const bz = points[b * 2 + 1]
  const cx = points[c * 2]
  const cz = points[c * 2 + 1]
  return (bx - ax) * (cz - az) - (bz - az) * (cx - ax)
}

/**
 * Write the convex hull of the first `count` x/z pairs of `points` into `out` as
 * x/z pairs (counter-clockwise) and return the hull's point count.
 *
 * `out` must have room for `count * 2` numbers.
 *
 * @example
 * ```ts
 * const count = convexHull(footprint, footprint.length / 2, outline)
 * ```
 */
export function convexHull(points: Float32Array, count: number, out: Float32Array): number {
  ensureCapacity(count)
  const n = Math.min(count, order.length)
  if (n <= 0) return 0
  if (n === 1) {
    out[0] = points[0]
    out[1] = points[1]
    return 1
  }

  // Sort the indices by (x, z). An insertion sort: the point count is small (a
  // footprint's corners, a swept outline's corners) and it needs no allocation.
  for (let i = 0; i < n; i += 1) order[i] = i
  for (let i = 1; i < n; i += 1) {
    const key = order[i]
    const kx = points[key * 2]
    const kz = points[key * 2 + 1]
    let j = i - 1
    while (j >= 0 && before(points, order[j], kx, kz)) {
      order[j + 1] = order[j]
      j -= 1
    }
    order[j + 1] = key
  }

  let k = 0
  // The lower hull.
  for (let i = 0; i < n; i += 1) {
    const p = order[i]
    while (k >= 2 && cross(points, stack[k - 2], stack[k - 1], p) <= 0) k -= 1
    stack[k] = p
    k += 1
  }
  // The upper hull.
  const limit = k + 1
  for (let i = n - 2; i >= 0; i -= 1) {
    const p = order[i]
    while (k >= limit && cross(points, stack[k - 2], stack[k - 1], p) <= 0) k -= 1
    stack[k] = p
    k += 1
  }

  const hullCount = Math.max(k - 1, 0)
  for (let i = 0; i < hullCount; i += 1) {
    const p = stack[i]
    out[i * 2] = points[p * 2]
    out[i * 2 + 1] = points[p * 2 + 1]
  }
  return hullCount
}

