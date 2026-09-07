/**
 * Mario — the player entity.
 *
 * One self-contained class per game object: owns its world position, velocity,
 * power state (small / large), facing, animation timing and physics. Its
 * render component `MarioSprite` lives in this same module and reads the
 * entity's reactive refs.
 *
 * Frames come from the Meth Meth Method sprite table: small Mario (16x16) at
 * y=88, large Mario (16x32) at y=88 / crouch at y=120 — addressed via
 * pre-cropped frame canvases (`image` component) because they don't sit on
 * the 16px grid.
 */

import { com } from '@rasenjs/core'
import { unref } from '@rasenjs/core'
import { ref } from '@rasenjs/reactive-signals'
import { sfx } from './audio'
import {
  ACCEL,
  FRICTION,
  GRAVITY,
  GRAVITY_HOLD,
  JUMP_VEL,
  JUMP_VEL_RUN,
  MAX_FALL,
  RUN_SPEED,
  SKID_DECEL,
  WALK_SPEED,
} from './constants'
import { SPRITE_FRAMES } from './sprites'
import { blankFrame, type World } from './world'

export type MarioState = 'normal' | 'pole' | 'clear' | 'dead'

export class Mario {
  // Screen coordinates & sprite frame (refs the renderer consumes)
  rx = ref(-1000)
  ry = ref(-1000)
  frame = ref<HTMLCanvasElement>(blankFrame)
  opacity = ref(1)
  scaleX = ref<number>(1)

  // World position, velocity and behaviour
  wx = 0
  wy = 0
  vx = 0
  vy = 0
  w = 15
  h = 16
  dir: 1 | -1 = 1
  grounded = false
  walkTime = 0

  /** 0 = small, 1 = large */
  power = 0
  state: MarioState = 'normal'
  crouching = false
  /** invulnerability timer after shrinking (seconds) */
  invincible = 0
  /** grow/shrink animation freeze timer (game pauses movement) */
  freeze = 0
  jumpHeld = false

  private frames: Record<string, HTMLCanvasElement> = {}

  constructor(private world: World) {
    const cb = this.world.assets.charBank
    const f = SPRITE_FRAMES
    const F = (k: keyof typeof f) => cb.frame(f[k].x, f[k].y, f[k].w, f[k].h, k)
    this.frames = {
      idle: F('marioIdle'),
      run1: F('marioRun1'),
      run2: F('marioRun2'),
      run3: F('marioRun3'),
      skid: F('marioSkid'),
      jump: F('marioJump'),
      die: F('marioDie'),
      climb1: F('marioClimb1'),
      climb2: F('marioClimb2'),
      largeIdle: F('marioLargeIdle'),
      largeRun1: F('marioLargeRun1'),
      largeRun2: F('marioLargeRun2'),
      largeRun3: F('marioLargeRun3'),
      largeSkid: F('marioLargeSkid'),
      largeJump: F('marioLargeJump'),
      largeCrouch: F('marioLargeCrouch'),
    }
  }

  /** Reset to a spawn position (world px). */
  reset(x: number, y: number) {
    this.wx = x
    this.wy = y
    this.vx = 0
    this.vy = 0
    this.dir = 1
    this.grounded = false
    this.state = 'normal'
    this.crouching = false
    this.invincible = 0
    this.freeze = 0
    this.walkTime = 0
    this.syncSize()
  }

  private syncSize() {
    if (this.power >= 1) {
      this.h = this.crouching ? 18 : 31
    } else {
      this.h = 16
      this.crouching = false
    }
  }

  /** Grow to large (mushroom). Freezes movement for the transform anim. */
  grow() {
    if (this.power >= 1) {
      // Already large — a mushroom is just points
      this.world.addScore(1000)
      return
    }
    this.power = 1
    this.crouching = false
    this.freeze = 0.8
    this.syncSize()
    this.wy -= 31 - 16
  }

  /** Shrink to small (enemy hit while large). Returns false when small. */
  shrink(): boolean {
    if (this.power < 1) return false
    this.power = 0
    this.crouching = false
    this.freeze = 0.8
    this.invincible = 2
    this.syncSize()
    this.wy += 31 - 16 // keep feet planted
    return true
  }

  /** Kill the player (start of the death animation). */
  kill() {
    this.state = 'dead'
    this.vx = 0
    this.vy = -380
    this.grounded = false
  }

  /** Start the flag-pole slide (snaps onto the pole). */
  startPoleSlide(tx: number) {
    if (this.state !== 'normal') return
    this.state = 'pole'
    this.wx = tx * 16 + 8 - this.w / 2
    this.vy = 0
    this.vx = 0
    sfx.flagpole()
  }

  /** Walk from the pole into the castle. */
  startClearWalk() {
    this.state = 'clear'
    this.dir = 1
  }

  /** Regular gameplay update — input, movement, gravity, tile collision. */
  update(dt: number) {
    const input = this.world.input

    // Grow/shrink transform freeze (game pauses movement)
    if (this.freeze > 0) {
      this.freeze -= dt
      return
    }
    if (this.invincible > 0) this.invincible -= dt

    // Horizontal input with acceleration / friction / skid
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0)
    const maxSpeed = input.run ? RUN_SPEED : WALK_SPEED
    this.crouching = this.power >= 1 && input.down && this.grounded
    this.syncSize()

