/**
 * Treasure class tests.
 *
 * The interesting cases are the ones a naive walker gets wrong: nested classes,
 * the item-type bands (`weap3`), negative `Picks`, and a class that cycles back
 * into itself.
 */

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createItemIndex,
  createRandom,
  ITEM_TABLE_NAMES,
  itemTableFile,
  parseItemTables,
  type Item,
  type ItemIndex,
  type ItemTableName,
  type ItemTables,
  type Random,
} from '../items'
import {
  classNumbers,
  createDropResolver,
  createTreasureClasses,
  MAX_DROPS,
  parseItemReference,
  scaledNoDrop,
  type DropResolver,
  type TreasureClassIndex,
} from '../treasure'

/**
 * The extracted tables, found relative to the working directory so the suite
 * passes whether vitest runs from the repository root or from `examples/arpg`.
 */
function tableDirectory(): string {
  const candidates = [
    path.resolve(process.cwd(), 'examples/arpg/public/original'),
    path.resolve(process.cwd(), 'public/original'),
    path.resolve(process.cwd(), '../public/original'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'table_weapons.json'))) return `${candidate}${path.sep}`
  }
  throw new Error(`the extracted tables were not found from ${process.cwd()}`)
}

const TABLE_DIR = tableDirectory()

function loadTables(overrides: Partial<Record<ItemTableName, string>> = {}): ItemTables {
  const files: Partial<Record<ItemTableName, string>> = {}
  for (const name of ITEM_TABLE_NAMES) {
    const file = `${TABLE_DIR}${itemTableFile(name)}`
    files[name] = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  }
  for (const [name, text] of Object.entries(overrides)) {
    if (text !== undefined) files[name as ItemTableName] = text
  }
  return parseItemTables(files)
}

const index: ItemIndex = createItemIndex(loadTables())
const treasure: TreasureClassIndex = createTreasureClasses(index)
const resolver: DropResolver = createDropResolver({ index, treasure })

function random(seed: number): Random {
  return createRandom(seed)
}

function count<K extends string>(entries: Iterable<K>): Map<K, number> {
  const counts = new Map<K, number>()
  for (const entry of entries) counts.set(entry, (counts.get(entry) ?? 0) + 1)
  return counts
}

function sorted(counts: Map<string, number>): [string, number][] {
  return [...counts.entries()].sort((left, right) => right[1] - left[1])
}

