/**
 * The `.d2s` save file.
 *
 * A save is a 335-byte header and then, in this order: the quest record, the
 * waypoints, the NPC records, the character's stats, its skills, its items, its
 * corpses, and — in an expansion game — the mercenary's items and the golem. The
 * header ends up holding the file's own size and a checksum over every byte of it,
 * so the file is written once to learn the size and patched afterwards.
 *
 * The numbers here are the original's, not a convention: the section markers
 * ("Woo!", "WS", `01 77`), the width of every field, the stat list's skip of
 * `CSvBits` 0 and the checksum's rotate-and-add all come from the game's own
 * writers. The item bitstream is `item.ts`.
 *
 * A save is also where the game keeps a little state it cannot rebuild: the map
 * seed (so a reloaded area is the same area) and the character's status word.
 */

import { BitReader, BitWriter } from './bits'
import { readItem, writeItem, type SaveItem } from './item'
import type { StatTable } from '../stats'

/** `0xAA55AA55`: the first four bytes of every save. */
export const SAVE_MAGIC = 0xaa55aa55

/** The version this writer emits; the game's reader accepts 92..96. */
export const SAVE_VERSION = 96

/** Header size in bytes (`0x000`–`0x14E`). */
export const SAVE_HEADER_SIZE = 0x14f

/** The stat-slot count the header carries; only a version ≤ 94 reader uses it. */
const STAT_SLOT_COUNT = 16

/** How many skill bytes follow the `if` marker. */
const SKILL_COUNT = 30

/** End-of-list marker for a stat list and for a property list. */
const LIST_END = 0x1ff

/** A stat as the `gf` list stores it: base stats only, with the 8 fraction bits. */
export interface SaveStat {
  id: number
  param?: number
  /** The in-memory value: life and mana keep their eight fraction bits. */
  value: number
}

/** The skills the header points at, and the two hands' item references. */
export interface SaveSkillsBar {
  left: number
  right: number
  leftItem?: number
  rightItem?: number
  swapA?: number
  swapB?: number
}

/** A hotkey slot: a skill and the item it is bound to. */
export interface SaveHotkey {
  skill: number
  itemRef: number
  /** The game's own "this slot is configured" bit, written into bit 15 of the skill. */
  configured?: boolean
}

/** The header fields, named for what the game reads and writes them from. */
export interface SaveHeader {
  /** The character's name, NUL-padded to 16 bytes. */
  name: string
  /** 0 = Amazon … 6 = Assassin, in the game's class order. */
  classId: number
  /** Stat 12, written so a character list can show it without reading the stats. */
  level: number
  /**
   * The client status word: bit 2 hardcore, bit 3 dead, bit 5 expansion, bit 6
   * ladder, bits 8–12 progression. The writer ORs in expansion and ladder itself,
   * because those are properties of the game, not of the character.
   */
  status: number
  expansion: boolean
  ladder?: boolean
  /** Bit 0: the alternate weapon set is the active one. */
  weaponSet?: number
  /** The client's act, written `| 0x80` into the difficulty byte. */
  act: number
  /** 0 = Normal, 1 = Nightmare, 2 = Hell: which of the three bytes carries the act. */
  difficulty: number
  /** The map seed, so a reload rebuilds the same area. */
  mapSeed: number
  /** `time()` at the write. */
  lastPlayed: number
  /** Client `+0x488`. */
  unk2c?: number
  /** Client `+0x480`, the one byte of the otherwise-zero tail that is read back. */
  unkBF?: number
  mercenary?: {
    dead?: boolean
    seed: number
    nameId: number
    hirelingId: number
    experience: number
  }
  skillsBar: SaveSkillsBar
  hotkeys?: readonly SaveHotkey[]
  /** 16 bytes of graphics choices, `0xFF` by default. */
  graphics?: Uint8Array
  /** 16 bytes of colour choices. */
  colours?: Uint8Array
}

