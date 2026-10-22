import { describe, expect, it } from 'vitest'
import { dccFrame, dccFrameCount, frameToRgba, parseDcc } from '../dcc'
import type { Palette } from '../tileart'

/**
 * The DCC container and its bit streams.
 *
 * The grammar these tests pin down was derived from the files rather than from
 * documentation, and `tools/verify-dcc.ts` checks it against all 298,134
 * direction blocks of the retail package. The assertions here are the small
 * facts that grammar implies: the direction table, the frame boxes, cells as 4x4
 * blocks phased with the direction's box, the strips a mask leaves alone, one or
 * two bits per pixel, and the coded canvas turned the right way up.
 *
 * The fixtures are built here rather than read from the game, so the tests say
 * what the layout is instead of only that a file parses.
 */

/** Collects bits the way the format stores them: least significant bit first. */
class BitWriter {
  private bits: number[] = []

  write(value: number, count: number): void {
    for (let i = 0; i < count; i += 1) this.bits.push((value >>> i) & 1)
  }

  /** A 4-bit displacement, chained while the value does not fit in one. */
  writeDisplacement(value: number): void {
    let rest = value
    while (rest > 14) {
      this.write(15, 4)
      rest -= 15
    }
    this.write(rest, 4)
  }

  get length(): number {
    return this.bits.length
  }

  bitsOf(): number[] {
    return [...this.bits]
  }

  /** The stream as bytes; the last one is padded with the zeros a block may leave over. */
  toBytes(): Uint8Array {
    const bytes = new Uint8Array(Math.ceil(this.bits.length / 8))
    this.bits.forEach((bit, index) => {
      if (bit) bytes[index >> 3] |= 1 << (index & 7)
    })
    return bytes
  }
}

interface CellSpec {
  /**
   * The codes of the strips the mask names, in the order the stream supplies
   * them: a displacement from zero for the first, from the code before it for
   * each later one. A code must therefore differ from its predecessor.
   */
  codes: number[]
  /** One selector per pixel, row major; read only when the cell's strips differ. */
  selectors?: number[]
  /** Copy this cell from where its grid cell was drawn last instead of coding it. */
  equal?: boolean
  /** Read this cell's codes as 8-bit values from the raw-code stream. */
  raw?: boolean
  /** Which strips are coded; a first touch codes all four. */
  mask?: number
}

interface FrameSpec {
  width: number
  height: number
  xOffset: number
  yOffset: number
  /** One entry per cell, in the frame's own cell order. */
  cells: CellSpec[]
}

interface DccSpec {
  directions: number
  framesPerDirection: number
  /** Palette indices the colour table holds; a code indexes this list. */
  palette: number[]
  /** One list of frames per direction. */
  frames: FrameSpec[][]
  /** Bit 1 asks for the equal-cell stream, bit 0 for the encoding-type and raw-code streams. */
  flags?: number
}

const FIELD_WIDTHS = [0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 26, 28, 30, 32]

function popcount(mask: number): number {
  let count = 0
  for (let i = 0; i < 4; i += 1) if ((mask & (1 << i)) !== 0) count += 1
  return count
}

/**
 * The strips a cell ends up with, given its mask and the codes read for it: the
 * first code read is the code of the highest strip the mask names, and a strip
 * the mask does not name keeps the code the cell had.
 */
function stripsOf(mask: number, codes: number[], previous: number[]): number[] {
  const strips = [...previous]
  let next = codes.length - 1
  for (let strip = 0; strip < 4; strip += 1) {
    if ((mask & (1 << strip)) === 0) continue
    strips[strip] = next >= 0 ? codes[next] : 0
    next -= 1
  }
  return strips
}

/** How many cells cover `size` pixels when the first starts `lead` into a grid cell. */
function cellCount(size: number, lead: number): number {
  const first = lead === 0 ? 4 : 4 - lead
  if (size - first <= 1) return 1
  const rest = size - first - 1
  const count = 2 + (rest >> 2)
  return (rest & 3) === 0 ? count - 1 : count
}

/** The sizes of those cells. */
function cellSizes(size: number, lead: number): number[] {
  const count = cellCount(size, lead)
  const first = lead === 0 ? 4 : 4 - lead
  if (count === 1) return [size]
  const sizes = [first]
  for (let i = 1; i < count - 1; i += 1) sizes.push(4)
  sizes.push(size - first - 4 * (count - 2))
  return sizes
}

