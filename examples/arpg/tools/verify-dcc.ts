/**
 * Re-runs the DCC decoding invariant against a real extracted directory.
 *
 * The claim `src/d2/dcc.ts` rests on is that a direction block is fully
 * accounted for: its header, its five bit streams and every frame's cells must
 * consume the whole block apart from the padding of its last byte, and the four
 * streams whose lengths the block declares must be consumed *exactly* — not
 * fewer bits, not more. If the grammar is wrong anywhere the cursors drift and
 * the block stops adding up, so this reports counts rather than a boolean. It
 * re-derives two size relations from the frame headers as well.
 *
 * This is deliberately a second implementation of the same grammar, written as a
 * flat walk over explicit cursors rather than the decoder's object graph: if the
 * two ever disagree the percentage below stops reading 100.000, which is the
 * reason for keeping it separate.
 *
 * What no grammar check can settle is the **row order**, and it is worth saying so
 * here because the old reading of the pixels survived on a comparison of two decoders
 * with each other: two readers that invert together agree, and the streams are
 * accounted for exactly either way. The only thing in the format that names an order is
 * the frame header's `bottomUp` bit, which this walk insists is 0 — as it is in all
 * 3,668,261 frames of the package — and the order itself is settled against the game's
 * own HD art of the same items. `src/d2/dc6.ts`'s "Row order" section carries that
 * measurement and `tools/verify-anim-compose.ts` re-runs it.
 *
 * Usage:
 *   tsx examples/arpg/tools/verify-dcc.ts [<extracted romfs dir>]
 *
 * Needs an extracted copy of the game, which the repository does not carry.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(process.argv[2] ?? '/tmp/d2r-all')

/** A 4-bit index into this table gives the width of the next field. */
const FIELD_WIDTHS = [0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 26, 28, 30, 32]
/** How many of a cell mask's four bits are set. */
const MASK_BIT_COUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4]
const CELL = 4
/** Beyond this much padding at the end of a block the parse is wrong. */
const MAX_PADDING_BITS = 7
/** The sizes a frame's coded cells can have, in pixels. */
const CELL_SIDES = [1, 2, 3, 4, 5]
/** A 4-bit displacement of 15 chains into the next displacement. */
const DISPLACEMENT_CHAIN = 15

function u32(bytes: Uint8Array, at: number): number {
  return (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
}

/** Every `.dcc` below a directory, at any depth. */
function findFiles(dir: string, out: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    const path = join(dir, entry)
    let isDirectory = false
    try {
      isDirectory = statSync(path).isDirectory()
    } catch {
      continue
    }
    if (isDirectory) findFiles(path, out)
    else if (entry.toLowerCase().endsWith('.dcc')) out.push(path)
  }
}

interface BitCursor {
  read: (count: number) => number
  signed: (count: number) => number
  skip: (count: number) => void
  position: () => number
}

/**
 * A bit cursor: the least significant bit of each byte first, the first bit read
 * becoming the value's bit 0.
 */
function cursor(bytes: Uint8Array, at: number): BitCursor {
  let bit = at
  const read = (count: number): number => {
    let value = 0
    for (let i = 0; i < count; i += 1) {
      value |= ((bytes[bit >> 3] >> (bit & 7)) & 1) << i
      bit += 1
    }
    return value >>> 0
  }
  return {
    read,
    signed: (count: number): number => {
      if (count === 0) return 0
      const value = read(count)
      const sign = 1 << (count - 1)
      return value & sign ? value - (sign << 1) : value
    },
    skip: (count: number): void => {
      bit += count
    },
    position: (): number => bit,
  }
}

/** How many cells cover `size` pixels when the first starts `lead` into a grid cell. */
function cellCount(size: number, lead: number): number {
  const first = lead === 0 ? CELL : CELL - lead
  if (size - first <= 1) return 1
  const rest = size - first - 1
  const count = 2 + (rest >> 2)
  return (rest & 3) === 0 ? count - 1 : count
}

/** The pixel sizes of those cells. */
function cellSizes(size: number, lead: number): number[] {
  const count = cellCount(size, lead)
  const first = lead === 0 ? CELL : CELL - lead
  if (count === 1) return [size]
  const sizes = [first]
  for (let i = 1; i < count - 1; i += 1) sizes.push(CELL)
  sizes.push(size - first - CELL * (count - 2))
  return sizes
}

interface FrameGeometry {
  width: number
  height: number
  left: number
  top: number
  codedBytes: number
  columns: number[]
  rows: number[]
}

