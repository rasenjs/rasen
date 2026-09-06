/**
 * Cubic Bézier curve utilities.
 *
 * These are pure math functions with no spine dependencies. They implement
 * the standard cubic Bézier evaluation used by Spine's animation curves and
 * path constraints, but are general-purpose enough for any 2D curve work.
 *
 * The curve is defined by 4 control points:
 *   P0 = (x1, y1)  — start
 *   P1 = (cx1, cy1) — control 1
 *   P2 = (cx2, cy2) — control 2
 *   P3 = (x2, y2)  — end
 */

/**
 * Evaluate a cubic Bézier curve at parameter `p` ∈ [0, 1].
 *
 * Returns `{ x, y }` on the curve.
 */
export function cubicBezier(
  p: number,
  x1: number, y1: number,
  cx1: number, cy1: number,
  cx2: number, cy2: number,
  x2: number, y2: number
): { x: number; y: number } {
  const tt = p * p, ttt = tt * p
  const u = 1 - p, uu = u * u, uuu = uu * u
  const uut3 = u * (u * p * 3)
  const utt3 = (u * p * 3) * p
  return {
    x: x1 * uuu + cx1 * uut3 + cx2 * utt3 + x2 * ttt,
    y: y1 * uuu + cy1 * uut3 + cy2 * utt3 + y2 * ttt,
  }
}

/**
 * Compute the tangent angle (in radians) at parameter `p` on a cubic Bézier.
 *
 * At `p ≈ 0`, the tangent is estimated from the first segment. The angle is
 * `atan2(dy, dx)` of the curve's derivative at `p`.
 */
export function cubicBezierTangent(
  p: number,
  x1: number, y1: number,
  cx1: number, cy1: number,
  cx2: number, cy2: number,
  x2: number, y2: number
): number {
  if (p < 1e-3) return Math.atan2(cy1 - y1, cx1 - x1)
  const u = 1 - p, uu = u * u, tt = p * p
  // Derivative: d/dp of cubic bezier = 3(1-t)²(P1-P0) + 6(1-t)t(P2-P1) + 3t²(P3-P2)
  const dxp = 3 * uu * (cx1 - x1) + 6 * u * p * (cx2 - cx1) + 3 * tt * (x2 - cx2)
  const dyp = 3 * uu * (cy1 - y1) + 6 * u * p * (cy2 - cy1) + 3 * tt * (y2 - cy2)
  return Math.atan2(dyp, dxp)
}

/**
 * Solve for the Bézier parameter `s` such that `cubicBezierX(s) ≈ f`.
 *
 * Uses bisection (20 iterations → ~1e-6 precision). This is the inverse of
 * the X-component of the cubic Bézier, used by Spine's animation system to
 * map a normalized time fraction to the actual curve parameter when the X-axis
 * represents time.
 *
 * The X-axis Bézier is: `x(s) = 3·(1-s)²·s·cx1 + 3·(1-s)·s²·cx2 + s³`
 * where cx1, cx2 are the normalized time handles.
 */
export function solveCubicBezierX(
  f: number,
  cx1: number,
  cx2: number
): number {
  let lo = 0, hi = 1, s = f
  for (let i = 0; i < 20; i++) {
    const oms = 1 - s
    const x = 3 * oms * oms * s * cx1 + 3 * oms * s * s * cx2 + s * s * s
    if (Math.abs(x - f) < 1e-6) break
    if (x < f) lo = s; else hi = s
    s = (lo + hi) / 2
  }
  return s
}

/**
 * Evaluate a Spine 1D animation curve at normalized time fraction `f`.
 *
 * The curve can be:
 * - `undefined` → linear interpolation between v0 and v1
 * - `'stepped'` → holds v0 (step function)
 * - `number[4]` → cubic Bézier with handles `[cx1, cy1, cx2, cy2]`
 *   where cx1/cx2 are time handles (absolute, normalized against [t0, t1])
 *   and cy1/cy2 are value handles (absolute).
 */
export function evalCurve1D(
  curve: unknown,
  f: number,
  v0: number,
  v1: number,
  t0: number,
  t1: number
): number {
  if (curve === undefined) return v0 + (v1 - v0) * f
  if (curve === 'stepped') return v0
  const c = curve as number[]
  if (c.length < 4) return v0 + (v1 - v0) * f
  const span = t1 - t0 || 1
  const ncx1 = (c[0] - t0) / span
  const ncx2 = (c[2] - t0) / span
  const s = solveCubicBezierX(f, ncx1, ncx2)
  const oms = 1 - s
  return oms * oms * oms * v0 + 3 * oms * oms * s * c[1] + 3 * oms * s * s * c[3] + s * s * s * v1
}