/** A corpse the player left behind: three words and its own item list. */
export interface SaveCorpse {
  /** Two position words; the first word the game writes is uninitialised in the original. */
  position: readonly [number, number]
  items: readonly SaveItem[]
}

/** Everything a save file holds, in the order the file holds it. */
export interface SaveContents {
  header: SaveHeader
  /** Three 96-byte quest blocks, one per difficulty. */
  quests: readonly Uint8Array[]
  /**
   * Three waypoint records, one per difficulty: a `0x0102` marker and seven
   * words, where bit `n` of byte `2 + n div 16` is waypoint `n`.
   */
  waypoints: readonly Uint8Array[]
  /** The NPC records: three 8-byte "first" blocks and three "second" ones. */
  npcs: { first: readonly Uint8Array[]; second: readonly Uint8Array[] }
  /** The base stat list, in the order the game keeps it. */
  stats: readonly SaveStat[]
  /** One byte per skill of the class. */
  skills: Uint8Array
  items: readonly SaveItem[]
  corpses?: readonly SaveCorpse[]
  /** Written only in an expansion game, and only when the player has a mercenary. */
  mercenaryItems?: readonly SaveItem[]
  /** An expansion game always writes `kf`, even with no golem. */
  golem?: SaveItem | null
}

/**
 * The save's checksum: rotate left, add the byte, repeat.
 *
 * The field itself must read as zero while this runs, so the caller passes the
 * buffer with `0x00C`–`0x00F` already cleared — which is also the state the file
 * is in before the value is patched in.
 */
export function saveChecksum(bytes: Uint8Array, length = bytes.length): number {
  let sum = 0
  for (let i = 0; i < length; i += 1) {
    sum = (((sum << 1) | (sum >>> 31)) + bytes[i]) >>> 0
  }
  return sum
}

/** Writes the 335-byte header. `fileSize` and `checksum` are zero until the file is complete. */
export function writeHeader(header: SaveHeader, fileSize: number, checksum: number): Uint8Array {
  const writer = new BitWriter()
  const u32 = (value: number): void => writer.write(value >>> 0, 32)
  const u16 = (value: number): void => writer.write(value & 0xffff, 16)

  u32(SAVE_MAGIC)
  u32(SAVE_VERSION)
  u32(fileSize)
  u32(checksum)
  u32(header.weaponSet ?? 0)

  const name = new Uint8Array(16)
  for (let i = 0; i < Math.min(15, header.name.length); i += 1) name[i] = header.name.charCodeAt(i) & 0xff
  writer.writeBytes(name)

  let status = (header.status & 0xffff) >>> 0
  if (header.expansion) status |= 0x20
  if (header.ladder === true) status |= 0x40
  u32(status)
  writer.write(header.classId & 0xff, 8)
  writer.write(STAT_SLOT_COUNT, 8)
  writer.write(SKILL_COUNT, 8)
  writer.write(header.level & 0xff, 8)
  u32(header.unk2c ?? 0)
  u32(header.lastPlayed)
  u32(0xffffffff)

  const hotkeys = header.hotkeys ?? []
  for (let slot = 0; slot < 16; slot += 1) {
    const hotkey = hotkeys[slot]
    if (hotkey === undefined) {
      u16(0xffff)
      u16(0xffff)
      continue
    }
    u16((hotkey.skill & 0xfff) | (hotkey.configured === true ? 0x8000 : 0))
    u16(hotkey.itemRef & 0xffff)
  }

  const bar = header.skillsBar
  u16(bar.left)
  u16(bar.leftItem ?? 0)
  u16(bar.right)
  u16(bar.rightItem ?? 0)
  u16(bar.swapA ?? 0)
  u16(0)
  u16(bar.swapB ?? 0)
  u16(0)

  const graphics = header.graphics ?? new Uint8Array(16).fill(0xff)
  const colours = header.colours ?? new Uint8Array(16).fill(0xff)
  if (graphics.length !== 16 || colours.length !== 16) {
    throw new Error('the graphics and colour blocks are 16 bytes each')
  }
  writer.writeBytes(graphics)
  writer.writeBytes(colours)

  // The three difficulty bytes: only the current one carries the act, and the
  // high bit says the map seed was taken from this save rather than rolled.
  for (let index = 0; index < 3; index += 1) {
    writer.write(index === header.difficulty ? (header.act & 0x7f) | 0x80 : 0, 8)
  }
  u32(header.mapSeed)

  const mercenary = header.mercenary
  u32(mercenary === undefined || mercenary.dead !== true ? 0 : 1 << 16)
  u32(mercenary?.seed ?? 0)
  u16(mercenary?.nameId ?? 0)
  u16(mercenary?.hirelingId ?? 0)
  u32(mercenary?.experience ?? 0)

  writer.writeBytes(new Uint8Array(16))
  writer.write(header.unkBF ?? 0, 8)
  writer.writeBytes(new Uint8Array(0x14f - 0xd0))

  const bytes = writer.toBytes()
  if (bytes.length !== SAVE_HEADER_SIZE) {
    throw new Error(`header came out ${bytes.length} bytes, not ${SAVE_HEADER_SIZE}`)
  }
  return bytes
}

