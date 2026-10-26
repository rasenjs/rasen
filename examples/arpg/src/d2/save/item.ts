/**
 * One item, as the save file stores it.
 *
 * An item is written as: a `JM` tag, the common part (where it is, what it is, its
 * seed), then — unless the item is "simple" — its extended part (quality, the
 * type-specific base stats, sockets, set state, properties). Every field is a
 * width that comes from `itemstatcost.txt`, so the tables decide the byte layout;
 * this module only knows the order.
 *
 * Two clamps exist in the original and they do not agree. `ClampU` (everything
 * here) saturates as unsigned, so a negative value becomes all ones;
 * `D2S_WriteStats` clamps the same way but signed, which is why a negative base
 * stat is written as 0 there and as `2^n − 1` here.
 */

import { BitReader, BitWriter } from './bits'
import type { StatTable } from '../stats'

/** `Save Param Bits` for a grouped head is written before its value; see {@link GROUPS}. */
export const ITEM_TAG = 0x4d4a // "JM", read back as a 16-bit value

/**
 * Property ids that stand for a family of stats.
 *
 * A head is written once with its own value, then each follower's raw value
 * follows with no id and no param — so a list containing a head *must* carry the
 * followers in the same order, which is why the followers are named here.
 */
const GROUPS: ReadonlyMap<number, readonly number[]> = new Map([
  [17, [18]],
  [48, [49]],
  [50, [51]],
  [52, [53]],
  [54, [55, 56]],
  [57, [58, 59]],
])

/** One stat as an item stores it: `id`, an optional param, and the value. */
export interface ItemProperty {
  id: number
  param?: number
  value: number
}

/** Item qualities, as `quality` numbers in the file. */
export const QUALITY = {
  inferior: 1,
  normal: 2,
  superior: 3,
  magic: 4,
  set: 5,
  rare: 6,
  unique: 7,
  crafted: 8,
  tempered: 9,
} as const

/** The base stats a type-specific item carries outside its property list. */
export interface ItemBaseStats {
  /** Stat 31: armour only. */
  armorClass?: number
  /** Stat 73; when non-zero the durability (stat 72) follows. */
  maxDurability?: number
  /** Stat 72. */
  durability?: number
  /** Stat 70, for a stackable item. */
  quantity?: number
  /** Stat 194, the number of filled sockets. */
  sockets?: number
}

/** Everything the file records about one item. */
export interface SaveItem {
  /**
   * The runtime item flags.
   *
   * The writer clears bit 19 and sets bit 23; `bit 21` marks a "simple" item (no
   * extended part), `bit 16` an ear, `bit 24` a personalized item, `bit 26` a
   * runeword, `bit 11` a socketed item and `bit 4` an identified one.
   */
  flags: number
  /** `version`, 10 bits; 101 in the shipped data. */
  version: number
  /** `mode`: 0 = stored, 3 and 5 = on the ground (world position instead of a grid slot). */
  mode: number
  /** Where it sits when not on the ground. */
  bodyLoc: number
  /** Grid slot inside the page. */
  x: number
  y: number
  /** Inventory page; the file stores `page + 1`. */
  page: number
  /** The four-character item code (`sst `). */
  code: string
  /** Unit `+0x28`: the seed the item was rolled with. */
  seed: number
  ilvl: number
  quality: number
  /** The item's type chain (`staf`, `rod`, `blun`, `mele`, `weap`), used to pick the base-stat branch. */
  types: readonly string[]
  /** Quality 1 and 3: the row in the quality's own table. */
  qualityIndex?: number
  /** Quality 4: the prefix and suffix affix ids already rebased to the class-aware base. */
  magic?: { prefix: number; suffix: number }
  /** Quality 5 and 7: the set or unique row id. */
  setOrUnique?: number
  /** Quality 6 and 8: the two name halves and up to three prefix/suffix slots each. */
  rare?: {
    name1: number
    name2: number
    prefixes: ReadonlyArray<number | null>
    suffixes: ReadonlyArray<number | null>
  }
  /** Quality 9: the two name halves. */
  tempered?: { name1: number; name2: number }
  /** The 11-bit quality payload of a charm, or 10-bit of a body, or 5-bit of a book. */
  qualityBits?: number
  /** Variable graphics (only when `has_gfx`): the 3-bit index. */
  gfx?: number
  /** `d.autoAffix − automagicBase`, written in 11 bits when non-zero. */
  classAffix?: number
  /** The runeword's row id, written in 16 bits when flag bit 26 is set. */
  runeword?: number | null
  /** A personalized name, written 7 bits per character when flag bit 24 is set. */
  personalized?: string
  /** An ear's class and level, written when flag bit 16 is set. */
  ear?: { classId: number; level: number; name: string }
  /** The realm data block written when its flag is set. */
  realm?: boolean
  base?: ItemBaseStats
  /** The main property list, framed per {@link writePropertyList}. */
  properties?: readonly ItemProperty[]
  /** Quality 5: the five bits naming which set states this item holds. */
  setStates?: number
  /** Items inside this one's sockets; each follows on its own byte boundary. */
  socketed?: readonly SaveItem[]
}

