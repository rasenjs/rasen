/**
 * The sprite atlases the layouts name, decoded and ready to draw — HD `SpA1` art and,
 * where a name has no HD file, the classic indexed `.dc6` the package still ships.
 *
 * A widget names its art as a package path with no extension, e.g.
 * `PANEL/HUD_02/front_panel`, and the file behind it is a sheet holding a grid of
 * frames. This module owns the name → file rule (one implementation, so the exporter
 * and the renderer cannot drift apart) and a loader that turns the decoded pixels into
 * something a canvas or a `background-image` can draw.
 *
 * Resolution tries four things in order, and the order is the whole design:
 *
 * 1. `hd/global/ui/<name>.sprite` — the HD art, which is what 509 of the layouts' 633
 *    art references get.
 * 2. `global/ui/<name>.dc6` — classic art at the same path. This is not a rarity: it
 *    answers 119 more references, every one of the layouts whose art Resurrected never
 *    re-drew in HD (the classic bank, trade and automap panels, and the quest icons the
 *    HD build keeps under `questicons/`). Without it, the classic half of the interface
 *    renders nothing.
 * 3. the exact name in `index.json`'s atlas map, which is the file the export chose.
 * 4. the lower-cased basename in that same map, and only when exactly one atlas carries
 *    it — `ui/index.json` is data this project generated, so the basename is an exact
 *    key rather than a guess. Two matches means ambiguity, which is reported and left
 *    alone; nothing here extends to prefixes or fuzzy matching.
 *
 * Everything degrades instead of failing. A partial export is the normal case: this
 * build names 5 art references it does not ship at all (`PANEL\Modals\Modal_Button`,
 * the `partygroupborder_%dslots` templates), and `frontend/hd/hdr_calibration.sprite` is
 * a version 50 sprite the HD decoder does not handle. A missing or undecodable file
 * resolves to `null` and the renderer falls back to its own art.
 */

import { parseDc6, frameToRgba, type Dc6Frame } from '../dc6'
import { parsePalette, type Palette } from '../tileart'
import { parseSprite, type Sprite } from '../../original/sprite'

/** The 256-entry palette every classic UI `.dc6` is indexed against. */
export const PALETTE_FILE = 'global/palette/act1/pal.dat'

/** The source rectangle of one frame inside the atlas, in texels. */
export interface UiAtlasFrame {
  sx: number
  sy: number
  sw: number
  sh: number
}

export interface UiAtlas {
  /** The name the layout used, as written (`PANEL/HUD_02/front_panel`). */
  readonly name: string
  /** Frames across. For classic art this is the layout's `frames / rows`, else `frames`. */
  readonly columns: number
  readonly rows: number
  /**
   * The largest cell in texels. Classic `.dc6` frames differ in size within one file
   * (the bank panel is 256x256, 64x256, 256x176 and 64x176), so `frame(index)` is the
   * authoritative rectangle and this is the bounding cell.
   */
  readonly frameWidth: number
  readonly frameHeight: number
  /** The whole sheet in texels, for `background-size`. */
  readonly width: number
  readonly height: number
  /** The sheet as a drawable source, for a 2D context. */
  readonly image: CanvasImageSource
  /**
   * The sheet as a PNG URL, for DOM `background-image` — an `ImageBitmap` cannot be
   * used there, and cropping happens with `background-position` + `background-size`.
   */
  readonly url: string
  /** The source rectangle of frame `index`, clamped into the range that exists. */
  frame(index: number): UiAtlasFrame
}

/**
 * The grid a widget states.
 *
 * `frames` is the *number of frames*, not the number of columns, and `rows` is how many
 * rows those frames are laid out in — so `columns = frames / rows`. Three layouts settle
 * it: `bankoriginallayout.json` says `frames: 4, rows: 2` and `panel/bank.dc6` holds four
 * frames whose sizes (256x256, 64x256, 256x176, 64x176) tile the layout's own `rect` of
 * 320x432 exactly as a 2x2 grid; `endscreenpanel.json` has two widgets on `MENU/EndGame`,
 * both `frames: 4, rows: 2`, the second with `frame: 4` to start at the fifth of the
 * file's eight frames, i.e. at its second 2x2 panel; and `blockingpanel.json` names
 * `FrontEnd\PopUpOKCancel` `frames: 2, rows: 1`, which is the two frames `popupokcancel.dc6`
 * holds (256x176 and 8x176 — a panel and its 8-texel border strip).
 *
 * A stated grid also wins over the header derivation below, which is how a widget that
 * wants the whole sheet as one picture — a nine-slice border, a background — asks for it:
 * `{ frames: 1, rows: 1 }`. Everything else is read as the horizontal strip its header
 * describes.
 */
