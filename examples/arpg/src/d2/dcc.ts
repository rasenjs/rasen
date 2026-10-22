/**
 * `.dcc` — the compressed sprite the game uses for its characters and monsters.
 *
 * A DCC is a bit — not byte — level container. Every field below is a
 * little-endian bit field and the sub-streams of a direction are packed
 * contiguously, without a byte boundary between them, which is why this reader
 * needs a bit cursor rather than a view over the bytes.
 *
 * ```
 * 0x00 u8  signature              0x74
 * 0x01 u8  version                6 in all 23,435 files of the package
 * 0x02 u8  directions             1, 4, 8, 16 or 32
 * 0x03 u8  framesPerDirection
 * 0x04     three bytes, 0 in every file — meaning unknown
 * 0x07 u32 1 in every file — meaning unknown
 * 0x0b u32 the file-wide counterpart of a direction's `OutSizeCoded`, see below
 * 0x0f u32[directions] absolute offset of each direction block
 * ```
 *
 * A direction block, read from its offset as a bit stream:
 * ```
 * u32   OutSizeCoded
 * u2    flags — bit 1 declares the equal-cell stream, bit 0 the encoding-type
 *       and raw-code streams. The declared fields follow the flags exactly.
 * u4 x7 seven field widths, in this order:
 *         variable0, width, height, xOffset, yOffset, optionalBytes, codedBytes
 *       each a 4-bit index into
 *         [0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 26, 28, 30, 32]
 * then `framesPerDirection` frame headers, each
 *   u(variable0)   always 0 bits wide in this package
 *   u(width) u(height) u(xOffset) u(yOffset)   the offsets are signed
 *   u(optionalBytes) u(codedBytes) u1 bottomUp
 * then, when flags bit 1 is set, u20 equalCellBits
 * then u20 pixelMaskBits
 * then, when flags bit 0 is set, u20 encodingTypeBits and u20 rawCodeBits
 * then 256 one-bit flags: the palette entries this direction draws with, in
 *      ascending palette order. A pixel code is an index into *that* list, not a
 *      palette index directly — all 489,798,496 codes of the package are inside
 *      their own list.
 * then five bit streams, back to back, sharing the bit cursor: equal cells,
 *      pixel masks, encoding types, raw codes, and finally the pixel codes and
 *      displacements, which run to the end of the block.
 * ```
 *
 * ## Cells
 *
 * Pixels are not coded one by one but per *cell*: a 4x4 block of the direction's
 * bounding box. That box is the union of its frames' boxes, and its cells are
 * anchored at the box's top left, with the last column and row taking the
 * remainder. A frame uses the cells that fall inside its own box, its first cell
 * of a row or column shortened to the box's edge, which phases the grid with the
 * direction and not with the frame. Verified: those cells tile each frame's
 * rectangle exactly (298,134 of 298,134 direction blocks) and are 1 to 5 pixels
 * on a side.
 *
 * A frame's `xOffset` is its box's left column and its `yOffset` the box's
 * *bottom* row, so the box is `[xOffset, xOffset + width)` by
 * `[yOffset - height + 1, yOffset]`. The DC6 sprites the package ships beside
 * four of these carry exactly these numbers (240 frames, identical dimensions
 * and offsets), which is what pins the convention down.
 *
 * ## How a cell is coded
 *
 * A cell holds up to four pixel codes, one per strip of the block. The mask
 * stream supplies 4 bits per coded cell; its set bits are the strips whose code
 * is new, and the pixel-code stream then supplies one code per set bit, each a
 * signed 4-bit displacement from the code before it (a displacement of 15 chains
 * into the next 4-bit displacement). A displacement of 0 ends the list. A strip
 * the mask does not name keeps the code that cell had the last time it was
 * coded, which is what makes a DCC a delta format. When a cell's encoding-type
 * bit is set, its codes are read as 8-bit values from the raw-code stream
 * instead.
 *
 * The same stream then carries the pixels: a cell whose four codes are equal
 * reads nothing, one with exactly two distinct codes reads one bit per pixel,
 * and anything else two bits per pixel, each selecting a position in the strip
 * list. A cell whose equal-cell bit is set is not coded at all — its pixels are
 * copied from where the same grid cell was drawn last, or cleared when the cell
 * changed size.
 *
 * The stream is consumed in two passes, and that is the layout rather than an
 * implementation detail: every cell's codes come first, in frame and cell order,
 * and only then the per-pixel selectors of the cells that were coded. The DC6
 * cross-check below is what rules out the other reading — with the selectors
 * interleaved between cells the codes would be read from the wrong bits.
 *
 * ## Row order
 *
 * The walk above fills the frame box top row first, as the cells are stored, and
 * the picture it produces is the right way up: row 0 of a decoded frame is the
 * picture's top row, the order `dc6.ts` returns and the rest of the game draws, so
 * `crop` copies the canvas rows straight through.
 *
 * The earlier reading of this file was the opposite — that the walk mirrors the
 * picture and that reversing the rows is what reproduces the DC6 — and it was wrong
 * in a way worth recording, because it is what let the mistake survive. It rested on
 * a comparison of the two decoders' *outputs*: with `dc6.ts` returning its frames
 * bottom row first, reversing this one's rows made the DCC and DC6 pictures of the
 * same art match pixel for pixel (that measurement still holds; on `monsters/mq`'s
 * torso it is exact, IoU 1.0000), and two readers that invert together agree with
 * each other, so the comparison could not see that both were upside down.
 *
 * What settles it is art that no decoder produced: the `global/items` classic `.dc6`
 * icons against the Resurrected `.sprite` art of the same items, exported straight
 * from its container and upright by construction. Compared as the normalised
 * row-width profile of each picture's content span, the classic icon read the old way
 * is the HD picture mirrored — a kite shield's point at the top of its cell instead
 * of the bottom — and read this way the two agree. `dc6.ts`'s "Row order" section
 * carries the numbers and `tools/verify-anim-compose.ts` re-runs the comparison.
 *
 * The frame header's `bottomUp` bit is consistent with this: it is 0 in all
 * 3,668,261 frames of the package, and this format is the one that does not need the
 * reversal. The two formats differ, and that is the whole of it — DCC rows are stored
 * top row first, DC6 rows bottom row first.
 *
 * ## Verification
 *
 * The grammar was derived from the files, and `tools/verify-dcc.ts` re-checks it
 * against an extracted package with a second implementation:
 *
 * - the header, the five streams and the frame headers account for every bit of
 *   every direction block apart from at most 7 trailing bits of its last byte,
 *   and the four streams with a declared length are consumed exactly — 298,134
 *   of 298,134 direction blocks, 3,668,261 frames, 23,435 files;
 * - the number of 4-bit mask reads the cell geometry implies equals the declared
 *   mask stream length, so neither the cell count nor the cell sizes are free
 *   parameters;
 * - the direction table tiles the file: every offset is in bounds, strictly
 *   increasing, its first entry sits right after the table and the last block
 *   ends at the end of the file;
 * - `OutSizeCoded` = the sum over a direction's frames of `codedBytes + 35`, and
 *   the file header's size word = the sum of every direction's `OutSizeCoded`
 *   plus `4 * frames + 24`;
 * - read the other way round, the frame headers of a sampled 1,805 direction
 *   blocks describe boxes outside 512x512 in 95.07% of them: the bit order is
 *   little-endian, not the reverse.
 *
 * ## What is unknown
 *
 * - the three zero bytes at 0x04, the `1` at 0x07, and what the two "size coded"
 *   words count. They are self-consistent — the relations above hold on every
 *   file — but nothing in the data says what they measure;
 * - `codedBytes`: the relation above is all that could be established, and it is
 *   neither the byte nor the bit length of the frame's own data;
 * - `variable0`, `optionalBytes` and `bottomUp`: 0 in all 3,668,261 frames, so
 *   their meaning cannot be checked. A frame that sets either of the latter two
 *   is rejected rather than guessed at;
 * - the trailing bits of a direction block: 0 to 7 bits of its last byte that no
 *   declared stream reaches. They are not zero — 53% of partial blocks have a
 *   set bit there — and follow no rule that could be found, so they are ignored.
 */

