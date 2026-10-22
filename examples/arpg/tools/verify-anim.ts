/**
 * Checks the animation export against the game tree it came from.
 *
 * This is deliberately a second implementation of the export's contract: it
 * re-decodes the source `.dcc`/`.dc6`, re-derives the grid the manifest
 * describes, composites the frames itself and compares the result with the
 * PNG's own bytes after inflating it. Nothing about the export is taken on
 * trust, so a bug in `export-anim.ts` shows up as a mismatch rather than as a
 * number that agrees with itself.
 *
 * What it reports, per category, are true percentages — the count of animations
 * the tree holds against the count the manifest has — plus, per animation:
 *
 * - the sheet exists and its IHDR matches the manifest's size;
 * - the manifest's columns and rows are contiguous from the origin and their
 *   totals are the sheet, so the frame cells tile it with no gap and no overlap;
 * - every frame the manifest declares is inside its cell and its cell inside the
 *   sheet;
 * - every frame's own `width`, `height`, `offsetX` and `offsetY` is what the
 *   source file declares at the recorded stored direction;
 * - every pixel: the inflated sheet equals the composite the sources imply, so
 *   the padding is transparent and no frame is shifted, truncated or dropped;
 * - the accounting: the pixels the sheets hold against the pixels the sources
 *   declare, and the same against every *stored* direction, which is what the
 *   8-of-16 direction choice costs.
 *
 * Usage:
 *   tsx examples/arpg/tools/verify-anim.ts [<romfs dir>] [<anim dir>]
 *
 * Needs an extracted copy of the game and a directory `export-anim.ts` wrote;
 * neither is in the repository.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseDc6 } from '../src/d2/dc6'
import { parseDcc } from '../src/d2/dcc'
import { parsePalette } from '../src/d2/tileart'

/** One decoded frame, the shape both decoders produce. */
interface IndexedFrame {
  width: number
  height: number
  offsetX: number
  offsetY: number
  pixels: Uint8Array
  alpha: Uint8Array
}

/** A decoded sprite file. */
interface Sprite {
  kind: 'dcc' | 'dc6'
  /** `[stored direction][frame]`. */
  frames: IndexedFrame[][]
}

interface DirectionEntry {
  source: number
  sheet: string
  width: number
  height: number
  frames: number
  columnsPerBand: number
  bands: number
  columns: { x: number; width: number }[]
  rows: { y: number; height: number }[]
  drawOrder: number[]
  cells: (number[] | null)[][]
}

interface AnimationEntry {
  kind: 'char' | 'monster' | 'missile' | 'overlay'
  cof: string | null
  frames: number
  storedDirections: number
  layers: { slot: string | null; name: string | null; file: string | null; kind: string | null }[]
  layerOrders: number[][]
  directions: DirectionEntry[]
}

interface Manifest {
  palette: string
  playedDirections: number
  heroWeapons: Record<string, string>
  animations: Record<string, AnimationEntry>
}

const root = resolve(process.argv[2] ?? '/tmp/d2r-all')
const animDir = resolve(process.argv[3] ?? join(import.meta.dirname, '../public/original/anim'))

const failures: string[] = []
let checks = 0

function fail(where: string, message: string): void {
  failures.push(`${where}: ${message}`)
}

function check(where: string, condition: boolean, message: string): boolean {
  checks += 1
  if (!condition) fail(where, message)
  return condition
}

/** Every file below `dir`, as `/`-separated paths relative to it. */
function walkFiles(dir: string, out: string[] = [], prefix = ''): string[] {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) walkFiles(join(dir, entry.name), out, rel)
    else out.push(rel)
  }
  return out
}

function isSprite(file: string): boolean {
  const lower = file.toLowerCase()
  return lower.endsWith('.dcc') || lower.endsWith('.dc6')
}

