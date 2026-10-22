/**
 * The game's animations, composed into sheets the renderer can draw.
 *
 * `tools/export-anim.ts` decodes the DCC art and writes, per animation and
 * direction, one PNG in which **each layer of each frame is its own cell** — 8
 * layers × 8 frames is 64 cells — together with a manifest recording every cell's
 * size and anchor. That is the honest form of the data, and it is not what a
 * renderer wants: drawing a frame would mean eight blits with eight anchors.
 *
 * So this composes each animation into the shape the rest of the app already
 * uses: **one uniform grid, one cell per (direction, frame)**, every cell the
 * animation's bounding box, the unit's anchor at the same point in every cell.
 * The result is a `SpriteSheet` — the same interface `sprites.ts` has always
 * produced — so an animation drops into the existing actor pool with nothing else
 * changed, and drawing a frame is one `drawImage`.
 *
 * ## The anchor
 *
 * A cell's manifest entry is `[width, height, offsetX, offsetY]` and the manifest
 * states the convention: `offsetY` is the frame's **bottom row**, as DC6 and DCC
 * store it. So a layer's top-left sits at `(offsetX, offsetY - height)` relative
 * to the unit's anchor, and the box that has to hold every layer of every frame is
 * the union of those. The composed cell is that union plus one pixel of margin,
 * and `anchorX`/`anchorY` record where inside the cell the unit's origin falls, so
 * a caller places the sprite at `(x - anchorX, y - anchorY)`.
 *
 * The anchor is deliberately computed once for the whole animation rather than per
 * frame: a per-frame anchor would make the character jitter as frames change, which
 * is exactly what the offsets exist to prevent.
 *
 * ## Row order and draw order
 *
 * The rows are taken as they come: the composition draws a band top row first, and the
 * sheet is upright because the decoders return their frames that way. That direction is
 * not a property of this file and was got wrong once for both formats at the same time
 * — see `dc6.ts`'s "Row order" section, which records what settled it (the classic
 * `.dc6` icons against the Resurrected `.sprite` art of the same items) and why the
 * cross-format argument this repository used to rely on could not have caught it.
 *
 * The z-order comes from the manifest's `drawOrder`/`layerOrders`. A row of that table
 * is honoured only when it is a complete permutation of the layer indices, which is
 * what the manifest's own note says it holds. A row that is not is a manifest written
 * by the exporter before it translated COF slot ids into indices — `chars/am/nu/hth`
 * lists 8 and 9 for 8 layers — and reading one of those as positions drops the layers
 * its out-of-range ids name, which is how a hero came to be drawn without a head. Such
 * a row is discarded whole and the layers are painted in the order the plan lists them,
 * with a warning, so a stale export degrades in z-order rather than in anatomy.
 *
 * ## Verification
 *
 * `tools/verify-anim-compose.ts` re-runs the composition and checks, per animation: that
 * every cell is the same size, that no layer was clipped (a layer whose box leaves the
 * cell is a composition bug, not art), and — from the sheets' own pixels — that every
 * band holds the art its cell declares, edge to edge. That last check is the one that
 * catches a band written to the wrong place; the anchor row is *not* assumed to be
 * under the figure's feet, because in this art it is not (the lowest opaque row ranges
 * from 146 px below the anchor to 146 px above it).
 */

import type { SpriteSheet } from '../sprites'

/** One cell's art within a direction's sheet: `[width, height, offsetX, offsetY]`. */
export type AnimCell = readonly [number, number, number, number] | null

export interface AnimColumn {
  readonly x: number
  readonly width: number
}

export interface AnimRow {
  readonly y: number
  readonly height: number
}

export interface AnimDirection {
  /** The stored direction this one was taken from, for a subsampled animation. */
  readonly source: number
  /** The sheet, relative to the export root. */
  readonly sheet: string
  readonly width: number
  readonly height: number
  readonly frames: number
  /**
   * How many frames one band of columns holds.
   *
   * The sheet is a grid of **frames across and layers down**, so a column is a
   * frame slot (`frame % columnsPerBand` plus `band * columnsPerBand`) and a row is
   * a layer (`band * layers.length + layer`). `columns` and `rows` carry each
   * column's and row's extent, and `cells[frame][layer]` gives the art's own size
   * and anchor inside that cell.
   */
  readonly columnsPerBand: number
  /** Bands of rows, `layers.length` rows each. */
  readonly bands: number
  readonly columns: readonly AnimColumn[]
  readonly rows: readonly AnimRow[]
  /** `cells[frame][layer]`, parallel to the animation's `layers`. */
  readonly cells: readonly (readonly AnimCell[])[]
  /** Per frame, an index into the animation's `layerOrders`. */
  readonly drawOrder: readonly number[]
}

