/**
 * The tile atlas — procedural pixel art with real autotiling.
 *
 * There is no bitmapped art in this project on purpose: the engine half of
 * Open-Terraria is MIT but its sprites are Re-Logic's, so a port cannot ship them.
 * Everything here is generated from the tile registry's colour data.
 *
 * ## Why this is an atlas and not "draw the tile at bake time"
 *
 * A tile's appearance depends on **which of its four neighbours are the same kind
 * of material**. That is what makes a dirt wall read as a solid mass with a lit top
 * edge instead of a grid of identical squares. Computing that per tile during the
 * bake would mean every chunk bake re-derives the edge shading, and the same tile
 * would be shaded twice for two adjacent chunks.
 *
 * So the 16 possible neighbourhood shapes are pre-rendered once into an atlas and
 * the bake becomes a single `drawImage` per tile:
 *
 *   frame = tile * (MASK_COUNT * NOISE_VARIANTS) + mask * NOISE_VARIANTS + noise
 *
 * ## Why the noise seed excludes the mask
 *
 * `noise` is picked from a hash of the tile's world coordinate, and the speckle
 * pattern is seeded by `(tile, noise)` only. If the mask fed the seed, mining a
 * neighbouring tile would visibly re-scramble this tile's texture — the speckles
 * would jump. Keeping them independent means an edge change only changes the edge.
 *
 * ## The art
 *
 * Each cell is drawn in a fixed order, and the order is what produces the look:
 *
 *   1. base fill, then speckles from the registry's accent colours
 *   2. material detail (ore blobs, wood grain, glass sheen, gem facet)
 *   3. edge bands for every side that has no neighbour — a pale 1 px lip above a
 *      darker 2 px band, which is the shading convention the whole atlas shares
 *   4. the surface treatment: grass crust, or a lighter lip for bare soil
 *
 * Step 3 sits *after* step 2 on purpose, so ore blobs are cut cleanly by the edge
 * bands rather than bleeding into the neighbouring material.
 */

import { TILE } from '../core/constants'
import { mulberry32 } from '../core/rng'
import { Tile, TILE_DEFS } from '../core/tile-defs'
import { Wall, type WallId } from '../core/tile-store'
import { ITEM_DEFS, itemDef } from '../core/items'

/** Bits of the neighbourhood mask. Set = that neighbour connects. */
export const BIT_N = 1
export const BIT_E = 2
export const BIT_S = 4
export const BIT_W = 8
/** Every side connected: the "interior" cell, also used for inventory icons. */
export const MASK_INTERIOR = BIT_N | BIT_E | BIT_S | BIT_W

export const MASK_COUNT = 16
export const NOISE_VARIANTS = 2
/** Atlas width in cells: one per neighbourhood shape, per noise variant. */
export const ATLAS_COLUMNS = MASK_COUNT * NOISE_VARIANTS

/**
 * Rows in the atlas reserved for background walls.
 *
 * Walls are not tiles — nothing collides with them and they have no autotile mask —
 * so they get their own small block of rows at the bottom of the same sheet. One
 * sheet means the bake is still a single `drawImage` source, and the DOM icon path
 * keeps working unchanged.
 */
export const WALL_ROWS = 4

/**
 * Rows reserved for items.
 *
 * Items occupy the same grid as everything else but only ever use column 0: a pickaxe
 * has no autotile neighbourhood. The row count is taken from the registry rather than
 * hardcoded, so adding an item cannot silently run off the end of the sheet.
 */
export const ITEM_ROWS = ITEM_DEFS.length
/** First atlas row that holds an item. */
export const ITEM_ROW_BASE = TILE_DEFS.length + WALL_ROWS
/** Noise variants per wall, matching `NOISE_VARIANTS` so the frame math is shared. */
export const WALL_VARIANTS = 4

/** Frame index for a wall. Lives past the tile rows so the two never collide. */
export function wallFrame(wall: number, noise: number): number {
  return (TILE_DEFS.length + wall) * (MASK_COUNT * NOISE_VARIANTS) + noise
}