import type { Palette } from './tileart'

export interface DccFrame {
  /** The picture's width in pixels. */
  width: number
  height: number
  /** Where the picture's left column sits relative to the frame's anchor. */
  offsetX: number
  /** The picture's *bottom* row, relative to the frame's anchor. */
  offsetY: number
  /** Palette indices, `width * height`, row major; row 0 is the top row. */
  pixels: Uint8Array
  /** 255 where the pixel exists; 0 where it is transparent (palette index 0). */
  alpha: Uint8Array
}

export interface DccFile {
  version: number
  directions: number
  framesPerDirection: number
  /** `[direction][frame]`. */
  frames: DccFrame[][]
}

const SIGNATURE = 0x74
/** Version 6 is the only version in the package and the only one this grammar covers. */
const SUPPORTED_VERSION = 6
/** Four bytes, then three zero bytes, a `1` and the file-wide size word. */
const HEADER_BYTES = 0x0f
/** Field widths are coded as indices into this table. */
const FIELD_WIDTHS = [0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 26, 28, 30, 32]
/** How many of a cell mask's four bits are set. */
const MASK_BIT_COUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4]
/** A cell is a 4x4 block of the direction's box. */
const CELL = 4
/** A 4-bit displacement of 15 chains into the next displacement. */
const DISPLACEMENT_CHAIN = 15
/** A direction block may end up to 7 bits into its last byte; more is a failure. */
const MAX_TRAILING_BITS = 7