export interface UiAtlasGrid {
  frames?: number
  rows?: number
}

export interface UiAtlasLoader {
  /** Resolves to `null` when the atlas is absent or does not decode. */
  load(name: string, options?: UiAtlasGrid): Promise<UiAtlas | null>
  /** Revokes every object URL this loader created; see the lifetime note on `load`. */
  dispose(): void
}

/**
 * The HD path of an atlas under a served `original/ui/` root — the export mirrors the
 * package, so this is also the path inside the game package.
 *
 * The rule is five steps on the layout's spelling, because the retail layouts are
 * inconsistent about it. All seven of these are real values:
 *
 *   `PANEL/HUD_02/front_panel`               → hd/global/ui/panel/hud_02/front_panel.sprite
 *   `PANEL\buysell`                          → hd/global/ui/panel/buysell.sprite
 *   `FrontEnd/HD/Final/FrontEnd_LeftPanel`   → hd/global/ui/frontend/hd/final/frontend_leftpanel.sprite
 *   `FrontEnd\HD\Final\FrontEnd_ButtonMed`   → hd/global/ui/frontend/hd/final/frontend_buttonmed.sprite
 *   `SplashScreen//splash_BlizzLogo`         → hd/global/ui/splashscreen/splash_blizzlogo.sprite
 *   `PANEL\Modals\Modal_Button`              → hd/global/ui/panel/modals/modal_button.sprite
 *   `PANEL/TooltipBorder/TooltipBorder`      → hd/global/ui/panel/tooltipborder/tooltipborder.sprite
 *
 * `\` → `/`, collapse repeated `/`, drop a leading `/`, lower-case, append
 * `.sprite`. The lower-casing is the package's own: `SpA1` art is stored lower-case
 * on disk while the layouts are authored case-insensitively.
 *
 * Total by construction: any string maps to a path, and a path that is not there — a
 * 404 on a static host, or the app's own `index.html` handed back by a dev server —
 * is reported as "no atlas" rather than as an exception. An empty or blank name maps
 * to the empty string, which means the same thing to the callers.
 */
export function atlasFileFor(name: string): string {
  const normalized = normalizeName(name)
  if (normalized === '') return ''
  return `hd/global/ui/${normalized}.sprite`
}

/**
 * The classic path of an atlas, tried when the HD path yields nothing.
 *
 * The classic tree uses the same five-step normalization and the same lower-case
 * spelling — `PANEL/TooltipBorder/TooltipBorder` and `PANEL\bank` are
 * `global/ui/panel/tooltipborder/tooltipborder.dc6` and `global/ui/panel/bank.dc6` —
 * which is why one normalization serves both. Total, like `atlasFileFor`.
 */
export function classicFileFor(name: string): string {
  const normalized = normalizeName(name)
  if (normalized === '') return ''
  return `global/ui/${normalized}.dc6`
}

/** The five steps `atlasFileFor` and `classicFileFor` share. */
function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+/, '')
    .toLowerCase()
}

/** `index.json` as the export writes it; every field but `atlases` is optional here. */
interface UiManifest {
  atlases?: Record<string, string>
}

/** Basenames of `index.json`'s atlas map, for the unambiguous-basename fallback. */
interface ManifestIndex {
  /** Normalized atlas name → package path of the file the export shipped. */
  byName: Map<string, string>
  /** Lower-cased basename → the paths that carry it, in map order. */
  byBasename: Map<string, string[]>
}

/** A decoded sheet, whichever decoder produced it. */
interface DecodedSheet {
  image: CanvasImageSource
  width: number
  height: number
  /** Authoritative per-frame rectangles; classic frames need not be uniform. */
  rects: UiAtlasFrame[]
  /** The largest cell, for `UiAtlas.frameWidth` / `frameHeight`. */
  cellWidth: number
  cellHeight: number
  columns: number
  rows: number
  url: string
  revoke: boolean
}

