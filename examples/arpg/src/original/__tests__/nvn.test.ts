import { describe, expect, it } from 'vitest'
import { nvnTexLayout, nvnTexLevelOffset, type NvnTextureDesc } from '../nvn-tex'
import { nvnBlOffset, nvnDeswizzle, nvnDeswizzleGeometry, nvnSwizzle } from '../nvn-deswizzle'

function desc(overrides: Partial<NvnTextureDesc>): NvnTextureDesc {
  return {
    target: 1,
    format: 0x44, // BC3_UNORM / DXT5
    flags: 0,
    samples: 0,
    width: 128,
    height: 128,
    depth: 1,
    levels: 1,
    stride: 0,
    pkgBlockH: 0,
    ...overrides,
  }
}

/** Deterministic bytes, so a failure is reproducible. */
function bytes(length: number, seed = 1): Uint8Array {
  const out = new Uint8Array(length)
  let state = seed >>> 0
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    out[i] = state & 0xff
  }
  return out
}

describe('nvn texture layout', () => {
  it('sizes a 128×128 DXT5 texture as 32 block rows of 512 bytes', () => {
    const layout = nvnTexLayout(desc({}))
    // 128 px / 4 = 32 blocks wide → 32 × 16 bytes = 512 bytes per block row;
    // 128 px / 4 = 32 block rows → 16 KiB.
    expect(layout.bpb).toBe(16)
    expect(layout.size).toBe(512 * 32)
    expect(layout.align).toBe(512)
    // height × 1.5 = 48 block rows → '48 + 7' / 8 = 6 GOBs of height → tile 2.
    expect(layout.tileH).toBe(2)
    expect(layout.tileD).toBe(0)
  })

  it('places level 0 at zero and grows with the levels before it', () => {
    const two = desc({ width: 64, height: 64, levels: 2, pkgBlockH: 1 })
    expect(nvnTexLevelOffset(two, 0)).toBe(0)
    // Level 0: 16×16 blocks of 16 bytes = 256-byte rows; tileH 0 means one GOB
    // of height, so 16 block rows → 2 GOB rows of 4 GOBs across = 8 blocks of
    // 512 bytes = 4096.
    expect(nvnTexLevelOffset(two, 1)).toBe(4096)
  })

  it('treats an uncompressed format as 1×1 blocks', () => {
    // format 0x36 is 8 bytes per pixel; 8×8 = 64 px × 8 B = 512 B.
    const layout = nvnTexLayout(desc({ format: 0x36, width: 8, height: 8, pkgBlockH: 1 }))
    expect(layout.bpb).toBe(8)
    expect(layout.size).toBe(512)
  })

  it('reports a linear texture by its stride', () => {
    const layout = nvnTexLayout(desc({ format: 0x36, width: 8, height: 4, flags: 0x10 }))
    expect(layout.align).toBe(32)
    // 8 px × 8 B = 64 bytes, already 32-aligned → 64 × 4 rows.
    expect(layout.size).toBe(64 * 4)
  })
})

describe('block-linear addressing', () => {
  it('keeps the first 16 bytes of the first block row contiguous', () => {
    // Inside a GOB, bytes 0..15 are the contiguous segment.
    for (let x = 0; x < 16; x++) {
      expect(nvnBlOffset(x, 0, 0, 512, 32, 2, 0)).toBe(x)
    }
  })

  it('orders y within a GOB before moving to the next GOB', () => {
    // y=2 is the start of the second 2-row group inside the 64-byte column.
    expect(nvnBlOffset(0, 2, 0, 512, 32, 2, 0)).toBe(64)
    expect(nvnBlOffset(0, 8, 0, 512, 32, 2, 0)).toBe(512)
  })

  it('skips a whole block height before the next block row', () => {
    // tileH = 2 makes a block 4 GOB rows = 32 rows tall, so with 64 rows there
    // are two block rows and row 32 starts the second: 8 GOBs across × 2048
    // bytes per block = 16384.
    expect(nvnBlOffset(0, 32, 0, 512, 64, 2, 0)).toBe(8 * 2048)
  })
})

describe('deswizzle round trip', () => {
  const cases: Array<Partial<NvnTextureDesc>> = [
    {},
    { width: 64, height: 64, pkgBlockH: 1 },
    { width: 256, height: 64 },
    { width: 64, height: 256 },
    { width: 512, height: 512 },
    { width: 16, height: 16, levels: 1, pkgBlockH: 3 },
    { format: 0x36, width: 128, height: 128 }, // 8 bpp, uncompressed
    { format: 0x41, width: 256, height: 128 }, // BC1, 8 bytes per block
  ]

  it('swizzle then deswizzle is the identity', () => {
    for (const overrides of cases) {
      const d = desc(overrides)
      const layout = nvnTexLayout(d)
      // Take the row layout from the decoder instead of assuming 4×4 blocks:
      // uncompressed and BC1 formats have different bytes per block.
      const geometry = nvnDeswizzleGeometry(d, 0, 0)
      expect(geometry).not.toBeNull()
      const pitch = geometry!.rowBytes
      const rows = geometry!.rows

      const linear = bytes(pitch * rows, 7)
      const storage = new Uint8Array(layout.size)

      expect(nvnSwizzle(d, 0, 0, linear, pitch, storage)).toBe(true)
      // The swizzle must actually relocate something, otherwise the round trip
      // would pass trivially on an all-zero buffer.
      expect(storage.some((value, index) => value !== linear[index])).toBe(true)

      const back = new Uint8Array(pitch * rows)
      expect(nvnDeswizzle(d, 0, 0, storage, back, pitch)).toBe(true)
      expect(Array.from(back)).toEqual(Array.from(linear))
    }
  })

  it('refuses the layout cases the original refuses', () => {
    const pitch = 16
    const storage = new Uint8Array(512)
    const out = new Uint8Array(pitch)
    expect(nvnDeswizzle(desc({ samples: 4 }), 0, 0, storage, out, pitch)).toBe(false)
    expect(nvnDeswizzle(desc({ flags: 0x10 }), 0, 0, storage, out, pitch)).toBe(false)
    expect(nvnDeswizzle(desc({ target: 10 }), 0, 0, storage, out, pitch)).toBe(false)
    expect(nvnDeswizzle(desc({ format: 0x1234 }), 0, 0, storage, out, pitch)).toBe(false)
    expect(nvnDeswizzle(desc({}), 1, 0, storage, out, pitch)).toBe(false) // levels = 1
  })
})
