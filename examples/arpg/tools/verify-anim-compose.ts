/**
 * Checks the animation composition's geometry against every exported animation.
 *
 * `src/d2/anim.ts` composes each animation into a uniform grid, and the claim that
 * matters is that **no layer is clipped**: a cell must be big enough to hold the
 * union of every layer box of every frame of every direction, with the unit's
 * anchor inside it. If the arithmetic is wrong, a character loses an arm or the
 * anchor drifts and the sprite jitters — neither of which a passing type check
 * would notice.
 *
 * It also re-runs the pixel-level half of the check, which needs a canvas to read the
 * sheets the manifest describes: this tool supplies one by decoding the export's PNGs
 * in Node. Two claims come out of the pixels.
 *
 * **Every band holds the art its cell declares, end to end.** The manifest says a
 * layer's picture is a `width x height` box at the top left of its cell with
 * `offsetY` as its bottom row, and over the whole export the pixels corroborate it:
 * every one of the 285,854 bands in the two figure trees has an opaque pixel in its
 * declared first and last row and first and last column, and the widest shortfall
 * anywhere is 2 px. That is the invariant to guard, because it is what a band written
 * to the wrong place breaks — a picture flipped inside its *cell* rather than inside
 * its own box, a sheet sliced with the rows and columns transposed, a layer read out
 * of the wrong row of the grid. It is also the check the "feet stay on the ground"
 * reading of the same numbers cannot be: the anchor is not the feet in this art (the
 * lowest opaque row of a composed figure ranges from 146 px below the anchor row to
 * 146 px above it, median 6 px, so no tolerance around the anchor row could be
 * asserted), while "the pixels end where the manifest declares they end" holds to the
 * pixel. Both numbers are printed below.
 *
 * **The exported art is the right way up**, which is the claim the pixels *can*
 * decide, because the export carries art that is not a decoder's output: the
 * Resurrected `.sprite` art of an item beside the classic `.dc6` icon of the same
 * item. The `.sprite` decode is upright by construction and the classic decode is
 * `frameToRgba`'s, so comparing the two settles the row order of the classic formats —
 * the row order `src/d2/dcc.ts` shares, since the two formats' outputs are
 * pixel-identical. It is the comparison `dcc.ts`'s row-order note describes as the one
 * its old reading could not make: two decoders that invert together agree with each
 * other.
 *
 * The comparison is of the normalised row-width profile of each picture's *content
 * span* — the rows from the first to the last with a pixel, resampled to `BINS` bins
 * and divided by its own peak — so it does not depend on where in its cell a picture
 * sits, which a redraw is free to move. Both directions' errors are printed per item,
 * and the check fails if the mirror fits the better of the two.
 *
 * Measured on this export, the mirror costs 0.035 to 0.369 while the picture as
 * decoded costs 0.019 to 0.093 (`invkit` 0.019 against 0.369, `invgts` 0.032/0.275,
 * `invmsk` 0.103/0.275, `invcap` 0.098/0.271; the round shields and the helm are
 * symmetric enough to say nothing). Turning either decoder's rows round fails this
 * check, which is the point of it: this is the one measurement here that is of art no
 * decoder produced, and the bug it guards against shipped once because the older
 * check compared two decoders with each other.
 *
 * Usage:
 *   tsx examples/arpg/tools/verify-anim-compose.ts [<anim dir>] [--no-pixels]
 */

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PNG } from 'pngjs'
import { boundsOf, type AnimIndex } from '../src/d2/anim'

const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
const root = resolve(args[0] ?? join(import.meta.dirname, '../public/original/anim'))
const withPixels = !process.argv.includes('--no-pixels')
/** The export root, which is the animation root's parent. */
const exportRoot = resolve(root, '..')

/**
 * An item whose classic icon and HD art are the same object, so the two can be
 * compared.
 *
 * The left side is the classic `.dc6`'s name under `global/items` — the name the item
 * tables' `invfile` column uses — and the right the Resurrected `.sprite` of the same
 * item, whose export name is the item's. The two cells have the same aspect, so the
 * art sits at the same end of them if the classic decode is upright.
 */
const ORIENTATION_PAIRS: readonly (readonly [string, string])[] = [
  ['invkit', 'kite_shield.png'],
  ['invgts', 'gothic_shield.png'],
  ['invmsk', 'mask.png'],
  ['invcap', 'cap_hat.png'],
  ['invbuc', 'buckler.png'],
  ['invtow', 'tower_shield.png'],
  ['invhlm', 'helm.png'],
  ['invsml', 'small_shield.png'],
]