/**
 * The frame grid of an HD sheet.
 *
 * The layout wins when it states one and is used as stated: `columns = frames / rows`,
 * and a `frames` that `rows` does not divide is reported by `createAtlasLoader` rather
 * than rounded.
 *
 * With no stated grid the header's `frameWidth` is the only thing that says how many
 * frames a sheet holds, and it gives a *display* width, so it rarely divides the sheet
 * exactly. Requiring an exact division — which is what this did first — draws every
 * horizontal animation strip as one enormous frame, and the HUD is made of those strips:
 * measured on the exported files, `panel/hud_02/healthmanaanimation/healthidle/4k/globe_health_man_idle`
 * is 8096 texels wide with a header of 174 (47 frames of 172, drawn 5397 px wide as one
 * frame), and `panel/hud_02/quest_button` is 241 with a header of 60 (4 frames of 60,
 * drawn 161 px instead of 60).
 *
 * So the frame count is `round(width / frameWidth)` and the cell is
 * `floor(width / columns)`, which tiles the sheet with at most a few leftover texels —
 * the header is a rounded display width, which is exactly why 241 is 4 x 60 and 166 is
 * 4 x 41 for `panel/closebtn_4x`. The division is accepted when the implied cell is
 * within two texels of the header, or within a sixteenth of it for frames large enough
 * that two texels is noise:
 *
 *   healthidle/4k/globe_health_man_idle   8096 / 174 -> 47 cells of 172   off by 2
 *   hotpoint/frameset1/globe_hot_point    4692 /  87 -> 54 cells of  86   off by 1
 *   levelanimation/glow                   2948 / 265 -> 11 cells of 268   off by 3
 *   frontend_buttonmed                     960 / 235 ->  4 cells of 240   off by 5
 *   logoanimation/logoanimation           7992 / 292 -> 27 cells of 296   off by 4
 *
 * The relative slack is not decoration: at a flat two-texel rule 25 of this build's 212
 * implied divisions would be thrown away, `glow` and the four-frame `frontend_buttonmed`
 * among them. And it stays a guard, because the derivation can only ever be out by
 * `0.5 / columns` of a frame — 25% at two columns, 6.25% at eight — so a sheet whose
 * header is plainly unrelated to its pixels still falls back to one column.
 *
 * `frameWidth >= width` is one frame, which is what keeps
 * `panel/hud_02/experience_bar` (764 of 764) and the two near-square backgrounds
 * (`controller/panel/inventorypanel/v2/inventorybg`, 507 of 512) right, and it is also
 * the majority case: 294 of the 508 decodable sheets.
 *
 * One sheet is known to come out of this by a couple of pixels per frame and cannot
 * be resolved from the file: `panel/tooltipborder/tooltipborder` is 252 x 24 with a
 * header of 24, which is 10.5 frames. The header says 24, this divides by the rounded
 * count and gets 11 frames of 22, and the difference is the two pixels a frame that
 * the sheet's twelve spare columns are spread over. The nine-tile borders cut from it
 * (the tooltip and the message log) are therefore a fifth of a slice narrower than
 * the header asks for — a corner is 5 texels instead of 6 — and nothing in the layout
 * or the header says which reading the game uses. Written down rather than tuned:
 * widening the slack to accept it would move `controller/lobby/gamelist/
 * latencyindicator` (256 x 24, header 60) as well, which is a different, unrelated
 * mismatch.
 */
function hdGrid(
  sprite: Pick<Sprite, 'width' | 'height' | 'frameWidth'>,
  grid: UiAtlasGrid | undefined,
): { columns: number; rows: number } {
  const frames = grid?.frames && grid.frames > 0 ? Math.floor(grid.frames) : 0
  const rows = grid?.rows && grid.rows > 0 ? Math.floor(grid.rows) : 0
  if (frames > 0 && rows > 0) return { columns: Math.max(1, Math.round(frames / rows)), rows }
  if (frames > 0) return { columns: frames, rows: 1 }
  if (rows > 0) return { columns: 1, rows }
  const header = sprite.frameWidth
  if (header <= 0 || header >= sprite.width) return { columns: 1, rows: 1 }
  const columns = Math.max(1, Math.round(sprite.width / header))
  if (columns === 1) return { columns: 1, rows: 1 }
  const cell = Math.floor(sprite.width / columns)
  const slack = Math.max(2, Math.round(header / 16))
  return Math.abs(cell - header) <= slack ? { columns, rows: 1 } : { columns: 1, rows: 1 }
}

