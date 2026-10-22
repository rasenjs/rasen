/**
 * Checks every missile and overlay the export holds against the composition.
 *
 * `src/d2/anim.ts` composes one animation into a uniform grid, and the flat trees
 * are where that arithmetic is exercised hardest: 392 missiles and 407 overlays,
 * whose stored direction counts are all over the place (1, 4, 8, 16 and 32 — the
 * export subsamples to the 8 the game plays) and whose cell sizes run from a
 * 4x18 arrow shaft to a 300-pixel explosion. A layer that does not fit its cell is
 * a composition bug, not art, and nothing in a passing type check would notice.
 *
 * So this composes **all 799** of them and checks, per animation:
 *
 * - that it composes at all (a null result means the first sheet would not load);
 * - that a cell exists for its geometry, with the anchor inside it;
 * - that every layer of every frame of every direction was drawn — a layer that is
 *   skipped is a direction whose sheet is missing, a band that ran past the rows,
 *   or a draw order that resolved to nothing;
 * - that no drawn layer leaves its cell (the property that matters);
 * - that no drawn layer reads outside its own PNG — the manifest's geometry against
 *   the file's real size, read from the PNG header.
 *
 * It also reports the two tables' own coverage of the trees, because that is the
 * claim the app depends on: `missiles.txt`'s `CelFile` and `overlays.txt`'s
 * `Filename` are how a missile or an effect finds its art, so the percentage of
 * rows those columns can resolve is the percentage of the game the app can draw.
 *
 * Usage:
 *   tsx examples/arpg/tools/verify-missiles.ts [<export dir>] [--quiet]
 *
 * The exit code is 1 when anything failed, so it can gate a build.
 */

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { boundsOf, composeAnimation, type AnimEntry, type AnimIndex } from '../src/d2/anim'
import {
  EFFECT_ART_FILE,
  flatArtKey,
  resolveFlatArtKey,
  type FlatTree,
} from '../src/d2/anim-art'

/** The export's animation root, and the tables beside it. */
const animRoot = resolve(process.argv[2] ?? join(import.meta.dirname, '../public/original/anim'))
const exportRoot = dirname(animRoot)
const quiet = process.argv.includes('--quiet')

/** One `drawImage` from a composition: what it read and where it put it. */
interface DrawCall {
  readonly sheet: string
  readonly source: readonly [number, number, number, number]
  readonly destination: readonly [number, number, number, number]
}

interface Shim {
  /** Receives every draw the composition makes; replaced per animation. */
  sink: DrawCall[]
  /** The PNGs that were read, by URL, with the size their header declares. */
  readonly sheets: Map<string, { width: number; height: number }>
}

const shim: Shim = { sink: [], sheets: new Map() }

/**
 * The pixel size a PNG declares, read from its header.
 *
 * The export writes plain PNGs, so the IHDR chunk — a fixed offset from the start —
 * is the whole decoder needed to check that the manifest's geometry and the file
 * agree. No image library is loaded, which is also why this runs outside a browser.
 */
