import { describe, expect, it } from 'vitest'
import { dc6Frame, dc6FrameCount, frameToRgba, parseDc6, type Dc6Frame } from '../dc6'
import { createItemArtIndex, itemArtUrl, setItemArtIndex, type ItemArtIndex } from '../itemart'
import type { Palette } from '../tileart'

/**
 * The DC6 container and its run-length encoding.
 *
 * The grammar these tests pin down was derived from the files rather than from
 * documentation, and the assertions here are the small cases it has to satisfy:
 * a row ends at `0x80`, a byte without the high bit is a run, and a skip may be
 * spread over several bytes. `tools/verify-dc6.ts` checks the same grammar
 * against all 387,172 frames in the package, which is where the multi-byte skip
 * rule earns its place.
 */

/**
 * Builds a DC6 whose frames are packed with no gap, so the body of every frame
 * runs exactly `declared` bytes and the reader needs no tail.
 */
function buildDc6(options: {
  directions: number
  framesPerDirection: number
  /** One entry per frame, in direction-major order. */
  frames: Array<{ width: number; height: number; body: Uint8Array; offsetX?: number; offsetY?: number }>
}): Uint8Array {
  const count = options.directions * options.framesPerDirection
  const tableEnd = 0x18 + count * 4
  const firstHeader = tableEnd
  const total = options.frames.reduce((sum, frame) => sum + 0x20 + frame.body.length, 0)
  const bytes = new Uint8Array(firstHeader + total)
  const view = new DataView(bytes.buffer)

  view.setUint32(0, 6, true)
  view.setUint32(4, 1, true)
  view.setUint32(8, 0, true)
  view.setUint32(0x0c, 0xffffffff, true)
  view.setUint32(0x10, options.directions, true)
  view.setUint32(0x14, options.framesPerDirection, true)

  let at = firstHeader
  for (let i = 0; i < count; i += 1) {
    const frame = options.frames[i] ?? { width: 0, height: 0, body: new Uint8Array(0) }
    view.setUint32(0x18 + i * 4, at, true)
    view.setUint32(at + 0x04, frame.width, true)
    view.setUint32(at + 0x08, frame.height, true)
    view.setInt32(at + 0x0c, frame.offsetX ?? 0, true)
    view.setInt32(at + 0x10, frame.offsetY ?? 0, true)
    view.setUint32(at + 0x1c, frame.body.length, true)
    bytes.set(frame.body, at + 0x20)
    at += 0x20 + frame.body.length
  }
  return bytes
}

/** A palette that maps index `n` to `(n, 0, 0)`, so indices are readable. */
function testPalette(): Palette {
  const rgb = new Uint8Array(256 * 3)
  for (let index = 0; index < 256; index += 1) rgb[index * 3] = index
  return { rgb, colours: 256 } as unknown as Palette
}

/** The `height` rows of a frame, each as the indices it filled in. */
function rowsOf(frame: Dc6Frame): number[][] {
  const rows: number[][] = []
  for (let y = 0; y < frame.height; y += 1) {
    rows.push([...frame.alpha.slice(y * frame.width, (y + 1) * frame.width)])
  }
  return rows
}