/** A canvas the current host can both draw on and encode. */
function createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }
  return new OffscreenCanvas(width, height)
}

/** Draws raw RGBA into a canvas rectangle. */
function paintRgba(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  rgba: Uint8Array,
  width: number,
  height: number,
  atX: number,
  atY: number,
): boolean {
  const context = canvas.getContext('2d') as CanvasRenderingContext2D | null
  if (!context) return false
  // `parseSprite` and `frameToRgba` both hand back exactly `width * height * 4` bytes, so
  // the view is the whole buffer and nothing is copied. The cast is type-level only:
  // neither decoder ever returns a `SharedArrayBuffer`.
  const pixels = new Uint8ClampedArray(rgba.buffer as ArrayBuffer, rgba.byteOffset, rgba.byteLength)
  context.putImageData(new ImageData(pixels, width, height), atX, atY)
  return true
}

/** PNG bytes for a canvas, or `null` where the host has no blob encoder. */
function toPngBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob | null> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/png' })
  if ('toBlob' in canvas) {
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
  }
  return Promise.resolve(null)
}

/**
 * A PNG URL for a canvas, preferring a blob object URL over a data URL.
 *
 * Object URLs keep 119 MiB of HD sheet pixels plus the classic sheets out of JavaScript
 * string memory and cost nothing to hand to CSS, so they are preferred; `toDataURL` is
 * the fallback for a host without `toBlob` (older WebKit). The `revoke` flag says which
 * one this is, because only an object URL has to be given back.
 */
async function encodeCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  name: string,
): Promise<{ url: string; revoke: boolean }> {
  const blob = await toPngBlob(canvas)
  if (blob) return { url: URL.createObjectURL(blob), revoke: true }
  if (typeof HTMLCanvasElement !== 'undefined' && canvas instanceof HTMLCanvasElement) {
    return { url: canvas.toDataURL('image/png'), revoke: false }
  }
  console.warn(`rasen: ui atlas ${name} has no PNG encoder, drawing it by name only`)
  return { url: '', revoke: false }
}

/**
 * The grid one HD sheet is cut into, and the cell that comes out of it.
 *
 * Exported because it is the whole of the answer to "how big is this widget": a
 * layout states a `filename` and nothing else, the widget is drawn at its art's own
 * size, and this is where that size is decided. A tool that measured a sheet its own
 * way would be measuring a different sprite than the app draws —
 * `tools/verify-ui-scale.ts` uses this for exactly that reason.
 */
export function measureSpriteGrid(
  sprite: Pick<Sprite, 'width' | 'height' | 'frameWidth'>,
  grid: UiAtlasGrid | undefined,
): { columns: number; rows: number; cellWidth: number; cellHeight: number } {
  const { columns, rows } = hdGrid(sprite, grid)
  return {
    columns,
    rows,
    cellWidth: Math.floor(sprite.width / columns),
    cellHeight: Math.floor(sprite.height / rows),
  }
}

/** One HD sheet: the pixels the header describes, cut into the grid the layout asks for. */
async function decodeSprite(
  bytes: Uint8Array,
  name: string,
  grid: UiAtlasGrid | undefined,
): Promise<DecodedSheet> {
  const sprite = parseSprite(bytes)
  const { columns, rows, cellWidth, cellHeight } = measureSpriteGrid(sprite, grid)
  if (grid && (grid.frames || grid.rows)) {
    const fit =
      (grid.frames ? sprite.width % columns === 0 : true) &&
      (grid.rows ? sprite.height % rows === 0 : true)
    if (!fit) {
      console.warn(
        `rasen: ui atlas ${name} is ${sprite.width}x${sprite.height} texels but the layout says ` +
          `${grid.frames ?? '?'} frames in ${grid.rows ?? 1} rows (${columns} columns), which does ` +
          'not divide it; the grid is used as stated',
      )
    }
  }
  const canvas = createCanvas(sprite.width, sprite.height)
  if (!paintRgba(canvas, sprite.rgba, sprite.width, sprite.height, 0, 0)) {
    throw new Error('sprite: no 2D context')
  }
  const rects: UiAtlasFrame[] = []
  for (let i = 0; i < columns * rows; i++) {
    rects.push({
      sx: (i % columns) * cellWidth,
      sy: Math.floor(i / columns) * cellHeight,
      sw: cellWidth,
      sh: cellHeight,
    })
  }
  const { url, revoke } = await encodeCanvas(canvas, name)
  return {
    image: canvas,
    width: sprite.width,
    height: sprite.height,
    rects,
    cellWidth,
    cellHeight,
    columns,
    rows,
    url,
    revoke,
  }
}

