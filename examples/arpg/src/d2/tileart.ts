/**
 * Real DT1 tile art: the game's own isometric pictures.
 *
 * A DT1 block is not one image. Its picture is assembled from sub-tiles, each a
 * 32-pixel wide slice of the tile, and the whole thing is coloured through the
 * game's 256-entry palette. That is why a tile cannot be drawn by "one texture
 * per cell": the shape of a floor, its corners and its transitions are all
 * baked into the sub-tile arrangement.
 *
 * ## The sub-tile box, as measured
 *
 * A sub-tile is **32 pixels wide** and its height is set by its format:
 *
 * | format | encoding | box | used by |
 * |---|---|---|---|
 * | `0x0001` | 256 bytes, uncompressed | 32x15 isometric diamond | floors, roofs |
 * | `0x2005` | run-length | 32x15 isometric diamond | floors, roofs |
 * | `0x1001` | run-length | 32x32 | walls, trees, cliffs |
 *
 * The diamond is the 2:1 shape one cell is made of, drawn as 15 pixel rows that
 * start inset and widen to a full 32 (see {@link DIAMOND_ROW_WIDTH}); the rows
 * sum to exactly 256, which is why the uncompressed variant is that length. The
 * run-length formats are a stream of `(skip, count)` pairs with a `(0, 0)` pair
 * ending a row, and on a diamond sub-tile those pairs are exactly the row insets
 * and widths above, so the two encodings hold the same picture.
 *
 * Every payload in the exported tilesets decodes this way: 30,051 format-1
 * payloads consume their bytes exactly, and 23,237 run-length payloads spell 15
 * rows (the diamonds) or 32 rows (the walls). `tools/verify-world.ts` re-runs the
 * geometry half of that check against the exported tree.
 *
 * ## Where a block's picture goes
 *
 * The sub-tile positions are the picture's own frame, and for a floor that frame
 * is the cell: all 1,241 floor blocks place art over `x 0..sizeX-1` and
 * `y 0..78`, i.e. exactly one 160x80 cell, starting at the frame origin. So the
 * picture's bottom-centre is the cell's bottom corner and there is nothing to
 * guess. Floors are what this renderer draws on the ground layer.
 *
 * The other two families are placed on their own layers, from the placement
 * rules the game's own loader states (`roof_y` and the three sub-tile origin
 * systems, reconstructed in the DT1 chapter of the format book):
 *
 * - **Walls** (`0x1001`, 32x32 sub-tiles on a 32-pixel grid) carry their
 *   position in `xPos`/`yPos` like everything else, on one of two vertical
 *   origins: upper walls (orientation 1–14) measure y upward from the tile
 *   frame's top edge (their rows are always negative), lower walls (orientation
 *   16+) measure y downward from 96 pixels below it (`y_pixel = y_pos + 96`).
 *   Both land in the same 160-wide tile frame the floors use.
 * - **Roofs** are the only blocks with a non-zero `roofY` (always 80): the
 *   game subtracts it from the tile's screen Y and draws roofs in a pass
 *   *above* the actors, so they are assembled per block and baked to their own
 *   bitmap (`WorldMap.roof`), not to the ground one.
 *
 * Index 0 is 0x00 in every retail palette and is treated as transparent: it is
 * the hole around a tile's silhouette.
 */

import type { Dt1Block, Dt1SubTile } from './dt1'

/** Width of every sub-tile's box: one sub-cell is 32x16 on screen. */
export const SUB_TILE_WIDTH = 32
/** Height of a diamond sub-tile's box. */
export const SUB_TILE_HEIGHT = 15
/** Height of a wall sub-tile's box. */
export const WALL_SUB_TILE_HEIGHT = 32
/** Payload bytes of one uncompressed diamond sub-tile. */
export const DIAMOND_BYTES = 256

/**
 * Pixel rows of a diamond sub-tile, widest in the middle: a 2:1 diamond drawn
 * as 15 rows. The widths sum to {@link DIAMOND_BYTES}.
 */
export const DIAMOND_ROW_WIDTH: readonly number[] = [
  4, 8, 12, 16, 20, 24, 28, 32, 28, 24, 20, 16, 12, 8, 4,
]

/** Column each diamond row starts at, mirroring {@link DIAMOND_ROW_WIDTH}. */
export const DIAMOND_ROW_INSET: readonly number[] = [
  14, 12, 10, 8, 6, 4, 2, 0, 2, 4, 6, 8, 10, 12, 14,
]

/** Uncompressed isometric diamond. */
export const DT1_FORMAT_DIAMOND = 0x0001
/** Run-length encoded isometric diamond. */
export const DT1_FORMAT_DIAMOND_RLE = 0x2005
/** Run-length encoded wall panel. */
export const DT1_FORMAT_WALL = 0x1001

/** A 256-entry RGB palette, as the game stores it. */
export interface Palette {
  /** RGB triples, `r,g,b` per entry. */
  readonly rgb: Uint8Array
}

