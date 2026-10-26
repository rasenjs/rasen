/**
 * The save file against a real one the game wrote.
 *
 * The vector is the header of `save3-seedtest-drop.d2s` from the save spec's
 * worked example: 1113 bytes, checksum `0xDBF815BF`, a level-71 expansion
 * Barbarian named `seedtest` with map seed 12345. Two things are pinned here
 * because they are where a reimplementation silently goes wrong: the checksum's
 * order of operations (it is a rotate, not a shift, and the field reads as zero
 * while it runs) and the header's byte offsets, which every later section depends
 * on.
 */

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseStatTable, type StatRow } from '../../stats'
import { saveChecksum, writeHeader, writeSave, readSummary, readSave, SAVE_HEADER_SIZE } from '../d2s'

function findTableDirectory(): string {
  let directory = process.cwd()
  for (;;) {
    for (const relative of ['public/original', 'examples/arpg/public/original', '../public/original']) {
      const candidate = resolve(directory, relative)
      if (existsSync(join(candidate, 'table_itemstatcost.json'))) return candidate
    }
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  throw new Error('the extracted table export (public/original) was not found')
}

const stats = parseStatTable(
  JSON.parse(readFileSync(join(findTableDirectory(), 'table_itemstatcost.json'), 'utf8')) as StatRow[],
)

/** The first 48 bytes of the real save, i.e. `0x000`–`0x02F`. */
const HEADER_PREFIX = [
  0x55, 0xaa, 0x55, 0xaa, 0x60, 0x00, 0x00, 0x00, 0x59, 0x04, 0x00, 0x00, 0xbf, 0x15, 0xf8, 0xdb,
  0x00, 0x00, 0x00, 0x00, 0x73, 0x65, 0x65, 0x64, 0x74, 0x65, 0x73, 0x74, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x20, 0x05, 0x00, 0x00, 0x04, 0x10, 0x1e, 0x47, 0x00, 0x00, 0x00, 0x00,
]

/** The header the game wrote, described field by field in the worked example. */
function seedtestHeader() {
  return {
    name: 'seedtest',
    classId: 4,
    level: 71,
    status: 0x0500,
    expansion: true,
    act: 0,
    difficulty: 0,
    mapSeed: 12345,
    lastPlayed: 1791799915,
    skillsBar: { left: 0, right: 154 },
  }
}

describe('saveChecksum', () => {
  // The spec lists the running sum at chosen byte indices of the real save; the
  // first sixteen bytes are the header prefix, with the checksum field as zero.
  const bytes = new Uint8Array(HEADER_PREFIX)
  bytes[0x0c] = 0
  bytes[0x0d] = 0
  bytes[0x0e] = 0
  bytes[0x0f] = 0

  it('adds and rotates', () => {
    expect(saveChecksum(bytes, 1)).toBe(0x00000055)
    expect(saveChecksum(bytes, 2)).toBe(0x00000154)
    expect(saveChecksum(bytes, 3)).toBe(0x000002fd)
    expect(saveChecksum(bytes, 4)).toBe(0x000006a4)
    expect(saveChecksum(bytes, 5)).toBe(0x00000da8)
    expect(saveChecksum(bytes, 9)).toBe(0x0000dad9)
    expect(saveChecksum(bytes, 16)).toBe(0x006d6d80)
  })
})

describe('writeHeader', () => {
  it('reproduces the first 48 bytes of a real save', () => {
    const header = writeHeader(seedtestHeader(), 1113, 0xdbf815bf)
    expect(Array.from(header.subarray(0, 48))).toEqual(HEADER_PREFIX)
  })

  it('is 335 bytes and zero past the fields it knows', () => {
    const header = writeHeader(seedtestHeader(), 0, 0)
    expect(header.length).toBe(SAVE_HEADER_SIZE)
    expect(header[0x2f]).toBe(0)
    expect(header[0xcf]).toBe(0)
    expect(header[0x14e]).toBe(0)
  })

  it('ORs expansion and ladder into the status word', () => {
    const plain = writeHeader({ ...seedtestHeader(), status: 0, expansion: false, ladder: false }, 0, 0)
    expect(new DataView(plain.buffer).getUint32(0x024, true)).toBe(0)
    const ladder = writeHeader({ ...seedtestHeader(), status: 0, expansion: true, ladder: true }, 0, 0)
    expect(new DataView(ladder.buffer).getUint32(0x024, true)).toBe(0x60)
  })

  it('puts the act in the byte of the difficulty it was played on', () => {
    const header = writeHeader({ ...seedtestHeader(), act: 3, difficulty: 1 }, 0, 0)
    expect(header[0x0a8]).toBe(0)
    expect(header[0x0a9]).toBe(0x83)
    expect(header[0x0aa]).toBe(0)
  })
})

describe('writeSave and readSave', () => {
  function contents() {
    return {
      header: seedtestHeader(),
      quests: [new Uint8Array(96), new Uint8Array(96), new Uint8Array(96)],
      waypoints: [0, 1, 2].map(() => {
        const record = new Uint8Array(16)
        record[0] = 0x02
        record[1] = 0x01
        record[2] = 0x01
        return record
      }),
      npcs: {
        first: [new Uint8Array(8), new Uint8Array(8), new Uint8Array(8)],
        second: [new Uint8Array(8), new Uint8Array(8), new Uint8Array(8)],
      },
      stats: [
        { id: 0, value: 30 },
        { id: 1, value: 10 },
        { id: 2, value: 20 },
        { id: 3, value: 25 },
        { id: 6, value: 55 << 8 },
        { id: 7, value: 55 << 8 },
        { id: 8, value: 10 << 8 },
        { id: 9, value: 10 << 8 },
        { id: 12, value: 71 },
        { id: 13, value: 1234567 },
      ],
      skills: new Uint8Array(30),
      items: [],
    }
  }

  it('writes its own size and a checksum that covers it', () => {
    const bytes = writeSave(contents(), stats)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    expect(view.getUint32(0x008, true)).toBe(bytes.length)
    const zeroed = bytes.slice()
    new DataView(zeroed.buffer, zeroed.byteOffset, zeroed.byteLength).setUint32(0x00c, 0, true)
    expect(view.getUint32(0x00c, true)).toBe(saveChecksum(zeroed))
  })

  it('reads back the header it wrote', () => {
    const bytes = writeSave(contents(), stats)
    const summary = readSummary(bytes)
    expect(summary.name).toBe('seedtest')
    expect(summary.classId).toBe(4)
    expect(summary.level).toBe(71)
    expect(summary.expansion).toBe(true)
    expect(summary.mapSeed).toBe(12345)
    expect(summary.checksum.valid).toBe(true)
  })

  it('round-trips the stats and the skills', () => {
    const original = contents()
    original.skills = Uint8Array.from({ length: 30 }, (_, index) => index)
    const bytes = writeSave(original, stats)
    const read = readSave(bytes, stats, () => [])
    // Stat 13 (experience) has a 32-bit field, so it comes back exactly; the
    // life and mana stats keep their eight fraction bits.
    expect(read.stats).toEqual(original.stats)
    expect(Array.from(read.skills)).toEqual(Array.from(original.skills))
  })

  it('rejects a file whose checksum does not match', () => {
    const bytes = writeSave(contents(), stats)
    bytes[0x040] ^= 0xff
    expect(readSummary(bytes).checksum.valid).toBe(false)
  })
})