/** Saturating clamp the item writer uses: unsigned, so a negative becomes all ones. */
function clampUnsigned(value: number, width: number): number {
  if (width >= 32) return value >>> 0
  const max = 2 ** width - 1
  return Math.min(value >>> 0, max)
}

/** Writes `value + add` in `width` bits, the shape every fixed stat uses. */
function writeFixed(writer: BitWriter, stats: StatTable, id: number, value: number): void {
  const def = stats.get(id)
  if (def === null) throw new Error(`no itemstatcost row for stat ${id}`)
  const width = def.saveBits ?? 0
  if (width === 0) return
  writer.write(clampUnsigned(value + (def.saveAdd ?? 0), width), width)
}

/** The width of a stat's value in a property list. */
function itemBitsOf(stats: StatTable, id: number): { width: number; add: number; param: number; shift: number } {
  const def = stats.get(id)
  if (def === null) throw new Error(`no itemstatcost row for stat ${id}`)
  return {
    width: def.saveBits ?? 0,
    add: def.saveAdd ?? 0,
    param: def.saveParamBits ?? 0,
    shift: def.valShift,
  }
}

/**
 * Writes a property list: `(id, [param], value)*` then `0x1FF`.
 *
 * A value is stored shifted right by `ValShift` and offset by `Save Add`. A stat
 * whose stored value is zero, or is the same as one already written in this list,
 * is skipped — that is how the original keeps a list of deltas rather than a dump
 * of every stat. A group head writes its followers' raw values immediately after
 * it, with no id and no param, and marks them written so they are not repeated.
 */
export function writePropertyList(
  writer: BitWriter,
  properties: readonly ItemProperty[],
  stats: StatTable,
): void {
  const written = new Int32Array(512)
  for (const property of properties) {
    if (property.id < 0 || property.id > 511) {
      throw new RangeError(`property id out of range: ${property.id}`)
    }
    const { width, add, param, shift } = itemBitsOf(stats, property.id)
    if (width === 0) continue
    const value = property.value >> shift
    if (value === 0 || value === written[property.id]) continue
    writer.write(property.id, 9)

    const followers = GROUPS.get(property.id)
    if (followers !== undefined) {
      writer.write(clampUnsigned(value + add, width), width)
      for (const follower of followers) {
        const own = properties.find((candidate) => candidate.id === follower)
        const followerValue = own === undefined ? 0 : own.value
        written[follower] = followerValue
        const bits = itemBitsOf(stats, follower)
        writer.write(clampUnsigned(followerValue + bits.add, bits.width), bits.width)
      }
      continue
    }

    if (param !== 0) writer.write(clampUnsigned(property.param ?? 0, param), param)
    writer.write(clampUnsigned(value + add, width), width)
  }
  writer.write(0x1ff, 9)
}

/** Quality-specific fields, written after the item's quality byte. */
function writeQualityFields(writer: BitWriter, item: SaveItem): void {
  switch (item.quality) {
    case QUALITY.inferior:
    case QUALITY.superior:
      writer.write(item.qualityIndex ?? 0, 3)
      return
    case QUALITY.magic:
      writer.write((item.magic?.prefix ?? 0) & 0x7ff, 11)
      writer.write((item.magic?.suffix ?? 0) & 0x7ff, 11)
      return
    case QUALITY.set:
    case QUALITY.unique: {
      const id = item.setOrUnique ?? 0
      writer.write(id < 0 ? 0xfff : id & 0xfff, 12)
      return
    }
    case QUALITY.rare:
    case QUALITY.crafted: {
      const rare = item.rare
      if (rare === undefined) throw new Error('a rare or crafted item needs its two name halves')
      writer.write(rare.name1 & 0xff, 8)
      writer.write(rare.name2 & 0xff, 8)
      for (let slot = 0; slot < 3; slot += 1) {
        const prefix = rare.prefixes[slot] ?? null
        writer.write(prefix === null ? 0 : 1, 1)
        if (prefix !== null) writer.write(prefix & 0x7ff, 11)
        const suffix = rare.suffixes[slot] ?? null
        writer.write(suffix === null ? 0 : 1, 1)
        if (suffix !== null) writer.write(suffix & 0x7ff, 11)
      }
      return
    }
    case QUALITY.tempered: {
      const tempered = item.tempered
      if (tempered === undefined) throw new Error('a tempered item needs its two name halves')
      writer.write(tempered.name1 & 0xff, 8)
      writer.write(tempered.name2 & 0xff, 8)
      return
    }
    default: {
      // Quality 2 (normal) and anything unlisted carry the type's own payload.
      const types = item.types
      if (types.includes('char')) {
        writer.write(item.qualityBits ?? 0, 12)
      } else if (types.includes('body')) {
        writer.write(item.qualityBits ?? 0, 10)
      } else if (types.includes('book') || types.includes('scro')) {
        writer.write(item.qualityBits ?? 0, 5)
      }
    }
  }
}

