/**
 * Item generation, driven by the retail tables.
 *
 * Everything here reads the game's own data (`weapons`/`armor`/`misc`,
 * `itemtypes`, `magicprefix`/`magicsuffix`/`automagic`, `uniqueitems`,
 * `setitems`, `properties`, `itemstatcost`, `itemratio`, `gems`,
 * `qualityitems`, `lowqualityitems`). Where a rule is *not* in the tables — the
 * order and shape of the quality cascade, and how many affixes a magic or rare
 * item carries — the code says so and names the source it follows.
 *
 * The three rules that shape most of this file:
 *
 * 1. **Quality** is rolled in a fixed order (unique → set → rare → magic →
 *    superior → normal → low). Each step turns an `itemratio.txt` row into a
 *    probability denominator in 128ths, reduced by magic find, clamped to the
 *    row's `Min` column, then improved by the treasure class factor (out of
 *    1024). A roll below 128 out of that denominator succeeds.
 * 2. **Affixes** come from `magicprefix`/`magicsuffix`, filtered by
 *    `spawnable`, `level`/`maxlevel` against the item's *affix level* (see
 *    {@link affixLevel}), the `itype`/`etype` type hierarchy, the affix `group`
 *    (one group never appears twice on an item) and `classspecific`, weighted by
 *    `frequency`.
 * 3. **Stats** are property codes (`properties.txt`) carrying `func`/`stat`
 *    pairs; each pair becomes one {@link ItemStat}, and the tooltip renders the
 *    property's own `*Tooltip` wording, falling back to `describeStat`.
 */

import { evaluateCalc, type CalcContext } from './calc'
import {
  describeStat,
  parseStatTable,
  StatSet,
  type StatRow,
  type StatTable,
  type StringTable,
} from './stats'

/* -------------------------------------------------------------------------- */
/* Randomness                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The random source item generation needs.
 *
 * An interface rather than `Math.random`, so a drop is reproducible: a seeded
 * generator turns "this unique never drops" into a case you can re-run.
 */
export interface Random {
  /** Uniform in `[0, 1)`. */
  next(): number
  /** Uniform integer in `[0, maxExclusive)`. Returns 0 for a non-positive bound. */
  int(maxExclusive: number): number
  /** Uniform integer in `[min, max]`, in either order. */
  range(min: number, max: number): number
}

/**
 * A seeded generator (mulberry32).
 *
 * Chosen because it is 32-bit integer arithmetic only, so every engine in the
 * target list produces the same sequence for the same seed — which is what makes
 * the drop tests meaningful.
 */
export function createRandom(seed: number): Random {
  let state = seed >>> 0
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int(maxExclusive: number): number {
      if (maxExclusive <= 1) return 0
      return Math.floor(next() * maxExclusive)
    },
    range(min: number, max: number): number {
      const low = Math.min(min, max)
      const high = Math.max(min, max)
      return low + Math.floor(next() * (high - low + 1))
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Tables                                                                     */
/* -------------------------------------------------------------------------- */

/** One exported table row: every cell is text or absent. */
export interface ItemTableRow {
  readonly [column: string]: string | null
}
export type ItemTable = readonly ItemTableRow[]

/** Every table item generation and treasure classes read. */
export const ITEM_TABLE_NAMES = [
  'weapons',
  'armor',
  'misc',
  'itemtypes',
  'magicprefix',
  'magicsuffix',
  'automagic',
  'uniqueitems',
  'setitems',
  'sets',
  'rareprefix',
  'raresuffix',
  'itemratio',
  'qualityitems',
  'lowqualityitems',
  'gems',
  'properties',
  'itemstatcost',
  'treasureclassex',
] as const
export type ItemTableName = (typeof ITEM_TABLE_NAMES)[number]

export type ItemTables = { readonly [K in ItemTableName]: ItemTable }

/** The exported file name of a table, as it sits in `public/original`. */
export function itemTableFile(name: ItemTableName): string {
  return `table_${name}.json`
}

/**
 * Parses the exported tables.
 *
 * Input is raw JSON *text* per table, so the same function serves a `fetch` in
 * the browser and a `readFileSync` in tests. A table that is absent becomes
 * empty rather than an error: items and treasure classes are useful separately,
 * and a missing `sets` table should not stop a weapon from dropping.
 */
export function parseItemTables(files: Partial<Record<ItemTableName, string>>): ItemTables {
  const tables = {} as Record<ItemTableName, ItemTable>
  for (const name of ITEM_TABLE_NAMES) {
    const source = files[name]
    if (source === undefined || source === '') {
      tables[name] = []
      continue
    }
    const parsed: unknown = JSON.parse(source)
    const rows: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { rows?: unknown[] }).rows)
        ? ((parsed as { rows: unknown[] }).rows as unknown[])
        : []
    tables[name] = rows.filter(
      (row): row is ItemTableRow => typeof row === 'object' && row !== null
    )
  }
  return tables
}

/**
 * Reads a numeric cell.
 *
 * Several numeric columns are calc cells in the retail files (an empty cell is
 * zero, a cell may hold `(clc1*100)/2`), so a value that is not a plain integer
 * is evaluated with the game's calc evaluator rather than `parseInt`, which would
 * silently keep only the leading digits of a formula.
 */
export function tableNumber(value: string | null | undefined, context: CalcContext = {}): number {
  if (value === null || value === undefined) return 0
  const trimmed = value.trim()
  if (trimmed === '') return 0
  if (/^[+-]?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10)
  const evaluated = evaluateCalc(trimmed, context)
  return Number.isFinite(evaluated) ? Math.trunc(evaluated) : 0
}

const cell = (row: ItemTableRow, column: string): string | null => row[column] ?? null
const text = (row: ItemTableRow, column: string): string | null => {
  const value = cell(row, column)
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}
/** Like {@link text}, but the files use `xxx`/`0` as "no value" in code columns. */
const nameCell = (row: ItemTableRow, column: string): string | null => {
  const value = text(row, column)
  return value === null || value === 'xxx' || value === '0' || value === '-1' ? null : value
}
const int = (row: ItemTableRow, column: string): number => tableNumber(cell(row, column))
const flag = (row: ItemTableRow, column: string): boolean => int(row, column) === 1

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ItemKind = 'weapon' | 'armor' | 'misc'
/** Base item tier, decided by `normcode`/`ubercode`/`ultracode`. */
export type ItemTier = 'normal' | 'exceptional' | 'elite'
export type ItemRarity = 'low' | 'normal' | 'superior' | 'magic' | 'rare' | 'set' | 'unique'
export type AffixKind = 'prefix' | 'suffix'

/** A base item: one row of `weapons.txt`, `armor.txt` or `misc.txt`. */
export interface ItemBase {
  readonly code: string
  readonly name: string
  readonly nameString: string | null
  readonly kind: ItemKind
  readonly type: string
  readonly type2: string | null
  readonly tier: ItemTier
  /** `level` — the quality level, used for affix level and drop eligibility. */
  readonly level: number
  readonly levelReq: number
  readonly reqStr: number
  readonly reqDex: number
  readonly minDamage: number
  readonly maxDamage: number
  readonly twoHandMinDamage: number
  readonly twoHandMaxDamage: number
  readonly minMissileDamage: number
  readonly maxMissileDamage: number
  readonly twoHanded: boolean
  readonly oneOrTwoHanded: boolean
  readonly minAc: number
  readonly maxAc: number
  readonly block: number
  readonly durability: number
  readonly noDurability: boolean
  /** `gemsockets` — the item's own socket cap; the item type caps it further. */
  readonly sockets: number
  /** `gemapplytype`: 0 weapon, 1 helm/armor, 2 shield. */
  readonly gemApplyType: number
  readonly invWidth: number
  readonly invHeight: number
  /** `invfile` — the DC6 in `global/items` the game draws this base with. */
  readonly invFile: string | null
  /** `uniqueinvfile` — the graphic a unique of this base uses instead. */
  readonly uniqueInvFile: string | null
  /** `setinvfile` — the graphic a set item of this base uses instead. */
  readonly setInvFile: string | null
  /** `rarity` — "chance 1/#", so a *higher* value is a *rarer* item. */
  readonly rarity: number
  readonly cost: number
  readonly spawnable: boolean
  readonly quest: boolean
  /** `magic lvl` — added to the affix level of this base. */
  readonly magicLevel: number
  /** `auto prefix` — the automagic group this base rolls; 0 when none. */
  readonly autoPrefix: number
  readonly normCode: string
  readonly uberCode: string | null
  readonly ultraCode: string | null
  readonly speed: number
  /** `bitfield1 & 1`: the base item may be magic at all. */
  readonly magicAllowed: boolean
  readonly stackable: boolean
  readonly minStack: number
  readonly maxStack: number
  readonly spawnStack: number
}

/** The three codes that make up one base item's tier family. */
export interface TierFamily {
  readonly normal: string
  readonly exceptional: string | null
  readonly elite: string | null
}

