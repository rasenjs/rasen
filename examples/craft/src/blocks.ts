/**
 * Block / tile definitions and a procedurally generated texture atlas.
 *
 * The atlas is drawn at runtime (no external assets, MIT-safe, deterministic)
 * and laid out row-major with `ATLAS_COLS × ATLAS_ROWS` tiles — exactly the
 * layout `buildVoxelMesh` expects.
 */

import type { VoxelFaces } from '@rasenjs/gfx'

// ---- block ids -------------------------------------------------------------

export const Blocks = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WOOD: 5,
  LEAVES: 6,
  PLANK: 7,
  GLASS: 8,
} as const

// ---- atlas layout ----------------------------------------------------------

export const Tiles = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WOOD_TOP: 5,
  WOOD_SIDE: 6,
  LEAVES: 7,
  PLANK: 8,
  GLASS: 9,
} as const

export const ATLAS_COLS = 5
export const ATLAS_ROWS = 2

/** Face→tile mapping per block id (index = block id). */
export const BLOCK_TILES: VoxelFaces[] = [
  // AIR — never rendered
  { left: 0, right: 0, top: 0, bottom: 0, front: 0, back: 0 },
  // GRASS — green top, grass-sides, dirt bottom
  {
    left: Tiles.GRASS_SIDE,
    right: Tiles.GRASS_SIDE,
    top: Tiles.GRASS_TOP,
    bottom: Tiles.DIRT,
    front: Tiles.GRASS_SIDE,
    back: Tiles.GRASS_SIDE,
  },
  // DIRT
  { left: Tiles.DIRT, right: Tiles.DIRT, top: Tiles.DIRT, bottom: Tiles.DIRT, front: Tiles.DIRT, back: Tiles.DIRT },
  // STONE
  { left: Tiles.STONE, right: Tiles.STONE, top: Tiles.STONE, bottom: Tiles.STONE, front: Tiles.STONE, back: Tiles.STONE },
  // SAND
  { left: Tiles.SAND, right: Tiles.SAND, top: Tiles.SAND, bottom: Tiles.SAND, front: Tiles.SAND, back: Tiles.SAND },
  // WOOD — bark sides, rings top/bottom
  {
    left: Tiles.WOOD_SIDE,
    right: Tiles.WOOD_SIDE,
    top: Tiles.WOOD_TOP,
    bottom: Tiles.WOOD_TOP,
    front: Tiles.WOOD_SIDE,
    back: Tiles.WOOD_SIDE,
  },
  // LEAVES
  { left: Tiles.LEAVES, right: Tiles.LEAVES, top: Tiles.LEAVES, bottom: Tiles.LEAVES, front: Tiles.LEAVES, back: Tiles.LEAVES },
  // PLANK
  { left: Tiles.PLANK, right: Tiles.PLANK, top: Tiles.PLANK, bottom: Tiles.PLANK, front: Tiles.PLANK, back: Tiles.PLANK },
  // GLASS — translucent light blue
  { left: Tiles.GLASS, right: Tiles.GLASS, top: Tiles.GLASS, bottom: Tiles.GLASS, front: Tiles.GLASS, back: Tiles.GLASS },
]

// ---- procedural atlas ------------------------------------------------------

const TILE_PX = 16

/** Deterministic hash → [0, 1). */
function hash2(x: number, y: number, seed = 0): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed * 144269504) >>> 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function blend(a: number[], b: number[], t: number): number[] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

/** Paint one 16×16 tile into an ImageData with a seeded scatter of color. */
function paint(
  img: Uint8ClampedArray,
  w: number,
  base: number[],
  vary: number[],
  seed: number,
  tintRows: Array<{ y: number; color: number[]; amount?: number }> = [],
): void {
  for (let py = 0; py < TILE_PX; py++) {
    for (let px = 0; px < TILE_PX; px++) {
      const r = hash2(px, py, seed)
      const c = blend(base, vary, r)
      const i = (py * w + px) * 4
      img[i] = c[0]
      img[i + 1] = c[1]
      img[i + 2] = c[2]
      img[i + 3] = 255
    }
  }
  for (const row of tintRows) {
    if (row.y < 0 || row.y >= TILE_PX) continue
    const amt = row.amount ?? 1
    for (let px = 0; px < TILE_PX; px++) {
      const r = hash2(px, row.y * 31 + seed, seed)
      const mixed = blend(
        [img[(row.y * w + px) * 4], img[(row.y * w + px) * 4 + 1], img[(row.y * w + px) * 4 + 2]],
        row.color,
        amt * (0.5 + r * 0.5),
      )
      const i = (row.y * w + px) * 4
      img[i] = mixed[0]
      img[i + 1] = mixed[1]
      img[i + 2] = mixed[2]
    }
  }
}

