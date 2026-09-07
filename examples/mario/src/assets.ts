/**
 * Asset loading.
 *
 * Loads the two sprite sheets. The *static* level layer (sky + terrain,
 * pipes, decorations, flag, castle) is pre-rendered per level into one
 * offscreen canvas by `buildStaticLayer` so gameplay rendering only needs a
 * single camera-offset `image` draw.
 */

import { LEVEL_ROWS, TILE, VIEW_W } from './constants'
import type { LevelData } from './level-data'
import { SpriteBank } from './sprites'
import { THEME_SKY, THEME_TILES } from './themes'

export interface GameAssets {
  /** sprites.png — characters & items */
  charBank: SpriteBank
  /** tiles.png — tiles, blocks, coins */
  tileBank: SpriteBank
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
export function buildStaticLayer(
  bank: SpriteBank,
  level: LevelData,
): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = level.cols * TILE
  c.height = LEVEL_ROWS * TILE
  const ctx = c.getContext('2d')!

  // Sky — tiled with the theme's baked sky tile so the blue always matches
  // the palette the decorative tiles (hills, bushes, clouds) were drawn for.
  const table = THEME_TILES[level.theme]
  const skyIdx = table['sky']
  if (skyIdx) {
    const sky = bank.tile(skyIdx[1] * 16 + skyIdx[0])
    const pattern = ctx.createPattern(sky, 'repeat')!
    ctx.fillStyle = pattern
  } else {
    ctx.fillStyle = THEME_SKY[level.theme]
  }
  // extend past the level edge so the viewport never shows gaps
  ctx.fillRect(0, 0, c.width + VIEW_W, c.height)

  for (let ty = 0; ty < LEVEL_ROWS; ty++) {
    for (let tx = 0; tx < level.cols; tx++) {
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

  return {
    charBank: new SpriteBank(spritesImg),
    tileBank: new SpriteBank(tilesImg),
  }
}