/** The quest section: a marker, a version and three 96-byte difficulty blocks. */
function writeQuests(writer: BitWriter, quests: readonly Uint8Array[]): void {
  writer.writeBytes(new Uint8Array([0x57, 0x6f, 0x6f, 0x21])) // "Woo!"
  writer.write(6, 32)
  writer.write(0x12a, 16)
  for (let difficulty = 0; difficulty < 3; difficulty += 1) {
    const block = quests[difficulty] ?? new Uint8Array(96)
    if (block.length !== 96) throw new Error(`quest block ${difficulty} is ${block.length} bytes, not 96`)
    writer.writeBytes(block)
  }
}

/** The waypoint section: a marker, a version and three 24-byte difficulty blocks. */
function writeWaypoints(writer: BitWriter, waypoints: readonly Uint8Array[]): void {
  writer.writeBytes(new Uint8Array([0x57, 0x53])) // "WS"
  writer.write(1, 32)
  writer.write(0x50, 16)
  for (let difficulty = 0; difficulty < 3; difficulty += 1) {
    const record = waypoints[difficulty] ?? new Uint8Array(16)
    if (record.length < 16) throw new Error(`waypoint record ${difficulty} is ${record.length} bytes, not 16`)
    // Sixteen bytes of record, then eight the original never writes.
    writer.writeBytes(record.subarray(0, 16))
    writer.writeBytes(new Uint8Array(8))
  }
}

/** The NPC section: two 8-byte records per difficulty. */
function writeNpcs(writer: BitWriter, npcs: SaveContents['npcs']): void {
  writer.writeBytes(new Uint8Array([0x01, 0x77]))
  writer.write(0x34, 16)
  for (let difficulty = 0; difficulty < 3; difficulty += 1) {
    const first = npcs.first[difficulty] ?? new Uint8Array(8)
    if (first.length !== 8) throw new Error(`NPC block ${difficulty} is ${first.length} bytes, not 8`)
    writer.writeBytes(first)
  }
  for (let difficulty = 0; difficulty < 3; difficulty += 1) {
    const second = npcs.second[difficulty] ?? new Uint8Array(8)
    if (second.length !== 8) throw new Error(`NPC block ${difficulty} is ${second.length} bytes, not 8`)
    writer.writeBytes(second)
  }
}

