/**
 * Coin — collectible entity with a spinning animation.
 *
 * Self-contained class: owns its spin animation and the collection decision
 * (overlap with the player). Its render component `CoinSprite` lives in this
 * same module.
 */

import { com } from '@rasenjs/core'
import { ref } from '@rasenjs/reactive-signals'
import { TILE } from './constants'
import { blankFrame, overlap, type World } from './world'
import type { Mario } from './Mario'

// Frame sequence relative to the theme coin base index (3 frames, 16 apart)
export class Coin {
  // Screen coordinates & sprite frame index (refs the renderer consumes)
  rx = ref(-1000)
  ry = ref(-1000)
  frame = ref(0)
  /** Cropped frame canvas (kept in sync; unused by the 2D view). */
  frameTex = ref<HTMLCanvasElement>(blankFrame)
  opacity = ref(0)
  // Original sprite sheet consumed by the `sprite` component
  get sheet(): CanvasImageSource {
    return this.world.assets.tileBank.image
  }

  // World position and behaviour
  active = false
  wx = 0
  wy = 0
  w = 12
  h = 16
  animTime = 0
  /** theme coin frame base (grid index of frame 1) */
  base = 15

  constructor(private world: World) {}

  spawn(tx: number, ty: number, base = 15) {
    this.active = true
    this.wx = tx * TILE + 2
    this.wy = ty * TILE
    this.base = base
    this.animTime = Math.random() * 0.4
  }

  deactivate() {
    this.active = false
  }

  update(dt: number) {
    if (!this.active) return
    this.animTime += dt
    const phase = Math.floor(this.animTime / 0.14) % 4
    // NES coin spin pulses by shading: bright → mid → dark → mid
    const idx = this.base + [0, 16, 32, 16][phase]
    this.frame.value = idx
    this.frameTex.value = this.world.assets.tileBank.tile(idx)
  }

  /** Did the player touch this coin? (collection is decided here) */
  overlapsPlayer(player: Mario): boolean {
    return this.active && overlap(this, player)
  }

  /** Bake the camera offset into the screen-coordinate refs. */
  syncScreen(cam: number) {
    if (!this.active) {
      this.opacity.value = 0
      return
    }
    this.rx.value = Math.round(this.wx - cam)
    this.ry.value = Math.round(this.wy)
    this.opacity.value = 1
  }
}

/**
 * CoinSprite — render component for a coin (same module as the entity).
 * Draws a 16x16 frame from the sheet via the `sprite` component.
 */
export const CoinSprite = com((props: { coin: Coin }) => {
  const c = props.coin
  return (
    <sprite
      image={c.sheet}
      x={c.rx}
      y={c.ry}
      frame={c.frame}
      frameWidth={16}
      frameHeight={16}
      columns={16}
      opacity={c.opacity}
    />
  )
})