export interface AnimLayer {
  readonly slot: string
  readonly name: string
  readonly file: string
  readonly kind: string
}

export interface AnimEntry {
  /** `char`, `monster`, `missile` or `overlay`. */
  readonly kind: string
  readonly cof?: string
  readonly frames: number
  readonly storedDirections: number
  readonly layers?: readonly AnimLayer[]
  readonly layerOrders?: readonly (readonly number[])[]
  readonly directions: readonly AnimDirection[]
}

export interface AnimIndex {
  readonly palette: string
  /** How many directions the game plays; the export subsampled to this. */
  readonly playedDirections: number
  readonly directionRule: string
  readonly animations: Readonly<Record<string, AnimEntry>>
}

/** A composed animation: a uniform sheet plus the geometry to place it. */
export interface ComposedAnimation {
  /** The sheet, in the shape the actor pool already expects. */
  readonly sheet: SpriteSheet
  /** Cells across: `directions * frames`. */
  readonly columns: number
  readonly directions: number
  readonly frames: number
  /** Where the unit's origin falls inside a cell. */
  readonly anchorX: number
  readonly anchorY: number
  /** The frame index for a direction and animation frame. */
  frameIndex(direction: number, frame: number): number
}

/** Loads the manifest. Returns null when the export is absent. */
export async function loadAnimIndex(base: string): Promise<AnimIndex | null> {
  try {
    const response = await fetch(`${base}original/anim/index.json`, { cache: 'no-store' })
    if (!response.ok) return null
    return (await response.json()) as AnimIndex
  } catch {
    return null
  }
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = url
  })
}

/** The bounding box every cell of an animation needs, in cell pixels. */
export function boundsOf(entry: AnimEntry): {
  left: number
  top: number
  right: number
  bottom: number
} {
  let left = 0
  let top = 0
  let right = 1
  let bottom = 1
  for (const direction of entry.directions) {
    for (const frame of direction.cells) {
      for (const cell of frame) {
        if (cell === null) continue
        const [width, height, offsetX, offsetY] = cell
        // `offsetX`/`offsetY` are where the layer sits relative to the frame's
        // anchor, and `offsetY` is the frame's **bottom** row, so the layer's top
        // row is `offsetY - height`. The union of those boxes is what a cell has
        // to hold.
        const cellLeft = offsetX
        const cellTop = offsetY - height
        left = Math.min(left, cellLeft)
        top = Math.min(top, cellTop)
        right = Math.max(right, cellLeft + width)
        bottom = Math.max(bottom, cellTop + height)
      }
    }
  }
  return { left, top, right, bottom }
}

/**
 * Whether a manifest draw order is a complete permutation of `0..count-1`.
 *
 * The manifest's note says its rows hold indices into `layers`, so a row that is
 * not a permutation cannot be read as one at all — it is the older exporter's COF
 * slot ids. The two readings disagree about which layers get drawn, so the check
 * is exact rather than a filter (see `composeAnimation`).
 */
function isPermutation(row: readonly number[], count: number): boolean {
  if (row.length !== count) return false
  const seen = new Uint8Array(count)
  for (const value of row) {
    if (!Number.isInteger(value) || value < 0 || value >= count || seen[value] === 1) return false
    seen[value] = 1
  }
  return true
}

/** Animation keys already reported as carrying a draw order from the older exporter. */
const staleOrdersReported = new Set<string>()

/**
 * Reports a draw order the exporter wrote as COF slot ids, once per animation.
 *
 * The fallback it triggers is safe, so this is a warning and not an error — but it
 * is not silent: an export not rebuilt since `flattenOrders` gained the slot-id
 * translation loses its per-frame z-order, and this line is the only sign of it.
 */
function reportStaleOrder(entry: AnimEntry): void {
  const key = entry.cof ?? entry.directions[0]?.sheet ?? 'anon'
  if (staleOrdersReported.has(key) || staleOrdersReported.size >= 8) return
  staleOrdersReported.add(key)
  console.warn(
    `rasen: ${key} carries a draw order of COF slot ids rather than layer indices — ` +
      'the manifest was written by an older exporter; its layers are painted in array order',
  )
}

/**
 * Composes one animation into a uniform sheet.
 *
 * Every direction is stacked left to right, so the frame index is
 * `direction * frames + frame` — the same shape `spriteFrame` has always had.
 * Returns null when the animation is unknown or its first sheet will not load,
 * which is what a partial export looks like.
 */
