/**
 * Tegra block-linear ↔ linear, and DXT5 block decode.
 *
 * A faithful port of `dm/gfx/tex/nvn_deswizzle.c` (plus its DDS/DXT5 step, which
 * the original delegates to Pillow by wrapping the linear data in a DDS header —
 * here the block decode is done directly so the browser needs no image pipeline).
 *
 *   GOB = 64 bytes × 8 rows = 512 bytes
 *   offset of (x byte, y row) inside a GOB =
 *     (x%64/32)·256 + (y%8/2)·64 + (x%32/16)·32 + (y%2)·16 + x%16
 *   block = 1 GOB wide × 2^tileH GOBs high × 2^tileD GOBs deep;
 *   inside a block y comes before z; blocks fill the level x → y → z.
 */

import { nvnTexLayout, nvnTexLevelOffset, nvnTexLevelTiles, nvnFmtBpb, type NvnTextureDesc } from './nvn-tex'

function gobOffset(x: number, y: number): number {
  return (
    (((x % 64) / 32) | 0) * 256 +
    (((y % 8) / 2) | 0) * 64 +
    (((x % 32) / 16) | 0) * 32 +
    (y % 2) * 16 +
    (x % 16)
  )
}

/** Byte offset of linear (x byte, y block row, z slice) within a level/layer. */
export function nvnBlOffset(
  x: number,
  y: number,
  z: number,
  rowBytes: number,
  rows: number,
  th: number,
  td: number,
): number {
  const bh = 1 << th
  const bd = 1 << td
  const gobsX = Math.ceil(rowBytes / 64)
  const blocksY = Math.ceil(rows / (8 * bh))
  const block = 512 * bh * bd
  return (
    Math.floor(z / bd) * gobsX * blocksY * block +
    Math.floor(y / (8 * bh)) * gobsX * block +
    Math.floor(x / 64) * block +
    ((z % bd) * bh + Math.floor((y % (8 * bh)) / 8)) * 512 +
    gobOffset(x, y)
  )
}

function mip(size: number, level: number): number {
  const s = size >>> level
  return s ? s : 1
}

export interface DeswizzleGeometry {
  /** Width in blocks, in bytes. */
  rowBytes: number
  /** Block rows. */
  rows: number
  /** Slices (3D textures only). */
  slices: number
  /** Where this level/layer starts inside the whole-texture storage. */
  base: number
  tileH: number
  tileD: number
  bpb: number
}

/**
 * Geometry of one level/layer, or `null` for textures this does not support
 * (multisampled, LINEAR, BUFFER, unknown format, out-of-range level/layer) —
 * the same cases the C returns -1 for.
 */
export function nvnDeswizzleGeometry(
  d: NvnTextureDesc,
  level: number,
  layer: number,
): DeswizzleGeometry | null {
  if (d.target === 5 || d.target === 6 || d.target === 10 || d.flags & 0x10 || d.samples > 1) {
    return null
  }
  const { bpb, bw, bh } = nvnFmtBpb(d.format)
  if (!bpb) return null
  if (level >= (d.levels ? d.levels : 1)) return null
  const layout = nvnTexLayout(d)
  if (layer >= layout.layers) return null

  const oneD = d.target === 0 || d.target === 3
  const w = mip(d.width, level)
  const h = oneD ? 1 : mip(d.height, level)
  const slices = d.target === 2 ? mip(d.depth ? d.depth : 1, level) : 1
  const rowBytes = Math.ceil(w / bw) * bpb
  const rows = Math.ceil(h / bh)
  const base = layer * layout.layerSize + nvnTexLevelOffset(d, level)
  const { tileH, tileD } = nvnTexLevelTiles(d, level)

  return { rowBytes, rows, slices, base, tileH, tileD, bpb }
}