/**
 * Atlas frame for an item icon.
 *
 * A block item reuses the tile's own interior cell, which is the elegant part: a
 * stone-block icon *is* the stone tile, so the hotbar and the world can never disagree
 * about what stone looks like and there is no second copy of that art to keep in sync.
 * Tools and materials get their own row.
 */
export function itemFrame(item: number): number {
  const def = itemDef(item)
  if (def.kind === 'block' && def.tile !== undefined) return iconFrame(def.tile)
  return (ITEM_ROW_BASE + item) * (MASK_COUNT * NOISE_VARIANTS)
}

export interface TileAtlas {
  readonly canvas: HTMLCanvasElement
  /** Cell edge in device pixels. */
  readonly cell: number
  readonly columns: number
  readonly rows: number
  /** Device pixels per logical pixel-of-art. */
  readonly scale: number
}

/** Frame index into the atlas for a tile in a given neighbourhood. */
export function atlasFrame(tile: number, mask: number, noise: number): number {
  return tile * (MASK_COUNT * NOISE_VARIANTS) + mask * NOISE_VARIANTS + noise
}

/** The frame an inventory icon uses: interior shading, first noise variant. */
export function iconFrame(tile: number): number {
  return atlasFrame(tile, MASK_INTERIOR, 0)
}

/**
 * Which tiles visually merge with each other.
 *
 * Materials that look alike are grouped so a dirt tile next to a grass tile does
 * not draw an internal edge — the seam between them would read as a wall. Ores
 * join the rock group for the same reason: a copper vein should look like it is
 * *in* the stone, not like 6 floating blocks.
 */
export function connectGroupOf(tile: number): string {
  switch (tile) {
    case Tile.Air:
      return 'air'
    case Tile.Dirt:
    case Tile.Grass:
    case Tile.Mud:
    case Tile.Sand:
      return 'soil'
    case Tile.Stone:
    case Tile.Ash:
    case Tile.Brick:
    case Tile.Copper:
    case Tile.Iron:
    case Tile.Silver:
    case Tile.Gold:
    case Tile.Gem:
      return 'rock'
    case Tile.Wood:
    case Tile.Plank:
      return 'wood'
    case Tile.Glass:
      return 'glass'
    // Torches, liquids and leaves are decorative: every one draws its own outline
    // so a field of leaves reads as foliage rather than a flat green mass.
    default:
      return `solo:${tile}`
  }
}

/** True when the two tiles should not draw an edge between them. */
export function connectsWith(a: number, b: number): boolean {
  if (a === Tile.Air || b === Tile.Air) return false
  return connectGroupOf(a) === connectGroupOf(b)
}