function u32(bytes: Uint8Array, at: number): number {
  return (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
}

/**
 * A cursor over bits: the least significant bit of each byte first, values
 * assembled little-endian, so the first bit read is the value's bit 0.
 *
 * That is the order the files use. Read the other way round, the frame headers
 * of a sampled 1,805 direction blocks describe boxes outside 512x512 in 95.07%
 * of them; read this way, every one of them is inside 1..512.
 */
class Bits {
  private at: number
  private readonly origin: number

  constructor(private readonly bytes: Uint8Array, bit: number) {
    this.at = bit
    this.origin = bit
  }

  read(count: number): number {
    let value = 0
    for (let i = 0; i < count; i += 1) {
      value |= ((this.bytes[this.at >> 3] >> (this.at & 7)) & 1) << i
      this.at += 1
    }
    return value >>> 0
  }

  /** Two's complement, so a 1-bit offset reads as 0 or -1. */
  readSigned(count: number): number {
    if (count === 0) return 0
    const value = this.read(count)
    const sign = 1 << (count - 1)
    return value & sign ? value - (sign << 1) : value
  }

  skip(count: number): void {
    this.at += count
  }

  /** The absolute bit position the cursor is at. */
  get position(): number {
    return this.at
  }

  /** The bits read since this cursor was created. */
  get consumed(): number {
    return this.at - this.origin
  }
}

interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** A cell, positioned relative to the direction's box rather than to its frame. */
interface Cell {
  x: number
  y: number
  width: number
  height: number
}

interface FrameHeader {
  width: number
  height: number
  xOffset: number
  yOffset: number
  /** Not used to draw anything: `tools/verify-dcc.ts` relates it to `OutSizeCoded`. */
  codedBytes: number
  box: Box
  cells: Cell[]
  cellsX: number
  cellsY: number
}

/** One coded cell: the up-to-four pixel codes of a 4x4 block, plus their provenance. */
interface CellEntry {
  /** Codes as they stand in the stream, i.e. indices into the direction's colour list. */
  raw: number[]
  /** `raw` resolved to palette indices; comparisons are made on `raw`. */
  palette: number[]
  /** Which frame and which of that frame's cells the entry was coded for. */
  frame: number
  cell: number
}

/**
 * How many cells cover `size` pixels when the first one starts `lead` pixels into
 * a cell of the direction's grid.
 *
 * When the remainder is a single pixel the last two cells are merged rather than
 * split, which is what makes a cell 5 pixels wide. The mask stream's declared
 * length confirms the count on every direction block of the package, so this is
 * measured rather than assumed.
 */
function cellCount(size: number, lead: number): number {
  const first = lead === 0 ? CELL : CELL - lead
  if (size - first <= 1) return 1
  const rest = size - first - 1
  const count = 2 + (rest >> 2)
  return (rest & 3) === 0 ? count - 1 : count
}

/** The pixel sizes of those cells, in order. */
function cellSizes(size: number, lead: number): number[] {
  const count = cellCount(size, lead)
  if (count === 1) return [size]
  const first = lead === 0 ? CELL : CELL - lead
  const sizes = [first]
  for (let i = 1; i < count - 1; i += 1) sizes.push(CELL)
  sizes.push(size - first - CELL * (count - 2))
  return sizes
}

/** The direction's box: the union of its frames' boxes. */
function directionBox(headers: FrameHeader[]): Box {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const header of headers) {
    left = Math.min(left, header.box.left)
    right = Math.max(right, header.box.left + header.width)
    top = Math.min(top, header.box.top)
    bottom = Math.max(bottom, header.box.top + header.height)
  }
  return { left, top, width: right - left, height: bottom - top }
}

