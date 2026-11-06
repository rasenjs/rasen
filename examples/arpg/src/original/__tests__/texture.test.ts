import { describe, expect, it } from 'vitest'
import { nvnSwizzle } from '@rasenjs/assets'
import type { NvnTextureDesc } from '@rasenjs/assets'
import { decodeTexture, mipOffset, parseTextureHeader } from '@rasenjs/assets'

/**
 * The `.texture` container, tested against assets fabricated here plus the
 * arithmetic that was confirmed against real files.
 *
 * The mip-offset rule is the part worth pinning: it was derived by matching
 * 1,200+ real files' sizes against candidate layouts, and a regression there
 * would silently decode every texture at the wrong offset.
 */

/** Build a `<DE(` container around a payload. */
function container(
  formatCode: number,
  width: number,
  height: number,
  payload: Uint8Array,
  opts: { blockLinear?: boolean; blockHeightLog2?: number } = {},
): Uint8Array {
  const mips = 1
  const dataStart = 0x24 + 8 * mips
  const out = new Uint8Array(dataStart + payload.length)
  const view = new DataView(out.buffer)
  out[0] = 0x3c
  out[1] = 0x44
  out[2] = 0x45
  out[3] = 0x28
  out[4] = formatCode
  view.setUint32(8, width, true)
  view.setUint32(12, height, true)
  out[0x13] = opts.blockHeightLog2 ?? 0
  if (opts.blockLinear) view.setUint32(0x14, 7, false) // bytes 00 00 00 07
  view.setUint32(0x1c, mips, true)
  view.setUint32(0x24, payload.length, true) // level size
  view.setUint32(0x28, 0, true) // level offset
  out.set(payload, dataStart)
  return out
}

/** One opaque white BC1 block. */
function whiteBc1(): Uint8Array {
  return new Uint8Array([0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0])
}

describe('texture header', () => {
  it('reads format, size and data offset', () => {
    const bytes = container(61, 8, 4, new Uint8Array(64))
    const header = parseTextureHeader(bytes)
    expect(header.formatCode).toBe(61)
    expect(header.format).toBe('bc3')
    expect(header.sRGB).toBe(false)
    expect(header.width).toBe(8)
    expect(header.height).toBe(4)
    expect(header.mips).toBe(1)
    expect(header.dataStart).toBe(0x24 + 8)
    // No block-linear marker: the payload is plain block rows.
    expect(header.blockLinear).toBe(false)
  })

  it('flags sRGB for format 62', () => {
    expect(parseTextureHeader(container(62, 4, 4, new Uint8Array(16))).sRGB).toBe(true)
  })

  it('maps every known format code to its NVN format', () => {
    // The reference project's d2r_nvn() table. 63 is BC4 and 65 is BC5 —
    // single-/two-channel, not colour; decoding them as BC1/BC3 is noise.
    expect(parseTextureHeader(container(61, 4, 4, new Uint8Array(16))).nvnFormat).toBe(0x44)
    expect(parseTextureHeader(container(62, 4, 4, new Uint8Array(16))).nvnFormat).toBe(0x48)
    expect(parseTextureHeader(container(63, 4, 4, new Uint8Array(16))).format).toBe('bc4')
    expect(parseTextureHeader(container(63, 4, 4, new Uint8Array(16))).nvnFormat).toBe(0x49)
    expect(parseTextureHeader(container(65, 4, 4, new Uint8Array(16))).format).toBe('bc5')
    expect(parseTextureHeader(container(65, 4, 4, new Uint8Array(16))).nvnFormat).toBe(0x4b)
    expect(parseTextureHeader(container(57, 4, 4, new Uint8Array(16))).format).toBe('bc1')
    expect(parseTextureHeader(container(31, 4, 4, new Uint8Array(16))).nvnFormat).toBe(0x25)
  })

  it('reads the block-linear marker and the packaged block height', () => {
    const header = parseTextureHeader(container(61, 4, 4, new Uint8Array(16), {
      blockLinear: true,
      blockHeightLog2: 3,
    }))
    expect(header.blockLinear).toBe(true)
    expect(header.blockHeight).toBe(4) // stored log2 + 1
  })

  it('rejects a file that is not a texture container', () => {
    expect(() => parseTextureHeader(new Uint8Array(64))).toThrow(/not a <DE/)
  })

  it('reports an unknown format instead of decoding nonsense', () => {
    const bytes = container(0x77, 4, 4, new Uint8Array(64))
    expect(parseTextureHeader(bytes).format).toBe('unknown')
    expect(() => decodeTexture(bytes)).toThrow(/unknown format code/)
  })
})