/** One `itemtypes.txt` row. */
export interface ItemTypeInfo {
  readonly code: string
  readonly name: string
  /** Direct parents (`Equiv1`/`Equiv2`). */
  readonly parents: readonly string[]
  /** Socket caps below `socketThresholds[0]`, below `[1]`, then above. */
  readonly maxSockets: readonly [number, number, number]
  readonly socketThresholds: readonly [number, number]
  /** `Normal` — always normal quality (gems, potions, runes, quest items). */
  readonly normal: boolean
  /** `Magic` — always at least magic (rings, amulets, jewels, charms). */
  readonly magic: boolean
  /** `Rare` — may be rare. */
  readonly rare: boolean
  /** `Class` — the class this item type belongs to, when it is class-specific. */
  readonly classes: readonly string[]
  /** `TreasureClass` — allowed inside the default item-type treasure classes. */
  readonly treasureClass: boolean
  readonly rarity: number
  readonly staffMods: string | null
}

/** One property applied to an item, as named by an affix/unique/set row. */
export interface PropertyAssignment {
  readonly code: string
  readonly param: number
  readonly min: number
  readonly max: number
}

/** A rolled value for one `func`/`stat` pair of a property. */
export interface ItemStat {
  /** The property that produced it (`str`, `dmg%`, …). */
  readonly property: string
  /** The stat code (`strength`, `item_maxdamage_percent`, …) or `null`. */
  readonly stat: string | null
  /** The property function that produced it. */
  readonly func: number
  readonly value: number
  readonly min: number
  readonly max: number
  /** `mod#param` / `par#`: skill, class, monster type or skill tab. */
  readonly param: number
  /** Second number some functions need (the level of a triggered skill). */
  readonly level: number
  /** `base`, `affix`, `unique`, `set`, `automagic`, `superior` or `socket`. */
  readonly source: string
}

/** One property application, kept whole so the tooltip can use its template. */
export interface ItemPropertyApplication {
  readonly property: string
  /** The property's `*Tooltip` wording, `#` standing for a number. */
  readonly template: string | null
  readonly param: number
  readonly min: number
  readonly max: number
  readonly value: number
  readonly source: string
  readonly stats: readonly ItemStat[]
}

/** One `magicprefix.txt` / `magicsuffix.txt` / `automagic.txt` row. */
export interface Affix {
  readonly name: string
  readonly kind: AffixKind
  /** `level` — the minimum affix level. */
  readonly level: number
  /** `maxlevel` — the maximum affix level; 0 means unbounded. */
  readonly maxLevel: number
  readonly levelReq: number
  readonly classLevelReq: number
  /** `rare` — allowed on rare items. */
  readonly rare: boolean
  readonly spawnable: boolean
  /** `frequency` — selection weight; 0 means never picked. */
  readonly frequency: number
  /** `group` — an item never carries two affixes of the same non-zero group. */
  readonly group: number
  /** `classspecific` — the class code this affix is restricted to. */
  readonly classes: readonly string[]
  readonly types: readonly string[]
  readonly excludedTypes: readonly string[]
  readonly transformColor: string | null
  readonly mods: readonly PropertyAssignment[]
}

/** One `uniqueitems.txt` row. */
export interface UniqueItemDef {
  readonly name: string
  readonly code: string
  /** `lvl` — the minimum item level for this unique. */
  readonly level: number
  readonly levelReq: number
  /** `rarity` — selection weight among the uniques of one base item. */
  readonly rarity: number
  readonly spawnable: boolean
  /** `nolimit` — may drop more than once in a game. */
  readonly noLimit: boolean
  readonly mods: readonly PropertyAssignment[]
}

/** One `setitems.txt` row. */
export interface SetItemDef {
  readonly name: string
  readonly setName: string
  readonly code: string
  readonly level: number
  readonly levelReq: number
  readonly rarity: number
  readonly spawnable: boolean
  readonly mods: readonly PropertyAssignment[]
  /** Partial-set bonuses (`aprop#a`/`aprop#b`), grouped per bonus step. */
  readonly partialMods: readonly (readonly PropertyAssignment[])[]
}

/**
 * One `sets.txt` row.
 *
 * The set is identified by name: `sets.txt` has a name column, and a
 * `setitems` row names its set with that same string.
 */
export interface SetDef {
  readonly name: string
  /** Base codes in the set, in `setitems.txt` order. */
  readonly items: readonly string[]
}

/** One `properties.txt` row, split into its `func`/`stat`/`val` triples. */
export interface PropertyDef {
  readonly code: string
  /** The `*Tooltip` template: the game's own wording, `#` for a number. */
  readonly tooltip: string | null
  readonly funcs: readonly PropertyFunction[]
}
export interface PropertyFunction {
  readonly func: number
  readonly stat: string | null
  readonly set: boolean
  /** `val#` — a constant some functions use (the class index, for one). */
  readonly value: number
}

/** A socketed gem or rune. */
export interface SocketedItem {
  readonly code: string
  readonly name: string
  readonly kind: 'gem' | 'rune'
  readonly properties: readonly ItemPropertyApplication[]
  readonly stats: readonly ItemStat[]
}

export interface QualityFactors {
  readonly unique: number
  readonly set: number
  readonly rare: number
  readonly magic: number
}

export const NO_QUALITY_FACTORS: QualityFactors = { unique: 0, set: 0, rare: 0, magic: 0 }

/** A generated item. */
export interface Item {
  readonly name: string
  readonly baseName: string
  readonly base: ItemBase
  readonly rarity: ItemRarity
  readonly tier: ItemTier
  /** `ilvl` — the item level it dropped at. */
  readonly ilvl: number
  /** The level its affixes were filtered against. */
  readonly affixLevel: number
  readonly reqLevel: number
  readonly sockets: number
  readonly socketed: readonly SocketedItem[]
  readonly prefixes: readonly Affix[]
  readonly suffixes: readonly Affix[]
  readonly autoAffix: Affix | null
  readonly unique: UniqueItemDef | null
  readonly setItem: SetItemDef | null
  readonly setName: string | null
  /** Property applications, in the order they were rolled. */
  readonly properties: readonly ItemPropertyApplication[]
  /** Every rolled stat, socketed gems and runes included. */
  readonly stats: readonly ItemStat[]
  /** The same stats through the game's add/percent/layered rules. */
  readonly statsOf: StatSet
  readonly defense: number
  readonly minDamage: number
  readonly maxDamage: number
  readonly maxDurability: number
  readonly ethereal: boolean
  readonly quantity: number
  /** Gold amount for a `gld` drop, 0 otherwise. */
  readonly gold: number
  /**
   * The `global/items` DC6 name the game draws, unique and set graphics
   * included. Null when the base carries no graphic at all.
   */
  readonly graphic: string | null
  readonly tooltip: readonly string[]
}

/* -------------------------------------------------------------------------- */
/* Index                                                                      */
/* -------------------------------------------------------------------------- */

export interface ItemIndex {
  readonly tables: ItemTables
  readonly bases: ReadonlyMap<string, ItemBase>
  readonly types: ReadonlyMap<string, ItemTypeInfo>
  readonly prefixes: readonly Affix[]
  readonly suffixes: readonly Affix[]
  readonly autoMagic: readonly Affix[]
  readonly uniquesByCode: ReadonlyMap<string, readonly UniqueItemDef[]>
  /** Unique items by their own name, which treasure classes may reference. */
  readonly uniquesByName: ReadonlyMap<string, UniqueItemDef>
  readonly setItemsByCode: ReadonlyMap<string, readonly SetItemDef[]>
  /** Set items by their own name, which treasure classes may reference. */
  readonly setItemsByName: ReadonlyMap<string, SetItemDef>
  readonly sets: ReadonlyMap<string, SetDef>
  /** `gems.txt` rows by code; runes live in this table too. */
  readonly gems: ReadonlyMap<string, ItemTableRow>
  readonly properties: ReadonlyMap<string, PropertyDef>
  readonly statTable: StatTable | null
  readonly strings: StringTable | undefined
  /** Every item type a code belongs to, including the code itself. */
  typesOf(code: string): ReadonlySet<string>
  hasType(code: string, type: string): boolean
  /** True when the type hierarchy names a class (`orb`, `h2h`, `pelt`, …). */
  isClassSpecific(code: string): boolean
  itemClass(code: string): string | null
  tierFamily(base: ItemBase): TierFamily
}

export interface ItemIndexOptions {
  /** Localized strings; without them `describeStat` falls back to stat names. */
  readonly strings?: StringTable
}

/** The `code`/`param`/`min`/`max` columns of one property-assignment family. */
interface ModColumns {
  readonly code: string
  readonly param: string
  readonly min: string
  readonly max: string
}

/** Reads a `xxx#code`/`xxx#param`/`xxx#min`/`xxx#max` column family. */
function readMods(
  row: ItemTableRow,
  columns: (index: number) => ModColumns,
  count: number
): PropertyAssignment[] {
  const mods: PropertyAssignment[] = []
  for (let index = 1; index <= count; index += 1) {
    const names = columns(index)
    const code = nameCell(row, names.code)
    if (code === null) continue
    mods.push({
      code,
      param: int(row, names.param),
      min: int(row, names.min),
      max: int(row, names.max),
    })
  }
  return mods
}