/** The `gf` stat list: the base stats the table gives a width for, then `0x1FF`. */
function writeStats(writer: BitWriter, stats: readonly SaveStat[], table: StatTable): void {
  writer.writeBytes(new Uint8Array([0x67, 0x66])) // "gf"
  for (const stat of stats) {
    const def = table.get(stat.id)
    if (def === null) throw new Error(`no itemstatcost row for stat ${stat.id}`)
    const width = def.csvBits
    if (width === 0) continue
    writer.write(stat.id, 9)
    if (def.csvParam !== 0) writer.write(stat.param ?? 0, def.csvParam)
    let value = stat.value ?? 0
    if (width < 32) {
      if (def.csvSigned) {
        const low = -(2 ** (width - 1))
        const high = 2 ** (width - 1) - 1
        value = Math.min(Math.max(value, low), high)
      } else {
        value = Math.min(Math.max(value, 0), 2 ** width - 1)
      }
    }
    writer.write(value >>> 0, width)
  }
  writer.write(LIST_END, 9)
  writer.align()
}

/** The `if` skill section: one byte of base level per skill of the class. */
function writeSkills(writer: BitWriter, skills: Uint8Array): void {
  writer.writeBytes(new Uint8Array([0x69, 0x66])) // "if"
  writer.writeBytes(skills)
}

/** One item list: `JM`, a count, then the items. */
function writeItemList(writer: BitWriter, items: readonly SaveItem[], table: StatTable): void {
  const payload = new BitWriter()
  let count = 0
  for (const item of items) count += writeItem(payload, item, table)
  writer.align()
  writer.write(0x4d4a, 16) // "JM"
  writer.write(count & 0xffff, 16)
  writer.writeBytes(payload.toBytes())
  writer.align()
}

/**
 * Builds a whole save file.
 *
 * The file is assembled with a zero size and checksum, and the two are patched
 * afterwards — the checksum covers the bytes that hold it, so it cannot be known
 * until everything else is written.
 */
export function writeSave(contents: SaveContents, table: StatTable): Uint8Array {
  const writer = new BitWriter()
  writer.writeBytes(writeHeader(contents.header, 0, 0))

  for (let i = 0; i < 2; i += 1) writer.align()
  writeQuests(writer, contents.quests)
  writeWaypoints(writer, contents.waypoints)
  writeNpcs(writer, contents.npcs)
  writeStats(writer, contents.stats, table)
  writeSkills(writer, contents.skills)
  writeItemList(writer, contents.items, table)

  const corpses = contents.corpses ?? []
  if (corpses.length > 1) throw new Error('a save holds at most one corpse')
  writer.align()
  writer.write(0x4d4a, 16)
  writer.write(corpses.length, 16)
  for (const corpse of corpses) {
    // The original writes an uninitialised stack word first; nothing reads it, so
    // it is a zero here rather than a byte that would differ on every save.
    writer.write(0, 32)
    writer.write(corpse.position[0] >>> 0, 32)
    writer.write(corpse.position[1] >>> 0, 32)
    writeItemList(writer, corpse.items, table)
  }

  if (contents.header.expansion) {
    writer.align()
    writer.writeBytes(new Uint8Array([0x6a, 0x66])) // "jf"
    if (contents.header.mercenary !== undefined) {
      writeItemList(writer, contents.mercenaryItems ?? [], table)
    }
    writer.align()
    writer.writeBytes(new Uint8Array([0x6b, 0x66])) // "kf"
    const golem = new BitWriter()
    if (contents.golem !== undefined && contents.golem !== null) writeItem(golem, contents.golem, table)
    writer.writeBytes(golem.toBytes())
  }

  writer.align()
  const bytes = writer.toBytes()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  view.setUint32(0x008, bytes.length, true)
  view.setUint32(0x00c, 0, true)
  view.setUint32(0x00c, saveChecksum(bytes), true)
  return bytes
}

/** What a save file says about a character, for a list that does not want to load it. */
export interface SaveSummary {
  name: string
  classId: number
  level: number
  hardcore: boolean
  dead: boolean
  expansion: boolean
  ladder: boolean
  act: number
  difficulty: number
  mapSeed: number
  lastPlayed: number
  /** The stored checksum and whether the file's own bytes agree with it. */
  checksum: { stored: number; computed: number; valid: boolean }
}