function move(
  d: NvnTextureDesc,
  level: number,
  layer: number,
  src: Uint8Array,
  dst: Uint8Array,
  pitch: number,
  toLinear: boolean,
): boolean {
  const geometry = nvnDeswizzleGeometry(d, level, layer)
  if (!geometry) return false
  const { rowBytes, rows, slices, base, tileH, tileD } = geometry
  if (pitch < rowBytes) return false

  for (let z = 0; z < slices; z++) {
    for (let y = 0; y < rows; y++) {
      const rowBase = (z * rows + y) * pitch
      // 16-byte segments: 16 bytes are contiguous inside a GOB, and 16 divides
      // every block width.
      for (let x = 0; x < rowBytes; x += 16) {
        const n = Math.min(16, rowBytes - x)
        const p = base + nvnBlOffset(x, y, z, rowBytes, rows, tileH, tileD)
        if (toLinear) {
          for (let i = 0; i < n; i++) dst[rowBase + x + i] = src[p + i]
        } else {
          for (let i = 0; i < n; i++) dst[p + i] = src[rowBase + x + i]
        }
      }
    }
  }
  return true
}

/** Decode one level/layer from whole-texture storage into `dst` (block rows). */
export function nvnDeswizzle(
  d: NvnTextureDesc,
  level: number,
  layer: number,
  src: Uint8Array,
  dst: Uint8Array,
  dstPitch: number,
): boolean {
  return move(d, level, layer, src, dst, dstPitch, true)
}

/** Reverse of {@link nvnDeswizzle}. Exists so the round trip can be tested. */
export function nvnSwizzle(
  d: NvnTextureDesc,
  level: number,
  layer: number,
  src: Uint8Array,
  srcPitch: number,
  dst: Uint8Array,
): boolean {
  return move(d, level, layer, src, dst, srcPitch, false)
}

// ---------------------------------------------------------------------------
// DXT5 (BC3)
// ---------------------------------------------------------------------------

/**
 * Expand a 16-bit RGB565 colour to 8 bits per channel.
 *
 * DXT5 stores 5/6-bit channels; the expansion to 8 bits is bit replication
 * (`(v << 3) | (v >> 2)`), not rescaling by 255/31. The difference is small but
 * real, and the differential test against the reference (which decodes through
 * Pillow) fails on it — value 3 becomes 24 rather than 25.
 */
function rgb565(value: number): [number, number, number] {
  const r5 = (value >> 11) & 0x1f
  const g6 = (value >> 5) & 0x3f
  const b5 = value & 0x1f
  return [(r5 << 3) | (r5 >> 2), (g6 << 2) | (g6 >> 4), (b5 << 3) | (b5 >> 2)]
}

/**
 * Decode one 8-byte DXT5 alpha block's 3-bit interpolation weights.
 * `a0`/`a1` lead the block; the six following bytes hold 16 × 3 bits.
 */
function alphaWeights(block: Uint8Array, offset: number, a0: number, a1: number): Uint8Array {
  const out = new Uint8Array(16)
  const table = new Uint8Array(8)
  table[0] = a0
  table[1] = a1
  if (a0 > a1) {
    for (let i = 1; i <= 6; i++) table[i + 1] = ((a0 * (7 - i) + a1 * i) / 7) | 0
  } else {
    for (let i = 1; i <= 4; i++) table[i + 1] = ((a0 * (5 - i) + a1 * i) / 5) | 0
    table[6] = 0
    table[7] = 255
  }
  for (let i = 0; i < 16; i++) {
    // 3-bit indices are one little-endian 48-bit field across block bytes 2..7.
    const bit = i * 3
    const byte = offset + 2 + (bit >> 3)
    const value = (block[byte] | (block[byte + 1] << 8)) >> (bit & 7)
    out[i] = table[value & 0x7]
  }
  return out
}

