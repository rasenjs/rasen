/**
 * Asset loading.
 *
 * Loads the sprite sheets, then pre-renders the *static* level layer
 * (sky, terrain, pipes, decorations, flag, castle) into one offscreen canvas
 * so gameplay rendering only needs a single camera-offset `image` draw.
 */

import { LEVEL_COLS, LEVEL_ROWS, TILE } from './constants'
import { buildLevel, type LevelData } from './level'
import { SpriteBank } from './sprites'

export interface GameAssets {
  /** sprites.png — characters (mario, goomba) */
  charBank: SpriteBank
  /** tiles.png — tiles, blocks, coins */
  tileBank: SpriteBank
  /** pre-rendered static level layer */
  staticLayer: HTMLCanvasElement
  level: LevelData
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load ${src}`))
    img.src = src
  })
}

/** Pre-render every static grid cell onto one big offscreen canvas. */
function renderStaticLayer(bank: SpriteBank, level: LevelData): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = LEVEL_COLS * TILE
  c.height = LEVEL_ROWS * TILE
  const ctx = c.getContext('2d')!

  // Sky
  ctx.fillStyle = '#5c94fc'
  ctx.fillRect(0, 0, c.width, c.height)

  for (let ty = 0; ty < LEVEL_ROWS; ty++) {
    for (let tx = 0; tx < LEVEL_COLS; tx++) {
      const idx = level.grid[ty][tx]
      if (idx < 0) continue // empty cell
      ctx.drawImage(bank.tile(idx), tx * TILE, ty * TILE)
    }
  }
  return c
}

export async function loadAssets(): Promise<GameAssets> {
  const [spritesImg, tilesImg] = await Promise.all([
    loadImage('/assets/sprites.png'),
    loadImage('/assets/tiles.png'),
  ])

  const charBank = new SpriteBank(spritesImg)
  const tileBank = new SpriteBank(tilesImg)

  const level = buildLevel()
  const staticLayer = renderStaticLayer(tileBank, level)

  return { charBank, tileBank, staticLayer, level }
}
