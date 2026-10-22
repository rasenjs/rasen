/**
 * `.dc6` — the classic Diablo II sprite sheet.
 *
 * The format is a thin container: a header naming the direction and frame
 * counts, a table of frame offsets, and per frame a header plus run-length
 * encoded palette indices. Colours are indices into the game's 256-entry
 * palette, the same one `.dt1` tiles use.
 *
 * ```
 * 0x00 u32 version            6
 * 0x04 u32 flags              1
 * 0x08 u32 encoding           0
 * 0x0c u32 terminator         -1
 * 0x10 u32 directions
 * 0x14 u32 framesPerDirection
 * 0x18 u32[directions x frames] frame offsets, absolute
 * ```
 *
 * Per frame, at its offset:
 * ```
 * +0x00 u32 flip
 * +0x04 u32 width
 * +0x08 u32 height
 * +0x0c i32 offsetX          where the picture sits relative to its anchor
 * +0x10 i32 offsetY
 * +0x14 u32 zero
 * +0x18 u32 zero
 * +0x1c u32 dataLength
 * +0x20 pixels
 * ```
 *
 * ## The run-length encoding
 *
 * Each row is a stream of commands:
 *
 * - `0x80` ends the row. Whatever is left of the row stays transparent.
 * - any other byte with the high bit set adds `byte & 0x7f` to the number of
 *   transparent pixels to skip and the next byte is read the same way. A skip
 *   may therefore be spread over several bytes, which is how the game encodes
 *   the wide sprites: `ff 84 0f` is a skip of 131 followed by a run of 15.
 * - the first byte without the high bit is a run length, followed by that many
 *   palette indices.
 *
 * ## The body length
 *
 * `dataLength` is consistently three bytes short of the body. The body actually
 * runs to the next frame's offset — which is what this reader uses, falling back
 * to `dataLength + 3` for the last frame and for a frame whose successor offset
 * is not usable. The three bytes matter: they can complete the final run.
 *
 * ## Row order
 *
 * The encoded body runs **bottom row first**: the first row of it is the frame's
 * last row, so the picture's row 0 — its top row — is the last row coded. The reader
 * reverses the rows, and every frame comes back with row 0 at the top, the order
 * `dcc.ts` returns and the renderers address.
 *
 * That is measured, not read off the format. The `flip` word at `+0x00` is 0 in every
 * frame of every one of the 119 `.dc6` this export carries, so it carries no row
 * order, and nothing else in the header names one. The evidence is the game's own art
 * for the same assets: `global/items`' classic `.dc6` icons against the Resurrected
 * `.sprite` art of the same item, exported straight from its container and upright by
 * construction. Compared as the normalised row-width profile of each picture's content
 * span — so the comparison does not care where in its cell a redraw put the art — the
 * classic picture without the reversal is the HD picture mirrored: the kite shield's
 * point at the top of its cell instead of the bottom, a mean profile error of 0.385
 * against 0.020 for the shield, 0.301/0.110 for the mask, 0.296/0.113 for the cap, with
 * the round shields and the helm symmetric enough to say nothing either way. With the
 * reversal the two agree, 0.019 to 0.093. `tools/verify-anim-compose.ts` re-runs that
 * comparison and prints every pair's numbers.
 *
 * The old reading of `dcc.ts` concluded the opposite of this from the same two spells
 * of art — it compared one decoder's frames with the other's, and two decoders that
 * invert together agree with each other, so that comparison could not see it.
 *
 * ## Verification
 *
 * None of the above is inferred from documentation. Across all 2,562 DC6 files
 * in the package — 387,172 frames — this reader consumes exactly the body it is
 * given, decodes exactly `height` rows, and never runs past the frame's width.
 * `tools/verify-dc6.ts` re-runs that check against an extracted directory, and
 * it is the reason the multi-byte skip rule is here at all: without it 0.18% of
 * frames drift and read past their own data.
 *
 * The `encoding` field at `0x08` reads 0 even on files that are plainly encoded,
 * so it does not select the decoder; this build ships no raw DC6.
 */

import type { Palette } from './tileart'

export interface Dc6Frame {
  width: number
  height: number
  /** Where the picture sits relative to the frame's anchor, in pixels. */
  offsetX: number
  offsetY: number
  /** Indexed pixels, `width * height`, row major. */
  pixels: Uint8Array
  /** 255 where the pixel exists; 0 where it is transparent (palette index 0). */
  alpha: Uint8Array
}

export interface Dc6File {
  version: number
  directions: number
  framesPerDirection: number
  /** `[direction][frame]`. */
  frames: Dc6Frame[][]
}

/** How far past `dataLength` the encoded body extends. */
const BODY_TAIL = 3

