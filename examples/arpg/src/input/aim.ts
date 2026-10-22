/**
 * Aiming — drag-to-aim and automatic target selection.
 *
 * Two halves of the same feature, both pure functions:
 *
 * - `computeAim` turns "I pressed here and my finger is now there" into an
 *   angle and a 0..1 power. Cast direction is therefore free-form (any angle),
 *   never quantised to a button's facing.
 * - `pickAutoTarget` answers "which monster did I mean?", preferring targets
 *   inside the facing cone and falling back to the nearest one in range.
 */

import { angleBetween, angleDelta, clamp, distance, type Vec2 } from './types'

export interface AimOptions {
  /** Offset (px) at which `power` saturates. Default `120`. */
  maxDistance?: number
  /** Offsets shorter than this (px) produce no direction yet. Default `12`. */
  minDistance?: number
}

export interface AimResult {
  /** True once the offset is long enough to carry a direction. */
  active: boolean
  /** Current pointer position. */
  x: number
  y: number
  /** Direction in radians (screen space). `0` when inactive. */
  angle: number
  /** Clamped, normalised offset length in `[0, 1]`. */
  power: number
}

export function computeAim(
  origin: Vec2,
  current: Vec2,
  options: AimOptions = {},
): AimResult {
  const maxDistance = options.maxDistance ?? 120
  const minDistance = options.minDistance ?? 12
  const dist = distance(origin, current)

  if (dist < minDistance) {
    return { active: false, x: current.x, y: current.y, angle: 0, power: 0 }
  }

  return {
    active: true,
    x: current.x,
    y: current.y,
    angle: angleBetween(origin, current),
    power: clamp(dist / maxDistance, 0, 1),
  }
}

/** Anything that can be aimed at. */
export interface TargetLike {
  x: number
  y: number
}

export interface AutoTargetOptions {
  /** Ignore targets further away than this (px). Default `Infinity`. */
  maxDistance?: number
  /** Preferred facing in radians. When set, targets in the cone are preferred. */
  facing?: number
  /** Half-angle of the facing cone in radians. Default `Math.PI / 3`. */
  facingTolerance?: number
  /** Filter, e.g. alive-only. */
  filter?: (target: TargetLike) => boolean
}

/**
 * Pick the target the player most plausibly meant.
 *
 * A target inside the facing cone always beats a nearer one outside it (that is
 * what makes "drag to aim at any angle, monsters are targeted automatically"
 * feel deliberate instead of random); ties inside the cone go to the closest.
 * With no cone, or nothing in it, the closest target in range wins.
 */
export function pickAutoTarget<T extends TargetLike>(
  origin: Vec2,
  targets: readonly T[],
  options: AutoTargetOptions = {},
): T | null {
  const maxDistance = options.maxDistance ?? Infinity
  const tolerance = options.facingTolerance ?? Math.PI / 3
  const filter = options.filter

  let nearest: T | null = null
  let nearestDistance = Infinity
  let inCone: T | null = null
  let inConeDeviation = Infinity

  for (const target of targets) {
    if (filter && !filter(target)) continue
    const dist = distance(origin, target)
    if (dist > maxDistance) continue

    if (dist < nearestDistance) {
      nearestDistance = dist
      nearest = target
    }

    if (options.facing !== undefined) {
      const deviation = Math.abs(
        angleDelta(options.facing, angleBetween(origin, target)),
      )
      if (deviation <= tolerance && deviation < inConeDeviation) {
        inConeDeviation = deviation
        inCone = target
      }
    }
  }

  return inCone ?? nearest
}
