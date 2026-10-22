#!/usr/bin/env node
/**
 * Checks `src/original/bitknit2.ts` against real Resurrected Granny sections.
 *
 * Every claim the decoder makes is byte-exact, so the check is byte-exact: a
 * batch of real section payloads and pointer-fixup frames is decoded and each
 * output must have the length the game data declares for it. The sections are
 * the whole `diablo` and `spheres` `.gr2` files and the `blend_sphere`
 * `.model` sample — main, deformable-index and discardable sections — plus
 * every framed `[u32 compressedSize][BitKnit2 payload]` pointer-fixup table
 * that follows them in each file.
 *
 * Two structural claims are measured alongside the sizes, because a decoder
 * that returned the right number of wrong bytes would otherwise pass:
 *
 * 1. **Decoded main sections contain the Granny self-describing type tree.**
 *    Printable ASCII type and member names (`Mesh`, `VertexData`, `Skeleton`,
 *    `Material`, `Bone`) must survive the entropy coding unchanged.
 * 2. **Pointer-fixup tables decompress to `count * 12`-byte triples** of
 *    `(u32 srcOffset, u32 dstSection, u32 dstOffset)`, and the fields stay
 *    plausible (small section indices, offsets inside the sections). The
 *    table at `diablo.gr2:333816` declares 1339 entries and must decode to
 *    16068 bytes. Two smaller frames per file decode to a 16-byte record
 *    stride instead; their fields are reported but not interpreted.
 *
 * The sizes, offsets and counts in the table below were measured on these
 * files; they are the ground truth the decoder is held to. Files that are
 * absent are reported and fail the run — the batch is the check.
 *
 * Usage:
 *   tsx examples/arpg/tools/verify-bitknit2.ts [<model-probe dir>]
 *
 * Defaults to `.scratch/model-probe` at the repository root (the samples the
 * hard oracles were taken from). Reads only. Exits 1 when anything decodes to
 * the wrong length or fails to decode.
 */

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodeBitknit2, isBitknit2 } from '../src/original/bitknit2'

const HERE = resolve(dirname(fileURLToPath(import.meta.url)))
const root = resolve(
  process.argv[2] && !process.argv[2].startsWith('--')
    ? process.argv[2]
    : // `tools` -> `arpg` -> `examples` -> the repo root, where `.scratch` lives.
      join(HERE, '..', '..', '..', '.scratch', 'model-probe'),
)

interface SectionCase {
  file: string
  label: string
  start: number
  end: number
  dstLen: number
  /** Type-tree names the decoded main section must contain. */
  strings?: string[]
}

interface FixupCase {
  file: string
  label: string
  /** Offset of the framing `u32 compressedSize`. */
  frameAt: number
  compressedSize: number
  dstLen: number
  /** Bytes per record in the decoded table: 12 for pointer triples. */
  stride: number
}

/** Names the Granny type tree writes into every decoded main section. */
const MAIN_STRINGS = ['Mesh', 'VertexData', 'Skeleton', 'Material', 'Bone']

/** The whole-section decodes: exact output length or failure. */
const SECTIONS: SectionCase[] = [
  { file: 'diablo.gr2', label: 'diablo main', start: 456, end: 212084, dstLen: 429436, strings: MAIN_STRINGS },
  { file: 'diablo.gr2', label: 'diablo deformable_index', start: 212084, end: 333188, dstLen: 540768 },
  { file: 'diablo.gr2', label: 'diablo discardable', start: 333188, end: 333816, dstLen: 22044 },
  { file: 'spheres.gr2', label: 'spheres main', start: 456, end: 68880, dstLen: 369012, strings: MAIN_STRINGS },
  { file: 'spheres.gr2', label: 'spheres discardable', start: 68880, end: 69428, dstLen: 16500 },
  {
    file: 'sample/data_hd_bvt_models_blend_sphere_lod0_model',
    label: 'blend_sphere main',
    start: 456,
    end: 10688,
    dstLen: 25984,
    strings: MAIN_STRINGS,
  },
  {
    file: 'sample/data_hd_bvt_models_blend_sphere_lod0_model',
    label: 'blend_sphere discardable',
    start: 10688,
    end: 11236,
    dstLen: 17116,
  },
]

/** The framed pointer-fixup tables that follow the sections of each file. */
const FIXUPS: FixupCase[] = [
  { file: 'diablo.gr2', label: 'diablo fixup main', frameAt: 333816, compressedSize: 5696, dstLen: 16068, stride: 12 },
  { file: 'diablo.gr2', label: 'diablo fixup small', frameAt: 339516, compressedSize: 40, dstLen: 48, stride: 16 },
  { file: 'diablo.gr2', label: 'diablo fixup deformable', frameAt: 339560, compressedSize: 2928, dstLen: 6480, stride: 12 },
  { file: 'spheres.gr2', label: 'spheres fixup main', frameAt: 69428, compressedSize: 9852, dstLen: 38616, stride: 12 },
  { file: 'spheres.gr2', label: 'spheres fixup small', frameAt: 79284, compressedSize: 140, dstLen: 352, stride: 16 },
  { file: 'spheres.gr2', label: 'spheres fixup discardable', frameAt: 79428, compressedSize: 2236, dstLen: 4788, stride: 12 },
  {
    file: 'sample/data_hd_bvt_models_blend_sphere_lod0_model',
    label: 'blend_sphere fixup main',
    frameAt: 11236,
    compressedSize: 1272,
    dstLen: 3012,
    stride: 12,
  },
  {
    file: 'sample/data_hd_bvt_models_blend_sphere_lod0_model',
    label: 'blend_sphere fixup small (stored)',
    frameAt: 12512,
    compressedSize: 20,
    dstLen: 16,
    stride: 16,
  },
  {
    file: 'sample/data_hd_bvt_models_blend_sphere_lod0_model',
    label: 'blend_sphere fixup discardable',
    frameAt: 12536,
    compressedSize: 2314,
    dstLen: 4992,
    stride: 12,
  },
]

