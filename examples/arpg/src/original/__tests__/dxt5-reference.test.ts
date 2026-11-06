import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { nvnSwizzle } from '@rasenjs/assets'
import { nvnTexLayout, type NvnTextureDesc } from '@rasenjs/assets'
import { parseSprite } from '../sprite'

/**
 * DXT5 block decoding, pinned to the reference decoder.
 *
 * Deswizzling is covered by `nvn-reference.test.ts`, but that stops at the
 * block-linear → linear step. Turning the linear blocks into pixels is the part
 * the reference delegates to Pillow, so it needs its own check: the expected
 * digests below were produced by `romfs_art.sprite()` on these exact blocks.
 *
 * Both colour modes and both alpha modes are represented, because they are where
 * a hand-written BC3 decoder goes wrong: the 4-colour and 3-colour palettes
 * differ in their interpolation weights, and the alpha modes differ in whether
 * the extremes are interpolated or pinned.
 */

const WIDTH = 8
const HEIGHT = 4

const CASES: Array<{ name: string; blocks: number[][]; rgbaSha256: string }> = [
  {
    // Palette mode (colour0 > colour1) with an 8-entry alpha ramp (alpha0 > alpha1).
    name: 'palette4-alpha8',
    blocks: [
      [200, 40, 0x1b, 0x4d, 0, 0xa5, 0x62, 0x08, 0x00, 0xf8, 0xe0, 0x07, 0x39, 0x4e, 0x27, 0x13],
      [10, 200, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0xe4, 0xe4, 0xe4, 0xe4],
    ],
    rgbaSha256: 'f519cdeb2c341b17e16e069e665bf38da29c2cb21f56e8970180a97073491883',
  },
  {
    // Interpolated mode (colour0 <= colour1) with the 6-entry alpha mode.
    name: 'palette3-alpha6',
    blocks: [
      [40, 200, 0x1b, 0x4d, 0, 0xa5, 0x62, 0x08, 0x00, 0x00, 0xff, 0xff, 0x39, 0x4e, 0x27, 0x13],
      [0, 0, 0, 0, 0, 0, 0, 0, 0x1f, 0x00, 0xf8, 0x00, 0x93, 0x00, 0x00, 0x00],
    ],
    rgbaSha256: '695fb117194cf256271cfc58f12f297621a6e628afaf985e8eba61f56291c8af',
  },
]

/** Wrap block-linear DXT5 storage in an `SpA1` header, as the game's sprites do. */
function spriteOf(storage: Uint8Array): Uint8Array {
  const out = new Uint8Array(40 + storage.length)
  out.set(new TextEncoder().encode('SpA1'), 0)
  const view = new DataView(out.buffer)
  view.setUint16(4, 61, true)
  view.setUint16(6, WIDTH, true)
  view.setUint32(8, WIDTH, true)
  view.setUint32(12, HEIGHT, true)
  out[23] = 0 // packaged block height + 1 = 1, i.e. one GOB high
  out.set(storage, 40)
  return out
}

describe('DXT5 decoding matches the reference decoder', () => {
  const desc: NvnTextureDesc = {
    target: 1,
    format: 0x44,
    flags: 0,
    samples: 0,
    width: WIDTH,
    height: HEIGHT,
    depth: 1,
    levels: 1,
    stride: 0,
    pkgBlockH: 1,
  }

  for (const testCase of CASES) {
    it(`decodes ${testCase.name} byte for byte`, () => {
      const layout = nvnTexLayout(desc)
      const pitch = Math.ceil(WIDTH / 4) * 16
      const rows = Math.ceil(HEIGHT / 4)

      const linear = new Uint8Array(pitch * rows)
      testCase.blocks.forEach((block, index) => linear.set(Uint8Array.from(block), index * 16))

      const storage = new Uint8Array(layout.size)
      expect(nvnSwizzle(desc, 0, 0, linear, pitch, storage)).toBe(true)

      const sprite = parseSprite(spriteOf(storage))
      expect(sprite.width).toBe(WIDTH)
      expect(sprite.height).toBe(HEIGHT)
      expect(createHash('sha256').update(sprite.rgba).digest('hex')).toBe(testCase.rgbaSha256)
    })
  }
})
