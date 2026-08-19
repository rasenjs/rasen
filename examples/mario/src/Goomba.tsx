/**
 * Goomba — walking enemy entity.
 *
 * Self-contained class: owns its patrol behaviour (gravity, wall/ledge
 * turning), walk/death animation and the stomp outcome of colliding with the
 * player. Its render component `GoombaSprite` lives in this same module.
 */

import { com } from '@rasenjs/core'
import { ref } from '@rasenjs/reactive-signals'
import { GRAVITY, MAX_FALL, TILE, VIEW_H } from './constants'
import { SPRITE_FRAMES } from './sprites'
import { blankFrame, overlap, type World } from './world'
import type { Mario } from './Mario'

const WALK_SPEED = 48

// Frame indices on the 16px grid of sprites.png (16 columns, 16px frames)
const FRAME_WALK1 = 5 // [80, 0]
const FRAME_WALK2 = 6 // [96, 0]
const FRAME_FLAT = 7 // [112, 0]

export class Goomba {
  // Screen coordinates & sprite frame index (refs the renderer consumes)
  rx = ref(-1000)
  ry = ref(-1000)
  frame = ref(0)
  /** Cropped frame canvas (kept in sync; unused by the 2D view). */
  frameTex = ref<HTMLCanvasElement>(blankFrame)
  opacity = ref(0)
  // Original sprite sheet consumed by the `sprite` component
  get sheet(): CanvasImageSource {
    return this.world.assets.charBank.image
  }

  // World position, velocity and behaviour
  active = false
  wx = 0
  wy = 0
  vx = 0
  vy = 0
  w = 16
  h = 16
  dir: 1 | -1 = -1
  grounded = false
  dead = false
  deadTimer = 0
  walkTime = 0

  constructor(private world: World) {}

  /** Spawn at a tile position (world px). */
  spawn(tx: number, ty: number) {
    this.active = true
    this.wx = tx * TILE
    this.wy = ty * TILE
    this.vx = -WALK_SPEED
    this.vy = 0
    this.dir = -1
    this.grounded = false
    this.dead = false
    this.deadTimer = 0
    this.walkTime = 0
  }

  deactivate() {
    this.active = false
  }

  /** Cropped walk/death frames (matching the frame indices above). */
  private frames(): { w1: HTMLCanvasElement; w2: HTMLCanvasElement; flat: HTMLCanvasElement } {
    const cb = this.world.assets.charBank
    const f = SPRITE_FRAMES
    return {
      w1: cb.frame(f.goombaWalk1.x, f.goombaWalk1.y, f.goombaWalk1.w, f.goombaWalk1.h, 'goombaWalk1'),
      w2: cb.frame(f.goombaWalk2.x, f.goombaWalk2.y, f.goombaWalk2.w, f.goombaWalk2.h, 'goombaWalk2'),
      flat: cb.frame(f.goombaFlat.x, f.goombaFlat.y, f.goombaFlat.w, f.goombaFlat.h, 'goombaFlat'),
    }
  }

  /** Patrol behaviour: gravity, movement, wall/ledge turning, animation. */
  update(dt: number) {
    if (!this.active) return
    if (this.dead) {
      this.deadTimer += dt
      if (this.deadTimer > 0.5) this.active = false
      this.frame.value = FRAME_FLAT
      this.frameTex.value = this.frames().flat
      return
    }

    this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL)
    this.wx += this.vx * dt
    if (this.world.collideX(this)) this.vx = -this.vx
    // turn around before walking off an edge
    if (this.grounded && !this.world.groundAhead(this)) this.vx = -this.vx
    this.wy += this.vy * dt
    this.grounded = false
    this.world.collideY(this)
    this.walkTime += dt
    if (this.wy > VIEW_H + 100) this.active = false

    const walking = Math.floor(this.walkTime / 0.15) % 2 === 0
    this.frame.value = walking ? FRAME_WALK1 : FRAME_WALK2
    const frames = this.frames()
    this.frameTex.value = walking ? frames.w1 : frames.w2
  }

  /**
   * Decide the outcome of colliding with the player.
   * @returns 'stomped' if the player stomped this goomba, 'killed-player'
   *          otherwise, or null when not touching.
   */
  onPlayerCollision(player: Mario): 'stomped' | 'killed-player' | null {
    if (!this.active || this.dead) return null
    if (!overlap(this, player)) return null
    const falling = player.vy > 0
    const feetAbove = player.wy + player.h - this.wy < 12
    if (falling && feetAbove) {
      this.dead = true
      this.vx = 0
      return 'stomped'
    }
    return 'killed-player'
  }

  /** Bake the camera offset into the screen-coordinate refs. */
  syncScreen(cam: number) {
    if (!this.active) {
      this.opacity.value = 0
      return
    }
    this.rx.value = Math.round(this.wx - cam)
    this.ry.value = Math.round(this.wy)
    this.opacity.value = this.dead ? Math.max(0, 1 - this.deadTimer * 2.2) : 1
  }
}

/**
 * GoombaSprite — render component for a goomba (same module as the entity).
 * Draws a 16x16 frame from the sheet via the `sprite` component.
 */
export const GoombaSprite = com((props: { goomba: Goomba }) => {
  const g = props.goomba
  return (
    <sprite
      image={g.sheet}
      x={g.rx}
      y={g.ry}
      frame={g.frame}
      frameWidth={16}
      frameHeight={16}
      columns={16}
      opacity={g.opacity}
    />
  )
})