/**
 * Decode a block-linear DXT5 (BC3) texture into RGBA.
 *
 * Two details are easy to get wrong and are pinned by the differential test
 * against the reference pipeline:
 *
 * 1. The interpolated colours belong in palette slots **2 and 3**, not 1 and 2 —
 *    slot 1 is `colour1`.
 * 2. BC3's colour block **always uses the four-colour formulas**, ignoring the
 *    `colour0 > colour1` test that BC1 uses. Pillow says so outright in
 *    `BcnDecode.c` — "BC2 and BC3 reuse BC1 color blocks but always act like
 *    c0 > c1" — and since the reference project decodes every original sprite
 *    through Pillow, matching it is what makes this byte-identical.
 *
 * @param linear the deswizzled block rows, `pitch` bytes per row of blocks
 * @returns RGBA bytes, `width * height * 4`
 */
export function decodeDxt5(
  linear: Uint8Array,
  width: number,
  height: number,
  pitch: number,
): Uint8Array {
  const blocksX = Math.ceil(width / 4)
  const blocksY = Math.ceil(height / 4)
  const out = new Uint8Array(width * height * 4)

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const block = by * pitch + bx * 16
      const a0 = linear[block]
      const a1 = linear[block + 1]
      const alphas = alphaWeights(linear, block, a0, a1)

      const c0 = linear[block + 8] | (linear[block + 9] << 8)
      const c1 = linear[block + 10] | (linear[block + 11] << 8)
      const [r0, g0, b0] = rgb565(c0)
      const [r1, g1, b1] = rgb565(c1)

      const palette = new Uint8Array(16)
      palette[0] = r0
      palette[1] = g0
      palette[2] = b0
      palette[3] = 255
      palette[4] = r1
      palette[5] = g1
      palette[6] = b1
      palette[7] = 255
      // Slots 2 and 3: two-thirds colour0 / two-thirds colour1.
      palette[8] = ((2 * r0 + r1) / 3) | 0
      palette[9] = ((2 * g0 + g1) / 3) | 0
      palette[10] = ((2 * b0 + b1) / 3) | 0
      palette[11] = 255
      palette[12] = ((r0 + 2 * r1) / 3) | 0
      palette[13] = ((g0 + 2 * g1) / 3) | 0
      palette[14] = ((b0 + 2 * b1) / 3) | 0
      palette[15] = 255

      for (let i = 0; i < 16; i++) {
        const px = bx * 4 + (i % 4)
        const py = by * 4 + Math.floor(i / 4)
        if (px >= width || py >= height) continue
        // One byte per row of four pixels, low bits first.
        const byte = block + 12 + (i >> 2)
        const ci = ((linear[byte] >> ((i & 3) * 2)) & 0x3) * 4

        const target = (py * width + px) * 4
        out[target] = palette[ci]
        out[target + 1] = palette[ci + 1]
        out[target + 2] = palette[ci + 2]
        out[target + 3] = alphas[i]
      }
    }
  }

  return out
}


// ---------------------------------------------------------------------------
// BC1 (DXT1)
// ---------------------------------------------------------------------------

/**
 * Decode a linear BC1 texture into RGBA.
 *
 * BC1 has no separate alpha block, so the colour palette has two modes chosen by
 * `colour0 > colour1`: four opaque colours, or three colours plus transparent
 * black. Building both palettes and selecting on the comparison is what makes
 * one-pixel-wide alpha detail (foliage, chains) come out right.
 */