    if (dir !== 0 && !(this.crouching && this.grounded)) {
      const turning = dir * this.vx < 0
      const accel = turning ? SKID_DECEL : ACCEL
      this.dir = dir as 1 | -1
      this.vx += dir * accel * dt
      if (Math.abs(this.vx) > maxSpeed) {
        this.vx = maxSpeed * Math.sign(this.vx)
      }
    } else {
      const friction = FRICTION * dt
      if (this.vx > friction) this.vx -= friction
      else if (this.vx < -friction) this.vx += friction
      else this.vx = 0
    }

    // Jump — variable height: lower gravity while held & rising
    if (this.grounded && input.consumeJump()) {
      this.vy = Math.abs(this.vx) > WALK_SPEED + 10 ? JUMP_VEL_RUN : JUMP_VEL
      this.grounded = false
      this.jumpHeld = true
      sfx.jump()
    }
    if (!input.jump) this.jumpHeld = false
    const gravity = this.jumpHeld && this.vy < 0 ? GRAVITY_HOLD : GRAVITY

    this.vy = Math.min(this.vy + gravity * dt, MAX_FALL)
    this.wx += this.vx * dt
    this.world.collideX(this)
    this.wy += this.vy * dt
    const head = this.world.collideY(this)
    if (head) {
      this.vy = 0
      this.world.bumpAt(head.tx, head.ty, this.power >= 1)
    }
    this.grounded = this.vy >= 0 && this.grounded

    // Lava is instant death
    if (this.world.lavaOverlap(this)) {
      this.world.killPlayer()
      return
    }

    // Animation clock: seconds scaled by speed (faster run → faster cycle)
    this.walkTime += dt * (Math.abs(this.vx) / WALK_SPEED)
  }

  /** Flag-pole / castle-walk update (no input). */
  updateSequence(dt: number) {
    if (this.state === 'pole') {
      this.vy = Math.min(this.vy + GRAVITY * dt, 130)
      this.wy += this.vy * dt
      const flag = this.world.flagPole()
      const bottom = flag ? flag.baseY * 16 - this.h : this.wy
      if (this.wy >= bottom) {
        this.wy = bottom
        this.startClearWalk()
      }
    } else if (this.state === 'clear') {
      this.vx = 80
      this.wx += this.vx * dt
      this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL)
      this.wy += this.vy * dt
      this.grounded = false
      this.world.collideY(this)
      this.walkTime += dt * (this.vx / WALK_SPEED)
    }
  }

  /** Death animation — no collision, classic leap. */
  updateDeath(dt: number) {
    this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL)
    this.wy += this.vy * dt
  }

  /** Current sprite frame canvas + vertical draw offset (frame bottom to feet). */
  currentFrame(): { canvas: HTMLCanvasElement; offset: number } {
    const F = this.frames
    // During grow/shrink freeze, flicker between small & large (anchored at feet)
    const flicker = this.freeze > 0 && Math.floor(this.freeze * 8) % 2 === 0
    const large = flicker ? this.power < 1 : this.power >= 1

    if (this.state === 'dead') return { canvas: F.die, offset: 0 }

    if (this.state === 'pole') {
      const f = Math.floor(this.walkTime / 0.15) % 2 === 0 ? F.climb1 : F.climb2
      return { canvas: f, offset: this.h - 16 }
    }

    if (large) {
      if (this.crouching) return { canvas: F.largeCrouch, offset: this.h - 32 }
      if (!this.grounded) return { canvas: F.largeJump, offset: this.h - 32 }
      const turning = this.dir * this.vx < -5
      if (turning) return { canvas: F.largeSkid, offset: this.h - 32 }
      if (Math.abs(this.vx) > 5) {
        const cycle = Math.floor(this.walkTime / 0.12) % 3
        return {
          canvas: [F.largeRun1, F.largeRun2, F.largeRun3][cycle],
          offset: this.h - 32,
        }
      }
      return { canvas: F.largeIdle, offset: this.h - 32 }
    }

    // Small frames are 16 tall — anchor at the feet even while the hitbox is
    // still large (grow/shrink flicker)
    const smallOffset = this.h - 16
    if (!this.grounded) return { canvas: F.jump, offset: smallOffset }
    const turning = this.dir * this.vx < -5
    if (turning) return { canvas: F.skid, offset: smallOffset }
    if (Math.abs(this.vx) > 5) {
      const cycle = Math.floor(this.walkTime / 0.12) % 3
      return { canvas: [F.run1, F.run2, F.run3][cycle], offset: smallOffset }
    }
    return { canvas: F.idle, offset: smallOffset }
  }

  /** Bake the camera offset into the screen-coordinate refs. */
  syncScreen(cam: number) {
    const { canvas, offset } = this.currentFrame()
    this.rx.value = Math.round(this.wx - (canvas.width - this.w) / 2 - cam)
    this.ry.value = Math.round(this.wy + offset)
    this.scaleX.value = this.dir
    // Blink while invincible
    this.opacity.value =
      this.invincible > 0 && Math.floor(this.invincible * 12) % 2 === 0
        ? 0.35
        : 1
    this.frame.value = canvas
  }
}

/**
 * MarioSprite — render component for the player (same module as the entity).
 * Reads Mario's reactive refs; flipped via the `scaleX` ref.
 */
export const MarioSprite = com((props: { mario: Mario }) => {
  // props.mario may be a getter (the compiler wraps member-expression JSX
  // props for reactivity) — unwrap it before reading.
  const m = unref(props.mario)
  return (
    <image
      image={() => m.frame.value}
      x={() => m.rx.value}
      y={() => m.ry.value}
      scaleX={() => m.scaleX.value}
      opacity={() => m.opacity.value}
    />
  )
})