const affixColumns =
  (prefix: string) =>
  (index: number): ModColumns => ({
    code: `${prefix}${index}code`,
    param: `${prefix}${index}param`,
    min: `${prefix}${index}min`,
    max: `${prefix}${index}max`,
  })

/**
 * `uniqueitems`/`setitems` spell the same four columns without the `code`/`param`
 * suffixes: `prop1`, `par1`, `min1`, `max1`.
 */
const propertyColumns =
  (prefix: string) =>
  (index: number): ModColumns => ({
    code: `${prefix}${index}`,
    param: `par${index}`,
    min: `min${index}`,
    max: `max${index}`,
  })

/** `gems.txt` capitalizes the modifier columns (`weaponMod1Code`). */
const gemColumns =
  (prefix: string) =>
  (index: number): ModColumns => ({
    code: `${prefix}${index}Code`,
    param: `${prefix}${index}Param`,
    min: `${prefix}${index}Min`,
    max: `${prefix}${index}Max`,
  })

function toItemBase(row: ItemTableRow, kind: ItemKind): ItemBase {
  const code = text(row, 'code') ?? ''
  const normCode = nameCell(row, 'normcode') ?? code
  const uberCode = nameCell(row, 'ubercode')
  const ultraCode = nameCell(row, 'ultracode')
  // The tier is decided by which of the three codes the row *is*, exactly as the
  // `itemratio.txt` `Uber` column documents ("determined by normcode, ubercode
  // and ultracode").
  const tier: ItemTier =
    code === ultraCode ? 'elite' : code === uberCode && code !== normCode ? 'exceptional' : 'normal'
  return {
    code,
    name: text(row, 'name') ?? code,
    nameString: nameCell(row, 'namestr'),
    kind,
    type: text(row, 'type') ?? '',
    type2: nameCell(row, 'type2'),
    tier,
    level: int(row, 'level'),
    levelReq: int(row, 'levelreq'),
    reqStr: int(row, 'reqstr'),
    reqDex: int(row, 'reqdex'),
    minDamage: int(row, 'mindam'),
    maxDamage: int(row, 'maxdam'),
    twoHandMinDamage: int(row, '2handmindam'),
    twoHandMaxDamage: int(row, '2handmaxdam'),
    minMissileDamage: int(row, 'minmisdam'),
    maxMissileDamage: int(row, 'maxmisdam'),
    twoHanded: flag(row, '2handed'),
    oneOrTwoHanded: flag(row, '1or2handed'),
    minAc: int(row, 'minac'),
    maxAc: int(row, 'maxac'),
    block: int(row, 'block'),
    durability: int(row, 'durability'),
    noDurability: flag(row, 'nodurability'),
    sockets: int(row, 'gemsockets'),
    gemApplyType: int(row, 'gemapplytype'),
    invWidth: int(row, 'invwidth') || 1,
    invHeight: int(row, 'invheight') || 1,
    // Some bases leave `invfile` empty and only have the flippy; the drop
    // animation is drawn at the same size, so it is a usable stand-in.
    invFile: nameCell(row, 'invfile') ?? nameCell(row, 'flippyfile'),
    uniqueInvFile: nameCell(row, 'uniqueinvfile'),
    setInvFile: nameCell(row, 'setinvfile'),
    rarity: int(row, 'rarity'),
    cost: int(row, 'cost'),
    spawnable: flag(row, 'spawnable'),
    quest: int(row, 'quest') > 0,
    magicLevel: int(row, 'magic lvl'),
    autoPrefix: int(row, 'auto prefix'),
    normCode,
    uberCode,
    ultraCode,
    speed: int(row, 'speed'),
    magicAllowed: (int(row, 'bitfield1') & 1) === 1,
    stackable: flag(row, 'stackable'),
    minStack: int(row, 'minstack'),
    maxStack: int(row, 'maxstack'),
    spawnStack: int(row, 'spawnstack'),
  }
}

function toItemType(row: ItemTableRow): ItemTypeInfo {
  const parents = [nameCell(row, 'Equiv1'), nameCell(row, 'Equiv2')].filter(
    (value): value is string => value !== null
  )
  const classCode = nameCell(row, 'Class')
  return {
    code: text(row, 'Code') ?? '',
    name: text(row, 'ItemType') ?? '',
    parents,
    maxSockets: [int(row, 'MaxSockets1'), int(row, 'MaxSockets2'), int(row, 'MaxSockets3')],
    socketThresholds: [
      int(row, 'MaxSocketsLevelThreshold1') || 25,
      int(row, 'MaxSocketsLevelThreshold2') || 40,
    ],
    normal: flag(row, 'Normal'),
    magic: flag(row, 'Magic'),
    rare: flag(row, 'Rare'),
    classes: classCode === null ? [] : [classCode],
    treasureClass: flag(row, 'TreasureClass'),
    rarity: int(row, 'Rarity'),
    staffMods: nameCell(row, 'StaffMods'),
  }
}

function toAffix(row: ItemTableRow, kind: AffixKind): Affix {
  const types: string[] = []
  const excluded: string[] = []
  for (let index = 1; index <= 7; index += 1) {
    const type = nameCell(row, `itype${index}`)
    if (type !== null) types.push(type)
  }
  for (let index = 1; index <= 5; index += 1) {
    const type = nameCell(row, `etype${index}`)
    if (type !== null) excluded.push(type)
  }
  // `classspecific` holds a class code (`ama`, `sor`, …), not a flag.
  const classCode = nameCell(row, 'classspecific')
  return {
    name: text(row, 'Name') ?? '',
    kind,
    level: int(row, 'level'),
    maxLevel: int(row, 'maxlevel'),
    levelReq: int(row, 'levelreq'),
    classLevelReq: int(row, 'classlevelreq'),
    rare: flag(row, 'rare'),
    spawnable: flag(row, 'spawnable'),
    frequency: int(row, 'frequency'),
    group: int(row, 'group'),
    classes: classCode === null ? [] : [classCode],
    types,
    excludedTypes: excluded,
    transformColor: nameCell(row, 'transformcolor'),
    mods: readMods(row, affixColumns('mod'), 3),
  }
}

function toUnique(row: ItemTableRow): UniqueItemDef {
  return {
    name: text(row, 'index') ?? '',
    code: nameCell(row, 'code') ?? '',
    level: int(row, 'lvl'),
    levelReq: int(row, 'lvl req'),
    rarity: int(row, 'rarity') || 1,
    spawnable: flag(row, 'spawnable'),
    noLimit: flag(row, 'nolimit'),
    mods: readMods(row, propertyColumns('prop'), 12),
  }
}

function toSetItem(row: ItemTableRow): SetItemDef {
  // Partial-set bonuses are per item and per "how many other set items are worn"
  // step; each step holds up to two properties (`a`/`b`).
  const partial: PropertyAssignment[][] = []
  for (let step = 1; step <= 5; step += 1) {
    const assignments = readMods(
      row,
      (index): ModColumns => {
        const suffix = index === 1 ? 'a' : 'b'
        return {
          code: `aprop${step}${suffix}`,
          param: `apar${step}${suffix}`,
          min: `amin${step}${suffix}`,
          max: `amax${step}${suffix}`,
        }
      },
      2
    )
    if (assignments.length > 0) partial.push(assignments)
  }
  return {
    name: text(row, 'index') ?? '',
    setName: text(row, 'set') ?? '',
    code: nameCell(row, 'item') ?? '',
    level: int(row, 'lvl'),
    levelReq: int(row, 'lvl req'),
    rarity: int(row, 'rarity') || 1,
    spawnable: flag(row, 'spawnable'),
    mods: readMods(row, propertyColumns('prop'), 9),
    partialMods: partial,
  }
}

/** Builds a {@link PropertyDef} from a `properties.txt` row. */
function toProperty(row: ItemTableRow): PropertyDef {
  const funcs: PropertyFunction[] = []
  for (let index = 1; index <= 7; index += 1) {
    const func = int(row, `func${index}`)
    if (func === 0) continue
    funcs.push({
      func,
      stat: nameCell(row, `stat${index}`),
      set: flag(row, `set${index}`),
      value: int(row, `val${index}`),
    })
  }
  return {
    code: text(row, 'code') ?? '',
    tooltip: nameCell(row, '*Tooltip'),
    funcs,
  }
}

/**
 * Builds the lookup structures item generation and treasure classes share.
 *
 * One pass over the tables happens here; everything downstream is a map lookup,
 * because a drop test rolls tens of thousands of items.
 */