/** The extended part: seed, ilvl, quality, base stats and the property lists. */
function writeExtended(writer: BitWriter, item: SaveItem, stats: StatTable): void {
  writer.write(item.seed >>> 0, 32)
  writer.write(Math.min(Math.max(item.ilvl, 1), 99), 7)
  writer.write(item.quality & 0xf, 4)

  const hasGfx = item.gfx !== undefined
  writer.write(hasGfx ? 1 : 0, 1)
  if (hasGfx) writer.write(item.gfx! & 0x7, 3)

  const classAffix = item.classAffix ?? 0
  writer.write(classAffix !== 0 ? 1 : 0, 1)
  if (classAffix !== 0) writer.write(classAffix & 0x7ff, 11)

  writeQualityFields(writer, item)

  const flags = item.flags >>> 0
  if ((flags & (1 << 26)) !== 0) {
    writer.write(item.runeword === null || item.runeword === undefined ? 0xffff : item.runeword & 0xffff, 16)
  }
  if ((flags & (1 << 16)) !== 0) {
    const ear = item.ear
    if (ear === undefined) throw new Error('flag bit 16 marks an ear; the item needs its class, level and name')
    writer.write(ear.classId & 0x7, 3)
    writer.write(ear.level & 0x7f, 7)
    writer.writePaddedString(ear.name, 7)
  } else if ((flags & (1 << 24)) !== 0) {
    if (item.personalized === undefined) throw new Error('flag bit 24 marks a personalized item; it needs its name')
    writer.writePaddedString(item.personalized, 7)
  }
  writer.write(item.realm === true ? 1 : 0, 1)
  if (item.realm === true) {
    writer.write(0, 32)
    writer.write(0, 32)
    writer.write(0, 32)
  }

  const base = item.base ?? {}
  if (item.types.includes('armo')) {
    writeFixed(writer, stats, 31, base.armorClass ?? 0)
    writeFixed(writer, stats, 73, base.maxDurability ?? 0)
    if ((base.maxDurability ?? 0) !== 0) writeFixed(writer, stats, 72, base.durability ?? 0)
  } else if (item.types.includes('weap')) {
    // A weapon has no armour class, so the first field the file holds is its
    // maximum durability — a staff's armour class would be a lie, and the original
    // does not write one either.
    writeFixed(writer, stats, 73, base.maxDurability ?? 0)
    if ((base.maxDurability ?? 0) !== 0) writeFixed(writer, stats, 72, base.durability ?? 0)
  } else if (item.types.includes('gold')) {
    const amount = base.quantity ?? 0
    const large = amount >= 0x1000
    writer.write(large ? 1 : 0, 1)
    writer.write(amount >>> 0, large ? 32 : 12)
  }

  if (item.types.includes('stak')) {
    // Stackable: the quantity is a fixed nine bits with no Save Add.
    writer.write(clampUnsigned(base.quantity ?? 0, 9), 9)
  }
  if ((flags & (1 << 11)) !== 0) {
    const sockets = item.base?.sockets ?? 0
    const def = stats.get(194)
    const width = def?.saveBits ?? 0
    if (width > 0) writer.write(clampUnsigned(sockets, width), width)
  }
  if (item.quality === QUALITY.set) writer.write(item.setStates ?? 0, 5)

  writePropertyList(writer, item.properties ?? [], stats)
  if (item.quality === QUALITY.set && (item.setStates ?? 0) !== 0) {
    // Each held set state contributes its own list; the shipped data uses at most
    // the first, and a state with no list is still framed (an immediate terminator).
    for (let bit = 0; bit < 5; bit += 1) {
      if (((item.setStates ?? 0) & (1 << bit)) === 0) continue
      writePropertyList(writer, [], stats)
    }
  }
  if ((flags & (1 << 26)) !== 0) writePropertyList(writer, [], stats)
}