function pngSize(path: string): { width: number; height: number } | null {
  let buffer: Buffer
  try {
    buffer = readFileSync(path)
  } catch {
    return null
  }
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

/**
 * The little of the DOM `composeAnimation` touches.
 *
 * `loadImage` needs an `Image` whose `src` setter eventually calls `onload`, and the
 * composition needs a canvas whose 2D context records `drawImage`. Nothing is
 * rasterised: the claim under test is geometry, so a draw is a rectangle, and the
 * sheets' real sizes come from the PNG headers.
 */
function installDomShim(): void {
  class StubImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    width = 0
    height = 0
    srcPath = ''

    set src(value: string) {
      this.srcPath = value
      const path = join(animRoot, value.replace(/^original\/anim\//, ''))
      const size = pngSize(path)
      if (size === null) {
        queueMicrotask(() => this.onerror?.())
        return
      }
      this.width = size.width
      this.height = size.height
      shim.sheets.set(value, size)
      queueMicrotask(() => this.onload?.())
    }

    get src(): string {
      return this.srcPath
    }
  }

  const canvas = {
    width: 0,
    height: 0,
    getContext: (kind: string): unknown => {
      if (kind !== '2d') return null
      return {
        imageSmoothingEnabled: false,
        drawImage: (
          image: StubImage,
          sx: number,
          sy: number,
          sw: number,
          sh: number,
          dx: number,
          dy: number,
          dw: number,
          dh: number,
        ): void => {
          shim.sink.push({
            sheet: image.srcPath,
            source: [sx, sy, sw, sh],
            destination: [dx, dy, dw, dh],
          })
        },
      }
    },
  }

  const host = globalThis as { document?: unknown; Image?: unknown }
  host.document = { createElement: (tag: string) => (tag === 'canvas' ? canvas : {}) }
  host.Image = StubImage
}

/** One animation's verdict. */
interface AnimationResult {
  readonly key: string
  readonly kind: string
  readonly cellWidth: number
  readonly cellHeight: number
  readonly frames: number
  readonly directions: number
  /** Non-null cells: the layers there is art for. */
  readonly layers: number
  readonly drawn: number
  /** True when the composition returned a sheet. */
  readonly composed: boolean
  readonly failures: readonly string[]
}

/** A failure that is not about one animation: a mapping, or a missing table. */
function problem(message: string): AnimationResult {
  return {
    key: message,
    kind: 'check',
    cellWidth: 0,
    cellHeight: 0,
    frames: 0,
    directions: 0,
    layers: 0,
    drawn: 0,
    composed: false,
    failures: [message],
  }
}

/** Composes one animation and checks every layer it claims to have. */
async function checkAnimation(key: string, entry: AnimEntry): Promise<AnimationResult> {
  const failures: string[] = []
  const box = boundsOf(entry)
  const cellWidth = Math.ceil(box.right - box.left) + 2
  const cellHeight = Math.ceil(box.bottom - box.top) + 2
  const anchorX = -box.left + 1
  const anchorY = -box.top + 1
  const frames = entry.directions.reduce((total, direction) => total + direction.frames, 0)
  let layers = 0
  for (const direction of entry.directions) {
    for (const frame of direction.cells) {
      for (const cell of frame) if (cell !== null) layers += 1
    }
  }

  if (entry.directions.length === 0 || entry.frames === 0) {
    failures.push('no directions or no frames')
    return {
      key,
      kind: entry.kind,
      cellWidth,
      cellHeight,
      frames: 0,
      directions: 0,
      layers,
      drawn: 0,
      composed: false,
      failures,
    }
  }
  if (cellWidth <= 2 || cellHeight <= 2) {
    failures.push(`degenerate cell ${cellWidth}x${cellHeight}`)
  } else if (anchorX < 0 || anchorY < 0 || anchorX >= cellWidth || anchorY >= cellHeight) {
    failures.push(`anchor ${anchorX},${anchorY} outside ${cellWidth}x${cellHeight}`)
  }

  shim.sink = []
  const composed = await composeAnimation('', entry)
  const draws = shim.sink
  if (composed === null) failures.push('composition returned null')
  if (draws.length < layers) {
    failures.push(`${layers - draws.length} of ${layers} layers were not drawn`)
  }

  // A cell is one (direction, frame) slot, `cellWidth` wide, laid out left to right
  // across the sheet — so a draw's column will land in exactly one of them, and a
  // layer that does not fit is a draw that leaves its own column or row.
  const drawnPerCell = new Map<number, number>()
  for (const draw of draws) {
    const [dx, dy, dw, dh] = draw.destination
    const cell = Math.floor(dx / cellWidth)
    drawnPerCell.set(cell, (drawnPerCell.get(cell) ?? 0) + 1)
    if (dy < 0 || dy + dh > cellHeight || dx + dw > (cell + 1) * cellWidth) {
      failures.push(
        `layer drawn at ${dx},${dy} ${dw}x${dh} leaves the ${cellWidth}x${cellHeight} cell`,
      )
      break
    }
  }
  for (let d = 0; d < entry.directions.length; d += 1) {
    const direction = entry.directions[d]
    for (let f = 0; f < direction.frames; f += 1) {
      const expected = (direction.cells[f] ?? []).filter((cell) => cell !== null).length
      const drawn = drawnPerCell.get(d * entry.frames + f) ?? 0
      if (drawn !== expected) {
        failures.push(`direction ${d} frame ${f} drew ${drawn} of ${expected} layers`)
        break
      }
    }
  }
  for (const draw of draws) {
    const size = shim.sheets.get(draw.sheet)
    const [sx, sy, sw, sh] = draw.source
    if (size === undefined) {
      failures.push(`sheet ${draw.sheet} was never read`)
      break
    }
    if (sx < 0 || sy < 0 || sx + sw > size.width || sy + sh > size.height) {
      failures.push(
        `layer reads ${sx},${sy} ${sw}x${sh} from a ${size.width}x${size.height} sheet (${draw.sheet})`,
      )
      break
    }
  }

  return {
    key,
    kind: entry.kind,
    cellWidth,
    cellHeight,
    frames,
    directions: entry.directions.length,
    layers,
    drawn: draws.length,
    composed: composed !== null,
    failures,
  }
}

/** A table row reduced to the file name its art column holds. */
function columnOf(row: Readonly<Record<string, string | null>>, column: string): string {
  const value = row[column]
  return typeof value === 'string' ? value.trim() : ''
}

/** Reads one of the export's tables, or null when it was not exported. */
function readTable(name: string): Readonly<Record<string, string | null>>[] | null {
  try {
    const parsed = JSON.parse(readFileSync(join(exportRoot, `table_${name}.json`), 'utf8'))
    return Array.isArray(parsed) ? (parsed as Readonly<Record<string, string | null>>[]) : null
  } catch {
    return null
  }
}

/**
 * How well a table's own art column resolves against the manifest.
 *
 * This is the claim the app leans on: `missiles.txt`'s `CelFile` and
 * `overlays.txt`'s `Filename` are how a missile or an effect finds its animation,
 * so a row whose column names nothing the export holds is a row the app cannot draw
 * with the game's own art.
 */
function checkTable(
  index: AnimIndex,
  name: string,
  tree: FlatTree,
  artColumn: string,
  labelColumn: string,
): { rows: number; resolved: number; unresolved: readonly string[] } {
  const table = readTable(name)
  if (table === null) {
    return { rows: 0, resolved: 0, unresolved: [`table_${name}.json is beside the export but missing`] }
  }
  const unresolved: string[] = []
  let resolved = 0
  for (const row of table) {
    const art = columnOf(row, artColumn)
    if (art !== '' && resolveFlatArtKey(index, tree, art) !== null) resolved += 1
    else unresolved.push(`${columnOf(row, labelColumn) || '(unnamed)'} → ${art || '(no file)'}`)
  }
  return { rows: table.length, resolved, unresolved }
}

function percent(part: number, whole: number): string {
  return whole === 0 ? 'n/a' : `${((part / whole) * 100).toFixed(1)}%`
}

async function main(): Promise<void> {
  let index: AnimIndex
  try {
    index = JSON.parse(readFileSync(join(animRoot, 'index.json'), 'utf8')) as AnimIndex
  } catch (error) {
    console.error(`verify-missiles: no manifest at ${animRoot}: ${String(error)}`)
    process.exitCode = 1
    return
  }

  installDomShim()

  const keys = Object.keys(index.animations).filter(
    (key) => key.startsWith('missiles/') || key.startsWith('overlays/'),
  )
  const results: AnimationResult[] = []
  for (const key of keys) {
    results.push(await checkAnimation(key, index.animations[key]))
  }

  const failures = results.filter((result) => result.failures.length > 0)
  const empties = results.filter((result) => result.layers === 0)
  const composed = results.filter((result) => result.composed)
  const cells = results.map((result) => result.cellWidth * result.cellHeight).sort((a, b) => a - b)
  const median = cells.length === 0 ? 0 : cells[Math.floor(cells.length / 2)]
  const frames = results.reduce((total, result) => total + result.frames, 0)
  const directions = results.reduce((total, result) => total + result.directions, 0)
  const layers = results.reduce((total, result) => total + result.layers, 0)

  console.log(
    `verify-missiles: ${results.length} flat animations ` +
      `(${results.filter((r) => r.kind === 'missile').length} missiles, ` +
      `${results.filter((r) => r.kind === 'overlay').length} overlays), ` +
      `${directions} directions, ${frames} frames, ${layers} layers`,
  )
  console.log(
    `verify-missiles: composed ${composed.length}/${results.length} (${percent(composed.length, results.length)}); ` +
      `${empties.length} have no art at all (${percent(empties.length, results.length)})`,
  )
  console.log(
    `verify-missiles: cell area min ${cells[0] ?? 0} px, median ${median} px, ` +
      `max ${cells[cells.length - 1] ?? 0} px; ` +
      `largest cell ${
        results.reduce(
          (best, result) =>
            result.cellWidth * result.cellHeight > best.cellWidth * best.cellHeight ? result : best,
          results[0] ?? { key: '-', cellWidth: 0, cellHeight: 0 },
        ).key
      }`,
  )

  for (const tree of ['missiles', 'overlays'] as const) {
    const inTree = results.filter((result) => result.key.startsWith(`${tree}/`))
    const empty = inTree.filter((result) => result.layers === 0)
    console.log(
      `  ${tree.padEnd(9)} ${String(inTree.length).padStart(4)} animations, ` +
        `${String(inTree.reduce((total, r) => total + r.frames, 0)).padStart(5)} frames, ` +
        `${String(inTree.reduce((total, r) => total + r.layers, 0)).padStart(5)} layers, ` +
        `${empty.length} with no art`,
    )
  }

  const missiles = checkTable(index, 'missiles', 'missiles', 'CelFile', 'Missile')
  const overlays = checkTable(index, 'overlay', 'overlays', 'Filename', 'overlay')
  console.log(
    `verify-missiles: missiles.txt ${missiles.resolved}/${missiles.rows} rows resolve to art ` +
      `(${percent(missiles.resolved, missiles.rows)})`,
  )
  console.log(
    `verify-missiles: overlays.txt ${overlays.resolved}/${overlays.rows} rows resolve to art ` +
      `(${percent(overlays.resolved, overlays.rows)})`,
  )
  // A table that is not there at all is a failure: without it there is no claim to
  // make about which art the app can reach.
  for (const [label, table] of [
    ['missiles', missiles],
    ['overlays', overlays],
  ] as const) {
    if (table.rows === 0) {
      failures.push(problem(`${label}: ${table.unresolved.join('; ')}`))
    }
  }

  // The mapping the app draws its effects with is only real if the manifest has
  // the files it names — a typo here would silently leave an effect drawn.
  for (const [kind, file] of Object.entries(EFFECT_ART_FILE)) {
    if (file === undefined) continue
    const key = resolveFlatArtKey(index, file.tree, file.fileName)
    const entry = key === null ? undefined : index.animations[key]
    console.log(
      `verify-missiles: effect ${kind.padEnd(14)} → ${
        key ?? `${flatArtKey(file.tree, file.fileName)} MISSING`
      }${entry === undefined ? '' : ` (${entry.frames} frames)`}`,
    )
    if (key === null) {
      failures.push(
        problem(`${kind}: ${flatArtKey(file.tree, file.fileName)} is not in the manifest`),
      )
    }
  }

  if (!quiet) {
    for (const result of failures.slice(0, 20)) {
      console.warn(`  ${result.key}: ${result.failures.join('; ')}`)
    }
    for (const row of missiles.unresolved.slice(0, 8)) {
      console.warn(`  missiles.txt ${row}`)
    }
    for (const row of overlays.unresolved.slice(0, 8)) {
      console.warn(`  overlays.txt ${row}`)
    }
  }

  if (failures.length > 0) {
    console.error(`verify-missiles: FAILED — ${failures.length} animations report a problem`)
    process.exitCode = 1
    return
  }
  console.log(
    `verify-missiles: OK — every missile and overlay composes, no layer leaves its cell, ` +
      `no layer reads outside its sheet; ${missiles.unresolved.length} missile rows and ` +
      `${overlays.unresolved.length} overlay rows have no art in the tables to begin with`,
  )
  // A row with no art is the tables' own gap, not a composition failure — it is
  // reported above so it stays visible, but it does not fail the run.
}

await main()
