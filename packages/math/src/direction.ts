/**
 * Direction vectors for yaw/pitch camera conventions.
 *
 * Convention (right-handed, matches the rest of Rasen):
 *   yaw = 0, pitch = 0  →  looking down -Z
 *   yaw increases       →  turning counter-clockwise (to the right on screen)
 */

import { vec3f, type Vec3f } from './vec3'

/**
 * Unit forward vector for a yaw/pitch pair.
 *
 * @example
 * ```ts
 * const dir = forwardVector(yaw.value, pitch.value)
 * // move forward: pos += dir * speed
 * ```
 */
export function forwardVector(yaw: number, pitch: number): Vec3f {
  const cp = Math.cos(pitch)
  return vec3f(cp * Math.sin(yaw), Math.sin(pitch), -cp * Math.cos(yaw))
}

/**
 * Unit right vector (perpendicular to forward, flat on the XZ plane).
 * Useful for strafing.
 */
export function rightVector(yaw: number): Vec3f {
  return vec3f(Math.cos(yaw), 0, Math.sin(yaw))
}