describe('mip layout', () => {
  // Confirmed against real files: every level is padded to 512 bytes.
  it('pads each level to 512 bytes', () => {
    // 128×128 BC3: level 0 is 32×32 blocks × 16 = 16384 (already 512-aligned).
    expect(mipOffset('bc3', 128, 128, 0)).toBe(0)
    expect(mipOffset('bc3', 128, 128, 1)).toBe(16384)
    // Level 1 is 16×16 blocks × 16 = 4096.
    expect(mipOffset('bc3', 128, 128, 2)).toBe(16384 + 4096)
    // Level 2 is 8×8 × 16 = 1024.
    expect(mipOffset('bc3', 128, 128, 3)).toBe(16384 + 4096 + 1024)
    // Level 3 is 4×4 × 16 = 256 → padded to 512.
    expect(mipOffset('bc3', 128, 128, 4)).toBe(16384 + 4096 + 1024 + 512)
  })

  it('reproduces the size of a real 256×256 BC3 file with 9 levels', () => {
    // The retail file is 89,708 bytes with data starting at 108 → 89,600 bytes.
    // Unpadded the 9 levels total 87,408; padded they total exactly 89,600.
    const total = mipOffset('bc3', 256, 256, 9)
    expect(total).toBe(89600)
  })

  it('accounts for BC1 being half the size of BC3', () => {
    expect(mipOffset('bc1', 128, 128, 1)).toBe(8192)
  })

  it('handles uncompressed RGBA8 without block padding arithmetic', () => {
    expect(mipOffset('rgba8', 8, 8, 0)).toBe(0)
    expect(mipOffset('rgba8', 8, 8, 1)).toBe(512) // 8*8*4 = 256 → padded
  })
})

describe('bc1 decoding', () => {
  it('decodes a white 4x4 block', () => {
    const bytes = container(57, 4, 4, whiteBc1())
    const texture = decodeTexture(bytes)
    expect(texture.width).toBe(4)
    expect(texture.height).toBe(4)
    expect(Array.from(texture.rgba.subarray(0, 4))).toEqual([255, 255, 255, 255])
  })

  it('decodes a 4x8 image as two block rows', () => {
    const payload = new Uint8Array(32)
    payload.set(whiteBc1(), 0)
    payload.set(whiteBc1(), 8)
    const texture = decodeTexture(container(57, 4, 8, payload))
    expect(texture.height).toBe(8)
    // The last pixel of the second block row must be inside the image.
    expect(Array.from(texture.rgba.subarray(texture.rgba.length - 4))).toEqual([255, 255, 255, 255])
  })

  it('rejects a payload shorter than the image needs', () => {
    const bytes = container(57, 64, 64, new Uint8Array(16))
    expect(() => decodeTexture(bytes)).toThrow(/truncated bc1/)
  })
})

describe('bc4 / bc5 decoding', () => {
  /** One BC4 block: endpoints a0/a1 and 16 indices of 0 (→ a0). */
  function flatBc4(a0: number, a1: number): Uint8Array {
    return new Uint8Array([a0, a1, 0, 0, 0, 0, 0, 0])
  }

  it('decodes BC4 as the channel replicated to RGB', () => {
    const texture = decodeTexture(container(63, 4, 4, flatBc4(200, 100)))
    expect(Array.from(texture.rgba.subarray(0, 4))).toEqual([200, 200, 200, 255])
  })

  it('decodes BC5 as red + green', () => {
    const payload = new Uint8Array(16)
    payload.set(flatBc4(10, 20), 0) // red
    payload.set(flatBc4(30, 40), 8) // green
    const texture = decodeTexture(container(65, 4, 4, payload))
    expect(Array.from(texture.rgba.subarray(0, 4))).toEqual([10, 30, 0, 255])
  })
})

describe('block-linear payloads', () => {
  it('unweaves GOB storage before decoding (round trip through nvnSwizzle)', () => {
    // 32×32 BC3: 8×8 blocks, 128 bytes per block row.
    const width = 32
    const height = 32
    const pitch = Math.ceil(width / 4) * 16
    const rows = Math.ceil(height / 4)
    const linear = new Uint8Array(pitch * rows)
    // A recognizable pattern: block (bx, by) carries its coordinates.
    for (let by = 0; by < rows; by++) {
      for (let bx = 0; bx < pitch / 16; bx++) {
        linear[by * pitch + bx * 16] = 0x10 + bx
        linear[by * pitch + bx * 16 + 1] = 0x40 + by
      }
    }
    const desc: NvnTextureDesc = {
      target: 1,
      format: 0x44, // BC3 — the NVN code, not the D2R code 61
      flags: 0,
      samples: 0,
      width,
      height,
      depth: 1,
      levels: 1,
      stride: 0,
      pkgBlockH: 2,
    }
    // GOB storage is block-aligned, so it can only be larger than the payload.
    const storage = new Uint8Array(0x10000)
    expect(nvnSwizzle(desc, 0, 0, linear, pitch, storage)).toBe(true)

    const straight = decodeTexture(container(61, width, height, linear))
    const woven = decodeTexture(
      container(61, width, height, storage, { blockLinear: true, blockHeightLog2: 1 }),
    )
    // Weaving then unwaving must reproduce the pixels exactly — anything else
    // and the file-order blocks tear the image into GOB-sized fragments.
    expect(Array.from(woven.rgba)).toEqual(Array.from(straight.rgba))
    // The pattern must actually reach the decoder: block (bx, by) carries its
    // coordinates as the two alpha endpoints, and index 0 selects a0.
    expect(straight.rgba[3]).toBe(0x10) // block (0,0)
    expect(straight.rgba[(31 * width + 31) * 4 + 3]).toBe(0x10 + 7) // block (7,7)
  })
})

describe('rgba8 decoding', () => {
  it('copies pixels through unchanged', () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    const texture = decodeTexture(container(31, 2, 1, payload))
    expect(Array.from(texture.rgba)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})
