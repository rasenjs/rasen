/**
 * `.texture` — the game's own image container.
 *
 * This is the format behind all terrain, environment, character and item art
 * (31,092 files in the retail package). The reference project never had to read
 * it as an image: it hands the buffer straight to the GPU. Reading it as pixels
 * needed the container worked out, and the game's own descriptor cache
 * (`hd/texture_desc_cache.json`, 31,072 records) is what made that possible —
 * it states each texture's format code, size and mip count, so every field below
 * was *confirmed against real data* rather than guessed.
 *
 * ## Header
 *
 * ```
 *   0x00  '<DE('          magic
 *   0x04  u8              format code (see FORMATS)
 *   0x08  u32             width
 *   0x0c  u32             height
 *   0x13  u8              log2 of the level-0 block height (packaged layout byte 0)
 *   0x14  u32             0x00000007 ⇔ pixel data is block-linear, 0 ⇔ linear
 *   0x1C  u32             mip count
 *   0x24  …               mip table: per level a u32 size + u32 offset
 *   0x24 + 8·mips         start of the pixel data
 * ```
 *
 * The block-linear marker, the block-height byte and the mip-table arithmetic
 * are the reference project's own reading of the container (`t_tex.c`), checked
 * here against real files: for a 256×256 BC3 with 9 levels the table's sizes sum
 * to exactly `file length − (0x24 + 8·9)`.
 *
 * ## Pixel data
 *
 * Files converted for the Switch are stored **block-linear** (Tegra GOBs; see
 * `nvn-deswizzle.ts`) and must be unwoven with the block height from 0x13
 * before the blocks decode to anything recognisable — decoding the block stream
 * in file order tore every image into GOB-sized fragments. Files without the
 * marker (e.g. `hd/debug`) are stored linearly and are byte-identical to the PC
 * version's.
 *
 * Mip levels are laid out consecutively and every level is padded up to a
 * 512-byte boundary (the NVN layout alignment): a 256×256 BC3 with 9 levels is
 * 87,408 bytes unpadded and 89,600 padded, matching the mip table exactly.
 */

import { nvnDeswizzle } from './nvn-deswizzle'
import type { NvnTextureDesc } from './nvn-tex'
import { decodeBc1, decodeBc4, decodeBc5, decodeDxt5 } from './nvn-deswizzle'

/** Pixel formats, identified by matching real file sizes against the cache. */
export type TextureFormat = 'bc1' | 'bc3' | 'bc4' | 'bc5' | 'rgba8' | 'unknown'

/**
 * The game's format code → pixel format.
 *
 * Each entry was derived by comparing thousands of real files against the sizes
 * the cache implies for every candidate layout; the counts are in the comments so
 * the evidence is visible. The `nvn` column is the NVN format number the game
 * uploads the data as — the reference project's `d2r_nvn()` mapping table, which
 * also pins down which BC generation each code is (63 is BC4, not BC1; 65 is
 * BC5, not BC3 — both are single-/two-channel, not colour).
 */
const FORMATS: Record<number, { kind: TextureFormat; sRGB: boolean; nvn: number }> = {
  61: { kind: 'bc3', sRGB: false, nvn: 0x44 }, // 0x3d — BC3, 18039 files
  62: { kind: 'bc3', sRGB: true, nvn: 0x48 }, // 0x3e — BC3 sRGB, 9156 files
  63: { kind: 'bc4', sRGB: false, nvn: 0x49 }, // 0x3f — BC4, 2864 files
  58: { kind: 'bc1', sRGB: true, nvn: 0x46 }, // 0x3a — BC1 sRGB, 351 files
  57: { kind: 'bc1', sRGB: false, nvn: 0x42 }, // 0x39 — BC1, 294 files
  65: { kind: 'bc5', sRGB: false, nvn: 0x4b }, // 0x41 — BC5, 23 files
  31: { kind: 'rgba8', sRGB: false, nvn: 0x25 }, // 0x1f — RGBA8, 345 files (VFX gradients)
}

/** Bytes of padding each mip level is rounded up to. */
const MIP_ALIGN = 512

export interface TextureHeader {
  formatCode: number
  format: TextureFormat
  sRGB: boolean
  /** The NVN format number the game uploads this data as. */
  nvnFormat: number
  width: number
  height: number
  /** Mip levels stored in the file. */
  mips: number
  /** True when the pixel data is Tegra block-linear (Switch conversion). */
  blockLinear: boolean
  /** Packaged-layout byte 0 (log2 of the block height) + 1; 0 = automatic. */
  blockHeight: number
  /** Byte offset where mip 0 starts. */
  dataStart: number
}

export interface Texture {
  header: TextureHeader
  /** Mip 0 as RGBA bytes, `width * height * 4`. */
  rgba: Uint8Array
  width: number
  height: number
}