function u32(bytes: Uint8Array, at: number): number {
  return (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
}

export function parseDc6(bytes: Uint8Array): Dc6File {
  if (bytes.length < 0x18) throw new Error('dc6: too short for a header')
  const version = u32(bytes, 0)
  const directions = u32(bytes, 0x10)
  const framesPerDirection = u32(bytes, 0x14)
  // The counts are bounded only by the offset table having to fit: the UI fonts
  // really do carry 13,806 frames in one direction, so a smaller "sane" cap
  // would reject real data.
  if (directions === 0 || framesPerDirection === 0) {
    throw new Error(`dc6: no frames (${directions} directions, ${framesPerDirection} frames)`)
  }
  const tableEnd = 0x18 + directions * framesPerDirection * 4
  if (tableEnd > bytes.length) {
    throw new Error(
      `dc6: offset table for ${directions}x${framesPerDirection} does not fit in ${bytes.length} bytes`,
    )
  }

  const count = directions * framesPerDirection
  const offsets = new Int32Array(count)
  for (let i = 0; i < count; i += 1) offsets[i] = u32(bytes, 0x18 + i * 4)

  const frames: Dc6Frame[][] = []
  for (let direction = 0; direction < directions; direction += 1) {
    const row: Dc6Frame[] = []
    for (let frame = 0; frame < framesPerDirection; frame += 1) {
      const index = direction * framesPerDirection + frame
      row.push(readFrame(bytes, offsets[index], offsets[index + 1] ?? bytes.length))
    }
    frames.push(row)
  }
  return { version, directions, framesPerDirection, frames }
}

function readFrame(bytes: Uint8Array, at: number, successor: number): Dc6Frame {
  const empty: Dc6Frame = {
    width: 0,
    height: 0,
    offsetX: 0,
    offsetY: 0,
    pixels: new Uint8Array(0),
    alpha: new Uint8Array(0),
  }
  if (at <= 0 || at + 0x20 > bytes.length) return empty

  const width = u32(bytes, at + 4)
  const height = u32(bytes, at + 8)
  const frame: Dc6Frame = {
    width,
    height,
    offsetX: u32(bytes, at + 0x0c) | 0,
    offsetY: u32(bytes, at + 0x10) | 0,
    pixels: new Uint8Array(width * height),
    alpha: new Uint8Array(width * height),
  }
  if (width === 0 || height === 0) return frame

  const bodyAt = at + 0x20
  const declared = u32(bytes, at + 0x1c)
  // The successor offset is the authority on where the body ends; `dataLength`
  // backs it up when the offsets are not usable.
  const toSuccessor = successor - bodyAt
  const length = Math.max(declared, Math.min(declared + BODY_TAIL, toSuccessor))
  decodeRle(bytes, bodyAt, length, frame)
  return frame
}

/**
 * Decodes the row commands into the frame's pixel buffer.
 *
 * A run that would leave the frame is clipped rather than rejected: the frame's
 * width is a bounding box, and encoded runs that reach past it are normal in
 * these files.
 *
 * The rows are stored bottom row first, so row `y` of the body is row
 * `height - 1 - y` of the picture — the reversal the header's "Row order" section
 * establishes from the game's own HD art of the same assets.
 */
function decodeRle(bytes: Uint8Array, at: number, length: number, frame: Dc6Frame): void {
  const { width, height, pixels, alpha } = frame
  const end = Math.min(at + Math.max(0, length), bytes.length)
  let cursor = at

  for (let y = 0; y < height; y += 1) {
    if (cursor >= end) break
    let x = 0
    // The body runs bottom row first: the first coded row is the picture's last.
    const rowAt = (height - 1 - y) * width
    for (;;) {
      if (cursor >= end) return
      let command = bytes[cursor]
      cursor += 1
      if (command === 0x80) break
      while (command & 0x80) {
        x += command & 0x7f
        if (cursor >= end) return
        command = bytes[cursor]
        cursor += 1
        if (command === 0x80) break
      }
      if (command === 0x80) break
      if (command === 0) continue
      const copy = Math.min(command, width - x, end - cursor)
      for (let i = 0; i < copy; i += 1) {
        const index = bytes[cursor + i]
        pixels[rowAt + x + i] = index
        alpha[rowAt + x + i] = index === 0 ? 0 : 255
      }
      cursor += command
      x += command
    }
  }
}

/** Turns an indexed frame into RGBA through the game's palette. */
export function frameToRgba(frame: Dc6Frame, palette: Palette): Uint8Array {
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
export function dc6Frame(file: Dc6File, direction: number, frame: number): Dc6Frame | null {
  if (direction < 0 || direction >= file.frames.length) return null
  return file.frames[direction][frame] ?? null
}

/** The number of frames in a direction, or 0 when the direction is missing. */
export function dc6FrameCount(file: Dc6File, direction: number): number {
  return file.frames[direction]?.length ?? 0
}
