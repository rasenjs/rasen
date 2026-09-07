/**
 * Goomba — walking enemy entity.
 *
 * Self-contained class: owns its patrol behaviour (gravity, wall/ledge
 * turning), walk/death animations (stomped flat, or flipped by a shell) and
 * the stomp outcome of colliding with the player. Its render component
 * `GoombaSprite` lives in this same module.
 */

import { com } from '@rasenjs/core'
import { ref } from '@rasenjs/reactive-signals'
import { ENEMY_SPEED, GRAVITY, MAX_FALL, VIEW_H } from './constants'
import { SPRITE_FRAMES } from './sprites'
import { blankFrame, overlap, type World } from './world'
import type { Mario } from './Mario'

type DeathKind = 'flat' | 'flip'

export class Goomba {
  // Screen coordinates & sprite frame (refs the renderer consumes)
  rx = ref(-1000)
  ry = ref(-1000)
  frame = ref<HTMLCanvasElement>(blankFrame)
  opacity = ref(0)
  scaleY = ref<number>(1)

  // World position, velocity and behaviour
  active = false
  spawned = false
  wx = 0
  wy = 0
  vx = 0
  vy = 0
  w = 15
  h = 15
  dir: 1 | -1 = -1
  grounded = false
  dead = false
  deathKind: DeathKind = 'flat'
  deadTimer = 0
  walkTime = 0

  constructor(private world: World) {}

  /** Spawn from level data (pixel position). Waits for the camera to approach. */
  spawn(x: number, y: number) {
    this.active = false
    this.spawned = true
    this.wx = x
    this.wy = y
    this.vx = -ENEMY_SPEED
    this.vy = 0
    this.dir = -1
    this.grounded = false
    this.dead = false
    this.deathKind = 'flat'
    this.deadTimer = 0
    this.walkTime = 0
  }

  /** Begin patrolling (called once the camera is close). */
  activate() {
    this.active = true
  }

  deactivate() {
    this.active = false
    this.spawned = false
  }

  private frames(): { w1: HTMLCanvasElement; w2: HTMLCanvasElement; flat: HTMLCanvasElement } {
    const cb = this.world.assets.charBank
    const f = SPRITE_FRAMES
    const blue = this.blue
    return {
      w1: cb.frame(
        (blue ? f.goombaBlueWalk1 : f.goombaWalk1).x,
        (blue ? f.goombaBlueWalk1 : f.goombaWalk1).y,
        16,
        16,
        blue ? 'goombaBlueWalk1' : 'goombaWalk1',
      ),
      w2: cb.frame(
        (blue ? f.goombaBlueWalk2 : f.goombaWalk2).x,
        (blue ? f.goombaBlueWalk2 : f.goombaWalk2).y,
        16,
        16,
        blue ? 'goombaBlueWalk2' : 'goombaWalk2',
      ),
      flat: cb.frame(
        (blue ? f.goombaBlueFlat : f.goombaFlat).x,
        (blue ? f.goombaBlueFlat : f.goombaFlat).y,
        16,
        16,
        blue ? 'goombaBlueFlat' : 'goombaFlat',
      ),
    }
  }

  /** palette flag, injected by the game on spawn */
  blue = false

  /** Patrol behaviour: gravity, movement, wall/ledge turning, animation. */
  update(dt: number) {
    if (!this.active) return
    if (this.dead) {
      this.deadTimer += dt
      if (this.deathKind === 'flat' && this.deadTimer > 0.5) this.active = false
      if (this.deathKind === 'flip' && this.wy > VIEW_H + 60) this.active = false
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
  }

  /** Current frame canvas (walk animation / death). */
  currentFrame(): HTMLCanvasElement {
    const f = this.frames()
    if (this.dead) return this.deathKind === 'flat' ? f.flat : f.w1
    return Math.floor(this.walkTime / 0.15) % 2 === 0 ? f.w1 : f.w2
  }

  /**
   * Decide the outcome of colliding with the player.
   * @returns 'stomped' | 'killed-player' | null
   */
  onPlayerCollision(player: Mario): 'stomped' | 'killed-player' | null {
    if (!this.active || this.dead) return null
    if (!overlap(this, player)) return null
    const falling = player.vy > 0
    const feetAbove = player.wy + player.h - this.wy < 12
    if (falling && feetAbove) {
      this.dead = true
      this.deathKind = 'flat'
      this.vx = 0
      return 'stomped'
    }
    return 'killed-player'
  }

  /** A moving shell hit this goomba — flip and fall off the screen. */
  flipKill() {
    if (this.dead) return
    this.dead = true
    this.deathKind = 'flip'
    this.vy = -220
    this.vx = 0
  }

  /** Bake the camera offset into the screen-coordinate refs. */
  syncScreen(cam: number) {
    if (!this.active) {
      this.opacity.value = 0
      return
    }
    const canvas = this.currentFrame()
    this.rx.value = Math.round(this.wx - (canvas.width - this.w) / 2 - cam)
    if (this.dead && this.deathKind === 'flat') {
      // flat art occupies the BOTTOM half of the 16px frame — align frame
      // bottom with the goomba's feet so the squash sits on the ground
      this.ry.value = Math.round(this.wy + this.h - canvas.height)
      this.scaleY.value = 1
    } else if (this.dead && this.deathKind === 'flip') {
      this.ry.value = Math.round(this.wy + this.h)
      this.scaleY.value = -1
    } else {
      this.ry.value = Math.round(this.wy + this.h - canvas.height)
      this.scaleY.value = 1
    }
    this.opacity.value = 1
    this.frame.value = canvas
  }
}

/**
 * GoombaSprite — render component for a goomba (same module as the entity).
 */
export const GoombaSprite = com((props: { goomba: Goomba }) => {
  const g = props.goomba
  return (
    <image
      image={g.frame}
      x={g.rx}
      y={g.ry}
      scaleY={g.scaleY}
      opacity={g.opacity}
    />
  )
})