export function parsePalette(bytes: Uint8Array): Palette {
  if (bytes.length < 768) throw new Error('palette: expected at least 768 bytes (256 RGB triples)')
  return { rgb: bytes.subarray(0, 768) }
}

/** One assembled tile picture. */
export interface TileBitmap {
  width: number
  height: number
  /** RGBA bytes, `width * height * 4`. */
  rgba: Uint8Array
  /**
   * The art's top-left corner in the 160x80 TILE FRAME (y down from the
   * frame's top edge). Floors crop to their diamond; walls rise above the
   * frame (negative) or hang below it, so the caller anchors by this — not by
   * the art's own bounding box, which would move a wall.
   */
  frameX: number
  frameY: number
}

/** A sub-tile together with the box its format implies. */
export interface PlacedSubTile {
  subTile: Dt1SubTile
  width: number
  height: number
}

/** Sub-tile boxes this renderer places, by format. */
const SUB_TILE_BOXES: ReadonlyMap<number, { width: number; height: number }> = new Map([
  [DT1_FORMAT_DIAMOND, { width: SUB_TILE_WIDTH, height: SUB_TILE_HEIGHT }],
  [DT1_FORMAT_DIAMOND_RLE, { width: SUB_TILE_WIDTH, height: SUB_TILE_HEIGHT }],
  [DT1_FORMAT_WALL, { width: SUB_TILE_WIDTH, height: WALL_SUB_TILE_HEIGHT }],
])

/** Which pass a block's picture belongs to: under the actors or above them. */
export type BlockLayer = 'ground' | 'roof'

/**
 * The vertical origin a sub-tile's `yPos` measures from, per the game's own
 * loader (the `y_add` of the three coordinate systems).
 *
 * Walls — orientations 1..14 — measure from 96 pixels BELOW the frame's top
 * edge. Every wall sub-tile in the shipped tile tree has a NEGATIVE `yPos`
 * (-32 .. -576 over 20,298 sub-tiles), so without the shift the whole wall,
 * railings included, is drawn above its own tile instead of standing on it.
 * Floors (0), the pillar/shadow block (15) and roofs (16..19) measure from the
 * top edge itself.
 */
export function subTileFrameY(subTile: Dt1SubTile, orientation: number): number {
  return orientation >= 1 && orientation <= 14 ? subTile.yPos + 96 : subTile.yPos
}

/** Which pass a block's picture draws in: roofs above the actors, the rest below. */
export function blockLayer(block: Dt1Block): BlockLayer {
  return block.roofY !== 0 ? 'roof' : 'ground'
}

/** The box a sub-tile of this format occupies, or `null` when it is not placed. */
export function subTileBox(format: number): { width: number; height: number } | null {
  return SUB_TILE_BOXES.get(format) ?? null
}

/** The sub-tiles of a block this renderer can place, with their boxes. */
export function placeableSubTiles(block: Dt1Block): PlacedSubTile[] {
  const out: PlacedSubTile[] = []
  for (const subTile of block.subTiles) {
    const box = subTileBox(subTile.format)
    if (box) out.push({ subTile, width: box.width, height: box.height })
  }
  return out
}

/**
 * Whether a block has picture art for the ground layer (floors and walls; the
 * roof layer is `blockLayer(block) === 'roof'`).
 */
export function isGroundBlock(block: Dt1Block): boolean {
  return blockLayer(block) === 'ground' && placeableSubTiles(block).length > 0
}

/**
 * Is this block a WALL — the art that has to be drawn OVER the actor?
 *
 * Orientations 1..14 are the wall family (`subTileFrameY`), and retail draws
 * them after the characters: a wall nearer the camera hides what is behind it.
 * The bake therefore splits a cell into its floor picture (drawn under the
 * actors) and its wall picture (drawn over them, under the roofs).
 */
export function isWallBlock(block: Dt1Block): boolean {
  return block.orientation >= 1 && block.orientation <= 14
}

/** Writes one palette index into the picture, skipping the transparent hole. */
function put(rgba: Uint8Array, width: number, x: number, y: number, index: number, palette: Palette): boolean {
  if (index === 0) return false
  const at = (y * width + x) * 4
  rgba[at] = palette.rgb[index * 3]
  rgba[at + 1] = palette.rgb[index * 3 + 1]
  rgba[at + 2] = palette.rgb[index * 3 + 2]
  rgba[at + 3] = 255
  return true
}

/**
 * Paint one uncompressed diamond sub-tile.
 *
 * The payload is the diamond row by row with no transparency markers inside it:
 * the shape is carried by {@link DIAMOND_ROW_WIDTH}, not by the data.
 */