export function createItemIndex(tables: ItemTables, options: ItemIndexOptions = {}): ItemIndex {
  const bases = new Map<string, ItemBase>()
  const addBases = (rows: ItemTable, kind: ItemKind): void => {
    for (const row of rows) {
      const base = toItemBase(row, kind)
      if (base.code === '') continue
      bases.set(base.code, base)
    }
  }
  addBases(tables.weapons, 'weapon')
  addBases(tables.armor, 'armor')
  addBases(tables.misc, 'misc')

  const types = new Map<string, ItemTypeInfo>()
  for (const row of tables.itemtypes) {
    const type = toItemType(row)
    if (type.code === '') continue
    types.set(type.code, type)
  }

  // The type hierarchy is what the affix `itype`/`etype` and `itemtypes.Class`
  // columns are matched against, so it is resolved once, transitively, and
  // guarded against a parent loop.
  const chains = new Map<string, ReadonlySet<string>>()
  const chainOf = (code: string): ReadonlySet<string> => {
    const cached = chains.get(code)
    if (cached !== undefined) return cached
    const chain = new Set<string>([code])
    // A self-referencing parent would otherwise recurse forever.
    chains.set(code, chain)
    for (const parent of types.get(code)?.parents ?? []) {
      for (const member of chainOf(parent)) chain.add(member)
    }
    return chain
  }
  for (const code of types.keys()) chainOf(code)

  const prefixList: Affix[] = []
  for (const row of tables.magicprefix) {
    const affix = toAffix(row, 'prefix')
    if (affix.name !== '') prefixList.push(affix)
  }
  const suffixList: Affix[] = []
  for (const row of tables.magicsuffix) {
    const affix = toAffix(row, 'suffix')
    if (affix.name !== '') suffixList.push(affix)
  }
  // `automagic` rows are named without the "of …" the suffixes use, but they are
  // applied at the end of the name list, so they are treated as suffixes.
  const autoMagic: Affix[] = []
  for (const row of tables.automagic) {
    const affix = toAffix(row, 'suffix')
    if (affix.name !== '') autoMagic.push(affix)
  }

  const sets = new Map<string, SetDef>()
  const members = new Map<string, string[]>()
  for (const row of tables.sets) {
    const name = text(row, 'index') ?? text(row, 'name')
    if (name === null || sets.has(name)) continue
    const items: string[] = []
    sets.set(name, { name, items })
    members.set(name, items)
  }
  // `sets.txt` holds no item list; its members are the `setitems` rows naming it.
  const setItemsByCode = new Map<string, SetItemDef[]>()
  const setItemsByName = new Map<string, SetItemDef>()
  for (const row of tables.setitems) {
    const item = toSetItem(row)
    if (item.code === '') continue
    const list = setItemsByCode.get(item.code)
    if (list === undefined) setItemsByCode.set(item.code, [item])
    else list.push(item)
    setItemsByName.set(item.name, item)
    const memberList = members.get(item.setName)
    if (memberList !== undefined && !memberList.includes(item.code)) memberList.push(item.code)
  }

  const uniquesByCode = new Map<string, UniqueItemDef[]>()
  const uniquesByName = new Map<string, UniqueItemDef>()
  for (const row of tables.uniqueitems) {
    const unique = toUnique(row)
    if (unique.code === '') continue
    const list = uniquesByCode.get(unique.code)
    if (list === undefined) uniquesByCode.set(unique.code, [unique])
    else list.push(unique)
    uniquesByName.set(unique.name, unique)
  }

  const gems = new Map<string, ItemTableRow>()
  for (const row of tables.gems) {
    const code = nameCell(row, 'code')
    if (code !== null) gems.set(code, row)
  }

  const properties = new Map<string, PropertyDef>()
  for (const row of tables.properties) {
    const property = toProperty(row)
    if (property.code !== '') properties.set(property.code, property)
  }

  const families = new Map<string, TierFamily>()
  for (const base of bases.values()) {
    if (families.has(base.normCode)) continue
    families.set(base.normCode, {
      normal: base.normCode,
      exceptional: base.uberCode,
      elite: base.ultraCode,
    })
  }

  const itemClass = (code: string): string | null => {
    for (const member of chainOf(code)) {
      const classCode = types.get(member)?.classes[0]
      if (classCode !== undefined) return classCode
    }
    return null
  }

  return {
    tables,
    bases,
    types,
    prefixes: prefixList,
    suffixes: suffixList,
    autoMagic,
    uniquesByCode,
    uniquesByName,
    setItemsByCode,
    setItemsByName,
    sets,
    gems,
    properties,
    statTable:
      tables.itemstatcost.length > 0 ? parseStatTable(tables.itemstatcost as readonly StatRow[]) : null,
    strings: options.strings,
    typesOf: (code: string): ReadonlySet<string> => chainOf(code),
    hasType: (code: string, type: string): boolean => chainOf(code).has(type),
    isClassSpecific: (code: string): boolean => {
      for (const member of chainOf(code)) {
        const info = types.get(member)
        if (info !== undefined && info.classes.length > 0) return true
      }
      return false
    },
    itemClass,
    tierFamily: (base: ItemBase): TierFamily =>
      families.get(base.normCode) ?? {
        normal: base.normCode,
        exceptional: base.uberCode,
        elite: base.ultraCode,
      },
  }
}

/* -------------------------------------------------------------------------- */
/* Affix level                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The affix level of an item.
 *
 * `magic lvl` (a handful of wands, staves and orbs) short-circuits the whole
 * thing: those bases roll affixes as if they were `ilvl + magic lvl`. Otherwise
 * the base item's quality level pushes the affix level *down* near the low end
 * and *up* past level 99 (`2*ilvl - 99`), which is why a high-level base is the
 * only way to see the top affixes on a low-level character.
 */
export function affixLevel(ilvl: number, qlvl: number, magicLevel: number): number {
  let level = Math.min(ilvl, 99)
  if (qlvl > level) level = qlvl
  let result: number
  if (magicLevel > 0) result = level + magicLevel
  else if (level < 99 - Math.floor(qlvl / 2)) result = level - Math.floor(qlvl / 2)
  else result = 2 * level - 99
  return Math.max(0, Math.min(result, 99))
}

/* -------------------------------------------------------------------------- */
/* Sockets                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The most sockets this base item can have at this item level.
 *
 * `itemtypes.txt` gives three caps with two level thresholds, the last holding
 * above the second threshold. The item's own `gemsockets` then caps *that*,
 * because a small item cannot hold the six sockets its type allows.
 */
export function maxSockets(index: ItemIndex, base: ItemBase, ilvl: number): number {
  const type = index.types.get(base.type)
  const byLevel =
    type === undefined
      ? base.sockets
      : ilvl < type.socketThresholds[0]
        ? type.maxSockets[0]
        : ilvl < type.socketThresholds[1]
          ? type.maxSockets[1]
          : type.maxSockets[2]
  return Math.max(0, Math.min(base.sockets, byLevel))
}

/* -------------------------------------------------------------------------- */
/* Quality                                                                    */
/* -------------------------------------------------------------------------- */

interface RarityChance {
  readonly base: number
  readonly divisor: number
  readonly min: number
}

/**
 * Magic find's diminishing returns, per quality.
 *
 * `MF_FACTOR` is the saturation constant: effective = `mf*factor/(mf+factor)`.
 * Magic gets no reduction at all — the game only reduces unique/set/rare.
 */
const MF_FACTOR: Readonly<Record<'unique' | 'set' | 'rare', number>> = {
  unique: 250,
  set: 500,
  rare: 600,
}

/**
 * One quality check.
 *
 * `chance` is a *denominator in 128ths*: the `Min` columns are documented as "the
 * minimum value of the probability denominator … calculated in 128ths", so
 * success is a roll below 128 out of that denominator. Magic find is applied
 * before the clamp — which is what makes the clamp a cap on how good magic find
 * can get — and the treasure class factor then subtracts its share out of 1024.
 */
function qualityCheck(
  random: Random,
  chance: RarityChance,
  magicFindFactor: number,
  magicFind: number,
  tcFactor: number,
  ilvl: number,
  qlvl: number
): boolean {
  let denominator = (chance.base - Math.floor((ilvl - qlvl) / Math.max(1, chance.divisor))) * 128
  let effectiveMagicFind = magicFind
  if (magicFindFactor > 0 && magicFind > 10) {
    effectiveMagicFind = Math.floor((magicFind * magicFindFactor) / (magicFind + magicFindFactor))
  }
  denominator = Math.floor((denominator * 100) / (100 + effectiveMagicFind))
  if (denominator < chance.min) denominator = chance.min
  denominator -= Math.floor((denominator * Math.max(0, tcFactor)) / 1024)
  if (denominator <= 128) return true
  return random.int(denominator) < 128
}

/** The `itemratio.txt` row for this item: expansion, and normal vs uber tier. */
function itemRatioRow(index: ItemIndex, base: ItemBase): ItemTableRow | null {
  // `Uber` selects by the *item's* tier: exceptional and elite items use the
  // uber rows, normal ones the plain rows (per the field's own description).
  const uber = base.tier === 'normal' ? '0' : '1'
  const classSpecific = index.isClassSpecific(base.type) ? '1' : '0'
  let fallback: ItemTableRow | null = null
  for (const row of index.tables.itemratio) {
    if (cell(row, 'Version') !== '1') continue
    if (fallback === null) fallback = row
    if ((cell(row, 'Uber') ?? '0') === uber && (cell(row, 'Class Specific') ?? '0') === classSpecific) {
      return row
    }
  }
  return fallback
}