describe('parseDc6', () => {
  it('reads the header and the frame table', () => {
    const dc6 = parseDc6(
      buildDc6({
        directions: 8,
        framesPerDirection: 3,
        frames: Array.from({ length: 24 }, () => ({
          width: 4,
          height: 4,
          body: new Uint8Array([0x80]),
        })),
      }),
    )
    expect(dc6.version).toBe(6)
    expect(dc6.directions).toBe(8)
    expect(dc6.framesPerDirection).toBe(3)
    expect(dc6.frames).toHaveLength(8)
    expect(dc6.frames[0]).toHaveLength(3)
    expect(dc6FrameCount(dc6, 7)).toBe(3)
    expect(dc6Frame(dc6, 7, 2)?.width).toBe(4)
    expect(dc6Frame(dc6, 8, 0)).toBeNull()
  })

  it('reads the frame offsets and anchors', () => {
    const dc6 = parseDc6(
      buildDc6({
        directions: 1,
        framesPerDirection: 1,
        frames: [{ width: 6, height: 5, offsetX: -2, offsetY: 7, body: new Uint8Array([0x80]) }],
      }),
    )
    const frame = dc6.frames[0][0]
    expect(frame.width).toBe(6)
    expect(frame.height).toBe(5)
    expect(frame.offsetX).toBe(-2)
    expect(frame.offsetY).toBe(7)
  })

  it('rejects a file whose frame table cannot fit', () => {
    const bytes = new Uint8Array(0x18)
    const view = new DataView(bytes.buffer)
    view.setUint32(0x10, 8, true)
    view.setUint32(0x14, 4, true)
    expect(() => parseDc6(bytes)).toThrow(/does not fit/)
  })

  it('accepts the frame counts the UI fonts use', () => {
    // `local/font/chi/font16.dc6` really has 13,806 frames in one direction, so
    // a cap on the count would reject real data.
    const body = new Uint8Array([0x80])
    const dc6 = parseDc6(
      buildDc6({
        directions: 1,
        framesPerDirection: 20000,
        frames: Array.from({ length: 20000 }, () => ({ width: 1, height: 1, body })),
      }),
    )
    expect(dc6.frames[0]).toHaveLength(20000)
  })
})

describe('the row encoding', () => {
  it('copies a run that starts at the row origin', () => {
    // 0x04 then four indices, then the row terminator.
    const dc6 = parseDc6(
      buildDc6({
        directions: 1,
        framesPerDirection: 1,
        frames: [
          { width: 4, height: 1, body: new Uint8Array([0x04, 9, 8, 7, 6, 0x80]) },
        ],
      }),
    )
    expect([...dc6.frames[0][0].pixels]).toEqual([9, 8, 7, 6])
  })

  it('skips transparent pixels before a run', () => {
    // 0x82 is a skip of 2, 0x02 the run length; the first two pixels stay empty.
    const dc6 = parseDc6(
      buildDc6({
        directions: 1,
        framesPerDirection: 1,
        frames: [{ width: 4, height: 1, body: new Uint8Array([0x82, 0x02, 5, 6, 0x80]) }],
      }),
    )
    const frame = dc6.frames[0][0]
    expect([...frame.pixels]).toEqual([0, 0, 5, 6])
    expect([...frame.alpha]).toEqual([0, 0, 255, 255])
  })

  it('spreads a skip over several bytes', () => {
    // 0xff 0x84 is a skip of 127 + 4; the game writes wide sprites this way, and
    // reading only one skip byte makes such frames drift and over-read.
    const dc6 = parseDc6(
      buildDc6({
        directions: 1,
        framesPerDirection: 1,
        frames: [
          { width: 140, height: 1, body: new Uint8Array([0xff, 0x84, 0x03, 1, 2, 3, 0x80]) },
        ],
      }),
    )
    const frame = dc6.frames[0][0]
    expect(frame.pixels[130]).toBe(0)
    expect(frame.pixels[131]).toBe(1)
    expect(frame.pixels[133]).toBe(3)
    expect([...frame.alpha.slice(0, 131)].every((a) => a === 0)).toBe(true)
  })

  it('ends a row at 0x80 and leaves the rest transparent', () => {
    const dc6 = parseDc6(
      buildDc6({
        directions: 1,
        framesPerDirection: 1,
        frames: [{ width: 4, height: 2, body: new Uint8Array([0x01, 3, 0x80, 0x80]) }],
      }),
    )
    const frame = dc6.frames[0][0]
    // The body runs bottom row first, so the run in its first row is the picture's
    // *last* row and the empty row it ends on is the picture's first.
    expect([...frame.alpha]).toEqual([0, 0, 0, 0, 255, 0, 0, 0])
  })

  it('advances a row for a bare 0x80', () => {
    const dc6 = parseDc6(
      buildDc6({
        directions: 1,
        framesPerDirection: 1,
        frames: [{ width: 2, height: 3, body: new Uint8Array([0x80, 0x02, 4, 5, 0x80, 0x80]) }],
      }),
    )
    const frame = dc6.frames[0][0]
    expect(frame.pixels[0]).toBe(0)
    expect(frame.pixels[2]).toBe(4)
    expect(frame.pixels[3]).toBe(5)
  })

  it('treats a zero-length run as no pixels', () => {
    // The encoders emit these as filler; they must not end the row.
    const dc6 = parseDc6(
      buildDc6({
        directions: 1,
        framesPerDirection: 1,
        frames: [{ width: 2, height: 1, body: new Uint8Array([0x00, 0x00, 0x02, 7, 8, 0x80]) }],
      }),
    )
    expect([...dc6.frames[0][0].pixels]).toEqual([7, 8])
  })

  it('clips a run that reaches past the frame width', () => {
    // Runs that overshoot the bounding box are normal in these files.
    const dc6 = parseDc6(
      buildDc6({
        directions: 1,
        framesPerDirection: 1,
        frames: [
          { width: 3, height: 1, body: new Uint8Array([0x05, 1, 2, 3, 4, 5, 0x80]) },
        ],
      }),
    )
    expect([...dc6.frames[0][0].pixels]).toEqual([1, 2, 3])
  })

  it('leaves trailing rows transparent when the body ends', () => {
    const dc6 = parseDc6(
      buildDc6({
        directions: 1,
        framesPerDirection: 1,
        frames: [{ width: 2, height: 4, body: new Uint8Array([0x02, 1, 2, 0x80]) }],
      }),
    )
    const rows = rowsOf(dc6.frames[0][0])
    // The one coded row is the picture's last: the body stores the rows bottom
    // first, so the rows it never reaches are the picture's *top* ones.
    expect(rows[3]).toEqual([255, 255])
    expect(rows.slice(0, 3).every((row) => row.every((a) => a === 0))).toBe(true)
  })
})