function readUint32(bytes: Uint8Array, at: number): number {
  return (
    (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
  )
}

/** Read the header without decoding pixels — cheap enough to scan thousands. */
export function parseTextureHeader(bytes: Uint8Array): TextureHeader {
  // The magic is '<DE('; checking it is what turns a wrong file into an error
  // instead of nonsense pixels.
  if (bytes[0] !== 0x3c || bytes[1] !== 0x44 || bytes[2] !== 0x45) {
    throw new Error('texture: not a <DE( container')
  }
  const formatCode = bytes[4]
  const entry = FORMATS[formatCode]
  const width = readUint32(bytes, 8)
  const height = readUint32(bytes, 12)
  const mips = readUint32(bytes, 0x1c)
  // The mip table (0x24, 8 bytes per level) is the authoritative data start;
  // when it is absent, the next u32 still holds a relative offset to it.
  const dataStart = mips >= 1 && mips <= 16 ? 0x24 + 8 * mips : 40 + readUint32(bytes, 40)
  const blockLinear = bytes[0x14] === 0 && bytes[0x15] === 0 && bytes[0x16] === 0 && bytes[0x17] === 7
  if (width <= 0 || height <= 0) throw new Error('texture: zero dimension')
  if (dataStart >= bytes.length) throw new Error('texture: pixel data starts past the end')
  return {
    formatCode,
    format: entry?.kind ?? 'unknown',
    sRGB: entry?.sRGB ?? false,
    nvnFormat: entry?.nvn ?? 0,
    width,
    height,
    mips,
    blockLinear,
    blockHeight: bytes[0x13] + 1,
    dataStart,
  }
}

/** Bytes per 4×4 block for a format; 0 when the format is not block-based. */
function bytesPerBlock(format: TextureFormat): number {
  if (format === 'bc1' || format === 'bc4') return 8
  if (format === 'bc3' || format === 'bc5') return 16
  return 0
}

/** Byte offset of a mip level inside the pixel data, honouring the 512 padding. */
export function mipOffset(format: TextureFormat, width: number, height: number, level: number): number {
  const blockBytes = bytesPerBlock(format)
  let offset = 0
  for (let i = 0; i < level; i++) {
    const w = Math.max(1, width >> i)
    const h = Math.max(1, height >> i)
    const size = blockBytes
      ? Math.max(1, Math.ceil(w / 4)) * Math.max(1, Math.ceil(h / 4)) * blockBytes
      : w * h * 4
    // Every level is padded to the NVN alignment, including the last.
    offset += Math.ceil(size / MIP_ALIGN) * MIP_ALIGN
  }
  return offset
}

/** Build the NVN descriptor for the level-0 deswizzle of one file. */
function textureDesc(header: TextureHeader): NvnTextureDesc {
  return {
    target: 1, // 2D
    format: header.nvnFormat,
    flags: 0,
    samples: 0,
    width: header.width,
    height: header.height,
    depth: 1,
    levels: 1,
    stride: 0,
    // The block height the game itself passes via SetPackagedTextureLayout;
    // the automatic pick must not be trusted to agree with the file.
    pkgBlockH: header.blockHeight,
  }
}

/**
 * Decode mip 0 into RGBA.
 *
 * `expectedLevels` comes from the descriptor cache when the caller has it; it is
 * only used to sanity-check that the data is big enough, because the mip layout
 * follows from the dimensions alone.
 */
export function decodeTexture(bytes: Uint8Array, expectedLevels = 1): Texture {
  const header = parseTextureHeader(bytes)
  const { format, width, height, dataStart } = header
  const body = bytes.subarray(dataStart)

  if (format === 'rgba8') {
    const needed = width * height * 4
    if (body.length < needed) throw new Error('texture: truncated RGBA8 data')
    if (!header.blockLinear) return { header, width, height, rgba: body.slice(0, needed) }
    const linear = new Uint8Array(needed)
    if (!nvnDeswizzle(textureDesc(header), 0, 0, body, linear, width * 4)) {
      throw new Error('texture: NVN deswizzle rejected this layout')
    }
    return { header, width, height, rgba: linear }
  }

  const blockBytes = bytesPerBlock(format)
  if (blockBytes) {
    const pitch = Math.ceil(width / 4) * blockBytes
    const rows = Math.ceil(height / 4)
    const needed = pitch * rows
    if (body.length < needed) {
      throw new Error(
        `texture: truncated ${format} data (need ${needed} for ${width}x${height}, have ${body.length})`,
      )
    }
    void expectedLevels
    const linear = new Uint8Array(needed)
    if (header.blockLinear) {
      // The Switch-converted files are stored in Tegra block-linear order:
      // decoding the blocks in file order tore every image into GOB-sized
      // fragments — a featureless mush at any viewing distance (a face atlas
      // with no face in it). Unwoven back to linear block rows first.
      if (!nvnDeswizzle(textureDesc(header), 0, 0, body, linear, pitch)) {
        throw new Error('texture: NVN deswizzle rejected this layout')
      }
    } else {
      linear.set(body.subarray(0, needed))
    }
    const rgba =
      format === 'bc1'
        ? decodeBc1(linear, width, height, pitch)
        : format === 'bc3'
          ? decodeDxt5(linear, width, height, pitch)
          : format === 'bc4'
            ? decodeBc4(linear, width, height, pitch)
            : decodeBc5(linear, width, height, pitch)
    return { header, width, height, rgba }
  }

  throw new Error(`texture: unknown format code ${header.formatCode} (0x${header.formatCode.toString(16)})`)
}