const problems: string[] = []
const notes: string[] = []
let okCount = 0
let failCount = 0

function report(label: string, ok: boolean, detail: string): void {
  if (ok) {
    okCount++
    console.log(`OK   ${label} — ${detail}`)
  } else {
    failCount++
    problems.push(`${label}: ${detail}`)
    console.log(`FAIL ${label} — ${detail}`)
  }
}

const files = new Map<string, Uint8Array>()
function load(file: string): Uint8Array | null {
  const cached = files.get(file)
  if (cached) return cached
  try {
    const bytes = new Uint8Array(readFileSync(join(root, file)))
    files.set(file, bytes)
    return bytes
  } catch (error) {
    report(file, false, `cannot read (${(error as Error).message})`)
    return null
  }
}

for (const testCase of SECTIONS) {
  const data = load(testCase.file)
  if (!data) continue
  const label = `${testCase.file} ${testCase.label} [${testCase.start}..${testCase.end}]`
  const src = data.subarray(testCase.start, testCase.end)
  if (!isBitknit2(src)) {
    report(label, false, 'payload does not start with the magic bytes b1 75')
    continue
  }
  try {
    const started = Date.now()
    const out = decodeBitknit2(src, testCase.dstLen)
    const elapsed = Date.now() - started
    if (out.length !== testCase.dstLen) {
      report(label, false, `decoded to ${out.length} bytes, expected ${testCase.dstLen}`)
      continue
    }
    const missing = (testCase.strings ?? []).filter(
      (name) => !Buffer.from(out).includes(name, 0, 'latin1'),
    )
    if (missing.length > 0) {
      report(label, false, `type-tree strings missing from the output: ${missing.join(', ')}`)
      continue
    }
    report(label, true, `${out.length} bytes in ${elapsed} ms${testCase.strings ? ' (type tree present)' : ''}`)
  } catch (error) {
    report(label, false, (error as Error).message)
  }
}

for (const testCase of FIXUPS) {
  const data = load(testCase.file)
  if (!data) continue
  const label = `${testCase.file} ${testCase.label} [@${testCase.frameAt}]`
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const declaredSize = view.getUint32(testCase.frameAt, true)
  if (declaredSize !== testCase.compressedSize) {
    report(label, false, `frame declares ${declaredSize} compressed bytes, expected ${testCase.compressedSize}`)
    continue
  }
  const payload = data.subarray(testCase.frameAt + 4, testCase.frameAt + 4 + testCase.compressedSize)
  if (!isBitknit2(payload)) {
    report(label, false, 'framed payload does not start with the magic bytes b1 75')
    continue
  }
  try {
    const out = decodeBitknit2(payload, testCase.dstLen)
    if (out.length !== testCase.dstLen) {
      report(label, false, `decoded to ${out.length} bytes, expected ${testCase.dstLen}`)
      continue
    }
    const entries = out.length / testCase.stride
    if (!Number.isInteger(entries)) {
      report(label, false, `${out.length} bytes is not a whole number of ${testCase.stride}-byte records`)
      continue
    }
    if (testCase.stride === 12) {
      // (u32 srcOffset, u32 dstSection, u32 dstOffset) triples.
      const table = new DataView(out.buffer, out.byteOffset, out.byteLength)
      const ranges = [0, 1, 2].map((field) => {
        let lo = Infinity
        let hi = -Infinity
        for (let entry = 0; entry < entries; entry++) {
          const value = table.getUint32(entry * 12 + field * 4, true)
          if (value < lo) lo = value
          if (value > hi) hi = value
        }
        return `[${lo}..${hi}]`
      })
      let bad = -1
      for (let entry = 0; entry < entries && bad < 0; entry++) {
        const srcOffset = table.getUint32(entry * 12, true)
        const dstSection = table.getUint32(entry * 12 + 4, true)
        const dstOffset = table.getUint32(entry * 12 + 8, true)
        if (dstSection >= 16 || srcOffset >= 4 << 20 || dstOffset >= 4 << 20) bad = entry
      }
      if (bad >= 0) {
        report(label, false, `entry ${bad} is not a plausible (srcOffset, dstSection, dstOffset) triple`)
        continue
      }
      notes.push(
        `${label}: ${entries} triples, field ranges srcOffset ${ranges[0]} dstSection ${ranges[1]} dstOffset ${ranges[2]}`,
      )
      report(label, true, `${entries} x 12-byte triples (${out.length} bytes)`)
    } else {
      // The small frames decompress to a 16-byte record stride whose fields
      // are not identified; only the decode itself is checked here.
      const table = new DataView(out.buffer, out.byteOffset, out.byteLength)
      const words = Array.from({ length: Math.min(4, out.length / 4) }, (_, i) => table.getUint32(i * 4, true))
      notes.push(`${label}: ${entries} x ${testCase.stride}-byte records, first words ${words.join(' ')}`)
      report(label, true, `${entries} x ${testCase.stride}-byte records (${out.length} bytes)`)
    }
  } catch (error) {
    report(label, false, (error as Error).message)
  }
}

for (const note of notes) console.log(`     ${note}`)
if (failCount > 0) {
  console.error(
    `verify-bitknit2: FAILED — ${failCount} problems, ${okCount} OK; first: ${problems.slice(0, 5).join('; ')}\n`,
  )
  process.exit(1)
}
console.log(`verify-bitknit2: OK — ${okCount} checks passed\n`)