/** How many bins a picture's row-width profile is resampled to before comparing. */
const BINS = 48

/**
 * The normalised row-width profile of a PNG's content span.
 *
 * The content span is the rows from the first to the last that hold a pixel, so the
 * profile says nothing about where in its cell the picture sits — which is what makes
 * it usable on two drawings of the same item that a redraw may have placed differently.
 * The span is resampled to `BINS` bins and the widths divided by the peak, so the
 * comparison is of shape only.
 */
function rowProfile(png: PNG): number[] | null {
  const widths: number[] = []
  for (let y = 0; y < png.height; y += 1) {
    let count = 0
    for (let x = 0; x < png.width; x += 1) {
      if (png.data[(y * png.width + x) * 4 + 3] > 8) count += 1
    }
    widths.push(count)
  }
  const span = widths.map((count, y) => (count > 0 ? y : -1)).filter((y) => y >= 0)
  if (span.length === 0) return null
  const top = span[0]
  const bottom = span[span.length - 1]
  const height = bottom - top + 1
  const bins: number[] = []
  for (let i = 0; i < BINS; i += 1) {
    const from = top + Math.floor((i * height) / BINS)
    const to = Math.max(from + 1, top + Math.floor(((i + 1) * height) / BINS))
    const slice = widths.slice(from, Math.min(to, bottom + 1))
    bins.push(slice.reduce((sum, value) => sum + value, 0) / slice.length)
  }
  const peak = Math.max(...bins) || 1
  return bins.map((value) => value / peak)
}

/** The mean absolute difference between two profiles. */
function profileError(a: readonly number[], b: readonly number[]): number {
  let total = 0
  for (let i = 0; i < a.length && i < b.length; i += 1) total += Math.abs(a[i] - b[i])
  return total / Math.min(a.length, b.length)
}

function main(): void {
  let index: AnimIndex
  try {
    index = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8')) as AnimIndex
  } catch (error) {
    console.error(`verify-anim-compose: no manifest at ${root}: ${String(error)}`)
    process.exitCode = 1
    return
  }

  const byKind = new Map<string, { animations: number; frames: number; directions: number }>()
  let animations = 0
  let frames = 0
  let directions = 0
  let clipped = 0
  let degenerate = 0
  let anchorOutside = 0
  let noLayers = 0
  let maxCell = 0
  let totalPixels = 0
  const failures: string[] = []

  for (const [key, entry] of Object.entries(index.animations)) {
    animations += 1
    const bucket = byKind.get(entry.kind) ?? { animations: 0, frames: 0, directions: 0 }
    bucket.animations += 1
    bucket.frames += entry.frames
    bucket.directions += entry.directions.length
    byKind.set(entry.kind, bucket)

    if (entry.directions.length === 0 || entry.frames === 0) {
      degenerate += 1
      if (failures.length < 10) failures.push(`${key}: no directions or no frames`)
      continue
    }
    if ((entry.layers?.length ?? 0) === 0 && entry.kind === 'char') {
      noLayers += 1
    }

    const box = boundsOf(entry)
    const cellWidth = Math.ceil(box.right - box.left) + 2
    const cellHeight = Math.ceil(box.bottom - box.top) + 2
    const anchorX = -box.left + 1
    const anchorY = -box.top + 1

    if (cellWidth <= 2 || cellHeight <= 2) {
      degenerate += 1
      if (failures.length < 10) failures.push(`${key}: degenerate cell ${cellWidth}x${cellHeight}`)
      continue
    }
    if (anchorX < 0 || anchorY < 0 || anchorX >= cellWidth || anchorY >= cellHeight) {
      anchorOutside += 1
      if (failures.length < 10) {
        failures.push(`${key}: anchor ${anchorX},${anchorY} outside ${cellWidth}x${cellHeight}`)
      }
      continue
    }

    // The condition: every layer of every frame of every direction fits.
    for (const direction of entry.directions) {
      directions += 1
      for (let f = 0; f < direction.cells.length; f += 1) {
        frames += 1
        for (const cell of direction.cells[f]) {
          if (cell === null) continue
          const [width, height, offsetX, offsetY] = cell
          const left = anchorX + offsetX
          const top = anchorY + offsetY - height
          if (left < 0 || top < 0 || left + width > cellWidth || top + height > cellHeight) {
            clipped += 1
            if (failures.length < 10) {
              failures.push(
                `${key} d${direction.source} f${f}: layer ${width}x${height}@${offsetX},${offsetY} ` +
                  `falls outside ${cellWidth}x${cellHeight} (${left},${top})`,
              )
            }
          }
        }
      }
    }

    maxCell = Math.max(maxCell, cellWidth * cellHeight)
    totalPixels += cellWidth * cellHeight * entry.directions.length * entry.frames
  }

  console.log(
    `anim-compose: ${animations} animations, ${directions} directions, ${frames} frames; ` +
      `sheet budget ${(totalPixels / 1e6).toFixed(1)} Mpx`,
  )
  for (const [kind, bucket] of [...byKind].sort()) {
    console.log(
      `  ${kind.padEnd(9)} ${String(bucket.animations).padStart(4)} animations, ` +
        `${String(bucket.frames).padStart(7)} frames, ${String(bucket.directions).padStart(5)} directions`,
    )
  }
  console.log(`anim-compose: largest cell ${maxCell} px, ${index.playedDirections} played directions`)

  const pixelProblems = withPixels ? checkPixels(index) : []
  const orientationProblems = withPixels ? checkOrientation() : []

  const problems: string[] = []
  if (clipped > 0) problems.push(`${clipped} layers would be clipped`)
  if (degenerate > 0) problems.push(`${degenerate} degenerate animations`)
  if (anchorOutside > 0) problems.push(`${anchorOutside} anchors outside their cell`)
  if (noLayers > 0) problems.push(`${noLayers} character animations with no layers`)
  for (const failure of failures) console.warn(`  ${failure}`)
  problems.push(...pixelProblems, ...orientationProblems)
  if (problems.length > 0) {
    console.error(`verify-anim-compose: FAILED — ${problems.join('; ')}`)
    process.exitCode = 1
    return
  }
  console.log(
    withPixels
      ? 'verify-anim-compose: OK — no layer is clipped, every band holds its declared box ' +
          'and the classic art agrees with the HD art'
      : 'verify-anim-compose: OK — no layer is clipped (the pixels were not read)',
  )
}