function rarityChance(row: ItemTableRow, rarity: 'unique' | 'set' | 'rare' | 'magic'): RarityChance {
  const prefix =
    rarity === 'unique' ? 'Unique' : rarity === 'set' ? 'Set' : rarity === 'rare' ? 'Rare' : 'Magic'
  return {
    base: int(row, prefix),
    divisor: int(row, `${prefix}Divisor`),
    min: int(row, `${prefix}Min`),
  }
}

/** True when this base item can carry a magic (or better) affix at all. */
export function canBeMagic(index: ItemIndex, base: ItemBase): boolean {
  const type = index.types.get(base.type)
  if (type === undefined) return false
  if (type.normal) return false
  return type.magic || base.magicAllowed
}

/**
 * Rolls the item's quality.
 *
 * The order is the one `itemratio.txt` documents ("Calculation order is Unique →
 * Set → Rare → Magic → HiQuality → Normal"). Item types declared `Normal` never
 * leave `normal`, and types declared `Magic` (rings, amulets, jewels, charms)
 * skip the magic check because they are always at least magic. A `misc` base
 * stops after the magic check: potions, gems and runes have no superior variant.
 */
export function rollRarity(
  index: ItemIndex,
  base: ItemBase,
  ilvl: number,
  magicFind: number,
  factors: QualityFactors,
  random: Random
): ItemRarity {
  const type = index.types.get(base.type)
  if (type === undefined || !canBeMagic(index, base)) return 'normal'
  const row = itemRatioRow(index, base)
  if (row === null) return 'normal'
  const qlvl = base.level
  const unique = qualityCheck(
    random,
    rarityChance(row, 'unique'),
    MF_FACTOR.unique,
    magicFind,
    factors.unique,
    ilvl,
    qlvl
  )
  if (unique) return 'unique'
  const set = qualityCheck(
    random,
    rarityChance(row, 'set'),
    MF_FACTOR.set,
    magicFind,
    factors.set,
    ilvl,
    qlvl
  )
  if (set) return 'set'
  if (
    type.rare &&
    qualityCheck(random, rarityChance(row, 'rare'), MF_FACTOR.rare, magicFind, factors.rare, ilvl, qlvl)
  ) {
    return 'rare'
  }
  if (type.magic) return 'magic'
  if (qualityCheck(random, rarityChance(row, 'magic'), 0, magicFind, factors.magic, ilvl, qlvl)) {
    return 'magic'
  }
  if (base.kind === 'misc') return 'normal'
  const superior = qualityCheck(
    random,
    { base: int(row, 'HiQuality'), divisor: int(row, 'HiQualityDivisor'), min: 0 },
    0,
    0,
    0,
    ilvl,
    qlvl
  )
  if (superior) return 'superior'
  const normal = qualityCheck(
    random,
    { base: int(row, 'Normal'), divisor: int(row, 'NormalDivisor'), min: 0 },
    0,
    0,
    0,
    ilvl,
    qlvl
  )
  if (normal) return 'normal'
  return 'low'
}

/* -------------------------------------------------------------------------- */
/* Property application                                                       */
/* -------------------------------------------------------------------------- */

/** Marker stats: they carry a flag rather than a value the stat system reads. */
const MARKER_STATS: readonly string[] = ['item_ethereal']

function pickWeighted<T>(
  random: Random,
  items: readonly T[],
  weight: (item: T) => number
): T | null {
  let total = 0
  for (const item of items) total += Math.max(0, weight(item))
  if (total <= 0) return null
  let roll = random.int(total)
  for (const item of items) {
    const value = Math.max(0, weight(item))
    if (roll < value) return item
    roll -= value
  }
  return items[items.length - 1] ?? null
}

/**
 * Turns one property code + (param, min, max) into stats.
 *
 * The `func` codes are the game's and their meaning is not in the tables, so each
 * case is annotated with the evidence for it: the stat it is paired with and the
 * property's own `*Tooltip`. Two things are deliberately not implemented —
 * `25` (`affix-rand`, a D2R meta-property that adds an affix from a pool the
 * tables only describe in comments) and the deeper semantics of `19`/`24`, whose
 * values are stored but not resolved against other tables — because inventing
 * them would produce items the game never makes.
 */
function applyProperty(
  index: ItemIndex,
  assignment: PropertyAssignment,
  source: string,
  random: Random
): ItemPropertyApplication | null {
  const property = index.properties.get(assignment.code)
  if (property === undefined) return null
  const rolled = random.range(assignment.min, assignment.max)
  const stats: ItemStat[] = []
  const push = (func: number, stat: string | null, value: number, param = 0, level = 0): void => {
    if (stat === null) return
    stats.push({
      property: property.code,
      stat,
      func,
      value,
      min: assignment.min,
      max: assignment.max,
      param,
      level,
      source,
    })
  }
  for (const fn of property.funcs) {
    switch (fn.func) {
      // 1/2/3/8/9/13/14 and friends all hand the rolled number to a named stat.
      // Which *layer* it lands in is decided by the stat's own `op` inside
      // StatSet, not here: `+15% Enhanced Defense` (func 2 → item_armor_percent,
      // op 13) is a percent of base while `+40 to Attack Rating` (func 1 → tohit)
      // is flat, and both come through this one case.
      case 1:
      case 2:
      case 3:
      case 8:
      case 9:
      case 13:
      case 14:
        push(fn.func, fn.stat, rolled, assignment.param)
        break
      // 5/6: the "adds +X to minimum/maximum damage" pair. Those rows have no
      // stat column, so the two targets are named explicitly.
      case 5:
        push(fn.func, 'mindamage', rolled)
        break
      case 6:
        push(fn.func, 'maxdamage', rolled)
        break
      // 7: `dmg%` — "Enhanced Damage" moves both ends of the weapon range.
      case 7:
        push(fn.func, 'item_mindamage_percent', rolled)
        push(fn.func, 'item_maxdamage_percent', rolled)
        break
      // 11: "Chance to cast level L Skill on event" — min is the percent chance,
      // max the skill level, param the skill.
      case 11:
        push(fn.func, fn.stat, assignment.min, assignment.param, assignment.max)
        break
      // 12: `skill-rand` — one skill from an id range.
      case 12:
        push(fn.func, fn.stat, 1, random.range(assignment.min, assignment.max))
        break
      // 15/16: the two ends of a damage range (`dmg-fire` → firemindam/firemaxdam).
      case 15:
        push(fn.func, fn.stat, assignment.min)
        break
      case 16:
        push(fn.func, fn.stat, assignment.max)
        break
      // 17/18: per level and by time. Those rows keep their number in
      // `mod#param` rather than min/max (per-level amounts are in eighths, and
      // `rep-dur`'s parameter is literally its seconds), so the parameter is the
      // value; a row that does fill min/max is honoured.
      case 17:
      case 18:
        push(
          fn.func,
          fn.stat,
          assignment.min === 0 && assignment.max === 0 ? assignment.param : rolled,
          assignment.param
        )
        break
      // 19: charged skill — min is the charge count, max the skill level.
      case 19:
        push(fn.func, fn.stat, Math.abs(assignment.min), assignment.param, Math.max(1, assignment.max))
        break
      // 20: `indestruct` has no stat column; the stat the game reads is named here.
      case 20:
        push(fn.func, 'item_indesctructible', 1)
        break
      // 21: class skills — `val` holds the class index (0 = amazon).
      case 21:
        push(fn.func, fn.stat, rolled, fn.value)
        break
      // 22: `oskill`/`aura`/`skill` — param is the skill.
      case 22:
        push(fn.func, fn.stat, rolled, assignment.param)
        break
      // 23: ethereal, which is a flag on the item rather than a stat.
      case 23:
        push(fn.func, 'item_ethereal', 1)
        break
      // 24: reanimate / versus-monster-type — param is the monster type index.
      case 24:
        push(fn.func, fn.stat, rolled, assignment.param)
        break
      // 36: a random class skill.
      case 36:
        push(fn.func, fn.stat, rolled, random.int(7))
        break
      default:
        push(fn.func, fn.stat ?? property.code, rolled, assignment.param)
        break
    }
  }
  if (stats.length === 0) return null
  return {
    property: property.code,
    template: property.tooltip,
    param: assignment.param,
    min: assignment.min,
    max: assignment.max,
    value: rolled,
    source,
    stats,
  }
}

function applyAssignments(
  index: ItemIndex,
  assignments: readonly PropertyAssignment[],
  source: string,
  random: Random,
  out: ItemPropertyApplication[]
): void {
  for (const assignment of assignments) {
    const application = applyProperty(index, assignment, source, random)
    if (application !== null) out.push(application)
  }
}

/* -------------------------------------------------------------------------- */
/* Affix selection                                                            */
/* -------------------------------------------------------------------------- */