function frameCells(header: FrameHeader, box: Box): Cell[] {
  const widths = cellSizes(header.width, (header.box.left - box.left) % CELL)
  const heights = cellSizes(header.height, (header.box.top - box.top) % CELL)
  const cells: Cell[] = []
  let y = header.box.top - box.top
  for (const height of heights) {
    let x = header.box.left - box.left
    for (const width of widths) {
      cells.push({ x, y, width, height })
      x += width
    }
    y += height
  }
  return cells
}

interface Streams {
  equalCells: Bits | null
  pixelMasks: Bits
  encodingTypes: Bits | null
  rawCodes: Bits | null
  pixelCodes: Bits
}

/**
 * Walks every frame's cells in order, filling in the codes of each.
 *
 * The walk is what gives the streams their meaning: a cell whose grid cell has
 * been seen before reads its equal-cell bit and, when that is clear, its 4-bit
 * mask, while the first cell to touch a grid cell has nothing to copy and is
 * coded in full — so it reads no mask at all.
 *
 * Entries come back in the order the cells were coded, which is the order the
 * rendering pass has to consume them in.
 */
function codeCells(
  headers: FrameHeader[],
  box: Box,
  cellsX: number,
  cellsY: number,
  streams: Streams,
): CellEntry[] {
  const grid: (CellEntry | null)[] = new Array(cellsX * cellsY).fill(null)
  const entries: CellEntry[] = []
  for (let frame = 0; frame < headers.length; frame += 1) {
    const header = headers[frame]
    const originX = Math.floor((header.box.left - box.left) / CELL)
    const originY = Math.floor((header.box.top - box.top) / CELL)
    for (let row = 0; row < header.cellsY; row += 1) {
      for (let column = 0; column < header.cellsX; column += 1) {
        const index = originX + column + (originY + row) * cellsX
        const previous = grid[index]
        let mask: number
        if (previous === null) {
          // Nothing to copy from: every strip is coded.
          mask = 0x0f
        } else if (streams.equalCells !== null && streams.equalCells.read(1) !== 0) {
          continue
        } else {
          mask = streams.pixelMasks.read(4)
        }
        const raw = previous === null ? [0, 0, 0, 0] : previous.raw.slice()
        const strips = MASK_BIT_COUNT[mask]
        let encoding = 0
        if (strips !== 0 && streams.encodingTypes !== null) encoding = streams.encodingTypes.read(1)
        const stack: number[] = []
        if (strips !== 0) {
          let last = 0
          for (let i = 0; i < strips; i += 1) {
            let code: number
            if (encoding !== 0 && streams.rawCodes !== null) {
              code = streams.rawCodes.read(8)
            } else {
              code = last
              let displacement = streams.pixelCodes.read(4)
              code += displacement
              while (displacement === DISPLACEMENT_CHAIN) {
                displacement = streams.pixelCodes.read(4)
                code += displacement
              }
            }
            // A code equal to the one before it ends the list: the strips the
            // mask does not name keep what they had.
            if (code === last) break
            last = code
            stack.push(code)
          }
        }
        // The strips are filled from the highest set bit down, so the first
        // code decoded lands in the last strip the mask names.
        let next = stack.length - 1
        for (let strip = 0; strip < 4; strip += 1) {
          if ((mask & (1 << strip)) === 0) continue
          raw[strip] = next >= 0 ? stack[next] : 0
          next -= 1
        }
        const entry: CellEntry = { raw, palette: [], frame, cell: column + row * header.cellsX }
        entries.push(entry)
        grid[index] = entry
      }
    }
  }
  return entries
}