describe('treasure class table', () => {
  it('reads a real class with its picks, no-drop and probabilities', () => {
    const treasureClass = treasure.classes.get('Act 1 H2H A')
    expect(treasureClass).toBeDefined()
    expect(treasureClass?.picks).toBe(1)
    expect(treasureClass?.noDrop).toBe(100)
    expect(treasureClass?.group).toBe(7)
    expect(treasureClass?.entries.map((entry) => entry.name)).toEqual([
      'gld',
      'Act 1 Equip A',
      'Act 1 Junk',
      'Act 1 Good',
    ])
    expect(treasureClass?.total).toBe(60)
  })

  it('expands the item-type bands into the base items of their level band', () => {
    const weapon3 = treasure.classes.get('weap3')
    expect(weapon3).toBeDefined()
    const codes = (weapon3?.entries ?? []).map((entry) => entry.name)
    expect(codes).toContain('hax')
    for (const code of codes) {
      const base = index.bases.get(code)
      expect(base).toBeDefined()
      expect(index.hasType(base?.type ?? '', 'weap')).toBe(true)
      // A band covers the three quality levels ending at its number.
      expect(base?.level).toBeGreaterThan(0)
      expect(base?.level).toBeLessThanOrEqual(3)
      expect(base?.spawnable).toBe(true)
    }
    const weapon6 = treasure.classes.get('weap6')
    for (const entry of weapon6?.entries ?? []) {
      const base = index.bases.get(entry.name)
      expect(base?.level).toBeGreaterThan(3)
      expect(base?.level).toBeLessThanOrEqual(6)
    }
    const armor3 = treasure.classes.get('armo3')
    expect((armor3?.entries ?? []).length).toBeGreaterThan(0)
    for (const entry of armor3?.entries ?? []) {
      expect(index.hasType(index.bases.get(entry.name)?.type ?? '', 'armo')).toBe(true)
    }
  })

  it('resolves every entry the tables name', () => {
    expect([...treasure.unknownEntries]).toEqual([])
  })

  it('picks the class of the group that suits the monster level', () => {
    expect(treasure.resolve('Act 1 H2H A', 3)).toBe('Act 1 H2H A')
    expect(treasure.resolve('Act 1 H2H A', 20)).toBe('Act 3 H2H A')
    expect(treasure.resolve('Act 1 H2H A', 85)).toBe('Act 5 (H) H2H C')
    // A class with no group is used as given.
    expect(treasure.resolve('Act 1 Junk', 85)).toBe('Act 1 Junk')
    expect(treasure.classes.get('Act 1 Junk')?.group).toBe(0)
    // Grouped classes are upgraded in place of the class the file names.
    expect(treasure.resolve('Act 1 Equip A', 85)).toBe('Act 5 (H) Equip C')
  })

  it('parses item references with parameters', () => {
    expect(parseItemReference('gld,mul=1280')).toEqual({ code: 'gld', goldMultiplier: 1280 })
    expect(parseItemReference('hax')).toEqual({ code: 'hax', goldMultiplier: 256 })
  })

  it('scales no-drop down when more players are in the game', () => {
    expect(scaledNoDrop(100, 60, 1)).toBe(100)
    expect(scaledNoDrop(100, 60, 2)).toBeLessThan(100)
    expect(scaledNoDrop(100, 60, 3)).toBeLessThan(scaledNoDrop(100, 60, 2))
  })
})