/** True when an affix may appear on this base item. */
function affixAllowed(index: ItemIndex, affix: Affix, base: ItemBase): boolean {
  const chain = new Set<string>(index.typesOf(base.type))
  if (base.type2 !== null) for (const member of index.typesOf(base.type2)) chain.add(member)
  if (!affix.types.some((type) => chain.has(type))) return false
  if (affix.excludedTypes.some((type) => chain.has(type))) return false
  if (affix.classes.length > 0) {
    const classCode = index.itemClass(base.type)
    if (classCode === null || !affix.classes.includes(classCode)) return false
  }
  return true
}

/**
 * The affixes that may roll on this item, before the per-item group filter.
 *
 * Cached per (kind, type, affix level) because answering it walks the type
 * hierarchy for ~1200 affixes; a drop test rolls tens of thousands of items, and
 * the answer only depends on the base item's *type* and the affix level.
 */
const eligibleCache = new WeakMap<ItemIndex, Map<string, readonly Affix[]>>()

function eligibleAffixes(
  index: ItemIndex,
  source: readonly Affix[],
  base: ItemBase,
  alvl: number,
  forRare: boolean
): readonly Affix[] {
  let cache = eligibleCache.get(index)
  if (cache === undefined) {
    cache = new Map()
    eligibleCache.set(index, cache)
  }
  const key = `${source === index.prefixes ? 'p' : source === index.suffixes ? 's' : 'a'}|${base.type}|${base.type2 ?? ''}|${alvl}|${forRare ? 1 : 0}`
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  const pool = source.filter(
    (affix) =>
      affix.spawnable &&
      affix.frequency > 0 &&
      affix.level <= alvl &&
      (affix.maxLevel === 0 || alvl <= affix.maxLevel) &&
      (!forRare || affix.rare) &&
      affixAllowed(index, affix, base)
  )
  cache.set(key, pool)
  return pool
}

/**
 * The affixes that may roll on this item.
 *
 * `frequency > 0` is not merely a weight: every classic-only affix in the
 * expansion tables carries `frequency 0`, so this filter also keeps classic
 * affixes off expansion items — which is exactly what `version < 100` means.
 */
function affixPool(
  index: ItemIndex,
  source: readonly Affix[],
  base: ItemBase,
  alvl: number,
  forRare: boolean,
  usedGroups: ReadonlySet<number>
): readonly Affix[] {
  if (usedGroups.size === 0) return eligibleAffixes(index, source, base, alvl, forRare)
  return eligibleAffixes(index, source, base, alvl, forRare).filter(
    (affix) => affix.group === 0 || !usedGroups.has(affix.group)
  )
}

interface AffixTarget {
  prefixes: Affix[]
  suffixes: Affix[]
  properties: ItemPropertyApplication[]
}

function addAffix(
  index: ItemIndex,
  target: AffixTarget,
  affix: Affix,
  usedGroups: Set<number>,
  random: Random
): void {
  if (affix.kind === 'prefix') target.prefixes.push(affix)
  else target.suffixes.push(affix)
  if (affix.group !== 0) usedGroups.add(affix.group)
  applyAssignments(index, affix.mods, 'affix', random, target.properties)
}

function pickAffix(pool: readonly Affix[], random: Random): Affix | null {
  return pickWeighted(random, pool, (affix) => affix.frequency)
}

/**
 * Roll the affixes of a magic item.
 *
 * The count comes first: a magic item has one or two affixes, equally likely.
 * Two affixes are always one prefix and one suffix; a single affix is a prefix
 * half the time. That is the community-documented shape of the rule, and it is
 * also the only shape that gives the three outcomes the game shows.
 */
function rollMagicAffixes(
  index: ItemIndex,
  base: ItemBase,
  alvl: number,
  random: Random,
  target: AffixTarget
): void {
  const used = new Set<number>()
  const two = random.int(2) === 1
  let wantPrefix = two || random.int(2) === 0
  const wantSuffix = two || !wantPrefix
  if (wantPrefix) {
    const affix = pickAffix(affixPool(index, index.prefixes, base, alvl, false, used), random)
    if (affix !== null) addAffix(index, target, affix, used, random)
  }
  if (wantSuffix) {
    const affix = pickAffix(affixPool(index, index.suffixes, base, alvl, false, used), random)
    if (affix !== null) addAffix(index, target, affix, used, random)
  }
  // An empty pool on the chosen side must not leave a bare "magic" item, so the
  // other side gets one attempt.
  if (target.prefixes.length === 0 && target.suffixes.length === 0) {
    wantPrefix = !wantPrefix
    const affix = pickAffix(
      affixPool(index, wantPrefix ? index.prefixes : index.suffixes, base, alvl, false, used),
      random
    )
    if (affix !== null) addAffix(index, target, affix, used, random)
  }
}

/**
 * Roll the affixes of a rare item.
 *
 * A rare item carries 3 to 6 affixes and never more than three of each kind. The
 * count comes from the game's generator rather than from a table; it is drawn
 * first, so the per-kind cap can only ever push an affix to the other side.
 */
function rollRareAffixes(
  index: ItemIndex,
  base: ItemBase,
  alvl: number,
  random: Random,
  target: AffixTarget
): void {
  const used = new Set<number>()
  const count = 3 + random.int(4)
  for (let index_ = 0; index_ < count; index_ += 1) {
    let wantPrefix = random.int(2) === 0
    if (wantPrefix && target.prefixes.length >= 3) wantPrefix = false
    if (!wantPrefix && target.suffixes.length >= 3) wantPrefix = true
    const pool = affixPool(
      index,
      wantPrefix ? index.prefixes : index.suffixes,
      base,
      alvl,
      true,
      used
    )
    const affix = pickAffix(pool, random)
    if (affix === null) continue
    addAffix(index, target, affix, used, random)
  }
}

/* -------------------------------------------------------------------------- */
/* Names                                                                      */
/* -------------------------------------------------------------------------- */

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1)
}

/** Type-filtered names from `rareprefix`/`raresuffix`. */
function rareNames(index: ItemIndex, base: ItemBase, rows: ItemTable): string[] {
  const names: string[] = []
  for (const row of rows) {
    const name = text(row, 'name')
    if (name === null) continue
    const types: string[] = []
    for (let index_ = 1; index_ <= 7; index_ += 1) {
      const type = nameCell(row, `itype${index_}`)
      if (type !== null) types.push(type)
    }
    if (types.length > 0 && !types.some((type) => index.hasType(base.type, type))) continue
    let excluded = false
    for (let index_ = 1; index_ <= 4; index_ += 1) {
      const type = nameCell(row, `etype${index_}`)
      if (type !== null && index.hasType(base.type, type)) excluded = true
    }
    if (!excluded) names.push(name)
  }
  return names
}

/** A rare name: `rareprefix` + `raresuffix`, e.g. "Viper Eye". */
function rareName(index: ItemIndex, base: ItemBase, random: Random): string {
  const prefixes = rareNames(index, base, index.tables.rareprefix)
  const suffixes = rareNames(index, base, index.tables.raresuffix)
  const prefix = prefixes.length > 0 ? prefixes[random.int(prefixes.length)] : 'Grim'
  const suffix = suffixes.length > 0 ? suffixes[random.int(suffixes.length)] : 'Bane'
  return `${prefix} ${capitalize(suffix)}`
}

/* -------------------------------------------------------------------------- */
/* Tooltip                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Fills a `*Tooltip` template: `#` is one number, extra `#` repeat the last.
 *
 * The number is made absolute because the templates carry the sign themselves
 * ("-#% Target Defense", "+# to Strength"), exactly as the client string does;
 * printing the raw negative value would give "--25".
 */
function fillTemplate(template: string, values: readonly number[]): string {
  let index = 0
  return template.replace(/#/g, () => {
    const value = values[Math.min(index, values.length - 1)] ?? 0
    index += 1
    return String(Math.abs(Math.round(value)))
  })
}

function statLine(index: ItemIndex, stat: string, value: number): string {
  if (index.statTable === null) return `${value >= 0 ? '+' : ''}${value} ${stat}`
  return describeStat(index.statTable, stat, value, { strings: index.strings })
}

/**
 * One tooltip line for a property application.
 *
 * The property's own `*Tooltip` is the game's wording for that property, so it is
 * preferred whenever it exists: it is the only place that knows a class-skill
 * line names a class and that a damage-range line needs both numbers.
 * `describeStat` covers the rest — properties whose tooltip column is empty —
 * which is what the `itemstatcost` description strings are for.
 */
function propertyLine(
  index: ItemIndex,
  application: ItemPropertyApplication
): { text: string; priority: number } | null {
  const shown = application.stats.filter((stat) => stat.stat !== null && !MARKER_STATS.includes(stat.stat))
  const first = shown[0] ?? application.stats[0]
  if (first === undefined || first.stat === null) return null
  const priority = index.statTable?.get(first.stat)?.descPriority ?? 0
  if (application.template !== null) {
    const values = shown.length > 0 ? shown.map((stat) => stat.value) : [application.value]
    return { text: fillTemplate(application.template, values), priority }
  }
  const display = application.min < 0 && first.value >= 0 ? -first.value : first.value
  return { text: statLine(index, first.stat, display), priority }
}

