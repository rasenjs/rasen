import { describe, expect, it } from 'vitest'
import golden from './fixtures/nvn-golden.json'
import { nvnTexLayout, nvnTexLevelOffset, type NvnTextureDesc } from '../nvn-tex'
import { nvnDeswizzle, nvnDeswizzleGeometry, nvnSwizzle } from '../nvn-deswizzle'

/**
 * Equivalence with the reference implementation.
 *
 * `fixtures/nvn-golden.json` is **output from the C code itself** —
 * `dm/gfx/nvn/nvn_tex.c` and `dm/gfx/tex/nvn_deswizzle.c` compiled unmodified and
 * run over 180 texture descriptors covering every branch: BC1/BC3 and
 * uncompressed and ASTC formats, automatic and packaged block heights, mip
 * chains, 1D/2D/3D/array/cubemap targets, LINEAR, multisampled, BUFFER and an
 * unknown format.
 *
 * Each record carries both the input and the expected output, so this test
 * re-derives the descriptor from the record and compares every field — including
 * FNV checksums of the actual deswizzled bytes, not merely the layout numbers.
 * A port that is "nearly right" fails here rather than silently producing wrong
 * pixels once real game files are read.
 */

interface Record {
  target: number
  format: number
  flags: number
  samples: number
  width: number
  height: number
  depth: number
  levels: number
  stride: number
  pkgBlockH: number
  size: number
  layerSize: number
  align: number
  layers: number
  bpb: number
  tileH: number
  tileD: number
  levelOffsets: number[]
  geomOk: boolean
  rowBytes: number
  rows: number
  slices: number
  geomBase: number
  geomTileH: number
  geomTileD: number
  deswizzleFnv: number
  roundTripFnv: number
}

const records = golden as unknown as Record[]

/** FNV-1a, matching the harness. */
function fnv(bytes: Uint8Array): number {
  let hash = 1469598103934665603n
  for (const byte of bytes) {
    hash ^= BigInt(byte)
    hash = BigInt.asUintN(64, hash * 1099511628211n)
  }
  return Number(BigInt.asUintN(64, hash))
}

function descOf(record: Record): NvnTextureDesc {
  return {
    target: record.target,
    format: record.format,
    flags: record.flags,
    samples: record.samples,
    width: record.width,
    height: record.height,
    depth: record.depth,
    levels: record.levels,
    stride: record.stride,
    pkgBlockH: record.pkgBlockH,
  }
}

/** Short label so a failure names the case instead of dumping 180 records. */
function label(record: Record): string {
  return (
    `target=${record.target} format=0x${record.format.toString(16)} flags=0x${record.flags.toString(16)}` +
    ` samples=${record.samples} ${record.width}x${record.height}x${record.depth}` +
    ` levels=${record.levels} stride=${record.stride} pkgBlockH=${record.pkgBlockH}`
  )
}

describe('equivalence with the reference C implementation', () => {
  it('has a golden fixture to compare against', () => {
    expect(records.length).toBeGreaterThan(100)
  })

  it('produces the same layout for every descriptor', () => {
    const mismatches: string[] = []
    for (const record of records) {
      const layout = nvnTexLayout(descOf(record))
      const actual = {
        size: layout.size,
        layerSize: layout.layerSize,
        align: layout.align,
        layers: layout.layers,
        bpb: layout.bpb,
        tileH: layout.tileH,
        tileD: layout.tileD,
      }
      const expected = {
        size: record.size,
        layerSize: record.layerSize,
        align: record.align,
        layers: record.layers,
        bpb: record.bpb,
        tileH: record.tileH,
        tileD: record.tileD,
      }
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        mismatches.push(`${label(record)}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`)
      }
    }
    expect(mismatches.join('\n')).toBe('')
  })

  it('produces the same per-level offsets', () => {
    const mismatches: string[] = []
    for (const record of records) {
      const desc = descOf(record)
      const actual = Array.from({ length: record.levels }, (_, level) =>
        nvnTexLevelOffset(desc, level),
      )
      if (JSON.stringify(actual) !== JSON.stringify(record.levelOffsets)) {
        mismatches.push(
          `${label(record)}\n  expected [${record.levelOffsets}]\n  actual   [${actual}]`,
        )
      }
    }
    expect(mismatches.join('\n')).toBe('')
  })

  it('agrees on which geometries are supported, and their numbers', () => {
    const mismatches: string[] = []
    for (const record of records) {
      const geometry = nvnDeswizzleGeometry(descOf(record), 0, 0)
      const actual = geometry
        ? {
            rowBytes: geometry.rowBytes,
            rows: geometry.rows,
            slices: geometry.slices,
            base: geometry.base,
            tileH: geometry.tileH,
            tileD: geometry.tileD,
          }
        : null
      const expected = record.geomOk
        ? {
            rowBytes: record.rowBytes,
            rows: record.rows,
            slices: record.slices,
            base: record.geomBase,
            tileH: record.geomTileH,
            tileD: record.geomTileD,
          }
        : null
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        mismatches.push(
          `${label(record)}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`,
        )
      }
    }
    expect(mismatches.join('\n')).toBe('')
  })

  it('deswizzles to byte-identical output, and swizzles back identically', () => {
    const mismatches: string[] = []
    for (const record of records) {
      const desc = descOf(record)
      const layout = nvnTexLayout(desc)

      if (!record.geomOk || layout.size === 0) {
        // The reference skips the byte work here; so do we, but assert we also
        // consider it unsupported rather than doing something the C would not.
        expect(nvnDeswizzleGeometry(desc, 0, 0)).toBeNull()
        expect(record.deswizzleFnv).toBe(0)
        continue
      }

      // Same input pattern as the harness.
      const storage = new Uint8Array(layout.size)
      for (let i = 0; i < storage.length; i++) storage[i] = (i * 37 + 11) & 0xff

      const geometry = nvnDeswizzleGeometry(desc, 0, 0)!
      const pitch = geometry.rowBytes
      const linear = new Uint8Array(pitch * geometry.rows * geometry.slices)
      expect(nvnDeswizzle(desc, 0, 0, storage, linear, pitch)).toBe(true)
      if (fnv(linear) !== record.deswizzleFnv) {
        mismatches.push(`${label(record)}\n  deswizzle checksum differs`)
        continue
      }

      const back = new Uint8Array(layout.size)
      expect(nvnSwizzle(desc, 0, 0, linear, pitch, back)).toBe(true)
      if (fnv(back) !== record.roundTripFnv) {
        mismatches.push(`${label(record)}\n  round-trip checksum differs`)
      }
    }
    expect(mismatches.join('\n')).toBe('')
  })
})
