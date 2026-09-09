/**
 * Polygon clipping helpers for the WebGL Spine renderer — the geometric
 * equivalent of the official SkeletonClipping.clipTriangles for a single
 * convex clip polygon. Extracted from `spine.ts` so the math is unit-testable
 * without a GL context.
 */

/**
 * Reorder a flat polygon (`[x0, y0, x1, y1, ...]`) to clockwise winding
 * (negative shoelace area) — the orientation the clip-side test in
 * {@link clipTriangleToPolygon} expects. Mirrors the official
 * SkeletonClipping.makeClockwise.
 */
export function makePolygonClockwise(poly: number[]): void {
  const n = poly.length
  if (n < 6) return
  let area = 0
  for (let i = 0; i < n; i += 2) {
    const j = i + 2 === n ? 0 : i + 2
    area += poly[i] * poly[j + 1] - poly[j] * poly[i + 1]
  }
  if (area < 0) return
  for (let i = 0, j = n - 2; i < j; i += 2, j -= 2) {
    const x = poly[i]
    const y = poly[i + 1]
    poly[i] = poly[j]
    poly[i + 1] = poly[j + 1]
    poly[j] = x
    poly[j + 1] = y
  }
}

// Scratch buffers — module-level so the per-frame hot loop allocates nothing
// (usage is synchronous).
let clipIn: number[] = []
let clipWork: number[] = []

/**
 * Clip one triangle against a convex, clockwise-wound polygon
 * (Sutherland–Hodgman). Output UVs are interpolated from the triangle's
 * corners via barycentric coordinates (same approach as the official clipper).
 *
 * @param out receives flat `[x, y, u, v, ...]` tuples (cleared first). Empty
 * when the triangle lies entirely outside the polygon.
 */
export function clipTriangleToPolygon(
  poly: number[],
  ax: number, ay: number, au: number, av: number,
  bx: number, by: number, bu: number, bv: number,
  cx: number, cy: number, cu: number, cv: number,
  out: number[]
): void {
  out.length = 0
  // A clip polygon needs at least 3 vertices — anything less is malformed
  // data; clip the triangle away entirely rather than rendering it unclipped.
  if (poly.length < 6) return
  clipIn.length = 0
  clipIn.push(ax, ay, bx, by, cx, cy)

  const n = poly.length
  for (let i = 0; i < n && clipIn.length >= 6; i += 2) {
    const ex = poly[i]
    const ey = poly[i + 1]
    const j = i + 2 === n ? 0 : i + 2
    const dx = poly[j] - ex
    const dy = poly[j + 1] - ey

    clipWork.length = 0
    const m = clipIn.length
    for (let p = 0; p < m; p += 2) {
      const qx = clipIn[p]
      const qy = clipIn[p + 1]
      const r = p + 2 === m ? 0 : p + 2
      const rx = clipIn[r]
      const ry = clipIn[r + 1]
      // Signed side of a point relative to the clip edge. A clockwise polygon
      // (negative shoelace area) keeps its interior on the non-positive side.
      const dq = dx * (qy - ey) - dy * (qx - ex)
      const dr = dx * (ry - ey) - dy * (rx - ex)
      if (dq <= 0) clipWork.push(qx, qy)
      if ((dq <= 0) !== (dr <= 0)) {
        // Segment crosses the edge — emit the intersection point.
        const den = dq - dr
        if (den > 1e-12 || den < -1e-12) {
          const t = dq / den
          clipWork.push(qx + (rx - qx) * t, qy + (ry - qy) * t)
        } else {
          clipWork.push(rx, ry)
        }
      }
    }
    const swap = clipIn
    clipIn = clipWork
    clipWork = swap
  }

  const m = clipIn.length
  if (m < 6) return // fewer than 3 points — fully clipped away

  // Barycentric UV interpolation over the triangle's corners.
  const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
  for (let p = 0; p < m; p += 2) {
    const x = clipIn[p]
    const y = clipIn[p + 1]
    if (den > 1e-12 || den < -1e-12) {
      const a = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den
      const b = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den
      const c = 1 - a - b
      out.push(x, y, au * a + bu * b + cu * c, av * a + bv * b + cv * c)
    } else {
      out.push(x, y, au, av)
    }
  }
}
