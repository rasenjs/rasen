/**
 * NVN texture storage layout (Tegra X1 block-linear).
 *
 * A faithful TypeScript port of `dm/gfx/nvn/nvn_tex.c` from the `d2r-mobile`
 * project (github.com/d2r-mobile/d2r-mobile, MIT), which itself ports deko3d's
 * `dk_image.cpp` (zlib licence, Copyright (C) 2018-2020 fincs). Kept
 * structurally identical to the C — same function names, same integer widths —
 * so it can be diffed against the original line by line rather than "looks
 * about right". Its MIT notice follows this header.
 *
 *   one GOB = 64 bytes × 8 rows = 512 bytes
 *   block height (tileH, in GOBs) is chosen from 'height × 1.5'
 *   levels are accumulated with block alignment
 *
 * The game's packaged textures (`SetPackagedTextureLayout`) carry 8 bytes of
 * layout parameters whose byte 0 is log2 of the block height; when present it
 * wins over the automatic choice.
 *
 * Nothing here exists for our own art — our sprites are drawn procedurally. This
 * module is only for reading the *original* game's sprites out of a RomFS that
 * the user extracted from their own copy (see `romfs.ts`).
 */

/*
 * This file is a port of `dm/gfx/nvn/nvn_tex.c` from d2r-mobile and includes
 * material from that work. Its license notice follows.
 *
 * d2r-mobile
 *
 * Copyright (c) 2026 jhaizhou
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

export interface NvnTextureDesc {
  /** NVNtextureTarget. */
  target: number
  /** NVNformat. */
  format: number
  /** NVNtextureFlags. */
  flags: number
  /** Sample count: 0 or 1 means single-sampled. */
  samples: number
  width: number
  height: number
  depth: number
  levels: number
  stride: number
  /** Packaged-layout byte 0 (log2 of block height) + 1; 0 = automatic. */
  pkgBlockH: number
}

export interface NvnTextureLayout {
  /** Total storage bytes. */
  size: number
  /** Bytes per layer. */
  layerSize: number
  align: number
  layers: number
  /** Bytes per block. */
  bpb: number
  /** Block height / block depth, in log2 of the GOB count. */
  tileH: number
  tileD: number
}

interface Format {
  bpb: number
  bw: number
  bh: number
}

const ASTC: ReadonlyArray<readonly [number, number]> = [
  [4, 4],
  [5, 4],
  [5, 5],
  [6, 5],
  [6, 6],
  [8, 5],
  [8, 6],
  [8, 8],
  [10, 5],
  [10, 6],
  [10, 8],
  [10, 10],
  [12, 10],
  [12, 12],
]

/** Bytes per block plus block width/height; uncompressed formats are 1×1. */
const UNCOMPRESSED: ReadonlyArray<readonly [number, number, number]> = [
  [0x01, 0x04, 1],
  [0x05, 0x09, 2],
  [0x0a, 0x0c, 4],
  [0x0d, 0x10, 2],
  [0x11, 0x15, 4],
  [0x16, 0x18, 8],
  [0x19, 0x1c, 3],
  [0x1d, 0x21, 6],
  [0x22, 0x24, 12],
  [0x25, 0x28, 4],
  [0x29, 0x2d, 8],
  [0x2e, 0x30, 16],
  [0x31, 0x31, 1],
  [0x32, 0x32, 2],
  [0x33, 0x35, 4],
  [0x36, 0x36, 8],
  [0x37, 0x38, 4],
  [0x39, 0x3c, 2],
  [0x3d, 0x40, 4],
  [0x51, 0x52, 1],
  [0x53, 0x54, 2],
  [0x55, 0x56, 4],
  [0x57, 0x58, 2],
  [0x59, 0x5a, 4],
  [0x5b, 0x5c, 8],
  [0x5d, 0x5e, 3],
  [0x5f, 0x60, 6],
  [0x61, 0x62, 12],
  [0x63, 0x64, 4],
  [0x65, 0x66, 8],
  [0x67, 0x68, 16],
  [0x69, 0x6c, 4],
  [0x6d, 0x70, 4],
  [0x71, 0x75, 8],
  [0x76, 0x78, 16],
  [0x95, 0x98, 2],
  [0x99, 0x9c, 4],
]