/**
 * Builds a DCC from a description.
 *
 * The writer tracks the direction's grid exactly as the decoder does, so it knows
 * whether a cell reads an equal-cell bit and a mask or is coded in full. It also
 * writes the pixel stream the way the format has it: the codes of every cell
 * first, then the selectors of the cells that were coded.
 */
function buildDcc(spec: DccSpec): Uint8Array {
  const flags = spec.flags ?? 0
  const fieldWidths = { width: 8, height: 8, xOffset: 8, yOffset: 8, coded: 12 }
  const blocks = spec.frames.map((frames) => {
    const equalCells = new BitWriter()
    const masks = new BitWriter()
    const encodingTypes = new BitWriter()
    const rawCodes = new BitWriter()
    const pixelData = new BitWriter()
    const body = new BitWriter()
    body.write(0, 32) // OutSizeCoded
    body.write(flags, 2)
    for (const width of [
      0,
      fieldWidths.width,
      fieldWidths.height,
      fieldWidths.xOffset,
      fieldWidths.yOffset,
      0,
      fieldWidths.coded,
    ]) {
      body.write(FIELD_WIDTHS.indexOf(width), 4)
    }
    let left = Infinity
    let top = Infinity
    let right = -Infinity
    let bottom = -Infinity
    for (const frame of frames) {
      body.write(frame.width, fieldWidths.width)
      body.write(frame.height, fieldWidths.height)
      body.write(frame.xOffset & 0xff, fieldWidths.xOffset)
      body.write(frame.yOffset & 0xff, fieldWidths.yOffset)
      body.write(0, fieldWidths.coded)
      body.write(0, 1)
      left = Math.min(left, frame.xOffset)
      right = Math.max(right, frame.xOffset + frame.width)
      top = Math.min(top, frame.yOffset - frame.height + 1)
      bottom = Math.max(bottom, frame.yOffset)
    }
    const cellsX = 1 + Math.floor((right - left - 1) / 4)
    const cells: number[][] = []
    const present: boolean[] = []
    for (let i = 0; i < cellsX * (1 + Math.floor((bottom - top - 1) / 4)); i += 1) {
      cells.push([0, 0, 0, 0])
      present.push(false)
    }
    // First pass: the codes of every cell, the way the decoder reads them.
    const coded: { cell: CellSpec; strips: number[] }[] = []
    frames.forEach((frame) => {
      const frameTop = frame.yOffset - frame.height + 1
      const originX = Math.floor((frame.xOffset - left) / 4)
      const originY = Math.floor((frameTop - top) / 4)
      const columns = cellSizes(frame.width, (frame.xOffset - left) % 4)
      const rows = cellSizes(frame.height, (frameTop - top) % 4)
      expect(columns.reduce((sum, size) => sum + size, 0)).toBe(frame.width)
      expect(rows.reduce((sum, size) => sum + size, 0)).toBe(frame.height)
      expect(columns.length * rows.length).toBe(frame.cells.length)
      frame.cells.forEach((cell, index) => {
        const column = index % columns.length
        const row = Math.floor(index / columns.length)
        const grid = originX + column + (originY + row) * cellsX
        const mask = present[grid] ? cell.mask ?? 0x0f : 0x0f
        if (present[grid]) {
          if ((flags & 0x2) !== 0 && cell.equal === true) {
            equalCells.write(1, 1)
            coded.push({ cell, strips: cells[grid] })
            return
          }
          if ((flags & 0x2) !== 0) equalCells.write(0, 1)
          masks.write(mask, 4)
        }
        const strips = popcount(mask)
        const raw = cell.raw === true
        if (strips !== 0 && (flags & 0x1) !== 0) encodingTypes.write(raw ? 1 : 0, 1)
        let last = 0
        for (const code of cell.codes) {
          if (raw) rawCodes.write(code, 8)
          else pixelData.writeDisplacement(code - last)
          last = code
        }
        if (cell.codes.length < strips) {
          // A code equal to the one before it ends the list.
          if (raw) rawCodes.write(last, 8)
          else pixelData.writeDisplacement(0)
        }
        cells[grid] = stripsOf(mask, cell.codes, cells[grid])
        present[grid] = true
        coded.push({ cell, strips: cells[grid] })
      })
    })
    if ((flags & 0x2) !== 0) body.write(equalCells.length, 20)
    body.write(masks.length, 20)
    if ((flags & 0x1) !== 0) {
      body.write(encodingTypes.length, 20)
      body.write(rawCodes.length, 20)
    }
    for (let entry = 0; entry < 256; entry += 1) body.write(spec.palette.includes(entry) ? 1 : 0, 1)
    // Second pass: the selectors, in the same frame and cell order.
    let at = 0
    frames.forEach((frame) => {
      const frameTop = frame.yOffset - frame.height + 1
      const columns = cellSizes(frame.width, (frame.xOffset - left) % 4)
      const rows = cellSizes(frame.height, (frameTop - top) % 4)
      frame.cells.forEach((cell, index) => {
        const written = coded[at]
        at += 1
        if (written.cell !== cell) return
        const column = index % columns.length
        const row = Math.floor(index / columns.length)
        const strips = written.strips
        if (strips[0] === strips[1]) return
        const perPixel = strips[1] !== strips[2] ? 2 : 1
        for (let i = 0; i < columns[column] * rows[row]; i += 1) {
          pixelData.write(cell.selectors?.[i] ?? 0, perPixel)
        }
      })
    })
    for (const stream of [equalCells, masks, encodingTypes, rawCodes, pixelData]) {
      for (const bit of stream.bitsOf()) body.write(bit, 1)
    }
    return body.toBytes()
  })

  const first = 0x0f + spec.directions * 4
  const layout: number[] = []
  let offset = first
  for (const block of blocks) {
    layout.push(offset)
    offset += block.length
  }
  const file = new Uint8Array(offset)
  file[0] = 0x74
  file[1] = 6
  file[2] = spec.directions
  file[3] = spec.framesPerDirection
  layout.forEach((value, index) => {
    file[0x0f + index * 4] = value & 0xff
    file[0x10 + index * 4] = (value >> 8) & 0xff
    file[0x11 + index * 4] = (value >> 16) & 0xff
    file[0x12 + index * 4] = (value >> 24) & 0xff
  })
  blocks.forEach((block, index) => file.set(block, layout[index]))
  return file
}