/** The mask for a tile from its four neighbours, in reading order. */
export function maskFor(n: number, e: number, s: number, w: number, tile: number): number {
  let mask = 0
  if (connectsWith(tile, n)) mask |= BIT_N
  if (connectsWith(tile, e)) mask |= BIT_E
  if (connectsWith(tile, s)) mask |= BIT_S
  if (connectsWith(tile, w)) mask |= BIT_W
  return mask
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export function buildTileAtlas(scale: number): TileAtlas {
  const cell = TILE * scale
  const columns = ATLAS_COLUMNS
  const rows = TILE_DEFS.length + WALL_ROWS + ITEM_ROWS
  const canvas = document.createElement('canvas')
  canvas.width = columns * cell
  canvas.height = rows * cell

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable for the tile atlas')
  ctx.imageSmoothingEnabled = false

  // Row-major over (tile, mask, noise): the frame index is the only thing the bake
  // needs to compute, so the layout is derived from the same `atlasFrame` the
  // renderer calls rather than written twice.
  for (let tile = 0; tile < TILE_DEFS.length; tile++) {
    for (let mask = 0; mask < MASK_COUNT; mask++) {
      for (let noise = 0; noise < NOISE_VARIANTS; noise++) {
        const { cx, cy } = originOf(atlasFrame(tile, mask, noise), columns, cell)
        drawCell(ctx, tile, mask, noise, cx, cy, cell, scale)
      }
    }
  }

  // Walls occupy the same grid but are drawn with their own, flatter treatment.
  for (let wall = 1; wall < WALL_ROWS; wall++) {
    for (let noise = 0; noise < WALL_VARIANTS; noise++) {
      const { cx, cy } = originOf(wallFrame(wall, noise), columns, cell)
      drawWallCell(ctx, wall, noise, cx, cy, cell, scale)
    }
  }

  // Items. Block items are skipped: they already have a cell, and `itemFrame` points
  // at it rather than duplicating the art.
  for (let item = 0; item < ITEM_ROWS; item++) {
    const def = itemDef(item)
    if (def.kind === 'block') continue
    const { cx, cy } = originOf(itemFrame(item), columns, cell)
    drawItemCell(ctx, item, cx, cy, cell, scale)
  }

  return { canvas, cell, columns, rows, scale }
}

type RGB = readonly [number, number, number]

/**
 * A frame index to its cell origin.
 *
 * The single place the atlas layout is defined; both the generator and the renderer
 * go through it, so a change to one cannot silently desynchronise the other.
 */
function originOf(frame: number, columns: number, cell: number): { cx: number; cy: number } {
  return { cx: (frame % columns) * cell, cy: ((frame / columns) | 0) * cell }
}

const WALL_COLORS: Record<number, RGB> = {
  [Wall.Dirt]: [78, 54, 34],
  [Wall.Stone]: [72, 72, 78],
  [Wall.Cave]: [44, 42, 50],
}

/**
 * A wall cell.
 *
 * Flatter than a tile on purpose: a wall is *behind* the player, so it must not
 * compete with the terrain in front of it. No edge bands, no top lip — just a dark
 * base, coarse grain, and a faint mortar grid so it reads as masonry rather than as
 * a flat fill.
 */
function drawWallCell(
  ctx: CanvasRenderingContext2D,
  wall: number,
  noise: number,
  cx: number,
  cy: number,
  _cell: number,
  scale: number
): void {
  const base = WALL_COLORS[wall] ?? WALL_COLORS[Wall.Stone]
  const rand = mulberry32(wall * 5147 + noise * 7919 + 3)
  const shade = (c: RGB, mul: number): string =>
    `rgb(${Math.round(c[0] * mul)},${Math.round(c[1] * mul)},${Math.round(c[2] * mul)})`
  const box = (x: number, y: number, w: number, h: number, color: string): void => {
    ctx.fillStyle = color
    ctx.fillRect(cx + x * scale, cy + y * scale, w * scale, h * scale)
  }

  box(0, 0, TILE, TILE, shade(base, 1))
  // Coarse grain.
  for (let i = 0; i < 34; i++) {
    const x = Math.floor(rand() * TILE)
    const y = Math.floor(rand() * TILE)
    const w = 1 + Math.floor(rand() * 3)
    // Half the grain is lighter, half darker, so it does not read as one direction
    // of lighting — a wall is lit by whatever is in front of it, not by the sun.
    box(x, y, w, 1, shade(base, rand() < 0.5 ? 1.28 : 0.74))
  }
  // Mortar lines: a brick bond, offset by row so it is not a plain grid.
  box(0, 0, TILE, 1, shade(base, 0.6))
  box(0, 8, TILE, 1, shade(base, 0.6))
  if (noise % 2 === 0) {
    box(6, 1, 1, 7, shade(base, 0.64))
    box(12, 9, 1, 7, shade(base, 0.64))
  } else {
    box(11, 1, 1, 7, shade(base, 0.64))
    box(4, 9, 1, 7, shade(base, 0.64))
  }
}

/**
 * A tool, weapon or material icon.
 *
 * These are drawn as *silhouettes on a diagonal* rather than as front-on sprites. At
 * 16 px a pickaxe only reads as a pickaxe if the handle runs corner to corner and the
 * head is a distinct shape at one end — anything more detailed collapses into noise.
 */
function drawItemCell(
  ctx: CanvasRenderingContext2D,
  item: number,
  cx: number,
  cy: number,
  _cell: number,
  scale: number
): void {
  const def = itemDef(item)
  const base = def.color
  const rand = mulberry32(item * 6151 + 17)

  const shade = (mul: number, alpha = 1): string => {
    const r = Math.max(0, Math.min(255, Math.round(base[0] * mul)))
    const g = Math.max(0, Math.min(255, Math.round(base[1] * mul)))
    const b = Math.max(0, Math.min(255, Math.round(base[2] * mul)))
    return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`
  }
  const box = (x: number, y: number, w: number, h: number, color: string): void => {
    ctx.fillStyle = color
    ctx.fillRect(cx + x * scale, cy + y * scale, w * scale, h * scale)
  }
  const px = (x: number, y: number, color: string): void => box(x, y, 1, 1, color)

  // Shared wood handle, for both tools and both weapons.
  const handle = (): void => {
    for (let i = 0; i < 8; i++) {
      box(4 + i, 12 - i, 2, 2, shade(0.62))
    }
    px(3, 13, shade(0.5))
    px(12, 3, shade(0.72))
  }

  switch (def.kind) {
    case 'pickaxe': {
      handle()
      // The head is a crescent: two tapering arms meeting at the top-right corner
      // where the handle ends.
      const head = shade(1)
      const headLit = shade(1.4)
      box(9, 2, 4, 2, head)
      box(11, 3, 3, 1, head)
      box(7, 3, 2, 1, head)
      box(6, 4, 2, 1, head)
      box(9, 2, 3, 1, headLit)
      px(12, 2, headLit)
      px(6, 4, headLit)
      // A highlight along the cutting edge is what makes it read as metal.
      px(9, 3, headLit)
      px(10, 3, headLit)
      break
    }

    case 'weapon': {
      handle()
      // Blade along the same diagonal, brighter, with a crossguard.
      const blade = shade(1.15)
      const edge = shade(1.6)
      for (let i = 0; i < 7; i++) {
        box(6 + i, 9 - i, 2, 2, blade)
      }
      for (let i = 0; i < 6; i++) {
        px(6 + i, 8 - i, edge)
      }
      box(4, 10, 4, 1, shade(0.7))
      box(7, 10, 2, 1, shade(0.7))
      px(3, 12, shade(0.55))
      px(4, 11, shade(0.55))
      break
    }

    default: {
      // A material: a small lumpy pile in the item's own colour, with a couple of
      // lighter facets. Round enough to read as "ore" and not as "block".
      const lump = shade(1)
      const lit = shade(1.35)
      const dark = shade(0.72)
      const body: ReadonlyArray<[number, number]> = [
        [5, 9], [6, 9], [7, 9], [8, 9], [9, 9], [10, 9],
        [4, 10], [5, 10], [6, 10], [7, 10], [8, 10], [9, 10], [10, 10], [11, 10],
        [4, 11], [5, 11], [6, 11], [7, 11], [8, 11], [9, 11], [10, 11], [11, 11],
        [5, 12], [6, 12], [7, 12], [8, 12], [9, 12], [10, 12],
      ]
      for (const [x, y] of body) box(x, y, 1, 1, lump)
      // Irregular facets so two different ores do not look like the same pebble.
      for (let i = 0; i < 5; i++) {
        const [x, y] = body[Math.floor(rand() * body.length)]
        px(x, y, i % 2 === 0 ? lit : dark)
      }
      px(6, 9, lit)
      px(9, 10, lit)
      box(5, 12, 6, 1, dark)
      break
    }
  }
}

/** The wall's own palette, for the atlas preview and the debug overlay. */
export function wallColor(wall: WallId): RGB {
  return WALL_COLORS[wall] ?? WALL_COLORS[Wall.Stone]
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  tile: number,
  mask: number,
  noise: number,
  cx: number,
  cy: number,
  cell: number,
  scale: number
): void {
  const def = TILE_DEFS[tile]
  if (!def || tile === Tile.Air) return

  // The speckle seed deliberately excludes `mask` — see the file header.
  const rand = mulberry32(tile * 7919 + noise * 104729 + 13)

  const shade = (c: RGB, mul: number, alpha = 1): string => {
    const r = Math.max(0, Math.min(255, Math.round(c[0] * mul)))
    const g = Math.max(0, Math.min(255, Math.round(c[1] * mul)))
    const b = Math.max(0, Math.min(255, Math.round(c[2] * mul)))
    return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`
  }
  const box = (x: number, y: number, w: number, h: number, color: string): void => {
    ctx.fillStyle = color
    ctx.fillRect(cx + x * scale, cy + y * scale, w * scale, h * scale)
  }
  const px = (x: number, y: number, color: string): void => box(x, y, 1, 1, color)

  switch (tile) {
    case Tile.Torch: {
      // Non-solid, so the transparent margin is what makes it look *placed*
      // rather than filling its cell.
      box(7, 9, 2, 6, shade([74, 50, 28], 1))
      box(6, 8, 4, 1, shade([116, 80, 42], 1))
      px(7, 5, shade([255, 236, 176], 1))
      px(8, 5, shade([255, 236, 176], 1))
      box(7, 4, 2, 1, shade([255, 202, 104], 1))
      box(6, 6, 4, 2, shade([246, 148, 52], 1))
      px(6, 7, shade([255, 190, 90], 1))
      px(9, 7, shade([255, 190, 90], 1))
      break
    }

    case Tile.Water:
    case Tile.Lava: {
      const base = def.color
      box(0, 0, TILE, TILE, shade(base, 0.74))
      // Horizontal wave banding: reads as a surface without an animation.
      for (let i = 0; i < 6; i++) {
        const y = 1 + Math.floor(rand() * (TILE - 2))
        const x = Math.floor(rand() * (TILE - 5))
        box(x, y, 3 + Math.floor(rand() * 3), 1, shade(base, 1.34))
      }
      if (!(mask & BIT_N)) {
        box(0, 0, TILE, 1, shade(base, 1.7))
        box(0, 1, TILE, 1, shade(base, 1.3))
      }
      px(2, TILE - 2, shade(base, 1.5))
      px(11, TILE - 3, shade(base, 1.5))
      break
    }

    case Tile.Glass: {
      // Glass is mostly alpha: the bake draws it over whatever is behind, and the
      // registry's low opacity lets that show through in the lightmap.
      ctx.fillStyle = shade(def.color, 1, 0.22)
      ctx.fillRect(cx, cy, cell, cell)
      box(0, 0, TILE, 1, shade(def.color, 1.5, 0.7))
      box(0, 1, TILE, 1, shade(def.color, 1.2, 0.5))
      box(0, TILE - 1, TILE, 1, shade(def.color, 0.7, 0.7))
      px(3, 4, shade([255, 255, 255], 1, 0.8))
      px(4, 5, shade([255, 255, 255], 1, 0.55))
      px(4, 4, shade([255, 255, 255], 1, 0.4))
      break
    }

    case Tile.Leaves: {
      const base = def.color
      const accents = def.accents ?? []
      // Clusters rather than uniform speckle, so the silhouette is ragged.
      for (let i = 0; i < 22; i++) {
        const x = Math.floor(rand() * (TILE - 3))
        const y = Math.floor(rand() * (TILE - 3))
        const pick = accents[Math.floor(rand() * accents.length)] ?? base
        const w = 2 + Math.floor(rand() * 2)
        box(x, y, w, 2, shade(pick, 0.9 + rand() * 0.32, 0.94))
      }
      // A few gaps, so the canopy lets some sky through.
      for (let i = 0; i < 3; i++) {
        const x = Math.floor(rand() * TILE)
        const y = Math.floor(rand() * TILE)
        ctx.clearRect(cx + x * scale, cy + y * scale, scale, scale)
      }
      break
    }

    case Tile.Wood: {
      const base = def.color
      box(0, 0, TILE, TILE, shade(base, 1))
      // Vertical bark: irregular stripes, darker in the gaps.
      for (let x = 0; x < TILE; x++) {
        const v = 0.74 + rand() * 0.52
        box(x, 0, 1, TILE, shade(base, v))
      }
      for (let i = 0; i < 4; i++) {
        const x = Math.floor(rand() * TILE)
        const y = Math.floor(rand() * (TILE - 4))
        box(x, y, 1, 2 + Math.floor(rand() * 3), shade(base, 0.6))
      }
      break
    }

    default: {
      const base = def.color
      const accents = def.accents ?? []

      // 1. base
      box(0, 0, TILE, TILE, shade(base, 1))

      // 2. speckles. 1–2 px so the grain survives at 1× and at 2×.
      const speckles = accents.length > 0 ? 30 : 0
      for (let i = 0; i < speckles; i++) {
        const x = Math.floor(rand() * (TILE - 2))
        const y = Math.floor(rand() * (TILE - 2))
        const w = 1 + Math.floor(rand() * 2)
        const h = 1 + Math.floor(rand() * 2)
        const pick = accents[Math.floor(rand() * accents.length)] ?? base
        box(x, y, w, h, shade(pick, 0.9 + rand() * 0.26))
      }

      // 2b. material detail, drawn before the edges so the edges cut it cleanly.
      if (def.key === 'copper' || def.key === 'iron' || def.key === 'silver' || def.key === 'gold') {
        const ore = def.accents?.[0] ?? base
        for (let i = 0; i < 4; i++) {
          const x = 2 + Math.floor(rand() * (TILE - 5))
          const y = 2 + Math.floor(rand() * (TILE - 5))
          const w = 2 + Math.floor(rand() * 3)
          box(x, y, w, w, shade(ore, 0.92 + rand() * 0.2))
          px(x, y, shade(ore, 1.35))
        }
      }
      if (tile === Tile.Gem) {
        for (let y = 3; y < TILE - 3; y++) {
          const t = 1 - Math.abs(y - TILE / 2) / (TILE / 2 - 3)
          const half = Math.max(1, Math.round(t * 4))
          box(TILE / 2 - half, y, half * 2, 1, shade(base, 0.85 + t * 0.4))
        }
        px(6, 5, shade([236, 226, 255], 1))
        px(9, 7, shade([255, 255, 255], 1))
      }
      if (tile === Tile.Brick) {
        // Two courses of brick, offset so the bond reads at 1×.
        box(0, 7, TILE, 1, shade(base, 0.6))
        box(7, 0, 1, 7, shade(base, 0.6))
        box(3, 8, 1, 8, shade(base, 0.6))
        box(12, 8, 1, 8, shade(base, 0.6))
      }
      if (tile === Tile.Plank) {
        box(0, 5, TILE, 1, shade(base, 0.66))
        box(0, 11, TILE, 1, shade(base, 0.66))
        box(5, 0, 1, 5, shade(base, 0.72))
        box(11, 6, 1, 5, shade(base, 0.72))
      }

      // 3. edges for every side with no neighbour.
      const edgeDark = shade(base, 0.6)
      const edgeLip = shade(base, 1.34)
      if (!(mask & BIT_N)) {
        box(0, 0, TILE, 1, edgeLip)
        box(0, 1, TILE, 2, shade(base, 0.78))
      }
      if (!(mask & BIT_S)) box(0, TILE - 2, TILE, 2, edgeDark)
      if (!(mask & BIT_W)) box(0, 0, 2, TILE, shade(base, 0.84))
      if (!(mask & BIT_E)) box(TILE - 2, 0, 2, TILE, shade(base, 0.7))

      // Inner corners: where two unconnected sides meet, deepen the corner so the
      // block reads as a cube rather than a cross.
      if (!(mask & BIT_N) && !(mask & BIT_W)) box(0, 0, 3, 3, shade(base, 0.7))
      if (!(mask & BIT_N) && !(mask & BIT_E)) box(TILE - 3, 0, 3, 3, shade(base, 0.66))
      if (!(mask & BIT_S) && !(mask & BIT_W)) box(0, TILE - 3, 3, 3, shade(base, 0.54))
      if (!(mask & BIT_S) && !(mask & BIT_E)) box(TILE - 3, TILE - 3, 3, 3, shade(base, 0.5))

      // 4. the surface treatment.
      if (tile === Tile.Grass && !(mask & BIT_N)) {
        // Grass is a living crust on soil, so the green only exists where the
        // tile is exposed to air. A grass tile with something above it is dirt.
        const greens: RGB[] = [
          [86, 148, 62],
          [64, 118, 48],
          [110, 172, 72],
          [48, 94, 44],
        ]
        box(0, 0, TILE, 1, shade(greens[2], 1.1))
        for (let x = 0; x < TILE; x++) {
          const pick = greens[Math.floor(rand() * greens.length)]
          box(x, 1, 1, 3, shade(pick, 1))
        }
        // Blades drooping into the tile below the crust.
        for (let i = 0; i < 6; i++) {
          const x = Math.floor(rand() * TILE)
          box(x, 4, 1, 1 + Math.floor(rand() * 2), shade(greens[0], 0.92))
        }
        // A bright rim on the very top pixel, which is what makes grass pop
        // against dirt at small sizes.
        box(0, 0, TILE, 1, shade([132, 196, 92], 1))
      }
    }
  }

  // Every cell gets a 1 px bottom shadow and right shadow when those sides are
  // exposed, so a column of blocks never reads as a flat wall. Liquid and torch
  // cells are excluded: they are drawn with their own margins.
  if (
    tile !== Tile.Torch &&
    tile !== Tile.Water &&
    tile !== Tile.Lava &&
    tile !== Tile.Leaves
  ) {
    const base = TILE_DEFS[tile].color
    if (!(mask & BIT_S)) box(0, TILE - 1, TILE, 1, shade(base, 0.46))
    if (!(mask & BIT_E)) box(TILE - 1, 0, 1, TILE, shade(base, 0.56))
  }
}

// ---------------------------------------------------------------------------
// The DOM side
// ---------------------------------------------------------------------------

let cachedAtlas: TileAtlas | null = null
let cachedUrl: string | null = null

function dataUrl(atlas: TileAtlas): string {
  if (cachedAtlas === atlas && cachedUrl) return cachedUrl
  cachedUrl = atlas.canvas.toDataURL('image/png')
  cachedAtlas = atlas
  return cachedUrl
}

/**
 * A DOM icon for a tile, cut straight out of the same atlas the canvas bakes from.
 *
 * This is the cheap half of the "one definition, two targets" story: the art is
 * shared, so the inventory and the world can never disagree about what a block
 * looks like. The other half — shared *widgets* — is `src/ui/widgets.ts`.
 *
 * The URL is cached because `toDataURL` on a 512×320 canvas is a real cost, and a
 * style object is rebuilt on every reactive flush.
 */
export function iconStyle(
  atlas: TileAtlas,
  item: number,
  cssSize: number
): Record<string, string> {
  const { columns, rows } = atlas
  const frame = itemFrame(item)
  const col = frame % columns
  const row = (frame / columns) | 0
  return {
    width: `${cssSize}px`,
    height: `${cssSize}px`,
    backgroundImage: `url(${dataUrl(atlas)})`,
    // Both axes are spelled out: `background-size` scales the *whole* sheet, so a
    // sheet that is not square in cells would be stretched by a single axis.
    backgroundSize: `${columns * cssSize}px ${rows * cssSize}px`,
    backgroundPosition: `${-col * cssSize}px ${-row * cssSize}px`,
    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated',
  }
}