interface Block {
  outSizeCoded: number
  codedBytes: number
  frames: number
  declared: { equalCells: number; pixelMasks: number; encodingTypes: number; rawCodes: number }
  consumed: { equalCells: number; pixelMasks: number; encodingTypes: number; rawCodes: number }
  /** Bits of the block's last byte that no stream reaches. */
  padding: number
  failure: string | null
}

/** One coded cell: the four codes it ended up with, and where it was coded. */
interface Entry {
  frame: number
  cell: number
  codes: number[]
}

/**
 * Walks one direction block cell by cell and pixel by pixel, reading every
 * stream, and reports where the cursors ended up.
 */
function walkBlock(bytes: Uint8Array, start: number, end: number, framesPerDirection: number): Block {
  const totalBits = (end - start) * 8
  const head = cursor(bytes, start * 8)
  const block: Block = {
    outSizeCoded: 0,
    codedBytes: 0,
    frames: 0,
    declared: { equalCells: 0, pixelMasks: 0, encodingTypes: 0, rawCodes: 0 },
    consumed: { equalCells: 0, pixelMasks: 0, encodingTypes: 0, rawCodes: 0 },
    padding: 0,
    failure: null,
  }
  const fail = (message: string): Block => {
    if (block.failure === null) block.failure = message
    return block
  }

  block.outSizeCoded = head.read(32)
  const flags = head.read(2)
  const widths = [
    FIELD_WIDTHS[head.read(4)],
    FIELD_WIDTHS[head.read(4)],
    FIELD_WIDTHS[head.read(4)],
    FIELD_WIDTHS[head.read(4)],
    FIELD_WIDTHS[head.read(4)],
    FIELD_WIDTHS[head.read(4)],
    FIELD_WIDTHS[head.read(4)],
  ]
  const geometry: FrameGeometry[] = []
  for (let frame = 0; frame < framesPerDirection; frame += 1) {
    head.skip(widths[0])
    const width = head.read(widths[1])
    const height = head.read(widths[2])
    const xOffset = head.signed(widths[3])
    const yOffset = head.signed(widths[4])
    const optionalBytes = head.read(widths[5])
    const codedBytes = head.read(widths[6])
    const bottomUp = head.read(1)
    if (width === 0 || height === 0) return fail(`frame ${frame} has an empty box`)
    if (optionalBytes !== 0) return fail(`frame ${frame} declares ${optionalBytes} optional bytes`)
    if (bottomUp !== 0) return fail(`frame ${frame} is bottom-up`)
    geometry.push({
      width,
      height,
      left: xOffset,
      top: yOffset - height + 1,
      codedBytes,
      columns: [],
      rows: [],
    })
    block.frames += 1
    block.codedBytes += codedBytes
  }

  if ((flags & 0x2) !== 0) block.declared.equalCells = head.read(20)
  block.declared.pixelMasks = head.read(20)
  if ((flags & 0x1) !== 0) {
    block.declared.encodingTypes = head.read(20)
    block.declared.rawCodes = head.read(20)
  }

  const palette: number[] = []
  for (let entry = 0; entry < 256; entry += 1) if (head.read(1) !== 0) palette.push(entry)
  if (palette.length === 0) return fail('the direction declares no palette entry')

  // The five streams are contiguous: each cursor starts where the last one ends.
  const equalCells = cursor(bytes, head.position())
  head.skip(block.declared.equalCells)
  const pixelMasks = cursor(bytes, head.position())
  head.skip(block.declared.pixelMasks)
  const encodingTypes = cursor(bytes, head.position())
  head.skip(block.declared.encodingTypes)
  const rawCodes = cursor(bytes, head.position())
  head.skip(block.declared.rawCodes)
  const pixelStream = cursor(bytes, head.position())
  const pixelOrigin = head.position()

  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const frame of geometry) {
    left = Math.min(left, frame.left)
    right = Math.max(right, frame.left + frame.width)
    top = Math.min(top, frame.top)
    bottom = Math.max(bottom, frame.top + frame.height)
  }
  const cellsX = 1 + Math.floor((right - left - 1) / CELL)
  const cellsY = 1 + Math.floor((bottom - top - 1) / CELL)
  for (const frame of geometry) {
    frame.columns = cellSizes(frame.width, (frame.left - left) % CELL)
    frame.rows = cellSizes(frame.height, (frame.top - top) % CELL)
    const across = frame.columns.reduce((sum, size) => sum + size, 0)
    const down = frame.rows.reduce((sum, size) => sum + size, 0)
    if (across !== frame.width || down !== frame.height) {
      return fail(`a frame's cells measure ${across}x${down}, not ${frame.width}x${frame.height}`)
    }
    for (const size of [...frame.columns, ...frame.rows]) {
      if (!CELL_SIDES.includes(size)) return fail(`a frame cell is ${size} pixels on a side`)
    }
  }

  // The codes as the decoder tracks them: one set per grid cell, and a cell the
  // mask does not name keeps its strips.
  const codes: number[][] = []
  const present: boolean[] = []
  for (let i = 0; i < cellsX * cellsY; i += 1) {
    codes.push([0, 0, 0, 0])
    present.push(false)
  }
  const entries: Entry[] = []
  for (let frameIndex = 0; frameIndex < geometry.length; frameIndex += 1) {
    const frame = geometry[frameIndex]
    const originX = Math.floor((frame.left - left) / CELL)
    const originY = Math.floor((frame.top - top) / CELL)
    for (let row = 0; row < frame.rows.length; row += 1) {
      for (let column = 0; column < frame.columns.length; column += 1) {
        const index = originX + column + (originY + row) * cellsX
        let mask: number
        if (present[index]) {
          if (block.declared.equalCells > 0) {
            const equalCell = equalCells.read(1)
            block.consumed.equalCells += 1
            if (equalCell !== 0) continue
          }
          mask = pixelMasks.read(4)
          block.consumed.pixelMasks += 4
        } else {
          // The first cell to reach this part of the canvas has nothing to copy
          // from: it is coded in full and reads no mask.
          mask = 0x0f
        }
        const strips = MASK_BIT_COUNT[mask]
        let encoding = 0
        if (strips !== 0 && block.declared.encodingTypes > 0) {
          encoding = encodingTypes.read(1)
          block.consumed.encodingTypes += 1
        }
        const stack: number[] = []
        if (strips !== 0) {
          let last = 0
          for (let i = 0; i < strips; i += 1) {
            let code: number
            if (encoding !== 0) {
              code = rawCodes.read(8)
              block.consumed.rawCodes += 8
            } else {
              code = last
              let displacement = pixelStream.read(4)
              code += displacement
              while (displacement === DISPLACEMENT_CHAIN) {
                displacement = pixelStream.read(4)
                code += displacement
              }
            }
            // A code equal to the one before it ends the list.
            if (code === last) break
            last = code
            stack.push(code)
          }
        }
        // The strips are filled from the highest set bit down.
        let next = stack.length - 1
        for (let strip = 0; strip < 4; strip += 1) {
          if ((mask & (1 << strip)) === 0) continue
          codes[index][strip] = next >= 0 ? stack[next] : 0
          next -= 1
        }
        present[index] = true
        entries.push({
          frame: frameIndex,
          cell: column + row * frame.columns.length,
          codes: codes[index].slice(),
        })
      }
    }
  }

  // Second pass: the pixels themselves. Their bit count depends on the codes, so
  // this can only run once the walk above is done — and it reads the codes the
  // entry had at the time it was coded, not whatever the cell holds now.
  let next = 0
  for (let frameIndex = 0; frameIndex < geometry.length; frameIndex += 1) {
    const frame = geometry[frameIndex]
    let cell = -1
    for (let row = 0; row < frame.rows.length; row += 1) {
      for (let column = 0; column < frame.columns.length; column += 1) {
        cell += 1
        const entry = entries[next]
        const coded = entry !== undefined && entry.frame === frameIndex && entry.cell === cell
        if (!coded) continue
        next += 1
        if (entry.codes[0] === entry.codes[1]) continue
        const perPixel = entry.codes[1] !== entry.codes[2] ? 2 : 1
        pixelStream.skip(frame.columns[column] * frame.rows[row] * perPixel)
      }
    }
  }

  if (block.consumed.equalCells !== block.declared.equalCells) {
    return fail(`equal-cell stream: ${block.consumed.equalCells} bits of ${block.declared.equalCells}`)
  }
  if (block.consumed.pixelMasks !== block.declared.pixelMasks) {
    return fail(`mask stream: ${block.consumed.pixelMasks} bits of ${block.declared.pixelMasks}`)
  }
  if (block.consumed.encodingTypes !== block.declared.encodingTypes) {
    return fail(
      `encoding-type stream: ${block.consumed.encodingTypes} bits of ${block.declared.encodingTypes}`,
    )
  }
  if (block.consumed.rawCodes !== block.declared.rawCodes) {
    return fail(`raw-code stream: ${block.consumed.rawCodes} bits of ${block.declared.rawCodes}`)
  }
  block.padding =
    totalBits - (head.position() - start * 8) - (pixelStream.position() - pixelOrigin)
  if (block.padding < 0) return fail(`the pixel stream overruns the block by ${-block.padding} bits`)
  if (block.padding > MAX_PADDING_BITS) {
    return fail(`${block.padding} bits of the block are unaccounted for`)
  }
  return block
}