function paintDiamond(
  rgba: Uint8Array,
  pictureWidth: number,
  originX: number,
  originY: number,
  data: Uint8Array,
  palette: Palette,
): boolean {
  let painted = false
  let cursor = 0
  for (let row = 0; row < DIAMOND_ROW_WIDTH.length; row++) {
    const rowWidth = DIAMOND_ROW_WIDTH[row]
    const inset = DIAMOND_ROW_INSET[row]
    for (let i = 0; i < rowWidth && cursor < data.length; i++) {
      const index = data[cursor]
      cursor++
      if (index === 0) continue
      const x = originX + inset + i
      if (x < 0 || x >= pictureWidth) continue
      if (put(rgba, pictureWidth, x, originY + row, index, palette)) painted = true
    }
  }
  return painted
}

/**
 * Paint one run-length encoded sub-tile.
 *
 * The stream is `(skip, count)` pairs: `skip` transparent pixels, then `count`
 * palette indices. A `(0, 0)` pair ends the row and starts the next one. The
 * payload ends the picture, so a diamond's 15 rows and a wall's 32 need no
 * separate count.
 */
function paintRle(
  rgba: Uint8Array,
  pictureWidth: number,
  originX: number,
  originY: number,
  data: Uint8Array,
  palette: Palette,
  maxRows: number,
): boolean {
  let painted = false
  let cursor = 0
  let x = 0
  let y = 0
  while (cursor + 1 < data.length && y < maxRows) {
    const skip = data[cursor]
    const count = data[cursor + 1]
    cursor += 2
    if (skip === 0 && count === 0) {
      x = 0
      y++
      continue
    }
    x += skip
    for (let i = 0; i < count && cursor < data.length; i++) {
      const index = data[cursor]
      cursor++
      const px = originX + x + i
      const py = originY + y
      if (px < 0 || px >= pictureWidth || py < 0) continue
      if (put(rgba, pictureWidth, px, py, index, palette)) painted = true
    }
    x += count
  }
  return painted
}

/**
 * Assemble a block's picture.
 *
 * Sub-tiles are drawn in file order, which is back to front: a DT1 stores them
 * so that later ones overpaint earlier ones. Composing in the same order is what
 * makes a later slice of a floor cover an earlier one.
 *
 * The bitmap is the bounding box of the placed sub-tiles with its origin kept
 * in tile-frame coordinates ({@link TileBitmap.frameX}), so a wall that rises
 * above the frame lands where the game puts it instead of where its own
 * bounding box would.
 *
 * @param layer which pass to assemble: the ground pass (floors + walls) or the
 *              roof pass the game draws above the actors.
 * @returns the bitmap, or `null` for a block with nothing to draw on that
 *          layer: the other layer's art, a pure collision footprint, or a
 *          placeholder tile.
 */
export function assembleTile(
  block: Dt1Block,
  palette: Palette,
  /** The `.dt1` the block came from, for the sub-tile pixel bytes. */
  fileBytes: Uint8Array,
  layer: BlockLayer = 'ground',
): TileBitmap | null {
  if (blockLayer(block) !== layer) return null
  const parts = placeableSubTiles(block)
  const yOf = (subTile: Dt1SubTile): number => subTileFrameY(subTile, block.orientation)

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const { subTile, width, height } of parts) {
    minX = Math.min(minX, subTile.xPos)
    minY = Math.min(minY, yOf(subTile))
    maxX = Math.max(maxX, subTile.xPos + width)
    maxY = Math.max(maxY, yOf(subTile) + height)
  }
  const width = maxX - minX
  const height = maxY - minY
  if (width <= 0 || height <= 0) return null

  const rgba = new Uint8Array(width * height * 4)
  let painted = false

  for (const { subTile, height: boxHeight } of parts) {
    const data = fileBytes.subarray(subTile.dataPtr, subTile.dataPtr + subTile.length)
    if (data.length === 0) continue
    const originX = subTile.xPos - minX
    const originY = yOf(subTile) - minY

    if (subTile.format === DT1_FORMAT_DIAMOND) {
      if (data.length < DIAMOND_BYTES) continue
      if (paintDiamond(rgba, width, originX, originY, data, palette)) painted = true
      continue
    }
    if (subTile.format === DT1_FORMAT_DIAMOND_RLE || subTile.format === DT1_FORMAT_WALL) {
      // The wall panels are the same (skip, count) RLE over 32 rows instead of
      // 15 — `paintRle` takes the row count.
      if (paintRle(rgba, width, originX, originY, data, palette, boxHeight)) painted = true
    }
    // Other formats are neither placed nor guessed at.
  }

  return painted ? { width, height, rgba, frameX: minX, frameY: minY } : null
}

/**
 * Colourise a tile bitmap onto a canvas, so it can be handed to `drawImage`.
 *
 * The canvas API is the only image source the renderer accepts, and going
 * through it also lets the browser do the scaling.
 */
export function bitmapToCanvas(bitmap: TileBitmap): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('tileart: no 2D context available')
  ctx.putImageData(new ImageData(new Uint8ClampedArray(bitmap.rgba), bitmap.width, bitmap.height), 0, 0)
  return canvas
}