describe('frameToRgba', () => {
  it('maps transparent indices to zero alpha and the rest through the palette', () => {
    const dc6 = parseDc6(
      buildDc6({
        directions: 1,
        framesPerDirection: 1,
        frames: [
          { width: 3, height: 2, body: new Uint8Array([0x82, 0x01, 5, 0x80, 0x03, 7, 8, 9, 0x80]) },
        ],
      }),
    )
    const rgba = frameToRgba(dc6.frames[0][0], testPalette())
    // The body's first row is the picture's last: the skip-then-one row is the
    // picture's second row (two transparent pixels, then index 5 at x = 2) and the
    // run of three is its first.
    expect(rgba[0]).toBe(7)
    expect(rgba[4]).toBe(8)
    expect(rgba[8]).toBe(9)
    expect(rgba[11]).toBe(255)
    expect(rgba[15]).toBe(0)
    expect(rgba[19]).toBe(0)
    expect(rgba[20]).toBe(5)
    expect(rgba[23]).toBe(255)
  })
})

describe('item art index', () => {
  it('resolves a table name case-insensitively', () => {
    // The tables spell runes `invrShae`; the file on disk is `invrshae.png`.
    const index = createItemArtIndex('/base/', {
      items: [
        { code: 'invrshae', file: 'invrshae.png' },
        { code: 'invhax', file: 'invhax.png' },
      ],
    })
    expect(index.count).toBe(2)
    expect(itemArtUrl('invrShae', index)).toBe('/base/original/itemart/invrshae.png')
    expect(itemArtUrl('invhax', index)).toBe('/base/original/itemart/invhax.png')
    expect(itemArtUrl('invmissing', index)).toBeNull()
  })

  it('returns null rather than a broken URL when there is no art', () => {
    expect(itemArtUrl('invhax', null)).toBeNull()
    const empty = createItemArtIndex('/base/', {})
    expect(empty.count).toBe(0)
    expect(itemArtUrl('invhax', empty)).toBeNull()
  })

  it('falls back to the file name when an entry carries no code', () => {
    const index = createItemArtIndex('/b/', { items: [{ file: 'invpot.png' }] })
    expect(itemArtUrl('invpot', index)).toBe('/b/original/itemart/invpot.png')
  })

  it('installs the index for the HUD to resolve against', () => {
    const index: ItemArtIndex = createItemArtIndex('/b/', {
      items: [{ code: 'invpot', file: 'invpot.png' }],
    })
    setItemArtIndex(index)
    expect(itemArtUrl('invpot')).toBe('/b/original/itemart/invpot.png')
    setItemArtIndex(null)
    expect(itemArtUrl('invpot')).toBeNull()
  })
})
