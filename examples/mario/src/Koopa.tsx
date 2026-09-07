/**
 * Koopa — turtle enemy with the classic shell mechanic.
 *
 * Walks like a goomba; stomped once it retreats into its shell. A stationary
 * shell can be kicked (runs fast, kills other enemies, bounces off walls) and
 * becomes dangerous to the player again. After a while it wakes up. Its
 * render component `KoopaSprite` lives in this same module.
 */

import { com } from '@rasenjs/core'
import { ref } from '@rasenjs/reactive-signals'
import { ENEMY_SPEED, GRAVITY, MAX_FALL, SHELL_SPEED, VIEW_H } from './constants'
import { SPRITE_FRAMES } from './sprites'
import { blankFrame, overlap, type World } from './world'
import type { Mario } from './Mario'

type KoopaState = 'walk' | 'shell' | 'shell-moving'

const WAKE_AFTER = 7 // seconds in shell before waking
const WAKE_DURATION = 1 // waking animation duration

export class Koopa {
  // Screen coordinates & sprite frame (refs the renderer consumes)
  rx = ref(-1000)
  ry = ref(-1000)
  frame = ref<HTMLCanvasElement>(blankFrame)
  opacity = ref(0)
  scaleX = ref<number>(1)
  scaleY = ref<number>(1)

  // World position, velocity and behaviour
  active = false
  spawned = false
  wx = 0
  wy = 0
  vx = 0
  vy = 0
  w = 14
  h = 22
  dir: 1 | -1 = -1
  grounded = false
  state: KoopaState = 'walk'
  dead = false
  deadTimer = 0
  walkTime = 0
  shellTime = 0
  waking = false

  /** palette flag ('green' | 'blue'), injected by the game on spawn */
  palette: 'green' | 'blue' = 'green'

  constructor(private world: World) {}

  /** Spawn from level data (pixel position). Waits for the camera to approach. */
  spawn(x: number, y: number, palette: 'green' | 'blue') {
    this.active = false
    this.spawned = true
    this.palette = palette
    this.wx = x
    this.wy = y
    this.vx = -ENEMY_SPEED
    this.vy = 0
    this.dir = -1
    this.grounded = false
    this.state = 'walk'
    this.dead = false
    this.deadTimer = 0
    this.walkTime = 0
    this.shellTime = 0
    this.waking = false
  }

  /** Begin patrolling (called once the camera is close). */
  activate() {
    this.active = true
  }

  deactivate() {
    this.active = false
    this.spawned = false
  }

  private f(key: 'Walk1' | 'Walk2' | 'Shell' | 'ShellLegs'): HTMLCanvasElement {
    const cb = this.world.assets.charBank
    const map = {
      greenWalk1: SPRITE_FRAMES.koopaGreenWalk1,
      greenWalk2: SPRITE_FRAMES.koopaGreenWalk2,
      greenShell: SPRITE_FRAMES.koopaGreenShell,
      greenShellLegs: SPRITE_FRAMES.koopaGreenShellLegs,
      blueWalk1: SPRITE_FRAMES.koopaBlueWalk1,
      blueWalk2: SPRITE_FRAMES.koopaBlueWalk2,
      blueShell: SPRITE_FRAMES.koopaBlueShell,
      blueShellLegs: SPRITE_FRAMES.koopaBlueShellLegs,
    } as const
    const r = map[`${this.palette}${key}` as keyof typeof map]
    return cb.frame(r.x, r.y, r.w, r.h, `koopa-${this.palette}-${key}`)
  }

  get shell(): boolean {
    return this.state !== 'walk'
  }

  get moving(): boolean {
    return this.state === 'shell-moving'
  }

  update(dt: number) {
    if (!this.active) return

    // Flipped (killed by another shell) — just fall
    if (this.dead) {
      this.deadTimer += dt
      this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL)
      this.wx += this.vx * dt
      this.wy += this.vy * dt
      if (this.wy > VIEW_H + 80) this.active = false
      return
    }

