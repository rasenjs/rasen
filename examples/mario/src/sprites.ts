/**
 * Sprite sheet definitions and a frame-bank helper.
 *
 * Assets (sprites.png / tiles.png) are 16px-grid sheets (256px wide => 16 columns).
 * The `SpriteBank` crops individual frames into small offscreen canvases so the
 * reactive `image` component can draw them by swapping the source ref.
 */

export interface FrameRect {
  x: number
  y: number
  w: number
  h: number
}

/** Frames inside sprites.png (characters) */
export const SPRITE_FRAMES = {
  marioIdle: { x: 0, y: 88, w: 16, h: 16 },
  marioRun1: { x: 16, y: 88, w: 16, h: 16 },
  marioRun2: { x: 32, y: 88, w: 16, h: 16 },
  marioRun3: { x: 48, y: 88, w: 16, h: 16 },
  marioBreak: { x: 64, y: 88, w: 16, h: 16 },
  marioJump: { x: 80, y: 88, w: 16, h: 16 },
  marioDie: { x: 96, y: 88, w: 16, h: 16 },
  goombaWalk1: { x: 80, y: 0, w: 16, h: 16 },
  goombaWalk2: { x: 96, y: 0, w: 16, h: 16 },
  goombaFlat: { x: 112, y: 0, w: 16, h: 16 },
} as const satisfies Record<string, FrameRect>

export type SpriteKey = keyof typeof SPRITE_FRAMES

/** Tile indices inside tiles.png (16x16 grid, 16 columns) */
export const TILE_IDX = {
  ground: 0,
  bricks: 1,
  metal: 2, // used "?" block
  chocolate: 3,
  chance1: 4,
  chance2: 5,
  chance3: 6,
  castleTopClosed: 8,
  castleTopOpen: 9,
  castleWindowRight: 10,
  castleArch: 11,
  castleWindowLeft: 12,
  dirt: 13,
  coin1: 15,
  coin2: 31,
  coin3: 47,
  grassLeft: 9 + 2 * 16,
  grass: 10 + 2 * 16,
  grassRight: 11 + 2 * 16,
  pipeInsertLeft: 0 + 5 * 16,
  pipeInsertRight: 1 + 5 * 16,
  pipeLeft: 0 + 6 * 16,
  pipeRight: 1 + 6 * 16,
  poleGreen: 12 + 13 * 16,
  poleWhite: 11 + 13 * 16,
  poleBall: 8 + 8 * 16,
  hillStainsLeft: 3 + 7 * 16,
  hillLeft: 4 + 7 * 16,
  hillStainsRight: 5 + 7 * 16,
  hillRight: 6 + 7 * 16,
  hillTop: 7 + 7 * 16,
  tileGreen: 12 + 7 * 16,
  cloud1: 11 + 10 * 16,
  cloud2: 12 + 10 * 16,
  cloud3: 13 + 10 * 16,
  bush1: 11 + 12 * 16,
  bush2: 12 + 12 * 16,
  bush3: 13 + 12 * 16,
} as const

/**
 * Crops frames out of a sprite sheet into standalone canvases.
 * Used so the reactive `image` component can draw any frame by swapping the ref.
 */
export class SpriteBank {
  private cache = new Map<string, HTMLCanvasElement>()

  constructor(
    private sheet: CanvasImageSource,
    private tileSize = 16,
    private columns = 16,
  ) {}

  /** Crop a 16x16 tile by grid index. */
  tile(index: number, key?: string): HTMLCanvasElement {
    const col = index % this.columns
    const row = Math.floor(index / this.columns)
    return this.frame(
      col * this.tileSize,
      row * this.tileSize,
      this.tileSize,
      this.tileSize,
      key ?? `t${index}`,
    )
  }

  /** Crop an arbitrary rectangle from the sheet. */
  frame(x: number, y: number, w: number, h: number, key: string): HTMLCanvasElement {
    const hit = this.cache.get(key)
    if (hit) return hit

    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')!
    ctx.drawImage(this.sheet, x, y, w, h, 0, 0, w, h)
    this.cache.set(key, c)
    return c
  }

  /** The original sprite sheet image (for the `sprite` component). */
  get image(): CanvasImageSource {
    return this.sheet
  }
}
