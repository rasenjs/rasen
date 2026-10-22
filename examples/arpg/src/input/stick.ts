/**
 * Virtual stick — a pure state machine for an on-screen thumbstick.
 *
 * The stick is *floating*: it takes its centre where the finger lands, and the
 * knob travels from there. Nothing is drawn here; the game reads `value` /
 * `magnitude` / `angle` and renders whatever it likes.
 *
 * `value` is a live object mutated in place — read it every frame instead of
 * copying it, and do not keep a stale reference expecting it to freeze.
 *
 * With `diagonals: true` the direction snaps to the 8 compass directions when
 * the finger is within `diagonalTolerance` degrees of one. That is what turns
 * "walking a narrow diagonal corridor" from a fight with the thumb into a
 * single deliberate push.
 */

import { angleDelta, clamp, type PointerSample, type Vec2 } from './types'

export interface VirtualStickOptions {
  /** Travel (px) at which the value saturates. Default `64`. */
  radius?: number
  /** Fraction of `radius` that reads as no input (0..1). Default `0.12`. */
  deadZone?: number
  /** Snap the direction to the 8 compass directions when close to one. Default `false`. */
  diagonals?: boolean
  /** Tolerance (degrees) around a compass direction for snapping. Default `24`. */
  diagonalTolerance?: number
  /**
   * Milliseconds for the value to fall back to zero after release.
   * `0` (default) snaps to zero instantly.
   */
  releaseDecay?: number
}

export interface VirtualStick {
  readonly active: boolean
  /** Pointer id currently driving the stick, or `null`. */
  readonly pointerId: number | null
  /** Centre of the stick (where the finger landed). */
  readonly origin: Vec2
  /** Normalised direction times magnitude; each axis in `[-1, 1]`. Live object. */
  readonly value: Vec2
  /** Normalised magnitude in `[0, 1]`. */
  readonly magnitude: number
  /** Direction in radians (screen space: +x right, +y down). `0` when idle. */
  readonly angle: number
  /**
   * Claim the stick with this contact. Returns `false` when another contact
   * already owns it, so the caller can route the touch elsewhere.
   */
  begin(sample: PointerSample): boolean
  /** Update from a sample of the owning contact. Ignored for other ids. */
  move(sample: PointerSample): void
  /** Release the stick if `id` owns it. */
  end(id: number): void
  /** Advance the release decay. `dt` in milliseconds. */
  tick(dt: number): void
}

const DEFAULTS = {
  radius: 64,
  deadZone: 0.12,
  diagonalTolerance: 24,
} as const

const COMPASS_STEP = Math.PI / 4

export function createVirtualStick(
  options: VirtualStickOptions = {},
): VirtualStick {
  const radius = options.radius ?? DEFAULTS.radius
  const deadZone = clamp(options.deadZone ?? DEFAULTS.deadZone, 0, 1)
  const diagonals = options.diagonals ?? false
  const tolerance =
    ((options.diagonalTolerance ?? DEFAULTS.diagonalTolerance) * Math.PI) / 180
  const releaseDecay = Math.max(0, options.releaseDecay ?? 0)

  const origin: Vec2 = { x: 0, y: 0 }
  const value: Vec2 = { x: 0, y: 0 }
  let magnitude = 0
  let angle = 0
  let active = false
  let pointerId: number | null = null

  const setZero = (): void => {
    value.x = 0
    value.y = 0
    magnitude = 0
    angle = 0
  }

  return {
    get active() {
      return active
    },
    get pointerId() {
      return pointerId
    },
    get origin() {
      return origin
    },
    get value() {
      return value
    },
    get magnitude() {
      return magnitude
    },
    get angle() {
      return angle
    },

    begin(sample) {
      if (active) return false
      active = true
      pointerId = sample.id
      origin.x = sample.x
      origin.y = sample.y
      setZero()
      return true
    },

    move(sample) {
      if (sample.id !== pointerId) return

      const dx = sample.x - origin.x
      const dy = sample.y - origin.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist <= deadZone * radius) {
        setZero()
        return
      }

      let a = Math.atan2(dy, dx)
      const mag = clamp(dist / radius, 0, 1)

      if (diagonals) {
        const snapped = Math.round(a / COMPASS_STEP) * COMPASS_STEP
        if (Math.abs(angleDelta(snapped, a)) <= tolerance) a = snapped
      }

      angle = a
      magnitude = mag
      value.x = Math.cos(a) * mag
      value.y = Math.sin(a) * mag
    },

    end(id) {
      if (id !== pointerId) return
      active = false
      pointerId = null
      if (releaseDecay <= 0) setZero()
    },

    tick(dt) {
      if (active || releaseDecay <= 0 || magnitude <= 0) return
      const factor = 1 - clamp(dt / releaseDecay, 0, 1)
      magnitude *= factor
      if (magnitude < 0.001) {
        setZero()
        return
      }
      value.x = Math.cos(angle) * magnitude
      value.y = Math.sin(angle) * magnitude
    },
  }
}