/** Decodes one package-relative sprite. */
function decodeSprite(file: string): Sprite {
  const bytes = new Uint8Array(readFileSync(join(root, file)))
  const isDc6 = file.toLowerCase().endsWith('.dc6')
  const decoded = isDc6 ? parseDc6(bytes) : parseDcc(bytes)
  return { kind: isDc6 ? 'dc6' : 'dcc', frames: decoded.frames }
}

/** The column slot of a frame. */
function slotOf(frame: number, columnsPerBand: number): number {
  return frame % columnsPerBand
}

/** The sheet row of a frame's band and layer. */
function rowOf(frame: number, columnsPerBand: number, layerCount: number, layer: number): number {
  return Math.floor(frame / columnsPerBand) * layerCount + layer
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
  const stream = source.pipeThrough(
    new DecompressionStream('deflate') as unknown as TransformStream<Uint8Array, Uint8Array>,
  )
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

/** Reverses the PNG scanline filters, so the sheet's own pixels are available. */
function unfilter(raw: Uint8Array, width: number, height: number): Uint8Array | string {
  const bytesPerPixel = 4
  const stride = width * bytesPerPixel
  if (raw.length < (stride + 1) * height) {
    return `IDAT holds ${raw.length} bytes, ${(stride + 1) * height} expected for ${width}x${height}`
  }
  const out = new Uint8Array(stride * height)
  let at = 0
  for (let y = 0; y < height; y += 1) {
    const filter = raw[at]
    at += 1
    const to = y * stride
    for (let i = 0; i < stride; i += 1) {
      const a = i >= bytesPerPixel ? out[to + i - bytesPerPixel] : 0
      const b = y > 0 ? out[to - stride + i] : 0
      const c = y > 0 && i >= bytesPerPixel ? out[to - stride + i - bytesPerPixel] : 0
      const value = raw[at + i]
      switch (filter) {
        case 0:
          out[to + i] = value
          break
        case 1:
          out[to + i] = (value + a) & 0xff
          break
        case 2:
          out[to + i] = (value + b) & 0xff
          break
        case 3:
          out[to + i] = (value + ((a + b) >> 1)) & 0xff
          break
        case 4:
          out[to + i] = (value + paeth(a, b, c)) & 0xff
          break
        default:
          return `scanline ${y} uses filter ${filter}`
      }
    }
    at += stride
  }
  return out
}

interface Png {
  width: number
  height: number
  bitDepth: number
  colorType: number
  interlace: number
  rgba: Uint8Array
}

/** Parses and decodes a PNG well enough to check one against its manifest entry. */
async function decodePng(bytes: Uint8Array): Promise<Png | string> {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (bytes.length < 8 || signature.some((value, index) => bytes[index] !== value)) {
    return 'not a PNG (bad signature)'
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let at = 8
  let width = 0
  let height = 0
  let bitDepth = 8
  let colorType = 6
  let interlace = 0
  let seenHeader = false
  const idat: Uint8Array[] = []
  while (at + 12 <= bytes.length) {
    const length = view.getUint32(at)
    if (at + 12 + length > bytes.length) return `chunk at ${at} runs past the file`
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7])
    if (type === 'IHDR') {
      width = view.getUint32(at + 8)
      height = view.getUint32(at + 12)
      bitDepth = bytes[at + 16]
      colorType = bytes[at + 17]
      interlace = bytes[at + 20]
      seenHeader = true
    } else if (type === 'IDAT') {
      idat.push(bytes.subarray(at + 8, at + 8 + length))
    } else if (type === 'IEND') {
      break
    }
    at += 12 + length
  }
  if (!seenHeader) return 'no IHDR'
  const joined = new Uint8Array(idat.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of idat) {
    joined.set(part, offset)
    offset += part.length
  }
  const raw = await inflate(joined)
  const pixels = unfilter(raw, width, height)
  if (typeof pixels === 'string') return pixels
  return { width, height, bitDepth, colorType, interlace, rgba: pixels }
}

/** The exported direction subset `export-anim.ts` chooses, re-derived. */
function expectedDirections(stored: number, played: number): number[] {
  if (stored <= played) return Array.from({ length: stored }, (_, i) => i)
  const stride = Math.round(stored / played)
  const out: number[] = []
  for (let i = 0; i < stored && out.length < played; i += stride) out.push(i)
  return out
}