/** Reads the header, and checks it against the file. */
export function readSummary(bytes: Uint8Array): SaveSummary {
  if (bytes.length < SAVE_HEADER_SIZE) throw new Error(`a save is at least ${SAVE_HEADER_SIZE} bytes`)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0x000, true) !== SAVE_MAGIC) throw new Error('not a save file: the magic word is absent')
  const stored = view.getUint32(0x00c, true)
  const zeroed = bytes.slice()
  new DataView(zeroed.buffer, zeroed.byteOffset, zeroed.byteLength).setUint32(0x00c, 0, true)
  const computed = saveChecksum(zeroed)
  let name = ''
  for (let i = 0; i < 16; i += 1) {
    const code = bytes[0x014 + i]
    if (code === 0) break
    name += String.fromCharCode(code)
  }
  const status = view.getUint32(0x024, true)
  let difficulty = 0
  for (let index = 0; index < 3; index += 1) {
    if ((bytes[0x0a8 + index] & 0x80) !== 0) difficulty = index
  }
  return {
    name,
    classId: bytes[0x028],
    level: bytes[0x02b],
    hardcore: (status & 0x04) !== 0,
    dead: (status & 0x08) !== 0,
    expansion: (status & 0x20) !== 0,
    ladder: (status & 0x40) !== 0,
    act: bytes[0x0a8 + difficulty] & 0x7f,
    difficulty,
    mapSeed: view.getUint32(0x0ab, true),
    lastPlayed: view.getUint32(0x030, true),
    checksum: { stored, computed, valid: stored === computed },
  }
}

/** Everything read back out of a save. */
export interface ReadSave {
  summary: SaveSummary
  stats: SaveStat[]
  skills: Uint8Array
  items: SaveItem[]
}

/**
 * Reads a whole save.
 *
 * `typesOf` supplies an item code's type chain, which the bitstream does not
 * carry: whether the fields after the quality byte are an armour class or a
 * durability depends on the code in `weapons.txt`/`armor.txt`/`misc.txt`.
 */
export function readSave(
  bytes: Uint8Array,
  table: StatTable,
  typesOf: (code: string) => readonly string[],
): ReadSave {
  const summary = readSummary(bytes)
  const reader = new BitReader(bytes)
  // The header is a flat byte block; the bit reader starts after it.
  reader.readBytes(SAVE_HEADER_SIZE)

  const expect = (marker: readonly number[]): void => {
    for (const byte of marker) {
      const read = reader.read(8)
      if (read !== byte) throw new Error(`expected marker ${marker.map((b) => String.fromCharCode(b)).join('')}`)
    }
  }

  expect([0x57, 0x6f, 0x6f, 0x21]) // Woo!
  reader.readBytes(4 + 2 + 3 * 96)

  expect([0x57, 0x53]) // WS
  reader.readBytes(4 + 2 + 3 * 24)

  expect([0x01, 0x77])
  reader.readBytes(2 + 3 * 8 + 3 * 8)

  expect([0x67, 0x66]) // gf
  const stats: SaveStat[] = []
  for (;;) {
    const id = reader.read(9)
    if (id === LIST_END) break
    const def = table.get(id)
    if (def === null || def.csvBits === 0) throw new Error(`stat ${id} cannot appear in a stat list`)
    const param = def.csvParam === 0 ? 0 : reader.read(def.csvParam)
    const value = def.csvSigned ? reader.readSigned(def.csvBits) : reader.read(def.csvBits)
    stats.push(def.csvParam === 0 ? { id, value } : { id, param, value })
  }
  reader.align()

  expect([0x69, 0x66]) // if
  const skills = reader.readBytes(SKILL_COUNT)

  const readList = (): SaveItem[] => {
    reader.align()
    if (reader.read(16) !== 0x4d4a) throw new Error('expected an item list')
    const count = reader.read(16)
    const items: SaveItem[] = []
    for (let i = 0; i < count; i += 1) {
      const item = readItem(reader, table, typesOf)
      if (item === null) break
      items.push(item)
    }
    return items
  }
  const items = readList()
  return { summary, stats, skills, items }
}