/**
 * Draws the coded cells into frames, reading the per-pixel selector bits.
 *
 * The entries are consumed in the order they were coded: the entry that lines up
 * with the cell being drawn is the one that was coded for it, and any other
 * means the cell was coded as "equal" and has to be copied from where its grid
 * cell was drawn last, or cleared when it changed size.
 */
function renderFrames(
  headers: FrameHeader[],
  box: Box,
  cellsX: number,
  cellsY: number,
  entries: CellEntry[],
  pixelCodes: Bits,
): DccFrame[] {
  const canvas = new Uint8Array(box.width * box.height)
  const last = new Array<Cell | null>(cellsX * cellsY).fill(null)
  const frames: DccFrame[] = []
  let next = 0
  for (let frame = 0; frame < headers.length; frame += 1) {
    const header = headers[frame]
    let cell = -1
    for (const current of header.cells) {
      cell += 1
      const index = Math.floor(current.x / CELL) + Math.floor(current.y / CELL) * cellsX
      const entry = entries[next]
      const coded = entry !== undefined && entry.frame === frame && entry.cell === cell
      const from = last[index]
      if (!coded) {
        if (from === null || current.width !== from.width || current.height !== from.height) {
          for (let y = 0; y < current.height; y += 1) {
            for (let x = 0; x < current.width; x += 1) {
              canvas[(current.y + y) * box.width + current.x + x] = 0
            }
          }
        } else {
          for (let y = 0; y < current.height; y += 1) {
            for (let x = 0; x < current.width; x += 1) {
              canvas[(current.y + y) * box.width + current.x + x] =
                canvas[(from.y + y) * box.width + from.x + x]
            }
          }
        }
      } else {
        next += 1
        if (entry.raw[0] === entry.raw[1]) {
          // One code only: every pixel of the block is that code, and the
          // stream carries nothing for this cell's pixels.
          for (let y = 0; y < current.height; y += 1) {
            for (let x = 0; x < current.width; x += 1) {
              canvas[(current.y + y) * box.width + current.x + x] = entry.palette[0]
            }
          }
        } else {
          const perPixel = entry.raw[1] !== entry.raw[2] ? 2 : 1
          for (let y = 0; y < current.height; y += 1) {
            for (let x = 0; x < current.width; x += 1) {
              canvas[(current.y + y) * box.width + current.x + x] =
                entry.palette[pixelCodes.read(perPixel)]
            }
          }
        }
      }
      last[index] = current
    }
    frames.push(crop(header, box, canvas))
  }
  return frames
}

/**
 * Cuts a frame's box out of the direction's canvas, turning it the right way up.
 *
 * The coded walk fills the box from its top row down, and the picture's own row
 * 0 is the box's last row — see the row-order note in the header comment.
 */
function crop(header: FrameHeader, box: Box, canvas: Uint8Array): DccFrame {
  const left = header.box.left - box.left
  const top = header.box.top - box.top
  const pixels = new Uint8Array(header.width * header.height)
  const alpha = new Uint8Array(header.width * header.height)
  // The canvas and the frame have the same row order — see the "Row order" note in
  // the header. A reversal here is what made every DCC frame upside down.
  for (let row = 0; row < header.height; row += 1) {
    const from = (top + row) * box.width + left
    for (let column = 0; column < header.width; column += 1) {
      const value = canvas[from + column]
      pixels[row * header.width + column] = value
      alpha[row * header.width + column] = value === 0 ? 0 : 255
    }
  }
  return {
    width: header.width,
    height: header.height,
    offsetX: header.xOffset,
    offsetY: header.yOffset,
    pixels,
    alpha,
  }
}