interface Totals {
  animations: number
  sheets: number
  sheetBytes: number
  /** Sheet pixels, summed from the manifest's own sizes. */
  sheetPixels: number
  /** Pixels that are a frame, summed from the source files. */
  framePixels: number
  /** The same frames in every stored direction. */
  storedPixels: number
  layers: number
  unresolvedLayers: number
}

function emptyTotals(): Totals {
  return {
    animations: 0,
    sheets: 0,
    sheetBytes: 0,
    sheetPixels: 0,
    framePixels: 0,
    storedPixels: 0,
    layers: 0,
    unresolvedLayers: 0,
  }
}

/**
 * Copies one source frame into the expected sheet at the cell's top left.
 *
 * The colourisation is repeated here rather than imported, so that the check
 * does not depend on the code path the export used to make the pixel it is
 * checking: a palette index is `palette[index * 3]` and the frame's `alpha` is
 * what decides whether a pixel exists at all.
 */
function blit(
  frame: IndexedFrame,
  palette: Uint8Array,
  out: Uint8Array,
  sheetWidth: number,
  x: number,
  y: number,
): void {
  for (let row = 0; row < frame.height; row += 1) {
    for (let column = 0; column < frame.width; column += 1) {
      const at = row * frame.width + column
      if (frame.alpha[at] === 0) continue
      const to = ((y + row) * sheetWidth + x + column) * 4
      if (to + 3 >= out.length) continue
      const source = frame.pixels[at] * 3
      out[to] = palette[source]
      out[to + 1] = palette[source + 1]
      out[to + 2] = palette[source + 2]
      out[to + 3] = 255
    }
  }
}

/** The first pixel at which two RGBA buffers differ, as `x,y`. */
function firstDifference(expected: Uint8Array, actual: Uint8Array, width: number): string | null {
  if (expected.length !== actual.length) {
    return `buffer sizes ${expected.length} and ${actual.length} -- the sheet is ${actual.length / 4} px, ${width} per row`
  }
  for (let at = 0; at < expected.length; at += 1) {
    if (expected[at] === actual[at]) continue
    const pixel = at >> 2
    const x = pixel % width
    const y = Math.floor(pixel / width)
    const channel = at & 3
    return (
      `at ${x},${y} channel ${channel}: the sources imply ${expected[at]}, the sheet holds ${actual[at]} ` +
      `(pixel ${pixel} of ${expected.length >> 2})`
    )
  }
  return null
}

