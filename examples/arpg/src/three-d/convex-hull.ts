/**
 * A 2D convex hull (Andrew's monotone chain) over x/z point pairs.
 *
 * The contact shadow needs the outline of the actor's footprint, and the
 * outline IS the hull of the points where the model touches the floor. The
 * hull is computed over a handful of points, so this implementation avoids
 * allocation entirely: the caller owns the scratch, and the hull is written
 * into the caller's output buffer.
 *
 * Collinear points are dropped (`cross <= 0`), so the hull keeps only the
 * extreme corners — a smaller outline to transform and to fan.
 */

export class ConvexHull {
  /** The scratch: the input points' order, sorted by (x, z). */
  private readonly order: Int32Array
  /** The scratch: the hull's point indices as they are built. */
  private readonly stack: Int32Array

  constructor(capacity: number) {
    this.order = new Int32Array(Math.max(capacity, 1))
    this.stack = new Int32Array(Math.max(capacity, 1) + 1)
  }

  /**
   * The hull of the first `count` x/z pairs of `points`.
   *
   * The hull is written into `out` as x/z pairs (counter-clockwise) and the
   * hull's point count is returned.
   */
  build(points: Float32Array, count: number, out: Float32Array): number {
    const n = Math.min(count, this.order.length)
    if (n <= 0) return 0
    if (n === 1) {
      out[0] = points[0]
      out[1] = points[1]
      return 1
    }

    // Sort the indices by (x, z). An insertion sort: the point count is
    // small (a footprint's corners, a swept outline's corners), and it
    // needs no scratch allocation.
    const order = this.order
    for (let i = 0; i < n; i += 1) order[i] = i
    for (let i = 1; i < n; i += 1) {
      const key = order[i]
      const kx = points[key * 2]
      const kz = points[key * 2 + 1]
      let j = i - 1
      while (j >= 0 && this.before(points, order[j], kx, kz)) {
        order[j + 1] = order[j]
        j -= 1
      }
      order[j + 1] = key
    }

    const stack = this.stack
    let k = 0
    // The lower hull.
    for (let i = 0; i < n; i += 1) {
      const p = order[i]
      while (k >= 2 && this.cross(points, stack[k - 2], stack[k - 1], p) <= 0) k -= 1
      stack[k] = p
      k += 1
    }
    // The upper hull.
    const limit = k + 1
    for (let i = n - 2; i >= 0; i -= 1) {
      const p = order[i]
      while (k >= limit && this.cross(points, stack[k - 2], stack[k - 1], p) <= 0) k -= 1
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

  /** Whether the point at `index` sorts before (x, z). */
  private before(points: Float32Array, index: number, x: number, z: number): boolean {
    const px = points[index * 2]
    const pz = points[index * 2 + 1]
    return px > x || (px === x && pz > z)
  }

  /** The 2D cross product of (b - a) × (c - a) over the x/z plane. */
  private cross(points: Float32Array, a: number, b: number, c: number): number {
    const ax = points[a * 2]
    const az = points[a * 2 + 1]
    const bx = points[b * 2]
    const bz = points[b * 2 + 1]
    const cx = points[c * 2]
    const cz = points[c * 2 + 1]
    return (bx - ax) * (cz - az) - (bz - az) * (cx - ax)
  }
}