/** Decodes one direction block into the frames it holds. */
function decodeDirection(
  bytes: Uint8Array,
  start: number,
  end: number,
  framesPerDirection: number,
): DccFrame[] {
  const header = new Bits(bytes, start * 8)
  header.read(32) // OutSizeCoded; the checker relates it to the frame headers
  const flags = header.read(2)
  const widths = {
    variable0: FIELD_WIDTHS[header.read(4)],
    width: FIELD_WIDTHS[header.read(4)],
    height: FIELD_WIDTHS[header.read(4)],
    xOffset: FIELD_WIDTHS[header.read(4)],
    yOffset: FIELD_WIDTHS[header.read(4)],
    optionalBytes: FIELD_WIDTHS[header.read(4)],
    codedBytes: FIELD_WIDTHS[header.read(4)],
  }
  const headers: FrameHeader[] = []
  for (let i = 0; i < framesPerDirection; i += 1) {
    header.skip(widths.variable0)
    const width = header.read(widths.width)
    const height = header.read(widths.height)
    const xOffset = header.readSigned(widths.xOffset)
    const yOffset = header.readSigned(widths.yOffset)
    const optionalBytes = header.read(widths.optionalBytes)
    const codedBytes = header.read(widths.codedBytes)
    const bottomUp = header.read(1) !== 0
    if (optionalBytes !== 0) {
      throw new Error('dcc: a frame declares optional bytes; no file of the package does')
    }
    if (bottomUp) {
      throw new Error('dcc: a frame is bottom-up; no file of the package is')
    }
    if (width === 0 || height === 0) {
      throw new Error(`dcc: a frame has an empty box (${width}x${height})`)
    }
    headers.push({
      width,
      height,
      xOffset,
      yOffset,
      codedBytes,
      box: { left: xOffset, top: yOffset - height + 1, width, height },
      cells: [],
      cellsX: 0,
      cellsY: 0,
    })
  }

  const equalCellBits = (flags & 0x2) !== 0 ? header.read(20) : 0
  const pixelMaskBits = header.read(20)
  const encodingTypeBits = (flags & 0x1) !== 0 ? header.read(20) : 0
  const rawCodeBits = (flags & 0x1) !== 0 ? header.read(20) : 0

  const palette: number[] = []
  for (let i = 0; i < 256; i += 1) if (header.read(1) !== 0) palette.push(i)

  // The five streams are contiguous but a cell reads them in an order of its
  // own, so each one is a cursor of its own that starts where the previous one
  // ends.
  let equalCells: Bits | null = null
  if ((flags & 0x2) !== 0) {
    equalCells = new Bits(bytes, header.position)
    header.skip(equalCellBits)
  }
  const pixelMasks = new Bits(bytes, header.position)
  header.skip(pixelMaskBits)
  let encodingTypes: Bits | null = null
  if ((flags & 0x1) !== 0) {
    encodingTypes = new Bits(bytes, header.position)
    header.skip(encodingTypeBits)
  }
  let rawCodes: Bits | null = null
  if ((flags & 0x1) !== 0) {
    rawCodes = new Bits(bytes, header.position)
    header.skip(rawCodeBits)
  }
  const pixelCodes = new Bits(bytes, header.position)

  const box = directionBox(headers)
  const cellsX = 1 + Math.floor((box.width - 1) / CELL)
  const cellsY = 1 + Math.floor((box.height - 1) / CELL)
  for (const frame of headers) {
    frame.cells = frameCells(frame, box)
    frame.cellsX = cellSizes(frame.width, (frame.box.left - box.left) % CELL).length
    frame.cellsY = cellSizes(frame.height, (frame.box.top - box.top) % CELL).length
  }

  const entries = codeCells(headers, box, cellsX, cellsY, {
    equalCells,
    pixelMasks,
    encodingTypes,
    rawCodes,
    pixelCodes,
  })
  // The walk has to have consumed exactly the streams the block declared. They
  // have declared lengths, so this is the sharpest check the grammar has, and it
  // is what caught the cell sizes and the per-pixel bit counts during the
  // derivation.
  const exact = (cursor: Bits | null, declared: number, name: string): void => {
    if (cursor !== null && cursor.consumed !== declared) {
      throw new Error(`dcc: the ${name} stream is ${declared} bits but ${cursor.consumed} were read`)
    }
  }
  exact(equalCells, equalCellBits, 'equal-cell')
  exact(pixelMasks, pixelMaskBits, 'mask')
  exact(encodingTypes, encodingTypeBits, 'encoding-type')
  exact(rawCodes, rawCodeBits, 'raw-code')

  for (const entry of entries) entry.palette = entry.raw.map((code) => palette[code])
  const frames = renderFrames(headers, box, cellsX, cellsY, entries, pixelCodes)

  // Everything the block declares has been read: what is left of its last byte
  // is padding, and 0 to 7 bits of it is the most the package ever has.
  const trailing = (end - start) * 8 - (pixelCodes.position - start * 8)
  if (trailing < 0 || trailing > MAX_TRAILING_BITS) {
    throw new Error(`dcc: ${trailing} bits of the direction block were left unexplained`)
  }
  return frames
}