/** A palette that maps index `n` to `(n, 0, 0)`, so a colour triplet is readable. */
function testPalette(): Palette {
  const rgb = new Uint8Array(256 * 3)
  for (let index = 0; index < 256; index += 1) rgb[index * 3] = index
  return { rgb }
}

/** The pixels of a frame, as rows of palette indices. */
function rows(frame: { width: number; height: number; pixels: Uint8Array }): number[][] {
  const out: number[][] = []
  for (let row = 0; row < frame.height; row += 1) {
    out.push([...frame.pixels.slice(row * frame.width, (row + 1) * frame.width)])
  }
  return out
}

/** A one-frame description of an 8x8 sprite: four 4x4 cells, only the first coded. */
function eightByEight(selectors: number[]): DccSpec {
  return {
    directions: 1,
    framesPerDirection: 1,
    palette: [0, 1, 2, 3, 4],
    frames: [
      [
        {
          width: 8,
          height: 8,
          xOffset: -3,
          yOffset: 12,
          cells: [
            { codes: [1, 2, 3], selectors },
            { codes: [] },
            { codes: [] },
            { codes: [] },
          ],
        },
      ],
    ],
  }
}

describe('parseDcc', () => {
  it('reads the header and the direction table', () => {
    const frames = (): FrameSpec[] =>
      Array.from({ length: 3 }, () => ({
        width: 4,
        height: 4,
        xOffset: 0,
        yOffset: 3,
        cells: [{ codes: [] }],
      }))
    const file = parseDcc(
      buildDcc({ directions: 2, framesPerDirection: 3, palette: [0, 1], frames: [frames(), frames()] }),
    )
    expect(file.version).toBe(6)
    expect(file.directions).toBe(2)
    expect(file.framesPerDirection).toBe(3)
    expect(file.frames).toHaveLength(2)
    expect(file.frames[0]).toHaveLength(3)
    expect(dccFrameCount(file, 1)).toBe(3)
    expect(dccFrameCount(file, 2)).toBe(0)
    expect(dccFrame(file, 1, 2)?.width).toBe(4)
    expect(dccFrame(file, 2, 0)).toBeNull()
    expect(dccFrame(file, 0, 3)).toBeNull()
    expect(dccFrame(file, -1, 0)).toBeNull()
  })

  it('reads a frame box, with signed offsets and the anchor at the box bottom', () => {
    const frame = parseDcc(buildDcc(eightByEight(new Array(64).fill(0)))).frames[0][0]
    expect(frame.width).toBe(8)
    expect(frame.height).toBe(8)
    expect(frame.offsetX).toBe(-3)
    expect(frame.offsetY).toBe(12)
  })

  it('rejects a file whose direction table cannot fit', () => {
    const bytes = new Uint8Array(0x12)
    bytes[0] = 0x74
    bytes[1] = 6
    bytes[2] = 8
    bytes[3] = 4
    expect(() => parseDcc(bytes)).toThrow(/does not fit/)
  })

  it('rejects a file that is not a version 6 DCC', () => {
    const bytes = buildDcc(eightByEight(new Array(64).fill(0)))
    const wrongSignature = bytes.slice()
    wrongSignature[0] = 0x75
    expect(() => parseDcc(wrongSignature)).toThrow(/expected 0x74/)
    const wrongVersion = bytes.slice()
    wrongVersion[1] = 7
    expect(() => parseDcc(wrongVersion)).toThrow(/version 7/)
  })

  it('rejects a direction block with bits no stream reaches', () => {
    // Four extra bytes leave 32 bits unaccounted for, more than the padding of
    // a block's last byte.
    const bytes = buildDcc(eightByEight(new Array(64).fill(0)))
    const padded = new Uint8Array(bytes.length + 4)
    padded.set(bytes)
    expect(() => parseDcc(padded)).toThrow(/unexplained/)
  })

  it('rejects a direction whose offset is out of bounds', () => {
    const bytes = buildDcc(eightByEight(new Array(64).fill(0)))
    const broken = bytes.slice()
    broken[0x0f] = 0x02 // one byte into the direction table
    expect(() => parseDcc(broken)).toThrow(/spans/)
  })
})