function paintTile(tileId: number): ImageData {
  const w = TILE_PX
  const img = new Uint8ClampedArray(w * w * 4)
  const seed = tileId * 1013 + 7

  switch (tileId) {
    case Tiles.GRASS_TOP:
      paint(img, w, [93, 164, 46], [57, 122, 30], seed)
      break
    case Tiles.GRASS_SIDE:
      // top 3 rows grass, rest dirt
      paint(img, w, [121, 85, 58], [90, 60, 38], seed)
      for (let y = 0; y < 4; y++) {
        for (let px = 0; px < w; px++) {
          const r = hash2(px, y, seed)
          const c = blend([93, 164, 46], [57, 122, 30], r)
          const i = (y * w + px) * 4
          img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; img[i + 3] = 255
        }
      }
      // jagged grass edge
      for (let px = 0; px < w; px++) {
        const drop = hash2(px, 99, seed) > 0.6 ? 1 : 0
        const y = 4 + drop
        const r = hash2(px, y, seed)
        const c = blend([93, 164, 46], [57, 122, 30], r)
        const i = (y * w + px) * 4
        img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; img[i + 3] = 255
      }
      break
    case Tiles.DIRT:
      paint(img, w, [121, 85, 58], [95, 65, 43], seed)
      break
    case Tiles.STONE:
      paint(img, w, [127, 127, 127], [95, 95, 95], seed)
      break
    case Tiles.SAND:
      paint(img, w, [219, 211, 160], [186, 176, 128], seed)
      break
    case Tiles.WOOD_TOP: {
      // concentric rings
      paint(img, w, [107, 74, 43], [86, 58, 33], seed)
      for (let py = 0; py < w; py++) {
        for (let px = 0; px < w; px++) {
          const dx = px - 7.5
          const dy = py - 7.5
          const d = Math.sqrt(dx * dx + dy * dy)
          if (Math.abs((d % 3) - 1.5) < 0.6) {
            const i = (py * w + px) * 4
            img[i] = 78; img[i + 1] = 52; img[i + 2] = 30; img[i + 3] = 255
          }
        }
      }
      break
    }
    case Tiles.WOOD_SIDE: {
      // vertical bark stripes
      paint(img, w, [107, 74, 43], [86, 58, 33], seed)
      for (let px = 0; px < w; px++) {
        if (hash2(px, 5, seed) > 0.5) {
          for (let py = 0; py < w; py++) {
            const i = (py * w + px) * 4
            img[i] = 74; img[i + 1] = 49; img[i + 2] = 27; img[i + 3] = 255
          }
        }
      }
      break
    }
    case Tiles.LEAVES:
      paint(img, w, [62, 142, 46], [38, 92, 30], seed, [
        { y: 0, color: [98, 166, 60], amount: 0.5 },
        { y: 3, color: [98, 166, 60], amount: 0.4 },
        { y: 7, color: [40, 100, 32], amount: 0.4 },
        { y: 11, color: [98, 166, 60], amount: 0.4 },
        { y: 15, color: [40, 100, 32], amount: 0.5 },
      ])
      break
    case Tiles.PLANK: {
      // horizontal plank stripes
      paint(img, w, [168, 123, 77], [138, 96, 58], seed)
      for (let py = 0; py < w; py += 4) {
        for (let px = 0; px < w; px++) {
          const i = (py * w + px) * 4
          img[i] = 118; img[i + 1] = 84; img[i + 2] = 52; img[i + 3] = 255
        }
      }
      break
    }
    case Tiles.GLASS: {
      // translucent light blue with white highlights
      paint(img, w, [158, 216, 230], [128, 192, 212], seed)
      for (let py = 0; py < w; py++) {
        for (let px = 0; px < w; px++) {
          const r = hash2(px, py, seed + 5)
          const i = (py * w + px) * 4
          img[i + 3] = r > 0.85 ? 60 : 130
          if (r > 0.92) {
            img[i] = 235; img[i + 1] = 250; img[i + 2] = 255
          }
        }
      }
      break
    }
    default:
      paint(img, w, [180, 80, 200], [120, 40, 160], seed)
  }

  return new ImageData(img, w, w)
}

/**
 * Build the texture atlas canvas. Call once at startup.
 */
export function createAtlas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = TILE_PX * ATLAS_COLS
  canvas.height = TILE_PX * ATLAS_ROWS
  const ctx = canvas.getContext('2d')!
  for (let tile = 0; tile < ATLAS_COLS * ATLAS_ROWS; tile++) {
    const col = tile % ATLAS_COLS
    const row = Math.floor(tile / ATLAS_COLS)
    ctx.putImageData(paintTile(tile), col * TILE_PX, row * TILE_PX)
  }
  return canvas
}
