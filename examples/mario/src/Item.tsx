/**
 * Item — power-ups that rise out of `?` blocks.
 *
 * `mushroom` emerges then walks like an enemy; `flower` stays on the block.
 * Collected on touch by the player. Its render component `ItemSprite` lives
 * in this same module.
 */

import { com } from '@rasenjs/core'
import { ref } from '@rasenjs/reactive-signals'
import { GRAVITY, ITEM_SPEED, MAX_FALL } from './constants'
import { SPRITE_FRAMES } from './sprites'
import { blankFrame, overlap, type World } from './world'
import type { Mario } from './Mario'

export type ItemKind = 'mushroom' | 'flower'

const EMERGE_TIME = 0.6 // seconds to rise out of the block

export class Item {
  // Screen coordinates & sprite frame canvas (refs the renderer consumes)
  rx = ref(-1000)
  ry = ref(-1000)
  frame = ref<HTMLCanvasElement>(blankFrame)
  opacity = ref(0)

  // World position and behaviour
  active = false
  kind: ItemKind = 'mushroom'
  wx = 0
  wy = 0
  vx = 0
  vy = 0
  w = 16
  h = 16
  grounded = false
  /** rise-out-of-block state */
  emerging = false
  emergeFrom = 0

  constructor(private world: World) {}

  /** Bake the sprite frame for this kind into a standalone canvas. */
  private frames(): { main: HTMLCanvasElement; palette: HTMLCanvasElement[] } {
    const cb = this.world.assets.charBank
    const f = SPRITE_FRAMES
    if (this.kind === 'flower') {
      // fire flower cycles its petal palette: 4 variants side by side
      const palette = [0, 1, 2, 3].map((i) =>
        cb.frame(f.flower.x + i * 16, f.flower.y, 16, 16, `flower-${i}`),
      )
      return { main: palette[0], palette }
    }
    return {
      main: cb.frame(f.mushroom.x, f.mushroom.y, 16, 16, 'mushroom'),
      palette: [],
    }
  }

  /** Start rising out of the block at (tx, ty). */
  spawn(tx: number, ty: number, kind: ItemKind) {
    this.active = true
    this.kind = kind
    this.wx = tx * 16
    this.wy = ty * 16
    this.emerging = true
    this.emergeFrom = ty * 16
    this.vx = 0
    this.vy = 0
  }

  deactivate() {
    this.active = false
  }

  private animTime = 0

  update(dt: number) {
    if (!this.active) return
    this.animTime += dt

    if (this.emerging) {
      this.wy -= 16 * (dt / EMERGE_TIME) * 2 // 32px rise in EMERGE_TIME
      if (this.wy <= this.emergeFrom - 16) {
        this.wy = this.emergeFrom - 16
        this.emerging = false
        if (this.kind === 'mushroom') this.vx = ITEM_SPEED
      }
      return
    }

    if (this.kind === 'mushroom') {
      this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL)
      this.wx += this.vx * dt
      if (this.world.collideX(this)) this.vx = -this.vx
      this.wy += this.vy * dt
      this.grounded = false
      this.world.collideY(this)
    }
  }

  /** Did the player touch this item? (only after fully emerged) */
  overlapsPlayer(player: Mario): boolean {
    return this.active && !this.emerging && overlap(this, player)
  }

  /** Bake the camera offset into the screen-coordinate refs. */
  syncScreen(cam: number) {
    if (!this.active) {
      this.opacity.value = 0
      return
    }
    this.rx.value = Math.round(this.wx - cam)
    this.ry.value = Math.round(this.wy)
    const { main, palette } = this.frames()
    this.frame.value =
      this.kind === 'flower' && palette.length > 0
        ? palette[Math.floor(this.animTime / 0.12) % palette.length]
        : main
    this.opacity.value = 1
  }
}

/**
 * ItemSprite — render component for an item (same module as the entity).
 */
export const ItemSprite = com((props: { item: Item }) => {
  const i = props.item
  return (
    <image
      image={i.frame}
      x={i.rx}
      y={i.ry}
      opacity={i.opacity}
    />
  )
})