export function formatOf(f: number): Format {
  // Order matters: ASTC and DXT share no codes, but the ranges below overlap
  // nothing either — the original relies on the same order.
  if (f >= 0x79 && f <= 0x94) {
    const k = (f - 0x79) % 14
    return { bpb: 16, bw: ASTC[k][0], bh: ASTC[k][1] }
  }
  if (f >= 0x41 && f <= 0x50) {
    const b8 = f <= 0x42 || f === 0x45 || f === 0x46 || f === 0x49 || f === 0x4a
    return { bpb: b8 ? 8 : 16, bw: 4, bh: 4 }
  }
  for (const [lo, hi, bpb] of UNCOMPRESSED) {
    if (f >= lo && f <= hi) return { bpb, bw: 1, bh: 1 }
  }
  return { bpb: 0, bw: 1, bh: 1 }
}

/** Bytes per block (0 = unknown format), plus block width/height. */
export function nvnFmtBpb(f: number): { bpb: number; bw: number; bh: number } {
  const t = formatOf(f)
  return { bpb: t.bpb, bw: t.bw, bh: t.bh }
}

function mip(size: number, level: number): number {
  const s = size >>> level
  return s ? s : 1
}

function blk(size: number, block: number): number {
  return Math.ceil(size / block)
}

function pickTile(gobs: number): number {
  return gobs >= 16 ? 4 : gobs >= 8 ? 3 : gobs >= 4 ? 2 : gobs >= 2 ? 1 : 0
}

function adjTile(shift: number, unit: number, dim: number): number {
  if (!shift) return 0
  let x = unit << (shift - 1)
  if (x >= dim) {
    while (--shift) {
      x >>= 1
      if (x < dim) break
    }
  }
  return shift
}

interface Shape {
  /** Dimensions used: 1, 2 or 3. */
  dpl: number
  layered: boolean
  w: number
  h: number
  z: number
}

function shape(d: NvnTextureDesc): Shape {
  let dpl: number
  let layered = false
  const w = d.width
  let h = d.height
  let z = d.depth

  switch (d.target) {
    case 0: // 1D
      dpl = 1
      h = 1
      z = 1
      break
    case 3: // 1D_ARRAY (layer count lives in height)
      dpl = 1
      z = d.height
      h = 1
      layered = true
      break
    case 2: // 3D
      dpl = 3
      break
    case 4:
    case 6: // 2D_ARRAY / MS_ARRAY
      dpl = 2
      layered = true
      break
    case 8: // CUBEMAP
      dpl = 2
      z = 6
      layered = true
      break
    case 9: // CUBEMAP_ARRAY
      dpl = 2
      z = d.depth * 6
      layered = true
      break
    default: // 2D / MS / RECTANGLE
      dpl = 2
      z = 1
      break
  }
  if (z === 0) z = 1
  return { dpl, layered, w, h, z }
}

function samplesXy(samples: number): { sx: number; sy: number } {
  if (samples === 2) return { sx: 2, sy: 1 }
  if (samples === 4) return { sx: 2, sy: 2 }
  if (samples === 8) return { sx: 4, sy: 2 }
  return { sx: 1, sy: 1 }
}

function levelOffset(
  d: NvnTextureDesc,
  level: number,
  s: Shape,
  tileH: number,
  tileD: number,
  t: Format,
): number {
  const { sx, sy } = samplesXy(d.samples)
  let off = 0
  for (let i = 0; i < level; i++) {
    const lw = blk(mip(s.w * sx, i), t.bw)
    const lh = s.dpl >= 2 ? blk(mip(s.h * sy, i), t.bh) : 1
    const ld = s.dpl >= 3 ? mip(s.z, i) : 1
    const lwb = lw * t.bpb
    const th = adjTile(tileH, 8, lh)
    const td = adjTile(tileD, 1, ld)
    const wt = Math.ceil(lwb / 64)
    const ht = (Math.ceil(lh / 8) + (1 << th) - 1) >> th
    const dt = (ld + (1 << td) - 1) >> td
    // `<< (9 + th + td)` is the byte size of one block; done in two steps so the
    // product stays exact in a double instead of overflowing a 32-bit shift.
    off += wt * ht * dt * Math.pow(2, 9 + th + td)
  }
  return off
}