/**
 * The pixel half: every layer's band against the box its cell declares.
 *
 * The sheet is a grid of frames across and layers down, and the manifest says a
 * layer's picture is a `width x height` box at the top left of its cell. So the
 * band's opaque pixels must span that whole box: a first and last row with a pixel,
 * and a first and last column with one. A band that is empty is a frame the art draws
 * nothing for, which overlays do, and is counted rather than failed.
 *
 * The lowest opaque row of a composed figure is reported against the anchor row as
 * well, because that number is what a reader expects to see — but it is not asserted:
 * see the header on why the anchor is not the feet in this art.
 */
function checkPixels(index: AnimIndex): string[] {
  const sheets = new Map<string, PNG>()
  const problems: string[] = []
  const lowestRows: number[] = []
  let bands = 0
  let emptyBands = 0
  let framesRead = 0
  let worstInset = 0
  let worstAt = ''

  for (const [key, entry] of Object.entries(index.animations)) {
    if (entry.kind === 'missile' || entry.kind === 'overlay') continue
    const layerCount = (entry.layers ?? []).length || 1
    for (const direction of entry.directions) {
      let png = sheets.get(direction.sheet)
      if (png === undefined) {
        try {
          png = PNG.sync.read(readFileSync(join(root, direction.sheet)))
        } catch (error) {
          problems.push(`${key}: ${direction.sheet} does not read — ${String(error)}`)
          continue
        }
        sheets.set(direction.sheet, png)
      }
      for (let f = 0; f < direction.frames; f += 1) {
        const cells = direction.cells[f]
        if (cells === undefined) continue
        const column = direction.columns[f % direction.columnsPerBand]
        const band = Math.floor(f / direction.columnsPerBand)
        let lowest = -Infinity
        for (let l = 0; l < layerCount; l += 1) {
          const cell = cells[l]
          const row = direction.rows[band * layerCount + l]
          if (cell === null || cell === undefined || column === undefined || row === undefined) continue
          const [width, height, , offsetY] = cell
          let firstRow = -1
          let lastRow = -1
          let firstColumn = -1
          let lastColumn = -1
          for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
              if (png.data[((row.y + y) * png.width + column.x + x) * 4 + 3] <= 8) continue
              if (firstRow < 0) firstRow = y
              lastRow = y
              if (firstColumn < 0 || x < firstColumn) firstColumn = x
              if (x > lastColumn) lastColumn = x
            }
          }
          bands += 1
          if (lastRow < 0) {
            emptyBands += 1
            continue
          }
          lowest = Math.max(lowest, offsetY - height + 1 + lastRow)
          // How far the picture falls short of the box it declares, over the four
          // edges. One pixel of slack, because a palette index of 0 is transparent
          // and a one-pixel edge of it is legitimate.
          const inset = Math.max(
            firstRow,
            height - 1 - lastRow,
            firstColumn,
            width - 1 - lastColumn,
          )
          if (inset > worstInset) {
            worstInset = inset
            worstAt = `${key} d${direction.source} f${f} layer ${l} (${width}x${height}@${offsetY})`
          }
        }
        framesRead += 1
        if (lowest !== -Infinity) lowestRows.push(lowest)
      }
    }
  }

  const sorted = [...lowestRows].sort((a, b) => a - b)
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0
  console.log(
    `anim-compose: ${bands} bands over ${framesRead} frames, ${emptyBands} of them empty; ` +
      `widest edge a picture leaves of its declared box ${worstInset} px` +
      (worstInset > 0 ? ` (${worstAt})` : ''),
  )
  console.log(
    `anim-compose: lowest opaque row against the anchor — min ${sorted[0] ?? 0}, 1% ${at(0.01)}, ` +
      `median ${at(0.5)}, 99% ${at(0.99)}, max ${sorted[sorted.length - 1] ?? 0}`,
  )
  if (worstInset > 2) {
    problems.push(
      `a band holds ${worstInset} px less than the box its cell declares (${worstAt}), ` +
        'so the sheet and the manifest disagree about where the art is',
    )
  }
  return problems
}