function main(): void {
  const files: string[] = []
  findFiles(root, files)
  if (files.length === 0) {
    console.error(`verify-dcc: no .dcc files under ${root}`)
    process.exitCode = 1
    return
  }

  let blocks = 0
  let frames = 0
  let exact = 0
  let padded = 0
  let sizeRelation = 0
  let fileRelation = 0
  let filesOk = 0
  const failures: string[] = []
  const paddingHistogram = new Map<number, number>()

  for (const path of files) {
    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(readFileSync(path))
    } catch (error) {
      failures.push(`${relative(root, path)}: ${String(error)}`)
      continue
    }
    if (bytes.length < 0x0f || bytes[0] !== 0x74 || bytes[1] !== 6) {
      failures.push(`${relative(root, path)}: not a version 6 DCC`)
      continue
    }
    const directions = bytes[2]
    const framesPerDirection = bytes[3]
    const tableEnd = 0x0f + directions * 4
    if (directions === 0 || framesPerDirection === 0 || tableEnd > bytes.length) {
      failures.push(`${relative(root, path)}: no direction table fits`)
      continue
    }
    const offsets: number[] = []
    for (let i = 0; i < directions; i += 1) offsets.push(u32(bytes, 0x0f + i * 4))
    let fileGood = true
    if (offsets[0] !== tableEnd) {
      failures.push(`${relative(root, path)}: the first direction starts at ${offsets[0]}`)
      fileGood = false
    }
    for (let i = 0; i < directions; i += 1) {
      const to = i + 1 < directions ? offsets[i + 1] : bytes.length
      if (offsets[i] < tableEnd || offsets[i] >= to || to > bytes.length) {
        failures.push(`${relative(root, path)}: the direction table does not tile the file`)
        fileGood = false
        break
      }
    }

    let fileCoded = 0
    let fileFrames = 0
    for (let i = 0; i < directions; i += 1) {
      const to = i + 1 < directions ? offsets[i + 1] : bytes.length
      blocks += 1
      let block: Block
      try {
        block = walkBlock(bytes, offsets[i], to, framesPerDirection)
      } catch (error) {
        failures.push(`${relative(root, path)} direction ${i}: ${String(error)}`)
        fileGood = false
        continue
      }
      frames += block.frames
      fileFrames += block.frames
      fileCoded += block.outSizeCoded
      if (block.failure !== null) {
        fileGood = false
        if (failures.length < 20) {
          failures.push(`${relative(root, path)} direction ${i}: ${block.failure}`)
        }
        continue
      }
      exact += 1
      padded += block.padding
      paddingHistogram.set(block.padding, (paddingHistogram.get(block.padding) ?? 0) + 1)
      const expected = block.codedBytes + 35 * block.frames
      if (block.outSizeCoded === expected) sizeRelation += 1
      else {
        fileGood = false
        if (failures.length < 20) {
          failures.push(
            `${relative(root, path)} direction ${i}: OutSizeCoded ${block.outSizeCoded}, frames say ${expected}`,
          )
        }
      }
    }

    const expectedTotal = fileCoded + 4 * fileFrames + 24
    if (u32(bytes, 0x0b) === expectedTotal) fileRelation += 1
    else {
      fileGood = false
      failures.push(
        `${relative(root, path)}: header size ${u32(bytes, 0x0b)}, directions say ${expectedTotal}`,
      )
    }
    if (fileGood) filesOk += 1
  }

  const percent = blocks === 0 ? 0 : (100 * exact) / blocks
  console.log(`verify-dcc: ${files.length} files, ${blocks} direction blocks, ${frames} frames`)
  console.log(
    `verify-dcc: ${exact} blocks fully accounted for (${percent.toFixed(3)}%), ${padded} trailing ` +
      `padding bits in total`,
  )
  console.log(
    `verify-dcc: OutSizeCoded agrees with the frame headers on ${sizeRelation} blocks; the header ` +
      `size agrees with the directions on ${fileRelation} files; ${filesOk} files clean`,
  )
  console.log(
    `verify-dcc: padding histogram ` +
      [...paddingHistogram.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([bits, count]) => `${bits}:${count}`)
        .join(' '),
  )
  for (const failure of failures.slice(0, 20)) console.warn(`  ${failure}`)
  if (exact !== blocks || filesOk !== files.length) {
    console.error(`verify-dcc: FAILED (${blocks - exact} blocks, ${files.length - filesOk} files)`)
    process.exitCode = 1
    return
  }
  console.log('verify-dcc: OK')
}

main()
