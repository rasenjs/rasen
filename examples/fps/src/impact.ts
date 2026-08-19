/**
 * Impact — a short-lived hit effect spawned at a raycast collision point.
 *
 * Matches Godot's impact.tscn: an AnimatedSprite3D playing hit.png's 4-frame
 * "shot" animation (speed 30 → ~0.13s), then removed. Rendered as a camera-
 * facing billboard so it reads like the original sprite.
 */

import { ref } from '@rasenjs/reactive-signals'

export interface Impact {
  x: number
  y: number
  z: number
  /** Current animation frame canvas (hit.png 2×2 grid, 128px frames). */
  texture: { value: HTMLCanvasElement }
  /** False once the animation has finished → removed from the scene. */
  alive: { value: boolean }
  time: number
}

/** Total animation frames (hit.png is a 2×2 grid of 128px frames). */
export const IMPACT_FRAMES = 4
/** Animation speed (frames per second), matches Godot impact.tscn speed=30. */
export const IMPACT_SPEED = 30

export function createImpact(x: number, y: number, z: number, frames: HTMLCanvasElement[]): Impact {
  return { x, y, z, texture: ref(frames[0]), alive: ref(true), time: 0 }
}

/** Advance the impact animation; returns false when it should be removed. */
export function updateImpact(impact: Impact, dt: number, frames: HTMLCanvasElement[]): boolean {
  if (!impact.alive.value) return false
  impact.time += dt
  const frame = Math.floor(impact.time * IMPACT_SPEED)
  if (frame >= IMPACT_FRAMES) {
    impact.alive.value = false
    return false
  }
  impact.texture.value = frames[frame]
  return true
}