/**
 * Writes one item, and its socketed items after it.
 *
 * The item starts on a byte boundary and so does each socketed item; the return
 * value is how many items were written, which the caller needs because an item
 * the original refuses (flag bit 15) does not count.
 */
export function writeItem(writer: BitWriter, item: SaveItem, stats: StatTable): number {
  writer.align()
  writer.write(ITEM_TAG, 16)

  const flags = ((item.flags & ~0x00080000) | 0x00800000) >>> 0
  writer.write(flags, 32)
  writer.write(item.version & 0x3ff, 10)
  writer.write(item.mode & 0x7, 3)

  if (item.mode === 3 || item.mode === 5) {
    // On the ground: a world position in tiles, 16 bits per axis, and no slot.
    writer.write(0, 16)
    writer.write(0, 16)
  } else {
    writer.write(item.bodyLoc & 0xf, 4)
    writer.write(item.x & 0xf, 4)
    writer.write(item.y & 0xf, 4)
    writer.write((item.page + 1) & 0x7, 3)
  }

  const simple = (flags & (1 << 21)) !== 0
  if (simple && (flags & (1 << 16)) !== 0) {
    const ear = item.ear
    if (ear === undefined) throw new Error('a simple ear needs its class, level and name')
    writer.write(ear.classId & 0x7, 3)
    writer.write(ear.level & 0x7f, 7)
    writer.writePaddedString(ear.name, 7)
  } else {
    for (let i = 0; i < 4; i += 1) writer.write(item.code.charCodeAt(i) & 0xff, 8)
  }

  let written = 1
  if (simple) {
    if (item.types.includes('gold')) {
      const amount = item.base?.quantity ?? 0
      const large = amount >= 0x1000
      writer.write(large ? 1 : 0, 1)
      writer.write(amount >>> 0, large ? 32 : 12)
    }
    writer.write(item.realm === true ? 1 : 0, 1)
  } else {
    writer.write((item.socketed?.length ?? 0) & 0x7, 3)
    writeExtended(writer, item, stats)
  }

  writer.align()
  for (const socketed of item.socketed ?? []) written += writeItem(writer, socketed, stats)
  return written
}

/** Reads a property list back. */
export function readPropertyList(reader: BitReader, stats: StatTable): ItemProperty[] {
  const properties: ItemProperty[] = []
  for (;;) {
    const id = reader.read(9)
    if (id === 0x1ff) return properties
    const { width, add, param, shift } = itemBitsOf(stats, id)
    const followers = GROUPS.get(id)
    if (followers !== undefined) {
      const head = ((reader.read(width) - add) << shift) | 0
      properties.push({ id, value: head })
      for (const follower of followers) {
        const bits = itemBitsOf(stats, follower)
        const value = ((reader.read(bits.width) - bits.add) << bits.shift) | 0
        properties.push({ id: follower, value })
      }
      continue
    }
    const paramValue = param === 0 ? 0 : reader.read(param)
    const value = ((reader.read(width) - add) << shift) | 0
    properties.push(param === 0 ? { id, value } : { id, param: paramValue, value })
  }
}

/**
 * Reads one item, and its socketed items.
 *
 * The reader has to know the type chain to know whether the base stats are an
 * armour class or a durability first, so the caller supplies it — the file holds
 * the code, not the type.
 */