/** Checks one animation and adds its numbers to the category's totals. */
async function verifyAnimation(
  key: string,
  entry: AnimationEntry,
  played: number,
  palette: Uint8Array,
  paletteError: string | null,
  totals: Totals,
): Promise<void> {
  const layerCount = entry.layers.length
  totals.animations += 1
  totals.layers += layerCount

  const sprites: (Sprite | null)[] = []
  for (const layer of entry.layers) {
    if (layer.file === null) {
      totals.unresolvedLayers += 1
      sprites.push(null)
      continue
    }
    if (!existsSync(join(root, layer.file))) {
      fail(key, `layer file ${layer.file} is not in the tree`)
      sprites.push(null)
      continue
    }
    const sprite = decodeSprite(layer.file)
    sprites.push(sprite)
    for (const direction of sprite.frames) {
      for (const frame of direction) totals.storedPixels += frame.width * frame.height
    }
  }

  entry.layerOrders.forEach((row, index) => {
    const sorted = [...row].sort((a, b) => a - b)
    check(
      key,
      sorted.length === layerCount && sorted.every((value, at) => value === at),
      `layerOrders[${index}] is not a permutation of ${layerCount} layers (${row.join(',')})`,
    )
  })

  const directionSizes = entry.directions.map((direction) => direction.frames)
  check(
    key,
    directionSizes.every((frames) => frames === entry.frames),
    `frames is ${entry.frames} but the directions hold ${directionSizes.join(',')}`,
  )
  const wanted = expectedDirections(entry.storedDirections, played)
  check(
    key,
    wanted.length === entry.directions.length &&
      entry.directions.every((direction, index) => direction.source === wanted[index]),
    `directions are ${entry.directions.map((d) => d.source).join(',')}, the rule gives ${wanted.join(',')}`,
  )

  for (const direction of entry.directions) {
    const where = `${key} direction ${direction.source}`
    totals.sheets += 1
    const path = join(animDir, direction.sheet)
    if (!existsSync(path)) {
      fail(where, `sheet ${direction.sheet} does not exist`)
      continue
    }
    totals.sheetBytes += statSync(path).size

    const png = await decodePng(new Uint8Array(readFileSync(path)))
    if (typeof png === 'string') {
      fail(where, `${direction.sheet}: ${png}`)
      continue
    }
    check(
      where,
      png.width === direction.width,
      `sheet is ${png.width} px wide, the manifest says ${direction.width}`,
    )
    check(
      where,
      png.height === direction.height,
      `sheet is ${png.height} px tall, the manifest says ${direction.height}`,
    )
    check(
      where,
      png.bitDepth === 8 && png.colorType === 6,
      `sheet is bit depth ${png.bitDepth}, colour type ${png.colorType}, not 8-bit RGBA`,
    )
    check(where, png.interlace === 0, 'sheet is interlaced')

    const columnsPerBand = direction.columnsPerBand
    const bands = Math.max(1, Math.ceil(direction.frames / columnsPerBand))
    check(
      where,
      direction.bands === bands,
      `bands is ${direction.bands}, but ${direction.frames} frames in ${columnsPerBand} columns make ${bands}`,
    )
    check(
      where,
      direction.columns.length === columnsPerBand,
      `columns holds ${direction.columns.length} entries, columnsPerBand is ${columnsPerBand}`,
    )
    check(
      where,
      direction.rows.length === bands * layerCount,
      `rows holds ${direction.rows.length} entries, ${bands} bands of ${layerCount} layers make ${bands * layerCount}`,
    )
    check(
      where,
      direction.cells.length === direction.frames,
      `cells holds ${direction.cells.length} frames, expected ${direction.frames}`,
    )
    check(
      where,
      direction.drawOrder.length === direction.frames,
      `drawOrder holds ${direction.drawOrder.length} entries, expected ${direction.frames}`,
    )

    // Columns and rows must start at the origin and add up to the sheet: with
    // prefix sums that is exactly "tiles it without a gap and without an overlap".
    let x = 0
    for (const [index, column] of direction.columns.entries()) {
      check(where, column.x === x, `columns[${index}].x is ${column.x}, expected ${x}`)
      check(where, column.width > 0, `columns[${index}].width is ${column.width}`)
      x += column.width
    }
    check(where, x === direction.width, `the columns total ${x} px, the sheet is ${direction.width}`)
    let y = 0
    for (const [index, row] of direction.rows.entries()) {
      check(where, row.y === y, `rows[${index}].y is ${row.y}, expected ${y}`)
      y += row.height
    }
    check(where, y === direction.height, `the rows total ${y} px, the sheet is ${direction.height}`)

    // The composite the sources imply, laid out through the manifest's own grid.
    const expected = new Uint8Array(direction.width * direction.height * 4)
    if (paletteError !== null) {
      fail(where, paletteError)
    } else {
      let framePixels = 0
      for (let frame = 0; frame < direction.frames; frame += 1) {
        const cells = direction.cells[frame] ?? []
        check(
          where,
          cells.length === layerCount,
          `cells[${frame}] holds ${cells.length} layers, expected ${layerCount}`,
        )
        const order = entry.layerOrders[direction.drawOrder[frame] ?? -1]
        check(
          where,
          order !== undefined,
          `drawOrder[${frame}] is ${direction.drawOrder[frame]}, out of ${entry.layerOrders.length} orders`,
        )
        const column = direction.columns[slotOf(frame, columnsPerBand)]
        if (column === undefined) continue
        for (let layer = 0; layer < layerCount; layer += 1) {
          const cell = cells[layer] ?? null
          const sprite = sprites[layer]
          const source = sprite?.frames[direction.source]?.[frame]
          const row = direction.rows[rowOf(frame, columnsPerBand, layerCount, layer)]
          if (cell === null) {
            check(
              where,
              source === undefined,
              `cells[${frame}][${layer}] is null but ${entry.layers[layer].file} has frame ${frame} of direction ${direction.source}`,
            )
            continue
          }
          check(
            where,
            source !== undefined,
            `cells[${frame}][${layer}] is set but ${entry.layers[layer].file} has no frame ${frame} of direction ${direction.source}`,
          )
          if (source === undefined || row === undefined) continue
          check(
            where,
            cell[0] === source.width &&
              cell[1] === source.height &&
              cell[2] === source.offsetX &&
              cell[3] === source.offsetY,
            `cells[${frame}][${layer}] is [${cell.join(',')}], ${entry.layers[layer].file} declares ` +
              `[${source.width},${source.height},${source.offsetX},${source.offsetY}]`,
          )
          check(
            where,
            cell[0] <= column.width && cell[1] <= row.height,
            `cells[${frame}][${layer}] is ${cell[0]}x${cell[1]}, its cell is ${column.width}x${row.height}`,
          )
          check(
            where,
            column.x + Math.max(cell[0], 1) <= direction.width &&
              row.y + Math.max(cell[1], 1) <= direction.height,
            `cells[${frame}][${layer}] at ${column.x},${row.y} runs past the ${direction.width}x${direction.height} sheet`,
          )
          framePixels += cell[0] * cell[1]
          blit(source, palette, expected, direction.width, column.x, row.y)
        }
      }
      const difference = firstDifference(expected, png.rgba, direction.width)
      if (difference !== null) {
        fail(where, `${direction.sheet} is not the composite the sources imply ${difference}`)
      }
      totals.framePixels += framePixels
    }
    totals.sheetPixels += direction.width * direction.height
  }
}

