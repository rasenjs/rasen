/**
 * Shared input vocabulary.
 *
 * Every module in this package speaks the same two shapes: a 2D point, and a
 * timestamped pointer sample. Coordinates are CSS pixels in whatever space the
 * host adapter chose (element-local by default); time is a
 * `DOMHighResTimeStamp` in milliseconds.
 */

/** A 2D point / vector. Screen convention: +x right, +y down. */
export interface Vec2 {
  x: number
  y: number
}

/**
 * One pointer sample (finger, pen or mouse).
 *
 * `id` is stable for the lifetime of a physical contact, which is what lets a
 * multi-touch host hand every subsequent sample of a gesture to the control
 * that claimed it on `down`.
 */
export interface PointerSample {
  /** Pointer identifier, stable across down/move/up. */
  id: number
  x: number
  y: number
  /** Host timestamp in milliseconds. */
  time: number
  /**
   * Opaque tag carried through to the emitted gesture — e.g. the HUD control
   * that was hit. The recognizer never inspects it.
   */
  target?: unknown
}

/** Distance between two points. */
export function distance(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}

/** Angle of the vector `a → b` in radians (screen space). */
export function angleBetween(a: Vec2, b: Vec2): number {
  return Math.atan2(b.y - a.y, b.x - a.x)
}

/**
 * Smallest signed difference between two angles, in `(-π, π]`.
 *
 * Used for "is this target inside my facing cone" tests, where the naive
 * subtraction breaks across the ±π seam.
 */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d <= -Math.PI) d += Math.PI * 2
  return d
}

/** Clamp `v` into `[min, max]`. */
export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}
