/**
 * Common scalar math functions matching WGSL built-in conventions.
 *
 * These are the scalar equivalents of WGSL's built-in math functions that
 * operate on individual numbers rather than vectors/matrices. They complement
 * the vector/matrix classes in the rest of the math library.
 */

/** Clamp `v` to [lo, hi] (WGSL: `clamp(v, lo, hi)`). */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/** Linearly interpolate between `a` and `b` by `t` (WGSL: `mix(a, b, t)`). */
export function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Smooth Hermite interpolation between 0 and 1 when `e0 < x < e1`
 *  (WGSL: `smoothstep(e0, e1, x)`). */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Returns 0.0 if `x < edge`, else 1.0 (WGSL: `step(edge, x)`). */
export function step(edge: number, x: number): number {
  return x >= edge ? 1 : 0
}

/** Return the fractional part of `x` (WGSL: `fract(x)`). */
export function fract(x: number): number {
  return x - Math.floor(x)
}

/** Modulo operation matching WGSL `mod(x, y)` — result has the sign of `y`.
 *  Unlike JS `%`, `mod(-1, 3)` returns `2`, not `-1`. */
export function mod(x: number, y: number): number {
  return x - y * Math.floor(x / y)
}

/** Return the sign of `x`: -1, 0, or +1 (WGSL: `sign(x)`). */
export function sign(x: number): number {
  return x > 0 ? 1 : x < 0 ? -1 : 0
}

/** Convert degrees to radians. */
export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Convert radians to degrees. */
export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI
}