/** How many animations each tree holds, by the same rule the exporter selects by. */
function census(): Record<string, number> {
  return {
    chars: walkFiles(join(root, 'global/chars')).filter((file) => file.toLowerCase().endsWith('.cof')).length,
    monsters: walkFiles(join(root, 'global/monsters')).filter((file) => file.toLowerCase().endsWith('.cof')).length,
    missiles: walkFiles(join(root, 'global/missiles')).filter(isSprite).length,
    overlays: walkFiles(join(root, 'global/overlays')).filter(isSprite).length,
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GiB`
  return `${(bytes / 1048576).toFixed(1)} MiB`
}

function formatCount(value: number): string {
  return value.toLocaleString('en-US')
}

function bucketOf(entry: AnimationEntry): string {
  if (entry.kind === 'char') return 'chars'
  if (entry.kind === 'monster') return 'monsters'
  return entry.kind === 'missile' ? 'missiles' : 'overlays'
}

async function main(): Promise<void> {
  const started = Date.now()
  const manifestPath = join(animDir, 'index.json')
  if (!existsSync(manifestPath)) {
    throw new Error(`no manifest at ${manifestPath} — run tools/export-anim.ts first`)
  }
  if (!existsSync(join(root, 'global/chars'))) {
    throw new Error(`no animation tree at ${join(root, 'global/chars')} — pass the tree as argv[2]`)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest

  const paletteFile = join(root, manifest.palette)
  let palette: Uint8Array = new Uint8Array(0)
  let paletteError: string | null = null
  try {
    palette = new Uint8Array(parsePalette(new Uint8Array(readFileSync(paletteFile))).rgb)
  } catch (error) {
    paletteError = `cannot read the palette at ${paletteFile} — ${String(error)}`
  }

  const treeCounts = census()
  const totals = new Map<string, Totals>([
    ['chars', emptyTotals()],
    ['monsters', emptyTotals()],
    ['missiles', emptyTotals()],
    ['overlays', emptyTotals()],
  ])

  const keys = Object.keys(manifest.animations).sort()
  const heroPairs = new Set(keys.filter((key) => key.startsWith('chars/')).map((key) => key.slice(0, key.lastIndexOf('/'))))
  for (const key of keys) {
    const entry = manifest.animations[key]
    if (entry === undefined) continue
    const bucket = bucketOf(entry)
    const accumulator = totals.get(bucket)
    if (accumulator === undefined) {
      fail(key, `unknown kind ${entry.kind}`)
      continue
    }
    try {
      await verifyAnimation(key, entry, manifest.playedDirections, palette, paletteError, accumulator)
    } catch (error) {
      fail(key, `verification threw — ${String(error)}`)
    }
  }

  const sheetsInManifest = keys.reduce(
    (sum, key) => sum + (manifest.animations[key]?.directions.length ?? 0),
    0,
  )
  const sheetsOnDisk = walkFiles(animDir).filter((file) => file.toLowerCase().endsWith('.png'))
  let sheetPixels = 0
  let framePixels = 0
  let storedPixels = 0
  for (const tally of totals.values()) {
    sheetPixels += tally.sheetPixels
    framePixels += tally.framePixels
    storedPixels += tally.storedPixels
  }

  console.log(`manifest:   ${manifestPath}`)
  console.log(`tree:       ${root}`)
  console.log('')
  for (const [name, tally] of totals) {
    const inTree = treeCounts[name] ?? 0
    const percent = inTree === 0 ? 0 : (tally.animations / inTree) * 100
    console.log(
      `${name.padEnd(9)} ${formatCount(tally.animations).padStart(5)} of ${formatCount(inTree).padStart(5)} animations exported ` +
        `(${percent.toFixed(2)}%)  ${formatCount(tally.sheets).padStart(5)} sheets  ` +
        `${formatBytes(tally.sheetBytes).padStart(9)}  ${formatCount(tally.layers)} layers, ` +
        `${tally.unresolvedLayers} of them with no art`,
    )
  }
  console.log(
    `hero      ${formatCount(heroPairs.size)} of ${CLASS_MODES} class x mode pairs a player can reach ` +
      `(${((heroPairs.size / CLASS_MODES) * 100).toFixed(2)}%)`,
  )
  console.log('')
  console.log(
    `sheets:     ${formatCount(sheetsOnDisk.length)} PNG on disk, ${formatCount(sheetsInManifest)} in the manifest` +
      `${sheetsOnDisk.length === sheetsInManifest ? '' : ' — THE COUNTS DIFFER'}`,
  )
  console.log(
    `pixels:     ${formatCount(sheetPixels)} in the sheets, of which ${formatCount(framePixels)} are a frame ` +
      `(${((framePixels / Math.max(1, sheetPixels)) * 100).toFixed(1)}%), ` +
      `so ${formatCount(sheetPixels - framePixels)} are transparent padding`,
  )
  console.log(
    `directions: every stored direction would declare ${formatCount(storedPixels)} px against ` +
      `${formatCount(framePixels)} px exported — ${(storedPixels / Math.max(1, framePixels)).toFixed(3)}x the frame pixels`,
  )
  console.log(`checks:     ${formatCount(checks)} assertions, ${formatCount(failures.length)} failed`)
  console.log(`elapsed:    ${((Date.now() - started) / 1000).toFixed(1)} s`)

  if (failures.length > 0) {
    console.log('')
    console.log('failures:')
    for (const failure of failures.slice(0, 200)) console.log(`  ${failure}`)
    if (failures.length > 200) console.log(`  ... and ${formatCount(failures.length - 200)} more`)
    process.exitCode = 1
  }
}

/** The 8 classes times the 8 modes `export-anim.ts` covers. */
const CLASS_MODES = 8 * 8

void main()
