/**
 * Mario — the player entity.
 *
 * One self-contained class per game object: owns its world position, velocity,
 * facing direction, animation timing and physics behaviour. Its render
 * component `MarioSprite` lives in this same module and reads the entity's
 * reactive refs.
 *
 * Note: Mario uses `image` (pre-cropped frames) instead of the `sprite`
 * component because his frames sit at y=88 in sprites.png — not on the 16px
 * grid — so `sprite`'s grid-based cropping can't address them.
 */

import { com } from '@rasenjs/core'
import { ref } from '@rasenjs/reactive-signals'
import { sfx } from './audio'
import {
  ACCEL,
  FRICTION,
  GRAVITY,
  JUMP_VEL,
  MAX_FALL,
  RUN_SPEED,
  START_X,
  START_Y,
} from './constants'
import { SPRITE_FRAMES } from './sprites'
import { blankFrame, type World } from './world'

export class Mario {
  // Screen coordinates & sprite frame (refs the renderer consumes)
  rx = ref(-1000)
  ry = ref(-1000)
  frame = ref<HTMLCanvasElement>(blankFrame)
  opacity = ref(1)
  scaleX = ref<number>(1)

  // World position, velocity and behaviour
  wx = START_X
  wy = START_Y
  vx = 0
  vy = 0
  w = 15
  h = 16
  dir: 1 | -1 = 1
  grounded = false
  dead = false
  walkTime = 0

  private jumpQueued = 0
  private frames: Record<string, HTMLCanvasElement> = {}

  constructor(private world: World) {
    const cb = this.world.assets.charBank
    const f = SPRITE_FRAMES
    this.frames = {
      idle: cb.frame(f.marioIdle.x, f.marioIdle.y, f.marioIdle.w, f.marioIdle.h, 'marioIdle'),
      run1: cb.frame(f.marioRun1.x, f.marioRun1.y, f.marioRun1.w, f.marioRun1.h, 'marioRun1'),
      run2: cb.frame(f.marioRun2.x, f.marioRun2.y, f.marioRun2.w, f.marioRun2.h, 'marioRun2'),
      run3: cb.frame(f.marioRun3.x, f.marioRun3.y, f.marioRun3.w, f.marioRun3.h, 'marioRun3'),
      break: cb.frame(f.marioBreak.x, f.marioBreak.y, f.marioBreak.w, f.marioBreak.h, 'marioBreak'),
      jump: cb.frame(f.marioJump.x, f.marioJump.y, f.marioJump.w, f.marioJump.h, 'marioJump'),
      die: cb.frame(f.marioDie.x, f.marioDie.y, f.marioDie.w, f.marioDie.h, 'marioDie'),
    }
  }

  /** Reset to the level start position. */
  reset() {
    this.wx = START_X
    this.wy = START_Y
    this.vx = 0
    this.vy = 0
    this.dir = 1
    this.grounded = false
    this.dead = false
    this.walkTime = 0
    this.jumpQueued = 0
  }

  /** Kill the player (start of the death animation). */
  kill() {
    this.dead = true
    this.vx = 0
    this.vy = -390
    this.grounded = false
  }

  /** Regular gameplay update — input, movement, gravity, tile collision. */
  update(dt: number) {
    const input = this.world.input

    // Horizontal input with acceleration / friction
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0)
    if (dir !== 0) {
      this.dir = dir as 1 | -1
      this.vx += dir * ACCEL * dt
      this.vx = Math.max(-RUN_SPEED, Math.min(RUN_SPEED, this.vx))
    } else {
      const friction = FRICTION * dt
      if (this.vx > friction) this.vx -= friction
      else if (this.vx < -friction) this.vx += friction
      else this.vx = 0
    }

    // Jump (input buffered so presses near landing aren't lost)
    if (input.consumeJump()) this.jumpQueued = 7
    if (this.jumpQueued > 0 && this.grounded) {
      this.jumpQueued = 0
      this.vy = JUMP_VEL
      this.grounded = false
      sfx.jump()
    }
    if (this.jumpQueued > 0) this.jumpQueued--

    // Gravity + integrate + tile collision
    this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL)
    this.wx += this.vx * dt
    this.world.collideX(this)
    this.wy += this.vy * dt
    this.grounded = false
    const bumped = this.world.collideY(this)
    if (bumped) this.world.bumpAt(bumped.tx, bumped.ty)

    // Walk animation clock
    if (Math.abs(this.vx) > 10) this.walkTime += dt

    this.frame.value = this.selectFrame()
  }

  /** Death animation update — pops up then falls back down. */
  updateDeath(dt: number) {
    this.vy += GRAVITY * 0.45 * dt
    this.wy += this.vy * dt
    this.frame.value = this.frames.die
  }

  /** Small upward bounce after stomping an enemy. */
  bounce() {
    this.vy = -260
    this.grounded = false
  }

  private selectFrame(): HTMLCanvasElement {
    if (this.dead) return this.frames.die
    if (!this.grounded) return this.frames.jump
    const speed = Math.abs(this.vx)
    if (speed < 4) return this.frames.idle
    // skidding — moving against the facing direction
    if (Math.sign(this.vx) !== this.dir && speed > 40) return this.frames.break
    const cycle = Math.floor(this.walkTime / 0.12) % 3
    return [this.frames.run1, this.frames.run2, this.frames.run3][cycle]
  }

  /** Bake the camera offset into the screen-coordinate refs. */
  syncScreen(cam: number) {
    this.rx.value = Math.round(this.wx - cam)
    this.ry.value = Math.round(this.wy)
    this.scaleX.value = this.dir
    this.opacity.value = 1
  }
}

/**
 * MarioSprite — render component for the player (same module as the entity).
 * Reads Mario's reactive refs; flipped via the `scaleX` ref.
 */
export const MarioSprite = com((props: { mario: Mario }) => {
  const m = props.mario
  return (
    <image image={m.frame} x={m.rx} y={m.ry} scaleX={m.scaleX} opacity={m.opacity} />
  )
})