export function decodeBc1(
  linear: Uint8Array,
  width: number,
  height: number,
  pitch: number,
): Uint8Array {
  const blocksX = Math.ceil(width / 4)
  const blocksY = Math.ceil(height / 4)
  const out = new Uint8Array(width * height * 4)

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const block = by * pitch + bx * 8
      const c0 = linear[block] | (linear[block + 1] << 8)
      const c1 = linear[block + 2] | (linear[block + 3] << 8)
      const [r0, g0, b0] = rgb565(c0)
      const [r1, g1, b1] = rgb565(c1)

      const palette = new Uint8Array(16)
      palette[0] = r0
      palette[1] = g0
      palette[2] = b0
      palette[3] = 255
      palette[4] = r1
      palette[5] = g1
      palette[6] = b1
      palette[7] = 255
      if (c0 > c1) {
        palette[8] = ((2 * r0 + r1) / 3) | 0
        palette[9] = ((2 * g0 + g1) / 3) | 0
        palette[10] = ((2 * b0 + b1) / 3) | 0
        palette[11] = 255
        palette[12] = ((r0 + 2 * r1) / 3) | 0
        palette[13] = ((g0 + 2 * g1) / 3) | 0
        palette[14] = ((b0 + 2 * b1) / 3) | 0
        palette[15] = 255
      } else {
        palette[8] = ((r0 + r1) / 2) | 0
        palette[9] = ((g0 + g1) / 2) | 0
        palette[10] = ((b0 + b1) / 2) | 0
        palette[11] = 255
        // Index 3 in this mode is transparent black, not a fourth colour.
        palette[12] = 0
        palette[13] = 0
        palette[14] = 0
        palette[15] = 0
      }

      for (let i = 0; i < 16; i++) {
        const px = bx * 4 + (i % 4)
        const py = by * 4 + Math.floor(i / 4)
        if (px >= width || py >= height) continue
        const byte = block + 4 + (i >> 2)
        const ci = ((linear[byte] >> ((i & 3) * 2)) & 0x3) * 4
        const target = (py * width + px) * 4
        out[target] = palette[ci]
        out[target + 1] = palette[ci + 1]
        out[target + 2] = palette[ci + 2]
        out[target + 3] = palette[ci + 3]
      }
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// BC4 / BC5 (single- and two-channel)
// ---------------------------------------------------------------------------

/**
 * Decode a linear BC4 texture (one channel per pixel) into RGBA.
 *
 * A BC4 block is exactly the alpha-block layout of DXT5 — two 8-bit endpoints
 * plus 16 × 3-bit indices — so the palette maths is shared with
 * {@link alphaWeights}. The channel is replicated to RGB with opaque alpha, the
 * same expansion the reference project uses when it has to upload a BC4 mask to
 * a device without BC support.
 */
export function decodeBc4(
  linear: Uint8Array,
  width: number,
  height: number,
  pitch: number,
): Uint8Array {
  const blocksX = Math.ceil(width / 4)
  const blocksY = Math.ceil(height / 4)
  const out = new Uint8Array(width * height * 4)

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const block = by * pitch + bx * 8
      const values = alphaWeights(linear, block, linear[block], linear[block + 1])
      for (let i = 0; i < 16; i++) {
        const px = bx * 4 + (i % 4)
        const py = by * 4 + Math.floor(i / 4)
        if (px >= width || py >= height) continue
        const target = (py * width + px) * 4
        out[target] = values[i]
        out[target + 1] = values[i]
        out[target + 2] = values[i]
        out[target + 3] = 255
      }
    }
  }

  return out
}

/**
 * Decode a linear BC5 texture (two channels per pixel) into RGBA.
 *
 * BC5 is two BC4 blocks side by side — red then green; the usual consumer is a
 * tangent-space normal map whose blue is reconstructed in the shader. Here blue
 * is left at 0 and alpha is opaque so the two stored channels stay readable.
 */
export function decodeBc5(
  linear: Uint8Array,
  width: number,
  height: number,
  pitch: number,
): Uint8Array {
  const blocksX = Math.ceil(width / 4)
  const blocksY = Math.ceil(height / 4)
  const out = new Uint8Array(width * height * 4)

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const block = by * pitch + bx * 16
      const red = alphaWeights(linear, block, linear[block], linear[block + 1])
      const green = alphaWeights(linear, block + 8, linear[block + 8], linear[block + 9])
      for (let i = 0; i < 16; i++) {
        const px = bx * 4 + (i % 4)
        const py = by * 4 + Math.floor(i / 4)
        if (px >= width || py >= height) continue
        const target = (py * width + px) * 4
        out[target] = red[i]
        out[target + 1] = green[i]
        out[target + 2] = 0
        out[target + 3] = 255
      }
    }
  }

  return out
}