export function readItem(
  reader: BitReader,
  stats: StatTable,
  typesOf: (code: string) => readonly string[],
): SaveItem | null {
  reader.align()
  const tag = reader.read(16)
  if (tag !== ITEM_TAG) return null
  const flags = reader.read(32)
  const version = reader.read(10)
  const mode = reader.read(3)

  let bodyLoc = 0
  let x = 0
  let y = 0
  let page = 0
  if (mode === 3 || mode === 5) {
    reader.read(16)
    reader.read(16)
  } else {
    bodyLoc = reader.read(4)
    x = reader.read(4)
    y = reader.read(4)
    page = reader.read(3) - 1
  }

  const simple = (flags & (1 << 21)) !== 0
  let code = ''
  let ear: SaveItem['ear']
  if (simple && (flags & (1 << 16)) !== 0) {
    const classId = reader.read(3)
    const level = reader.read(7)
    let name = ''
    for (;;) {
      const ch = reader.read(7)
      if (ch === 0) break
      name += String.fromCharCode(ch)
    }
    ear = { classId, level, name }
    code = ''
  } else {
    for (let i = 0; i < 4; i += 1) code += String.fromCharCode(reader.read(8))
  }

  const item: SaveItem = {
    flags,
    version,
    mode,
    bodyLoc,
    x,
    y,
    page,
    code,
    seed: 0,
    ilvl: 1,
    quality: QUALITY.normal,
    types: typesOf(code),
    ear,
  }

  if (simple) {
    if (item.types.includes('gold')) {
      const large = reader.read(1) === 1
      item.base = { quantity: large ? reader.read(32) : reader.read(12) }
    }
    item.realm = reader.read(1) === 1
    reader.align()
    return item
  }

  const socketCount = reader.read(3)
  item.seed = reader.read(32)
  item.ilvl = reader.read(7)
  item.quality = reader.read(4)

  if (reader.read(1) === 1) item.gfx = reader.read(3)
  if (reader.read(1) === 1) item.classAffix = reader.read(11)

  switch (item.quality) {
    case QUALITY.inferior:
    case QUALITY.superior:
      item.qualityIndex = reader.read(3)
      break
    case QUALITY.magic:
      item.magic = { prefix: reader.read(11), suffix: reader.read(11) }
      break
    case QUALITY.set:
    case QUALITY.unique:
      item.setOrUnique = reader.read(12)
      break
    case QUALITY.rare:
    case QUALITY.crafted: {
      const name1 = reader.read(8)
      const name2 = reader.read(8)
      const prefixes: Array<number | null> = []
      const suffixes: Array<number | null> = []
      for (let slot = 0; slot < 3; slot += 1) {
        prefixes.push(reader.read(1) === 1 ? reader.read(11) : null)
        suffixes.push(reader.read(1) === 1 ? reader.read(11) : null)
      }
      item.rare = { name1, name2, prefixes, suffixes }
      break
    }
    case QUALITY.tempered: {
      item.tempered = { name1: reader.read(8), name2: reader.read(8) }
      break
    }
    default:
      if (item.types.includes('char')) item.qualityBits = reader.read(12)
      else if (item.types.includes('body')) item.qualityBits = reader.read(10)
      else if (item.types.includes('book') || item.types.includes('scro')) item.qualityBits = reader.read(5)
  }

  if ((flags & (1 << 26)) !== 0) item.runeword = reader.read(16)
  if ((flags & (1 << 16)) !== 0) {
    const classId = reader.read(3)
    const level = reader.read(7)
    let name = ''
    for (;;) {
      const ch = reader.read(7)
      if (ch === 0) break
      name += String.fromCharCode(ch)
    }
    item.ear = { classId, level, name }
  } else if ((flags & (1 << 24)) !== 0) {
    let name = ''
    for (;;) {
      const ch = reader.read(7)
      if (ch === 0) break
      name += String.fromCharCode(ch)
    }
    item.personalized = name
  }
  if (reader.read(1) === 1) {
    item.realm = true
    reader.read(32)
    reader.read(32)
    reader.read(32)
  }

  const readFixed = (id: number): number => {
    const def = stats.get(id)
    const width = def?.saveBits ?? 0
    if (width === 0) return 0
    return (reader.read(width) - (def?.saveAdd ?? 0)) | 0
  }
  const base: ItemBaseStats = {}
  if (item.types.includes('armo')) {
    base.armorClass = readFixed(31)
    base.maxDurability = readFixed(73)
    if (base.maxDurability !== 0) base.durability = readFixed(72)
  } else if (item.types.includes('weap')) {
    base.maxDurability = readFixed(73)
    if (base.maxDurability !== 0) base.durability = readFixed(72)
  } else if (item.types.includes('gold')) {
    const large = reader.read(1) === 1
    base.quantity = large ? reader.read(32) : reader.read(12)
  }
  if (item.types.includes('stak')) base.quantity = reader.read(9)
  if ((flags & (1 << 11)) !== 0) {
    const width = stats.get(194)?.saveBits ?? 0
    if (width > 0) base.sockets = reader.read(width)
  }
  item.base = base
  if (item.quality === QUALITY.set) item.setStates = reader.read(5)

  item.properties = readPropertyList(reader, stats)
  if (item.quality === QUALITY.set && (item.setStates ?? 0) !== 0) {
    for (let bit = 0; bit < 5; bit += 1) {
      if (((item.setStates ?? 0) & (1 << bit)) === 0) continue
      readPropertyList(reader, stats)
    }
  }
  if ((flags & (1 << 26)) !== 0) readPropertyList(reader, stats)

  reader.align()
  if (socketCount > 0) {
    const socketed: SaveItem[] = []
    for (let i = 0; i < socketCount; i += 1) {
      const child = readItem(reader, stats, typesOf)
      if (child === null) break
      socketed.push(child)
    }
    item.socketed = socketed
  }
  return item
}
