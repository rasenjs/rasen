/**
 * `SpA1` sprites — the container the game's own UI art uses.
 *
 * A port of `sprite()` in `dm/ios/tools/romfs_art.py`. Header:
 *
 *   0x00  'SpA1'
 *   0x04  u16 version   (31 = raw RGBA, 61 = DXT5 in Tegra block-linear)
 *   0x06  u16 frameWidth (display width; a sheet can hold several frames)
 *   0x08  u32 width
 *   0x0c  u32 height
 *   0x28  payload
 *
 * The DXT5 case is the interesting one and the reason `nvn-tex.ts` /
 * `nvn-deswizzle.ts` exist at all: the payload is stored in the Switch GPU's
 * block-linear layout, so it has to be un-swizzled before the blocks mean
 * anything. The original does that in C and then hands the linear result to
 * Pillow inside a synthetic DDS header; here the block decode is done in
 * TypeScript so the browser needs no image pipeline.
 */

import { decodeDxt5, nvnDeswizzle } from './nvn-deswizzle'
import type { NvnTextureDesc } from './nvn-tex'

/** NVNformat for BC3_UNORM (DXT5). */
const NVN_FORMAT_DXT5 = 0x44

export interface Sprite {
  version: number
  /** Display width of one frame; the image may hold `width / frameWidth` frames. */
  frameWidth: number
  width: number
  height: number
  /** RGBA bytes, `width * height * 4`. */
  rgba: Uint8Array
}

function readUint16(bytes: Uint8Array, at: number): number {
  return bytes[at] | (bytes[at + 1] << 8)
}

function readUint32(bytes: Uint8Array, at: number): number {
  return (
    (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
  )
}

function ascii(bytes: Uint8Array, at: number, length: number): string {
  let out = ''
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[at + i])
  return out
}

/** Parse an `SpA1` sprite. Throws when the magic or version is unexpected. */
export function parseSprite(bytes: Uint8Array): Sprite {
  if (ascii(bytes, 0, 4) !== 'SpA1') {
    throw new Error('sprite: not an SpA1 file')
  }
  const version = readUint16(bytes, 4)
  const frameWidth = readUint16(bytes, 6)
  const width = readUint32(bytes, 8)
  const height = readUint32(bytes, 12)

  if (version === 31) {
    const start = 40
    const needed = width * height * 4
    if (bytes.length < start + needed) throw new Error('sprite: truncated v31 payload')
    return { version, frameWidth, width, height, rgba: bytes.slice(start, start + needed) }
  }

  if (version === 61) {
    // Byte 23 of the header is the packaged-layout block height + 1.
    const desc: NvnTextureDesc = {
      target: 1,
      format: NVN_FORMAT_DXT5,
      flags: 0,
      samples: 0,
      width,
      height,
      depth: 1,
      levels: 1,
      stride: 0,
      pkgBlockH: bytes[23] + 1,
    }

    const pitch = Math.ceil(width / 4) * 16
    const linear = new Uint8Array(pitch * Math.ceil(height / 4))
    if (!nvnDeswizzle(desc, 0, 0, bytes.subarray(40), linear, pitch)) {
      throw new Error('sprite: DXT5 layout not supported')
    }
    return { version, frameWidth, width, height, rgba: decodeDxt5(linear, width, height, pitch) }
  }

  // Version 50 is the third variant the export holds, and it is not identified. It
  // appears in exactly one file — `hd/global/ui/frontend/hd/hdr_calibration.sprite`,
  // 960 x 960 with a 7,864,320-byte payload, which is 2.13 times the RGBA payload that
  // size implies and neither the v31 layout nor v61's DXT5 (whose payload at that size
  // is 921,600 bytes, 8.5 times smaller) — and it belongs to a calibration screen this
  // app does not draw. Reported rather than guessed at, and the name is here so that a
  // reader who meets it in `tools/verify-ui-atlas.ts` does not have to find it again.
  throw new Error(`sprite: unsupported version ${version}`)
}

/**
 * One frame of a horizontal sprite sheet.
 *
 * The header's `frameWidth` is the display width, which is why this is not a
 * plain `index * width / frames` division.
 */
export function spriteFrame(sprite: Sprite, index: number): Sprite {
  if (sprite.frameWidth <= 0 || sprite.frameWidth >= sprite.width) return sprite
  const frames = Math.max(1, Math.floor(sprite.width / sprite.frameWidth))
  const frame = ((index % frames) + frames) % frames
  const out = new Uint8Array(sprite.frameWidth * sprite.height * 4)
  for (let y = 0; y < sprite.height; y++) {
    const from = (y * sprite.width + frame * sprite.frameWidth) * 4
    out.set(sprite.rgba.subarray(from, from + sprite.frameWidth * 4), y * sprite.frameWidth * 4)
  }
  return {
    version: sprite.version,
    frameWidth: sprite.frameWidth,
    width: sprite.frameWidth,
    height: sprite.height,
    rgba: out,
  }
}

/**
 * Put the pixels on a canvas so they can be drawn, and so the browser's own
 * scaling and alpha handling applies.
 *
 * Kept out of `parseSprite` on purpose: the decode half runs in Node (a CLI
 * pre-pass, and the unit tests) where there is no `document`.
 */
export function spriteToCanvas(
  sprite: Sprite,
  target?: HTMLCanvasElement | OffscreenCanvas,
): HTMLCanvasElement | OffscreenCanvas {
  const canvas =
    target ??
    (typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(sprite.width, sprite.height)
      : document.createElement('canvas'))
  canvas.width = sprite.width
  canvas.height = sprite.height

  const context = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null
  if (!context) throw new Error('sprite: no 2D context available')

  // Straight (non-premultiplied) RGBA is what ImageData wants, and that is
  // exactly what the decode produced.
  context.putImageData(
    new ImageData(new Uint8ClampedArray(sprite.rgba), sprite.width, sprite.height),
    0,
    0,
  )
  return canvas
}
