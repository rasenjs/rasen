import { describe, expect, it } from 'vitest'
import { parseSprite, spriteFrame } from '../sprite'
import { nvnSwizzle } from '@rasenjs/assets'
import { nvnTexLayout, type NvnTextureDesc } from '@rasenjs/assets'

/**
 * The `SpA1` container, verified end to end against assets we build ourselves.
 * Both versions are covered, and the v61 case goes through the real storage
 * path: a linear DXT5 block is swizzled into Tegra layout, wrapped in a header,
 * and has to come back out as the colour we put in.
 */

function header(version: number, frameWidth: number, width: number, height: number): Uint8Array {
  const out = new Uint8Array(40)
  out.set(new TextEncoder().encode('SpA1'), 0)
  const view = new DataView(out.buffer)
  view.setUint16(4, version, true)
  view.setUint16(6, frameWidth, true)
  view.setUint32(8, width, true)
  view.setUint32(12, height, true)
  return out
}

/** A single fully opaque white DXT5 block (BC3: 8 bytes alpha, 8 bytes colour). */
function whiteDxt5Block(): Uint8Array {
  return new Uint8Array([
    255, 255, 0, 0, 0, 0, 0, 0, // alpha endpoints equal, all indices 0
    0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0, // colour0 = colour1 = white, indices 0
  ])
}

function dxt5Desc(width: number, height: number): NvnTextureDesc {
  return {
    target: 1,
    format: 0x44,
    flags: 0,
    samples: 0,
    width,
    height,
    depth: 1,
    levels: 1,
    stride: 0,
    pkgBlockH: 1, // matches the header byte we write below (0 → pkgBlockH 1)
  }
}

describe('SpA1 v31 (raw RGBA)', () => {
  it('reads pixels straight after the header', () => {
    const sprite = new Uint8Array(40 + 2 * 1 * 4)
    sprite.set(header(31, 2, 2, 1), 0)
    sprite.set([255, 0, 0, 255, 0, 255, 0, 128], 40)

    const parsed = parseSprite(sprite)
    expect(parsed.version).toBe(31)
    expect(parsed.width).toBe(2)
    expect(parsed.height).toBe(1)
    expect(Array.from(parsed.rgba)).toEqual([255, 0, 0, 255, 0, 255, 0, 128])
  })

  it('crops a frame out of a horizontal sheet', () => {
    const sprite = new Uint8Array(40 + 4 * 1 * 4)
    sprite.set(header(31, 2, 4, 1), 0)
    sprite.set([1, 1, 1, 255, 2, 2, 2, 255, 3, 3, 3, 255, 4, 4, 4, 255], 40)

    const frame = spriteFrame(parseSprite(sprite), 1)
    expect(frame.width).toBe(2)
    expect(Array.from(frame.rgba)).toEqual([3, 3, 3, 255, 4, 4, 4, 255])
  })

  it('rejects a file that is not SpA1', () => {
    expect(() => parseSprite(new Uint8Array(64))).toThrow(/not an SpA1/)
  })

  it('rejects an unknown version instead of guessing', () => {
    const sprite = new Uint8Array(40)
    sprite.set(header(99, 1, 1, 1), 0)
    expect(() => parseSprite(sprite)).toThrow(/unsupported version 99/)
  })
})

describe('SpA1 v61 (DXT5 in Tegra block-linear)', () => {
  it('decodes a swizzled header + block back to the colour that went in', () => {
    const desc = dxt5Desc(4, 4)
    const layout = nvnTexLayout(desc)

    // The stored payload is the block-linear image, not the linear blocks.
    const linear = whiteDxt5Block()
    const storage = new Uint8Array(layout.size)
    expect(nvnSwizzle(desc, 0, 0, linear, 16, storage)).toBe(true)

    const file = new Uint8Array(40 + storage.length)
    const head = header(61, 4, 4, 4)
    // Byte 23 is the packaged block height + 1; 0 here means "one GOB high".
    head[23] = 0
    file.set(head, 0)
    file.set(storage, 40)

    const parsed = parseSprite(file)
    expect(parsed.version).toBe(61)
    expect(parsed.width).toBe(4)
    expect(parsed.height).toBe(4)
    for (let i = 0; i < 16; i++) {
      expect(Array.from(parsed.rgba.subarray(i * 4, i * 4 + 4))).toEqual([255, 255, 255, 255])
    }
  })

  it('honours the packaged block height in the header', () => {
    // A 64×64 image with the header claiming a 4-GOB block height (byte 23 = 2)
    // must produce the same pixels as the automatic layout would, because the
    // data is built with the same block height.
    const desc: NvnTextureDesc = { ...dxt5Desc(64, 64), pkgBlockH: 3 }
    const layout = nvnTexLayout(desc)
    const pitch = Math.ceil(64 / 4) * 16
    const rows = Math.ceil(64 / 4)
    const linear = new Uint8Array(pitch * rows)
    for (let block = 0; block < rows * (pitch / 16); block++) {
      linear.set(whiteDxt5Block(), block * 16)
    }
    const storage = new Uint8Array(layout.size)
    expect(nvnSwizzle(desc, 0, 0, linear, pitch, storage)).toBe(true)

    const file = new Uint8Array(40 + storage.length)
    const head = header(61, 64, 64, 64)
    head[23] = 2 // pkgBlockH 3 = a 4-GOB block height for a DXT5 image
    file.set(head, 0)
    file.set(storage, 40)

    const parsed = parseSprite(file)
    expect(parsed.rgba.length).toBe(64 * 64 * 4)
    expect(Array.from(parsed.rgba.subarray(0, 4))).toEqual([255, 255, 255, 255])
    // The last pixel of the last block must be inside the image, not padding.
    expect(Array.from(parsed.rgba.subarray(parsed.rgba.length - 4))).toEqual([255, 255, 255, 255])
  })
})