export async function composeAnimation(
  base: string,
  entry: AnimEntry,
  bounds?: { left: number; top: number; right: number; bottom: number },
): Promise<ComposedAnimation | null> {
  const directions = entry.directions.length
  if (directions === 0 || entry.frames === 0) return null

  const box = bounds ?? boundsOf(entry)
  // One pixel of margin on each side, so a frame that exactly fills the box does
  // not lose its last row to rounding when the cell is scaled.
  const cellWidth = Math.ceil(box.right - box.left) + 2
  const cellHeight = Math.ceil(box.bottom - box.top) + 2
  const anchorX = -box.left + 1
  const anchorY = -box.top + 1

  const canvas = document.createElement('canvas')
  canvas.width = cellWidth * directions * entry.frames
  canvas.height = cellHeight
  const context = canvas.getContext('2d')
  if (!context) return null
  context.imageSmoothingEnabled = false

  const images = new Map<string, HTMLImageElement | null>()
  await Promise.all(
    entry.directions.map(async (direction) => {
      images.set(direction.sheet, await loadImage(`${base}original/anim/${direction.sheet}`))
    }),
  )

  for (let d = 0; d < directions; d += 1) {
    const direction = entry.directions[d]
    const image = images.get(direction.sheet) ?? null
    if (image === null) continue
    for (let f = 0; f < direction.frames; f += 1) {
      const cellX = (d * entry.frames + f) * cellWidth
      const frame = direction.cells[f]
      if (frame === undefined) continue
      // The sheet is frames across and layers down: column = frame slot, row =
      // layer, with `layers.length` rows per band. Getting these the wrong way
      // round draws every layer into the first row and the sheet comes out blank.
      const layerCount = entry.layers?.length ?? 1
      const band = Math.floor(f / direction.columnsPerBand)
      const column = direction.columns[f % direction.columnsPerBand]
      if (column === undefined) continue
      // `drawOrder` indexes `layerOrders`, and the manifest's own note says a row
      // holds *indices* into `layers`, back to front. A row satisfying that is a
      // permutation of `0..layerCount-1` and is honoured.
      //
      // A row that is not is a manifest written by the exporter as it was before
      // that translation existed, and holds COF *slot ids*: `chars/am/nu/hth`
      // lists `[2,3,8,1,4,0,9,7]` for 8 layers and `chars/ba/nu/hth` 8 and 9 as
      // well. Reading such a row as positions and keeping the values that happen
      // to be in range draws some layers twice and *drops* the ones the
      // out-of-range ids name — for `am/nu/hth` that is `hd` and `s2`, so the
      // hero is painted without a head — while an empty result falls back, which
      // is how the case went unnoticed. So a row that is not a permutation is
      // discarded whole and every layer is painted in the order the plan lists
      // them, which for a character is its COF's draw order for the first frame.
      // The cost is the z-order of the frames whose COF order differs from that
      // one; the alternative cost is a missing head, which is the larger error.
      const orderRow = entry.layerOrders?.[direction.drawOrder[f] ?? 0]
      const ordered = orderRow !== undefined && isPermutation(orderRow, layerCount)
      if (orderRow !== undefined && !ordered) reportStaleOrder(entry)
      const order = ordered && orderRow !== undefined ? orderRow : frame.map((_, index) => index)
      for (const layerIndex of order) {
        const layer = frame[layerIndex]
        if (layer === undefined || layer === null) continue
        const [width, height, offsetX, offsetY] = layer
        const row = direction.rows[band * layerCount + layerIndex]
        if (row === undefined) continue
        // `offsetY` is the frame's bottom row, so the layer's top row is
        // `offsetY - height`. The destination is the cell origin plus the anchor
        // plus that; adding the canvas height here was the bug that drew every
        // layer below the sheet.
        context.drawImage(
          image,
          column.x,
          row.y,
          Math.min(width, column.width),
          Math.min(height, row.height),
          cellX + anchorX + offsetX,
          anchorY + offsetY - height,
          width,
          height,
        )
      }
    }
  }

  const columns = directions * entry.frames
  return {
    sheet: { image: canvas, frameWidth: cellWidth, frameHeight: cellHeight, columns, rows: 1 },
    columns,
    directions,
    frames: entry.frames,
    anchorX,
    anchorY,
    frameIndex: (direction: number, frame: number): number => {
      const d = ((direction % directions) + directions) % directions
      return d * entry.frames + Math.min(Math.max(0, frame), entry.frames - 1)
    },
  }
}

/**
 * The animation keys a tree offers for one actor.
 *
 * `chars/ba/nu/hth` is a class's animation, `monsters/0a/a1/1hs` a monster's, and
 * the missile and overlay trees are flat (`missiles/arrow`). The caller knows
 * which shape it wants, so this only offers the lookup rather than guessing.
 */
export function animationKeyFor(tree: string, parts: readonly string[]): string {
  return [tree, ...parts].join('/')
}