    this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL)

    if (this.state === 'walk') {
      this.wx += this.vx * dt
      if (this.world.collideX(this)) this.vx = -this.vx
      if (this.grounded && !this.world.groundAhead(this)) this.vx = -this.vx
      this.walkTime += dt
    } else if (this.state === 'shell-moving') {
      this.wx += this.vx * dt
      if (this.world.collideX(this)) {
        this.vx = -this.vx
      }
    } else {
      // idle shell — wake up after a while
      this.shellTime += dt
      if (this.shellTime > WAKE_AFTER) this.waking = true
      if (this.shellTime > WAKE_AFTER + WAKE_DURATION) {
        this.state = 'walk'
        this.waking = false
        this.vx = -ENEMY_SPEED
        this.h = 22
      }
    }

    this.wy += this.vy * dt
    this.grounded = false
    this.world.collideY(this)
    if (this.wy > VIEW_H + 100) this.active = false

    // Face the movement direction (art faces right natively, like MMM:
    // flip when moving left). Idle shells keep their last facing.
    if (this.vx !== 0) this.dir = this.vx < 0 ? -1 : 1
  }

  /** Stomp: walk→shell, moving shell→stopped. */
  stomp(): 'stomped' | null {
    if (this.dead) return null
    if (this.state === 'walk') {
      this.state = 'shell'
      this.shellTime = 0
      this.waking = false
      this.vx = 0
      this.h = 14
      this.vy = 0
      return 'stomped'
    }
    if (this.state === 'shell-moving') {
      this.state = 'shell'
      this.shellTime = 0
      this.waking = false
      this.vx = 0
      this.h = 14
      return 'stomped'
    }
    return null
  }

  /** Kick a stationary shell (returns true if kicked). */
  kick(dir: 1 | -1): boolean {
    if (this.dead || this.state !== 'shell') return false
    this.state = 'shell-moving'
    this.vx = SHELL_SPEED * dir
    this.h = 14
    return true
  }

  /** Another moving shell hit this koopa — flip and fall. */
  flipKill() {
    if (this.dead) return
    this.dead = true
    this.vy = -220
    this.vx = 0
  }

  /**
   * Decide the outcome of colliding with the player.
   * @returns 'stomped' | 'kicked' | 'killed-player' | null
   */
  onPlayerCollision(player: Mario): 'stomped' | 'kicked' | 'killed-player' | null {
    if (!this.active || this.dead) return null
    if (!overlap(this, player)) return null
    const falling = player.vy > 0
    const feetAbove = player.wy + player.h - this.wy < 14
    if (falling && feetAbove) {
      return this.stomp() ?? 'stomped'
    }
    // Side touch: kick stationary shells, hurt the player otherwise
    if (this.state === 'shell') {
      const dir: 1 | -1 = player.wx + player.w / 2 < this.wx + this.w / 2 ? 1 : -1
      if (this.kick(dir)) return 'kicked'
      return null
    }
    return 'killed-player'
  }

  /** Current frame canvas (walk / shell / waking). */
  currentFrame(): HTMLCanvasElement {
    if (this.dead) return this.f('Walk1')
    if (this.state === 'walk') {
      return Math.floor(this.walkTime / 0.15) % 2 === 0
        ? this.f('Walk1')
        : this.f('Walk2')
    }
    if (this.waking) {
      return Math.floor(this.shellTime * 8) % 2 === 0
        ? this.f('ShellLegs')
        : this.f('Shell')
    }
    return this.f('Shell')
  }

  /** Bake the camera offset into the screen-coordinate refs. */
  syncScreen(cam: number) {
    if (!this.active) {
      this.opacity.value = 0
      return
    }
    const canvas = this.currentFrame()
    this.rx.value = Math.round(this.wx - (canvas.width - this.w) / 2 - cam)
    if (this.dead) {
      this.ry.value = Math.round(this.wy + this.h)
      this.scaleY.value = -1
    } else {
      this.ry.value = Math.round(this.wy + this.h - canvas.height)
      this.scaleY.value = 1
    }
    this.scaleX.value = this.dir
    this.opacity.value = 1
    this.frame.value = canvas
  }
}

/**
 * KoopaSprite — render component for a koopa (same module as the entity).
 */
export const KoopaSprite = com((props: { koopa: Koopa }) => {
  const k = props.koopa
  return (
    <image
      image={k.frame}
      x={k.rx}
      y={k.ry}
      scaleX={k.scaleX}
      scaleY={k.scaleY}
      opacity={k.opacity}
    />
  )
})