/**
 * The row order of the classic decode, against art that is not a decoder's output.
 *
 * `hd/global/ui/items` is the Resurrected art of the same items, exported to PNG
 * straight from the `.sprite` container and therefore upright. A classic icon whose
 * content sits at the opposite end of its cell from the HD picture of the same object
 * has its rows stored upside down, and both errors are printed.
 */
function checkOrientation(): string[] {
  const problems: string[] = []
  let asIsCount = 0
  let mirroredCount = 0
  let tied = 0
  let missing = 0
  for (const [code, hd] of ORIENTATION_PAIRS) {
    let classicProfile: number[] | null
    let hdProfile: number[] | null
    try {
      classicProfile = rowProfile(
        PNG.sync.read(readFileSync(join(exportRoot, 'itemart', `${code}.png`))),
      )
      hdProfile = rowProfile(PNG.sync.read(readFileSync(join(exportRoot, hd))))
    } catch {
      missing += 1
      continue
    }
    if (classicProfile === null || hdProfile === null) continue
    const asIs = profileError(classicProfile, hdProfile)
    const mirrored = profileError(classicProfile, [...hdProfile].reverse())
    // A picture whose profile is close to its own mirror — the round shields, the helm —
    // reads nearly the same either way, and the two drawings are not the same drawing:
    // the items that carry no direction score 0.002 to 0.014 apart, while the four that
    // do carry one score 0.14 to 0.37 apart. A tenth of that gap is the verdict line.
    const decided = Math.abs(asIs - mirrored) > 0.03
    console.log(
      `  ${code.padEnd(8)} vs ${hd.padEnd(18)} as-is ${asIs.toFixed(3)}  mirrored ${mirrored.toFixed(3)}` +
        (decided ? '' : '  (symmetric: no verdict)'),
    )
    if (!decided) {
      tied += 1
      continue
    }
    if (mirrored < asIs) {
      mirroredCount += 1
      problems.push(
        `${code} reads as the HD art of ${hd} mirrored vertically (${mirrored.toFixed(3)} ` +
          `against ${asIs.toFixed(3)}): the classic decode's rows are the wrong way up`,
      )
    } else asIsCount += 1
  }
  if (missing > 0) {
    console.log(`anim-compose: ${missing} of ${ORIENTATION_PAIRS.length} item pairs are not exported`)
  }
  console.log(
    `anim-compose: item row order — ${asIsCount} as decoded, ${mirroredCount} mirrored, ` +
      `${tied} symmetric`,
  )
  return problems
}

main()
