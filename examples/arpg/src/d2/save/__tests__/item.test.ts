/**
 * The item serializer, against a real item the game wrote.
 *
 * The vector is the save/reimplementation spec's worked example: a short staff
 * dropped in `run:2026-10-12-d2s-io`, logged field by field at the write and
 * dumped from the file at offset `0x403`. Matching it byte for byte means the
 * field order, the widths out of `itemstatcost.txt`, the `Save Add` offsets and
 * the property framing are all the original's — one swapped field would shift
 * every bit after it.
 */

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseStatTable, type StatRow } from '../../stats'
import { BitReader, BitWriter } from '../bits'
import { QUALITY, readItem, writeItem, writePropertyList, type SaveItem } from '../item'

/** `import.meta.url` is not a `file:` URL under the runner; walk the working directory instead. */
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

/** The staff's type chain, from `weapons.txt` (`staf`) up through `itemtypes.txt` to `weap`. */
const STAFF_TYPES = ['staf', 'rod', 'blun', 'mele', 'weap'] as const

/** The item as the game logged it at the write (spec § I, "One item: the dropped staff"). */
function droppedStaff(): SaveItem {
  return {
    flags: 0x00080010,
    version: 101,
    mode: 0,
    bodyLoc: 0,
    x: 1,
    y: 0,
    page: 0,
    code: 'sst ',
    seed: 2728687498,
    ilvl: 1,
    quality: QUALITY.inferior,
    types: STAFF_TYPES,
    qualityIndex: 1,
    base: { maxDurability: 6, durability: 5 },
    properties: [
      { id: 107, param: 36, value: 1 },
      { id: 107, param: 38, value: 1 },
    ],
  }
}

const STAFF_BYTES = [
  0x4a, 0x4d, 0x10, 0x00, 0x80, 0x00, 0x65, 0x00, 0x02, 0x32, 0x37, 0x47, 0x07, 0x02, 0xc5, 0x3b,
  0x52, 0xd1, 0x40, 0x10, 0x06, 0x05, 0xd6, 0x90, 0xc8, 0x1a, 0x13, 0xf9, 0x0f,
]

describe('writeItem', () => {
  it('reproduces the 29 bytes the game wrote for a dropped staff', () => {
    const writer = new BitWriter()
    writeItem(writer, droppedStaff(), stats)
    expect(Array.from(writer.toBytes())).toEqual(STAFF_BYTES)
  })

  it('tags every item with JM and clears the runtime-only flag bit', () => {
    const writer = new BitWriter()
    writeItem(writer, droppedStaff(), stats)
    const reader = new BitReader(writer.toBytes())
    expect(reader.read(16)).toBe(0x4d4a)
    // Bit 19 is cleared and bit 23 set on the way out to the file.
    expect(reader.read(32)).toBe(0x00800010)
  })

  it('round-trips through its own reader', () => {
    const writer = new BitWriter()
    writeItem(writer, droppedStaff(), stats)
    const read = readItem(new BitReader(writer.toBytes()), stats, () => STAFF_TYPES)
    expect(read).not.toBeNull()
    expect(read!.code).toBe('sst ')
    expect(read!.seed).toBe(2728687498)
    expect(read!.ilvl).toBe(1)
    expect(read!.quality).toBe(QUALITY.inferior)
    expect(read!.qualityIndex).toBe(1)
    expect(read!.base).toEqual({ maxDurability: 6, durability: 5 })
    expect(read!.properties).toEqual([
      { id: 107, param: 36, value: 1 },
      { id: 107, param: 38, value: 1 },
    ])
  })

  it('starts each item on a byte boundary', () => {
    const writer = new BitWriter()
    writer.write(0b101, 3)
    writeItem(writer, droppedStaff(), stats)
    const bytes = writer.toBytes()
    // Three bits of padding, then the item's own tag.
    expect(bytes[0]).toBe(0b00000101)
    expect(bytes[1]).toBe(0x4a)
    expect(bytes[2]).toBe(0x4d)
  })
})

describe('writePropertyList', () => {
  it('skips a stat whose stored value is zero', () => {
    const writer = new BitWriter()
    writePropertyList(writer, [{ id: 107, param: 36, value: 0 }], stats)
    const reader = new BitReader(writer.toBytes())
    expect(reader.read(9)).toBe(0x1ff)
  })

  it('writes the param only for a stat that has one', () => {
    const writer = new BitWriter()
    // Stat 73 (maxdurability) has no `Save Param Bits`; stat 107 has nine.
    writePropertyList(writer, [{ id: 73, value: 6 }], stats)
    const reader = new BitReader(writer.toBytes())
    expect(reader.read(9)).toBe(73)
    expect(reader.read(stats.get(73)!.saveBits!)).toBe(6)
    expect(reader.read(9)).toBe(0x1ff)
  })

  it('stores a shifted value without its low bits, offset by Save Add', () => {
    // Stat 7 (maxhp): ValShift 8, so the file holds points not points<<8; the
    // table's Save Add of 32 is added on the way out (it is why a zero life is
    // representable at all).
    const writer = new BitWriter()
    writePropertyList(writer, [{ id: 7, value: 40 << 8 }], stats)
    const reader = new BitReader(writer.toBytes())
    expect(reader.read(9)).toBe(7)
    expect(reader.read(stats.get(7)!.saveBits!)).toBe(40 + 32)
  })
})