/**
 * One classic `.dc6`: direction 0's frames become the cells.
 *
 * A `.dc6` frame is its own bitmap with its own size — the four frames of `panel/bank.dc6`
 * are 256x256, 64x256, 256x176 and 64x176 — so the sheet is *composed*: frames are laid
 * out row-major into the grid, each column is as wide as the widest frame in it and each
 * row as tall as the tallest, and every frame is blitted at its cell's origin. For the
 * bank panel that composition is 320x432, which is exactly the `rect` the layout gives
 * the widget, and its 2x2 grid is the `frames: 4, rows: 2` the layout states.
 *
 * The column count comes from the layout when it states one (`frames / rows`) and from
 * the file otherwise (all frames in a single row); the rows are then however many rows
 * the file's frames need, so a file holding more than one panel still has every frame in
 * the sheet — `MENU/EndGame` holds eight, and `endscreenpanel.json`'s two widgets take
 * four each, the second starting at `frame: 4`. A layout that names a different number of
 * frames than the file holds is reported, and the file's frames are what get laid out.
 */
async function decodeClassic(
  bytes: Uint8Array,
  palette: Palette,
  name: string,
  grid: UiAtlasGrid | undefined,
): Promise<DecodedSheet | null> {
  const file = parseDc6(bytes)
  const frames: Dc6Frame[] = file.frames[0] ?? []
  if (frames.length === 0) {
    console.warn(`rasen: ui atlas ${name} is a .dc6 with no frames in direction 0`)
    return null
  }
  const statedFrames = grid?.frames && grid.frames > 0 ? Math.floor(grid.frames) : 0
  const statedRows = grid?.rows && grid.rows > 0 ? Math.floor(grid.rows) : 0
  if (statedFrames > 0 && statedRows > 0 && statedFrames % statedRows !== 0) {
    console.warn(
      `rasen: ui atlas ${name} says ${statedFrames} frames in ${statedRows} rows, which is not a ` +
        'whole number of columns; one row is used',
    )
  }
  const columns =
    statedFrames > 0 && statedRows > 0 && statedFrames % statedRows === 0
      ? statedFrames / statedRows
      : frames.length
  const rows = Math.ceil(frames.length / columns)
  if (statedFrames > 0 && statedFrames !== frames.length) {
    console.warn(
      `rasen: ui atlas ${name} says ${statedFrames} frames but the .dc6 holds ${frames.length} in ` +
        `direction 0; all ${frames.length} are laid out, so a widget starting at 'frame' beyond ` +
        `${statedFrames} still has cells`,
    )
  }
  const columnWidth = new Array<number>(columns).fill(0)
  const rowHeight = new Array<number>(rows).fill(0)
  frames.forEach((frame, i) => {
    const column = i % columns
    const row = Math.floor(i / columns)
    columnWidth[column] = Math.max(columnWidth[column], frame.width)
    rowHeight[row] = Math.max(rowHeight[row], frame.height)
  })
  const columnAt: number[] = []
  for (let column = 0, x = 0; column < columns; column++) {
    columnAt[column] = x
    x += columnWidth[column]
  }
  const rowAt: number[] = []
  for (let row = 0, y = 0; row < rows; row++) {
    rowAt[row] = y
    y += rowHeight[row]
  }
  const canvas = createCanvas(
    columnAt[columns - 1] + columnWidth[columns - 1],
    rowAt[rows - 1] + rowHeight[rows - 1],
  )
  const rects: UiAtlasFrame[] = []
  for (const [i, frame] of frames.entries()) {
    const sx = columnAt[i % columns]
    const sy = rowAt[Math.floor(i / columns)]
    if (!paintRgba(canvas, frameToRgba(frame, palette), frame.width, frame.height, sx, sy)) {
      throw new Error('dc6: no 2D context')
    }
    rects.push({ sx, sy, sw: frame.width, sh: frame.height })
  }
  const { url, revoke } = await encodeCanvas(canvas, name)
  return {
    image: canvas,
    width: columnAt[columns - 1] + columnWidth[columns - 1],
    height: rowAt[rows - 1] + rowHeight[rows - 1],
    rects,
    cellWidth: Math.max(...columnWidth),
    cellHeight: Math.max(...rowHeight),
    columns,
    rows,
    url,
    revoke,
  }
}