describe('drop resolution', () => {
  it('evaluates a calc expression in a class column with the monster level in scope', () => {
    // The retail export holds plain integers everywhere, but the file format
    // allows formulas; they must be evaluated with `mlvl` bound, not parsed.
    const rows = JSON.parse(
      fs.readFileSync(`${TABLE_DIR}${itemTableFile('treasureclassex')}`, 'utf8')
    ) as Record<string, string | null>[]
    rows.push({
      'Treasure Class': 'Formula TC',
      group: null,
      level: 'mlvl-5',
      Picks: '1',
      Unique: 'mlvl*10',
      Set: '0',
      Rare: 'mlvl',
      Magic: 'mlvl+2',
      NoDrop: '0',
      Item1: 'gld',
      Prob1: '1',
      Item2: 'hax',
      Prob2: 'mlvl',
    })
    const withFormula = createTreasureClasses(
      createItemIndex(loadTables({ treasureclassex: JSON.stringify(rows) }))
    )
    const treasureClass = withFormula.classes.get('Formula TC')
    expect(treasureClass).toBeDefined()
    if (treasureClass === undefined) return
    const numbers = classNumbers(treasureClass, 40)
    expect(numbers.factors).toEqual({ unique: 400, set: 0, rare: 40, magic: 42 })
    expect(numbers.level).toBe(35)
    expect(numbers.probs).toEqual([1, 40])
    expect(numbers.total).toBe(41)
  })

  it('breaks a cycle instead of recursing forever', () => {
    // Two classes that point at each other, one of which can also drop a hand axe.
    const rows = JSON.parse(
      fs.readFileSync(`${TABLE_DIR}${itemTableFile('treasureclassex')}`, 'utf8')
    ) as Record<string, string | null>[]
    rows.push(
      {
        'Treasure Class': 'Cycle A',
        group: null,
        level: null,
        Picks: '1',
        Unique: null,
        Set: null,
        Rare: null,
        Magic: null,
        NoDrop: null,
        Item1: 'Cycle B',
        Prob1: '1',
      },
      {
        'Treasure Class': 'Cycle B',
        group: null,
        level: null,
        Picks: '1',
        Unique: null,
        Set: null,
        Rare: null,
        Magic: null,
        NoDrop: null,
        Item1: 'Cycle A',
        Prob1: '1',
        Item2: 'hax',
        Prob2: '1',
      }
    )
    const cyclic = createTreasureClasses(
      createItemIndex(loadTables({ treasureclassex: JSON.stringify(rows) }))
    )
    const cycleResolver = createDropResolver({ index, treasure: cyclic })
    const random_ = random(99)
    let produced = 0
    for (let i = 0; i < 20; i += 1) {
      const items = cycleResolver.rollDrops('Cycle A', 20, 0, random_)
      expect(items.length).toBeLessThanOrEqual(MAX_DROPS)
      produced += items.length
    }
    // Half the picks fall through to the hand axe, and none of them hang.
    expect(produced).toBeGreaterThan(0)
    expect(produced).toBeLessThanOrEqual(20)
  })

  it('treats negative picks as a guaranteed quantity', () => {
    const treasureClass = treasure.classes.get('Act 1 Worldstone Shard Parent')
    expect(treasureClass).toBeDefined()
    expect(treasureClass?.picks).toBe(-1)
    const items = resolver.rollDrops('Act 1 Worldstone Shard Parent', 30, 0, random(5), {
      maxItems: 10,
    })
    expect(items).toHaveLength(1)
  })

  it('reports the distribution of a real class over 1,000 rolls', () => {
    const random_ = random(4242)
    const rolls = 1000
    const monsterLevel = 5
    let drops = 0
    let gold = 0
    const rarities: string[] = []
    const kinds: string[] = []
    const codes: string[] = []
    const levels: number[] = []
    for (let i = 0; i < rolls; i += 1) {
      const items: Item[] = resolver.rollDrops('Act 1 H2H A', monsterLevel, 0, random_)
      expect(items.length).toBeLessThanOrEqual(MAX_DROPS)
      drops += items.length
      for (const item of items) {
        rarities.push(item.rarity)
        kinds.push(item.base.kind)
        codes.push(item.base.code)
        levels.push(item.ilvl)
        gold += item.gold
      }
    }

    const rarityCounts = sorted(count(rarities) as Map<string, number>)
    const kindCounts = sorted(count(kinds) as Map<string, number>)
    const codeCounts = sorted(count(codes) as Map<string, number>)
    console.log(`Act 1 H2H A @ mlvl ${monsterLevel}, 0% MF, ${rolls} rolls`)
    console.log(`  items: ${drops} (${(drops / rolls).toFixed(3)} per roll, ${gold} gold)`)
    console.log(`  kinds: ${JSON.stringify(kindCounts)}`)
    console.log(`  rarity: ${JSON.stringify(rarityCounts)}`)
    console.log(`  base items: ${JSON.stringify(codeCounts.slice(0, 12))}`)

    // One pick per roll, and 100/160 no-drop, so about 3/8 of the rolls drop.
    expect(drops).toBeGreaterThan(rolls * 0.3)
    expect(drops).toBeLessThan(rolls * 0.45)
    expect(new Set(kinds)).toEqual(new Set(['weapon', 'armor', 'misc']))
    expect(rarityCounts.length).toBeGreaterThan(0)
    // Gold arrives as its own item with a multiplier from the `gld,mul=` entry.
    expect(gold).toBeGreaterThan(drops)
    // Monster level is the item level of what drops.
    expect(Math.min(...levels)).toBeGreaterThanOrEqual(monsterLevel)
  })

  it('produces the same drops for the same seed', () => {
    const first = resolver.rollDrops('Act 1 H2H A', 12, 50, random(31337))
    const second = resolver.rollDrops('Act 1 H2H A', 12, 50, random(31337))
    expect(second.map((item) => item.name)).toEqual(first.map((item) => item.name))
  })
})