export function parseDcc(bytes: Uint8Array): DccFile {
  if (bytes.length < HEADER_BYTES) throw new Error('dcc: too short for a header')
  if (bytes[0] !== SIGNATURE) {
    throw new Error(`dcc: signature 0x${bytes[0].toString(16)}, expected 0x74`)
  }
  const version = bytes[1]
  if (version !== SUPPORTED_VERSION) throw new Error(`dcc: version ${version}, expected 6`)
  const directions = bytes[2]
  const framesPerDirection = bytes[3]
  if (directions === 0 || framesPerDirection === 0) {
    throw new Error(`dcc: no frames (${directions} directions, ${framesPerDirection} frames)`)
  }
  const tableEnd = HEADER_BYTES + directions * 4
  if (tableEnd > bytes.length) {
    throw new Error(
      `dcc: direction table for ${directions} directions does not fit in ${bytes.length} bytes`,
    )
  }
  const offsets: number[] = []
  for (let i = 0; i < directions; i += 1) offsets.push(u32(bytes, HEADER_BYTES + i * 4))
  for (let i = 0; i < directions; i += 1) {
    const from = offsets[i]
    const to = i + 1 < directions ? offsets[i + 1] : bytes.length
    if (from < tableEnd || from >= to || to > bytes.length) {
      throw new Error(`dcc: direction ${i} spans [${from}, ${to}) of ${bytes.length} bytes`)
    }
  }
  const frames: DccFrame[][] = []
  for (let i = 0; i < directions; i += 1) {
    const to = i + 1 < directions ? offsets[i + 1] : bytes.length
    frames.push(decodeDirection(bytes, offsets[i], to, framesPerDirection))
  }
  return { version, directions, framesPerDirection, frames }
}

/** Turns an indexed frame into RGBA through the game's palette. */
export function frameToRgba(frame: DccFrame, palette: Palette): Uint8Array {
  const out = new Uint8Array(frame.width * frame.height * 4)
  for (let i = 0; i < frame.pixels.length; i += 1) {
    if (frame.alpha[i] === 0) continue
    const source = frame.pixels[i] * 3
    out[i * 4] = palette.rgb[source]
    out[i * 4 + 1] = palette.rgb[source + 1]
    out[i * 4 + 2] = palette.rgb[source + 2]
    out[i * 4 + 3] = 255
  }
  return out
}

/** The frame at a direction and frame index, or null when it does not exist. */
export function dccFrame(file: DccFile, direction: number, frame: number): DccFrame | null {
  if (direction < 0 || direction >= file.frames.length) return null
  return file.frames[direction][frame] ?? null
}

/** The number of frames in a direction, or 0 when the direction is missing. */
export function dccFrameCount(file: DccFile, direction: number): number {
  return file.frames[direction]?.length ?? 0
}