/**
 * A loader for one served `original/ui/` root.
 *
 * `base` is the URL prefix the app is served from and must end with `/`, so the fetch is
 * `${base}${atlasFileFor(name)}`; `createAtlasLoader('original/ui/')` therefore reads
 * `original/ui/hd/global/ui/panel/...` and `original/ui/global/ui/panel/...`, which is
 * the tree `tools/export-ui.ts` writes.
 *
 * Both the composed sheet and its URL are cached per (file, grid), and so is the
 * `UiAtlas` built from it. The grid has to be part of the key rather than the file alone:
 * a sheet's rectangles and its pixels-where-frames-begin depend on the grid, so two
 * widgets naming one file with different grids must not see each other's composition —
 * which is exactly the case a nine-slice border asking for `{ frames: 1, rows: 1 }`
 * falls into. The cost is a second canvas and a second PNG only when one file is really
 * asked for two grids.
 *
 * Object URLs are **kept for the lifetime of the page** and never revoked by the app.
 * Widgets hold them in `background-image`, and revoking one would blank a widget that is
 * still on screen; the memory is bounded by the export anyway. `dispose()` is for a host
 * that tears the UI down for good, which the example never does.
 */
export function createAtlasLoader(base: string): UiAtlasLoader {
  const sheets = new Map<string, Promise<DecodedSheet | null>>()
  const atlases = new Map<string, UiAtlas>()
  /** Identifies a grid, so a sheet's cache entry can be per (file, grid). */
  const gridKey = (grid: UiAtlasGrid | undefined): string =>
    `${grid?.frames ?? ''}x${grid?.rows ?? ''}`
  const revokers = new Set<string>()
  let manifest: Promise<ManifestIndex | null> | null = null
  let palette: Promise<Palette | null> | null = null

  /** `index.json`, read once; a tree without it simply has no fallback. */
  function readManifest(): Promise<ManifestIndex | null> {
    if (manifest) return manifest
    manifest = (async () => {
      try {
        const response = await fetch(`${base}index.json`, { cache: 'no-store' })
        if (!response.ok) throw new Error(`${response.status} for index.json`)
        const parsed = (await response.json()) as UiManifest
        const byName = new Map<string, string>()
        for (const [name, file] of Object.entries(parsed.atlases ?? {})) {
          if (typeof file === 'string') byName.set(normalizeName(name), file)
        }
        // A key's last segment is the file's basename, which is what makes the fallback
        // an exact lookup into data this project wrote rather than a guess.
        const byBasename = new Map<string, string[]>()
        for (const [name, file] of byName) {
          const basename = name.slice(name.lastIndexOf('/') + 1)
          byBasename.set(basename, [...(byBasename.get(basename) ?? []), file])
        }
        return { byName, byBasename }
      } catch (error) {
        console.warn('rasen: ui manifest unavailable, the basename fallback is off', String(error))
        return null
      }
    })()
    return manifest
  }

  /** The shared 256-entry palette, read once; classic art cannot decode without it. */
  function readPalette(): Promise<Palette | null> {
    if (palette) return palette
    palette = (async () => {
      try {
        const response = await fetch(`${base}${PALETTE_FILE}`, { cache: 'no-store' })
        if (!response.ok) throw new Error(`${response.status} for ${PALETTE_FILE}`)
        return parsePalette(new Uint8Array(await response.arrayBuffer()))
      } catch (error) {
        console.warn('rasen: ui palette missing, classic art cannot be decoded', String(error))
        return null
      }
    })()
    return palette
  }

  /** Fetches and decodes one package path, whichever kind of file it is. */
  function sheetFor(
    path: string,
    name: string,
    grid: UiAtlasGrid | undefined,
  ): Promise<DecodedSheet | null> {
    const key = `${path}|${gridKey(grid)}`
    const cached = sheets.get(key)
    if (cached) return cached
    const pending = (async () => {
      try {
        const response = await fetch(`${base}${path}`, { cache: 'no-store' })
        if (!response.ok) return null
        // A 200 is not proof the file is there: a dev server (and static hosts configured
        // for a single-page app) answer an unknown path with the app's own `index.html`.
        // Vite returns `content-type: text/html` for a file it does not have, and no
        // content type at all for one it does.
        if ((response.headers.get('content-type') ?? '').includes('text/html')) return null
        const bytes = new Uint8Array(await response.arrayBuffer())
        if (!path.toLowerCase().endsWith('.dc6')) return await decodeSprite(bytes, name, grid)
        const shared = await readPalette()
        if (!shared) return null
        return await decodeClassic(bytes, shared, name, grid)
      } catch (error) {
        // A file this build does not ship, or one neither decoder handles
        // (`hdr_calibration.sprite` is version 50), is a missing asset, not a broken page.
        console.warn(`rasen: ui atlas ${name} unavailable at ${path}`, String(error))
        return null
      }
    })()
    sheets.set(key, pending)
    return pending
  }

  /** The four-step resolution: HD path, classic path, manifest name, unique basename. */
  async function sheetForName(
    name: string,
    grid: UiAtlasGrid | undefined,
  ): Promise<{ sheet: DecodedSheet; path: string } | null> {
    const tried: string[] = []
    for (const path of [atlasFileFor(name), classicFileFor(name)]) {
      if (path === '') continue
      tried.push(path)
      const sheet = await sheetFor(path, name, grid)
      if (sheet) return { sheet, path }
    }
    const index = await readManifest()
    if (!index) return null
    const normalized = normalizeName(name)
    const exact = index.byName.get(normalized)
    if (exact && !tried.includes(exact)) {
      const sheet = await sheetFor(exact, name, grid)
      if (sheet) return { sheet, path: exact }
      tried.push(exact)
    }
    const basename = normalized.slice(normalized.lastIndexOf('/') + 1)
    const candidates = index.byBasename.get(basename) ?? []
    if (candidates.length === 1) {
      const sheet = await sheetFor(candidates[0], name, grid)
      if (sheet) return { sheet, path: candidates[0] }
    } else if (candidates.length > 1) {
      console.warn(
        `rasen: ui atlas ${name} is missing and its basename "${basename}" is ambiguous in ` +
          `index.json (${candidates.join(', ')}); refusing to pick one`,
      )
    }
    return null
  }

  return {
    async load(name: string, options?: UiAtlasGrid): Promise<UiAtlas | null> {
      if (normalizeName(name) === '') return null
      const resolved = await sheetForName(name, options)
      if (!resolved) return null
      const { sheet, path } = resolved
      const key = `${path}|${gridKey(options)}`
      const cached = atlases.get(key)
      if (cached) return cached
      const atlas: UiAtlas = {
        name,
        columns: sheet.columns,
        rows: sheet.rows,
        frameWidth: sheet.cellWidth,
        frameHeight: sheet.cellHeight,
        width: sheet.width,
        height: sheet.height,
        image: sheet.image,
        url: sheet.url,
        frame(index: number): UiAtlasFrame {
          // Clamped, never wrapped: an out-of-range frame must not read past the sheet.
          const i = Math.min(Math.max(Math.trunc(index) || 0, 0), sheet.rects.length - 1)
          return sheet.rects[i]
        },
      }
      if (sheet.revoke) revokers.add(sheet.url)
      atlases.set(key, atlas)
      return atlas
    },
    dispose(): void {
      for (const url of revokers) URL.revokeObjectURL(url)
      revokers.clear()
      sheets.clear()
      atlases.clear()
      manifest = null
      palette = null
    },
  }
}