/**
 * The modifier lines, ordered by the game's `descpriority`.
 *
 * The order matters: the tables are authored so that structural lines (damage
 * before resistances) come out first, and identical lines are collapsed because
 * two properties can produce the same wording.
 */
function modifierLines(
  index: ItemIndex,
  properties: readonly ItemPropertyApplication[]
): string[] {
  const lines: { text: string; priority: number }[] = []
  const seen = new Set<string>()
  for (const application of properties) {
    const line = propertyLine(index, application)
    if (line === null || seen.has(line.text)) continue
    seen.add(line.text)
    lines.push(line)
  }
  lines.sort((left, right) => left.priority - right.priority)
  return lines.map((line) => line.text)
}

/* -------------------------------------------------------------------------- */
/* Item creation                                                              */
/* -------------------------------------------------------------------------- */

export interface MakeItemContext {
  readonly index: ItemIndex
  readonly random: Random
  /** Item level: the monster or area level the item dropped at. */
  readonly ilvl: number
  /** Base item code. Without one, a random eligible base item is used. */
  readonly code?: string
  readonly magicFind?: number
  /** Quality factors from the treasure class that produced the drop. */
  readonly factors?: QualityFactors
  /** Force the quality instead of rolling it. */
  readonly quality?: ItemRarity
  /** Force one named unique (a treasure class may name it directly). */
  readonly unique?: string
  /** Force one named set item. */
  readonly setItem?: string
  /** Force the socket count; still capped by the base item and its type. */
  readonly sockets?: number
  /** Gem and rune codes to socket, in order. */
  readonly socketed?: readonly string[]
  /** Force (or forbid) ethereal. */
  readonly ethereal?: boolean
  /** `mul` from a `gld,mul=…` drop entry, in 256ths. */
  readonly goldMultiplier?: number
}

/** A random spawnable base item whose quality level allows it at `ilvl`. */
function randomBase(index: ItemIndex, ilvl: number, random: Random): ItemBase {
  const pool: ItemBase[] = []
  for (const base of index.bases.values()) {
    if (!base.spawnable || base.quest || base.level > ilvl) continue
    pool.push(base)
  }
  const picked = pool.length > 0 ? pool[random.int(pool.length)] : index.bases.get('hax')
  if (picked === undefined) throw new Error('the item index holds no base items')
  return picked
}

/**
 * Applies a gem or rune to the item it is socketed into.
 *
 * Which of the three modifier sets applies is the *host* item's `gemapplytype`
 * (0 weapon, 1 helm/armor, 2 shield) — the same rune gives attack rating in a
 * weapon and defence in armour.
 */
function socketItem(
  index: ItemIndex,
  code: string,
  applyType: number,
  random: Random
): SocketedItem | null {
  const row = index.gems.get(code)
  const base = index.bases.get(code)
  if (row === undefined || base === undefined) return null
  const prefix = applyType === 1 ? 'helmMod' : applyType === 2 ? 'shieldMod' : 'weaponMod'
  const assignments = readMods(row, gemColumns(prefix), 3)
  const applications: ItemPropertyApplication[] = []
  applyAssignments(index, assignments, 'socket', random, applications)
  const stats: ItemStat[] = []
  for (const application of applications) for (const stat of application.stats) stats.push(stat)
  return {
    code,
    name: base.name,
    kind: base.type === 'rune' ? 'rune' : 'gem',
    properties: applications,
    stats,
  }
}

/**
 * Superior items take one `qualityitems.txt` row whose flag column matches the
 * base item's type (weapon, armor, shield, boots, gloves, belt, …).
 */
function applySuperior(index: ItemIndex, base: ItemBase, random: Random, target: AffixTarget): void {
  const categories: string[] = []
  if (index.hasType(base.type, 'tors') || index.hasType(base.type, 'helm')) categories.push('armor')
  if (index.hasType(base.type, 'weap')) categories.push('weapon')
  if (index.hasType(base.type, 'shld')) categories.push('shield')
  if (index.hasType(base.type, 'boot')) categories.push('boots')
  if (index.hasType(base.type, 'glov')) categories.push('gloves')
  if (index.hasType(base.type, 'belt')) categories.push('belt')
  if (index.hasType(base.type, 'scep')) categories.push('scepter')
  if (index.hasType(base.type, 'wand')) categories.push('wand')
  if (index.hasType(base.type, 'staf')) categories.push('staff')
  if (index.hasType(base.type, 'bow')) categories.push('bow')
  const pool = index.tables.qualityitems.filter((row) =>
    categories.some((category) => flag(row, category))
  )
  if (pool.length === 0) return
  const row = pool[random.int(pool.length)]
  applyAssignments(index, readMods(row, affixColumns('mod'), 2), 'superior', random, target.properties)
}

function itemName(
  index: ItemIndex,
  base: ItemBase,
  rarity: ItemRarity,
  target: AffixTarget,
  unique: UniqueItemDef | null,
  setItem: SetItemDef | null,
  random: Random
): string {
  if (unique !== null) return unique.name
  if (setItem !== null) return setItem.name
  if (rarity === 'rare') return rareName(index, base, random)
  if (rarity === 'low') {
    const rows = index.tables.lowqualityitems
    const row = rows.length > 0 ? rows[random.int(rows.length)] : null
    const prefix = row === null ? 'Crude' : text(row, 'Name') ?? 'Crude'
    return `${prefix} ${base.name}`
  }
  const prefix = target.prefixes[0]?.name ?? null
  const suffix = target.suffixes[0]?.name ?? null
  const parts: string[] = []
  if (prefix !== null) parts.push(prefix)
  parts.push(base.name)
  if (suffix !== null) parts.push(suffix)
  return parts.join(' ')
}

/**
 * The DC6 the game draws for this item in an inventory cell.
 *
 * Uniques and set items have their own graphic, which the base tables name in
 * `uniqueinvfile`/`setinvfile`; a base with no override falls back to its plain
 * `invfile`. Both are the same asset family, so an unknown override is still
 * better resolved than left blank.
 */
function itemGraphic(
  base: ItemBase,
  unique: UniqueItemDef | null,
  setItem: SetItemDef | null
): string | null {
  if (unique !== null && base.uniqueInvFile !== null) return base.uniqueInvFile
  if (setItem !== null && base.setInvFile !== null) return base.setInvFile
  return base.invFile
}

function itemDefense(base: ItemBase, stats: StatSet, random: Random, ethereal: boolean): number {
  if (base.maxAc <= 0 && base.minAc <= 0) return 0
  const rolled = random.range(base.minAc, Math.max(base.minAc, base.maxAc))
  const percent = stats.layers('item_armor_percent').basePercent
  const flat = stats.layers('armorclass').add + stats.layers('armorclass_vs_missile').add
  const total = Math.floor((rolled * (100 + percent)) / 100) + flat
  return ethereal ? Math.floor((total * 3) / 2) : total
}

/**
 * Weapon damage.
 *
 * Flat damage is added after the percent, because "Enhanced Damage" scales the
 * weapon's own range: that is what the line means on a weapon tooltip.
 */
function itemDamage(base: ItemBase, stats: StatSet, ethereal: boolean): { min: number; max: number } {
  if (base.maxDamage === 0 && base.minDamage === 0) return { min: 0, max: 0 }
  const factor = ethereal ? 1.5 : 1
  const minPercent = stats.layers('item_mindamage_percent').basePercent
  const maxPercent = stats.layers('item_maxdamage_percent').basePercent
  const min =
    Math.floor(((base.minDamage * (100 + minPercent)) / 100) * factor) + stats.layers('mindamage').add
  const max =
    Math.floor(((base.maxDamage * (100 + maxPercent)) / 100) * factor) + stats.layers('maxdamage').add
  return { min, max: Math.max(min, max) }
}

function itemRequiredLevel(
  base: ItemBase,
  affixes: readonly Affix[],
  unique: UniqueItemDef | null,
  setItem: SetItemDef | null,
  stats: readonly ItemStat[]
): number {
  let level = base.levelReq
  for (const affix of affixes) level = Math.max(level, affix.levelReq)
  if (unique !== null) level = Math.max(level, unique.levelReq)
  if (setItem !== null) level = Math.max(level, setItem.levelReq)
  // A `levelreq` property (a few runewords and charms carry one) raises the bar.
  for (const stat of stats) if (stat.stat === 'item_levelreq') level = Math.max(level, stat.value)
  return level
}

/**
 * The tooltip, in the game's shape: name, base type, damage or defence,
 * durability, sockets, modifiers, requirements.
 */
