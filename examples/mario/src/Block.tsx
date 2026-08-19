/**
 * Block — brick / `?` block entity.
 *
 * Self-contained class: owns its bump animation, the `?` spin animation, the
 * used-state transition and what happens when the player bumps it from below.
 * Its render component `BlockSprite` lives in this same module.
 */

import { com } from '@rasenjs/core'
import { ref } from '@rasenjs/reactive-signals'
import { sfx } from './audio'
import { SCORE_BLOCK_COIN, TILE } from './constants'
import { TILE_IDX } from './sprites'
import { type World } from './world'

const BUMP_TIME = 0.18
const CHANCE_SEQUENCE = ['chance1', 'chance1', 'chance2', 'chance3'] as const

export type BlockType = 'brick' | 'chance'

export class Block {
  // Screen coordinates & sprite frame index (refs the renderer consumes)
  rx = ref(-1000)
  ry = ref(-1000)
  frame = ref(0)
  opacity = ref(0)
  // Original sprite sheet consumed by the `sprite` component
  get sheet(): CanvasImageSource {
    return this.world.assets.tileBank.image
  }

  // Tile position and behaviour
  active = false
  tx = 0
  ty = 0
  type: BlockType = 'brick'
  used = false
  bumpTimer = 0

  constructor(private world: World) {}

  init(tx: number, ty: number, type: BlockType) {
    this.active = true
    this.tx = tx
    this.ty = ty
    this.type = type
    this.used = false
    this.bumpTimer = 0
  }

  deactivate() {
    this.active = false
  }

  update(dt: number) {
    if (!this.active) return
    if (this.bumpTimer > 0) this.bumpTimer -= dt
    this.frame.value = this.currentFrame()
  }

  /** The player bumped this block from below — handle the consequence. */
  bump() {
    if (this.bumpTimer > 0) return
    this.bumpTimer = BUMP_TIME
    if (this.type === 'chance' && !this.used) {
      this.used = true
      this.world.addCoin(SCORE_BLOCK_COIN)
      this.world.spawnCoinParticle(this.tx * TILE + 8, this.ty * TILE - 2)
      sfx.coin()
    } else {
      sfx.bump()
    }
  }

  private currentFrame(): number {
    if (this.type === 'chance' && !this.used) {
      const name = CHANCE_SEQUENCE[Math.floor(this.world.clock / 0.18) % 4]
      return name === 'chance2'
        ? TILE_IDX.chance2
        : name === 'chance3'
          ? TILE_IDX.chance3
          : TILE_IDX.chance1
    }
    return this.used ? TILE_IDX.metal : TILE_IDX.bricks
  }

  /** Bake the camera offset into the screen-coordinate refs. */
  syncScreen(cam: number) {
    if (!this.active) {
      this.opacity.value = 0
      return
    }
    this.rx.value = Math.round(this.tx * TILE - cam)
    const bumpY =
      this.bumpTimer > 0
        ? -Math.sin((1 - this.bumpTimer / BUMP_TIME) * Math.PI) * 5
        : 0
    this.ry.value = Math.round(this.ty * TILE + bumpY)
    this.opacity.value = 1
  }
}

/**
 * BlockSprite — render component for a block (same module as the entity).
 * Draws a 16x16 frame from the sheet via the `sprite` component (the bump
 * offset is baked into `ry`).
 */
export const BlockSprite = com((props: { block: Block }) => {
  const b = props.block
  return (
    <sprite
      image={b.sheet}
      x={b.rx}
      y={b.ry}
      frame={b.frame}
      frameWidth={16}
      frameHeight={16}
      columns={16}
      opacity={b.opacity}
    />
  )
})