describe('the cell walk', () => {
  it('reads two bits per pixel into the coded canvas’ own rows', () => {
    // Every pixel of the first cell picks strip (x + y) % 4, and the cell's
    // strips are [3, 2, 1, 0] — a diagonal ramp. The other cells stay transparent.
    const selectors = Array.from({ length: 16 }, (_, i) => ((i % 4) + Math.floor(i / 4)) % 4)
    const frame = parseDcc(buildDcc(eightByEight(selectors))).frames[0][0]
    const strips = [3, 2, 1, 0]
    const canvas = (x: number, y: number): number =>
      x < 4 && y < 4 ? strips[selectors[y * 4 + x]] : 0
    const expected: number[][] = []
    for (let row = 0; row < 8; row += 1) {
      const line: number[] = []
      // The picture's row 0 is the coded canvas's row 0: this format stores its
      // rows top row first, and `dc6.ts` is the one that stores them the other way.
      for (let column = 0; column < 8; column += 1) line.push(canvas(column, row))
      expected.push(line)
    }
    expect(rows(frame)).toEqual(expected)
    // Strip 0 is code 0, which resolves to palette index 0 — transparent — so the
    // pixels that pick it (selector 3, four of the sixteen) are not drawn.
    expect([...frame.alpha].filter((value) => value === 255)).toHaveLength(12)
  })

  it('leaves a one-code cell opaque-free and reads no pixel bits for it', () => {
    const frame = parseDcc(buildDcc(eightByEight(new Array(16).fill(0)))).frames[0][0]
    for (let i = 0; i < 64; i += 1) {
      const column = i % 8
      const row = Math.floor(i / 8)
      // The cell the frame codes is its top left 4x4, and the frame's rows are the
      // coded canvas's rows in the same order.
      const covered = column < 4 && row < 4
      expect(frame.alpha[i]).toBe(covered ? 255 : 0)
    }
  })

  it('copies a cell marked equal instead of coding it again', () => {
    const selectors = Array.from({ length: 16 }, (_, i) => ((i % 4) + Math.floor(i / 4)) % 4)
    const frame = (last: CellSpec): FrameSpec => ({
      width: 8,
      height: 8,
      xOffset: 0,
      yOffset: 7,
      cells: [{ codes: [1, 2, 3], selectors }, { codes: [] }, { codes: [] }, last],
    })
    const file = parseDcc(
      buildDcc({
        directions: 1,
        framesPerDirection: 2,
        flags: 0x2,
        palette: [0, 1, 2, 3, 4],
        frames: [[frame({ codes: [] }), frame({ codes: [], equal: true })]],
      }),
    )
    expect(rows(file.frames[0][1])).toEqual(rows(file.frames[0][0]))
    expect([...file.frames[0][1].alpha]).toEqual([...file.frames[0][0].alpha])
  })

  it('inherits the strips a mask leaves alone', () => {
    // The second frame's cell codes only strips 0 and 1, and the single code it
    // reads lands in strip 1; strips 2 and 3 keep frame 0's codes.
    const first = new Array(16).fill(0)
    const second = [3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2]
    const frame = (selectors: number[], cell: CellSpec): FrameSpec => ({
      width: 4,
      height: 4,
      xOffset: 0,
      yOffset: 3,
      cells: [{ selectors, ...cell }],
    })
    const file = parseDcc(
      buildDcc({
        directions: 1,
        framesPerDirection: 2,
        palette: [0, 1, 2, 3, 4],
        frames: [
          [
            frame(first, { codes: [1, 2, 3] }),
            frame(second, { codes: [4], mask: 0b0011 }),
          ],
        ],
      }),
    )
    // Frame 0's strips are [3, 2, 1, 0]. Frame 1 codes strips 0 and 1: its only
    // code, 4, lands in strip 0 — the first code read goes to the highest strip
    // the mask names, and 0 is the lowest of the two — and strip 1 falls to zero
    // because the list ran out after one code. Strips 2 and 3 keep frame 0's
    // codes, 1 and 0.
    const strips = [4, 0, 1, 0]
    const coded = (selector: number): number => strips[selector]
    expect(rows(file.frames[0][1])).toEqual([
      second.slice(12, 16).map(coded),
      second.slice(8, 12).map(coded),
      second.slice(4, 8).map(coded),
      second.slice(0, 4).map(coded),
    ])
  })

  it('reads 8-bit codes when the encoding-type stream says so', () => {
    const selectors = Array.from({ length: 16 }, (_, i) => i % 4)
    const file = parseDcc(
      buildDcc({
        directions: 1,
        framesPerDirection: 1,
        flags: 0x1,
        palette: [0, 1, 2, 3, 4],
        frames: [
          [
            {
              width: 4,
              height: 4,
              xOffset: 0,
              yOffset: 3,
              cells: [{ codes: [1, 2, 4], selectors, raw: true }],
            },
          ],
        ],
      }),
    )
    // The strips are [4, 2, 1, 0], so selector 0..3 names code 4, 2, 1 or 0, and
    // the picture's row 0 is the coded block's row 0.
    const coded = (selector: number): number => [4, 2, 1, 0][selector]
    expect(rows(file.frames[0][0])).toEqual([
      selectors.slice(0, 4).map(coded),
      selectors.slice(4, 8).map(coded),
      selectors.slice(8, 12).map(coded),
      selectors.slice(12, 16).map(coded),
    ])
  })

  it('reads a frame wider than its cells divide into fours', () => {
    // Six pixels across is a cell of four and a cell of two, and the mask stream
    // has to account for the second cell being coded as well.
    const selectors = new Array(8).fill(0)
    const file = parseDcc(
      buildDcc({
        directions: 1,
        framesPerDirection: 1,
        palette: [0, 1, 2],
        frames: [
          [
            {
              width: 6,
              height: 2,
              xOffset: 0,
              yOffset: 1,
              cells: [
                { codes: [1, 2], selectors },
                { codes: [1, 2], selectors },
              ],
            },
          ],
        ],
      }),
    )
    expect(rows(file.frames[0][0])).toEqual([
      [2, 2, 2, 2, 2, 2],
      [2, 2, 2, 2, 2, 2],
    ])
  })
})

describe('frameToRgba', () => {
  it('colours the opaque pixels and leaves the transparent ones empty', () => {
    const frame = parseDcc(buildDcc(eightByEight(new Array(16).fill(0)))).frames[0][0]
    const rgba = frameToRgba(frame, testPalette())
    // The picture's first four rows are the coded cell, whose selector 0 names
    // strip 0 = code 3; the four rows below stayed transparent.
    for (let row = 0; row < 8; row += 1) {
      for (let column = 0; column < 8; column += 1) {
        const at = (row * 8 + column) * 4
        const coded = column < 4 && row < 4
        expect([...rgba.slice(at, at + 4)]).toEqual(coded ? [3, 0, 0, 255] : [0, 0, 0, 0])
      }
    }
  })
})