function buildTooltip(index: ItemIndex, item: Item): string[] {
  const lines: string[] = [item.name]
  if (item.name !== item.baseName) lines.push(item.baseName)
  const base = item.base
  if (base.kind === 'weapon' && (item.minDamage > 0 || item.maxDamage > 0)) {
    lines.push(`One-Hand Damage: ${item.minDamage} to ${item.maxDamage}`)
  }
  if (item.defense > 0) lines.push(`Defense: ${item.defense}`)
  if (item.maxDurability > 0) lines.push(`Durability: ${item.maxDurability} of ${item.maxDurability}`)
  if (item.ethereal) lines.push('Ethereal')
  for (const line of modifierLines(index, item.properties)) lines.push(line)
  if (item.sockets > 0) {
    const sockets = `Socketed (${item.sockets})`
    if (!lines.includes(sockets)) lines.push(sockets)
  }
  // Socketed gems and runes contribute their own lines, named, the way the game
  // shows what is inside an item.
  for (const socketed of item.socketed) {
    lines.push(socketed.name)
    for (const line of modifierLines(index, socketed.properties)) lines.push(line)
  }
  if (base.reqStr > 0) lines.push(`Required Strength: ${base.reqStr}`)
  if (base.reqDex > 0) lines.push(`Required Dexterity: ${base.reqDex}`)
  if (item.reqLevel > 0) lines.push(`Required Level: ${item.reqLevel}`)
  return lines
}

/**
 * Creates one item.
 *
 * The roll order is the game's: quality first (it decides how many affixes there
 * are), then the unique/set identity, then affixes, then the automagic affix the
 * base item asks for, then sockets, and finally the requirements — every one of
 * those steps can raise them.
 */
export function makeItem(context: MakeItemContext): Item {
  const { index, random, ilvl } = context
  const factors = context.factors ?? NO_QUALITY_FACTORS
  const magicFind = context.magicFind ?? 0
  const base =
    context.code === undefined
      ? randomBase(index, ilvl, random)
      : index.bases.get(context.code) ?? randomBase(index, ilvl, random)

  const target: AffixTarget = { prefixes: [], suffixes: [], properties: [] }
  const alvl = affixLevel(ilvl, base.level, base.magicLevel)
  let rarity: ItemRarity = context.quality ?? rollRarity(index, base, ilvl, magicFind, factors, random)
  let unique: UniqueItemDef | null = null
  let setItem: SetItemDef | null = null
  let durabilityMultiplier = 1

  if (rarity === 'unique') {
    // A treasure class may name one exact unique, which bypasses both the level
    // check and the rarity draw.
    const forced = context.unique === undefined ? null : index.uniquesByName.get(context.unique) ?? null
    const pool =
      forced !== null
        ? [forced]
        : (index.uniquesByCode.get(base.code) ?? []).filter(
            (definition) => definition.spawnable && definition.level <= ilvl
          )
    unique = pickWeighted(random, pool, (definition) => definition.rarity)
    if (unique === null) {
      // No unique exists for this base, so the game upgrades the roll instead of
      // dropping nothing: a rare with triple durability, or magic when the type
      // cannot be rare at all.
      rarity = (index.types.get(base.type)?.rare ?? false) ? 'rare' : 'magic'
      durabilityMultiplier = 3
    }
  }
  if (rarity === 'set') {
    const forced =
      context.setItem === undefined ? null : index.setItemsByName.get(context.setItem) ?? null
    const pool =
      forced !== null
        ? [forced]
        : (index.setItemsByCode.get(base.code) ?? []).filter(
            (definition) => definition.spawnable && definition.level <= ilvl
          )
    setItem = pickWeighted(random, pool, (definition) => definition.rarity)
    if (setItem === null) {
      rarity = 'magic'
      durabilityMultiplier = 2
    }
  }

  // The game raises the item level to the unique's/set item's own level, which is
  // what makes a low-level base drop with its designed stats.
  let itemLevel = ilvl
  if (unique !== null) itemLevel = Math.max(itemLevel, unique.level)
  if (setItem !== null) itemLevel = Math.max(itemLevel, setItem.level)

  if (rarity === 'unique' && unique !== null) {
    applyAssignments(index, unique.mods, 'unique', random, target.properties)
  } else if (rarity === 'set' && setItem !== null) {
    applyAssignments(index, setItem.mods, 'set', random, target.properties)
  } else if (rarity === 'rare') {
    rollRareAffixes(index, base, alvl, random, target)
  } else if (rarity === 'magic') {
    rollMagicAffixes(index, base, alvl, random, target)
  } else if (rarity === 'superior') {
    applySuperior(index, base, random, target)
  }

  // Automagic (staves, wands, orbs, class items) rides on any non-unique item.
  let autoAffix: Affix | null = null
  if (rarity !== 'unique' && rarity !== 'set' && base.autoPrefix > 0) {
    const pool = index.autoMagic.filter(
      (affix) =>
        affix.spawnable &&
        affix.group === base.autoPrefix &&
        affix.level <= alvl &&
        (affix.maxLevel === 0 || alvl <= affix.maxLevel) &&
        affixAllowed(index, affix, base)
    )
    autoAffix = pickWeighted(random, pool, (affix) => affix.frequency || 1)
    if (autoAffix !== null) {
      applyAssignments(index, autoAffix.mods, 'automagic', random, target.properties)
    }
  }

  const ownStats: ItemStat[] = []
  for (const application of target.properties) for (const stat of application.stats) ownStats.push(stat)

  // Sockets. The count is capped by the item type and by `gemsockets`; normal and
  // superior items can also spawn already socketed, which the game gives a
  // one-in-three chance of.
  const socketCap = maxSockets(index, base, itemLevel)
  const socketProperty = ownStats.find((stat) => stat.stat === 'item_numsockets')
  let sockets = 0
  if (context.sockets !== undefined) sockets = context.sockets
  else if (socketProperty !== undefined) sockets = socketProperty.value
  else if ((rarity === 'normal' || rarity === 'superior') && socketCap > 0 && random.int(3) === 0) {
    sockets = 1 + random.int(socketCap)
  }
  if (context.socketed !== undefined) sockets = Math.max(sockets, context.socketed.length)
  sockets = Math.min(sockets, socketCap)

  const socketed: SocketedItem[] = []
  if (context.socketed !== undefined) {
    for (const code of context.socketed.slice(0, sockets)) {
      const item = socketItem(index, code, base.gemApplyType, random)
      if (item !== null) socketed.push(item)
    }
  }

  const stats: ItemStat[] = [...ownStats]
  for (const socketedItem of socketed) for (const stat of socketedItem.stats) stats.push(stat)

  const statsOf = new StatSet({ table: index.statTable ?? undefined })
  for (const stat of stats) if (stat.stat !== null) statsOf.apply(stat.stat, stat.value)

  const forcedEthereal = ownStats.some((stat) => stat.stat === 'item_ethereal')
  const ethereal =
    context.ethereal ??
    (forcedEthereal ||
      (rarity !== 'set' &&
        base.kind !== 'misc' &&
        !base.noDurability &&
        !base.quest &&
        !ownStats.some((stat) => stat.stat === 'item_indesctructible') &&
        random.int(100) < 5))
  const maxDurability = base.noDurability
    ? 0
    : Math.max(
        1,
        Math.floor(
          (ethereal ? Math.floor(base.durability / 2) + 1 : base.durability) * durabilityMultiplier
        )
      )
  const gold =
    base.code === 'gld'
      ? Math.max(
          1,
          Math.floor(
            ((random.int(Math.max(1, itemLevel) * 8) + 1) * (context.goldMultiplier ?? 256)) / 256
          )
        )
      : 0

  // Low-quality items are the "Crude"/"Cracked"/"Damaged" ones: the exported
  // `lowqualityitems` table carries only names, so the game's flat penalty on
  // damage and defence is applied here.
  const lowQualityFactor = rarity === 'low' ? 0.75 : 1
  const damage = itemDamage(base, statsOf, ethereal)
  const item: Item = {
    name: itemName(index, base, rarity, target, unique, setItem, random),
    baseName: base.name,
    base,
    rarity,
    tier: base.tier,
    ilvl: itemLevel,
    affixLevel: alvl,
    reqLevel: itemRequiredLevel(
      base,
      [...target.prefixes, ...target.suffixes, ...(autoAffix === null ? [] : [autoAffix])],
      unique,
      setItem,
      stats
    ),
    sockets,
    socketed,
    prefixes: target.prefixes,
    suffixes: target.suffixes,
    autoAffix,
    unique,
    setItem,
    setName: setItem?.setName ?? null,
    properties: target.properties,
    stats,
    statsOf,
    defense: Math.floor(itemDefense(base, statsOf, random, ethereal) * lowQualityFactor),
    minDamage: Math.floor(damage.min * lowQualityFactor),
    maxDamage: Math.floor(damage.max * lowQualityFactor),
    maxDurability,
    ethereal,
    quantity: base.stackable
      ? base.spawnStack || random.range(base.minStack || 1, base.maxStack || 1)
      : 1,
    gold,
    graphic: itemGraphic(base, unique, setItem),
    tooltip: [],
  }
  return { ...item, tooltip: buildTooltip(index, item) }
}
