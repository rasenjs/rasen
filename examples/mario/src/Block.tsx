/**
 * Block — brick / `?` block entity.
 *
 * Self-contained class: owns its bump animation, the `?` spin animation, the
 * used-state transition and what happens when the player bumps it from below
 * (coin / power-up contents, brick breaking when Mario is large). Its render
 * component `BlockSprite` lives in this same module.
 */

import { com } from '@rasenjs/core'
import { ref } from '@rasenjs/reactive-signals'
import { sfx } from './audio'
import {
  SCORE_BLOCK_COIN,
  SCORE_BRICK,
  TILE,
  SPRITE_GRID_COLUMNS,
} from './constants'
import type { LevelData } from './level-data'
import { THEME_BLOCK_FRAMES } from './themes'
import type { World } from './world'

const BUMP_TIME = 0.18

export class Block {
  // Screen coordinates & sprite frame index (refs the renderer consumes)
  rx = ref(-1000)
  ry = ref(-1000)
  frame = ref(0)
  opacity = ref(0)

  // Tile position and behaviour
  active = false
  tx = 0
  ty = 0
  type: 'brick' | 'chance' = 'brick'
  used = false
  bumpTimer = 0

  constructor(private world: World) {}

  get sheet(): CanvasImageSource {
    return this.world.assets.tileBank.image
  }

  init(def: LevelData['blocks'][number]) {
    this.active = true
    this.tx = def.tx
    this.ty = def.ty
    this.type = def.type
    this.used = false
    this.bumpTimer = 0
  }

  deactivate() {
    this.active = false
  }

  get chanceContents(): 'powerup' | 'coin' {
    const def = this.world.level.blocks.find(
      (b) => b.tx === this.tx && b.ty === this.ty,
    )
    return def?.contents === 'coin' ? 'coin' : 'powerup'
  }

  update(dt: number) {
    if (!this.active) return
    if (this.bumpTimer > 0) this.bumpTimer -= dt
    this.frame.value = this.currentFrame()
  }

  /**
   * The player bumped this block from below.
   * @param brickBreakable true when Mario is large (bricks shatter)
   */
  bump(brickBreakable: boolean) {
    if (this.bumpTimer > 0) return
    this.bumpTimer = BUMP_TIME

    if (this.type === 'chance') {
      if (!this.used) {
        this.used = true
        if (this.chanceContents === 'coin') {
          this.world.addCoin(SCORE_BLOCK_COIN)
          // coin (16x16) sits centered on the block (same left edge) and
          // starts just above the block top
          this.world.spawnCoinParticle(this.tx * TILE, this.ty * TILE - 16)
          sfx.coin()
        } else {
          this.world.spawnItemFromBlock(this.tx, this.ty)
          sfx.powerupAppear()
        }
        return
      }
      // A used ? block never breaks — it just thuds
      sfx.bump()
      return
    }

    // Brick
    if (brickBreakable) {
      this.world.spawnShrapnel(this.tx, this.ty)
      this.world.addScore(SCORE_BRICK)
      this.deactivate()
      this.world.brickBroken(this.tx, this.ty)
      sfx.brickBreak()
      return
    }
    sfx.bump()
  }

  private currentFrame(): number {
    const F = THEME_BLOCK_FRAMES[this.world.level.theme]
    if (this.type === 'chance') {
      if (this.used) return F.used
      const phase = Math.floor(this.world.clock / 0.16) % 5
      return [F.chance1, F.chance1, F.chance2, F.chance3, F.chance2][phase]
    }
    return F.brick
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
      columns={SPRITE_GRID_COLUMNS}
      opacity={b.opacity}
    />
  )
})
