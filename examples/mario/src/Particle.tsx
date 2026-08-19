/**
 * Particle — coin popup entity that arcs up and fades out (spawned by
 * bumping a `?` block).
 *
 * Self-contained class: owns its whole lifecycle. Its render component
 * `ParticleSprite` lives in this same module.
 */

import { com } from '@rasenjs/core'
import { ref } from '@rasenjs/reactive-signals'
import { TILE_IDX } from './sprites'
import { type World } from './world'

export class Particle {
  // Screen coordinates & sprite frame index (refs the renderer consumes)
  rx = ref(-1000)
  ry = ref(-1000)
  frame = ref(TILE_IDX.coin1) // fixed: the spinning coin frame
  opacity = ref(0)
  // Original sprite sheet consumed by the `sprite` component
  get sheet(): CanvasImageSource {
    return this.world.assets.tileBank.image
  }

  // World position and behaviour
  active = false
  wx = 0
  wy = 0
  vx = 0
  vy = 0
  life = 0
  maxLife = 1

  constructor(private world: World) {}

  /** Launch a coin popup from a world position. */
  spawn(x: number, y: number) {
    this.active = true
    this.wx = x
    this.wy = y
    this.vx = 0
    this.vy = -230
    this.life = 0.6
    this.maxLife = 0.6
  }

  deactivate() {
    this.active = false
  }

  update(dt: number) {
    if (!this.active) return
    this.vy += 620 * dt
    this.wx += this.vx * dt
    this.wy += this.vy * dt
    this.life -= dt
    if (this.life <= 0) this.active = false
  }

  /** Bake the camera offset into the screen-coordinate refs. */
  syncScreen(cam: number) {
    if (!this.active) {
      this.opacity.value = 0
      return
    }
    this.rx.value = Math.round(this.wx - cam)
    this.ry.value = Math.round(this.wy)
    this.opacity.value = Math.max(0, Math.min(1, this.life / this.maxLife))
  }
}

/**
 * ParticleSprite — render component for a coin popup (same module as the
 * entity). Draws the coin frame from the sheet via the `sprite` component.
 */
export const ParticleSprite = com((props: { particle: Particle }) => {
  const p = props.particle
  return (
    <sprite
      image={p.sheet}
      x={p.rx}
      y={p.ry}
      frame={p.frame}
      frameWidth={16}
      frameHeight={16}
      columns={16}
      opacity={p.opacity}
    />
  )
})