export function nvnTexLayout(d: NvnTextureDesc): NvnTextureLayout {
  const t = formatOf(d.format)
  const s = shape(d)
  // Only the vertical sample count affects the block rows.
  const { sy } = samplesXy(d.samples)

  const out: NvnTextureLayout = {
    size: 0,
    layerSize: 0,
    align: 512,
    layers: s.layered ? s.z : 1,
    bpb: t.bpb,
    tileH: 0,
    tileD: 0,
  }

  if (!t.bpb) {
    out.size = 0
    out.layerSize = 0
    out.align = 512
    return out
  }

  if (d.target === 10) {
    // BUFFER
    out.layerSize = out.size = t.bpb * d.width
    out.align = t.bpb === 12 ? 4 : t.bpb
    return out
  }

  if (d.flags & 0x10) {
    // LINEAR: row pitch = stride, or aligned to 32
    out.align = d.flags & 0x40 ? 128 : 32
    const stride = d.stride
      ? d.stride
      : (t.bpb * blk(s.w, t.bw) + out.align - 1) & ~(out.align - 1)
    out.layerSize = out.size = stride * blk(s.h, t.bh)
    return out
  }

  let tileH = 0
  let tileD = 0
  if (s.dpl === 2) {
    const ah = blk(s.h * sy, t.bh)
    // The C is `(ah + ah / 2 + 7) / 8` with *integer* division — truncating, not
    // a ceiling. Using Math.ceil here picks one block height too many, which the
    // differential test against the reference implementation catches.
    tileH = d.pkgBlockH ? d.pkgBlockH - 1 : pickTile(Math.trunc((ah + (ah >> 1) + 7) / 8))
  } else if (s.dpl === 3) {
    tileD = pickTile(s.z + (s.z >> 1))
  }
  out.tileH = tileH
  out.tileD = tileD

  const levels = d.levels ? d.levels : 1
  let ls = levelOffset(d, levels, s, tileH, tileD, t)

  if (s.layered) {
    // Layer size is aligned to the block: shrink the block height/depth until the
    // block still fits, then round the level up to whole blocks.
    const hh = blk(s.h, t.bh)
    let th = tileH
    let td = tileD
    while (th && hh <= 8 << (th - 1)) th--
    while (td && s.z <= 1 << (td - 1)) td--
    const sh = th + td + 9
    const g = ls >> sh
    if (ls !== g << sh) ls = (g + 1) << sh
  }

  out.layerSize = ls
  out.size = s.layered ? ls * s.z : ls
  out.align = 512
  return out
}

export function nvnTexLevelOffset(d: NvnTextureDesc, level: number): number {
  const t = formatOf(d.format)
  const s = shape(d)
  if (!t.bpb || d.flags & 0x10 || d.target === 10) return 0
  const layout = nvnTexLayout(d)
  return levelOffset(d, level, s, layout.tileH, layout.tileD, t)
}

/** Block height/depth actually used by `level` (log2 of the GOB count). */
export function nvnTexLevelTiles(
  d: NvnTextureDesc,
  level: number,
): { tileH: number; tileD: number } {
  const t = formatOf(d.format)
  const s = shape(d)
  const { sy } = samplesXy(d.samples)
  const layout = nvnTexLayout(d)
  const lh = s.dpl >= 2 ? blk(mip(s.h * sy, level), t.bh) : 1
  const ld = s.dpl >= 3 ? mip(s.z, level) : 1
  return {
    tileH: adjTile(layout.tileH, 8, lh),
    tileD: adjTile(layout.tileD, 1, ld),
  }
}
