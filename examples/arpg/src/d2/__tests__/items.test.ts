/**
 * Item generation tests.
 *
 * These read the real exported tables, so they fail if the rules drift away from
 * the retail data rather than from an expectation written by hand.
 */

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  affixLevel,
  createItemIndex,
  createRandom,
  ITEM_TABLE_NAMES,
  itemTableFile,
  makeItem,
  maxSockets,
  NO_QUALITY_FACTORS,
  parseItemTables,
  rollRarity,
  type Affix,
  type Item,
  type ItemIndex,
  type ItemRarity,
  type ItemTableName,
  type ItemTables,
  type Random,
} from '../items'
import { parseStringTable } from '../stats'

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

function loadTables(): ItemTables {
  const files: Partial<Record<ItemTableName, string>> = {}
  for (const name of ITEM_TABLE_NAMES) {
    const file = `${TABLE_DIR}${itemTableFile(name)}`
    files[name] = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  }
  return parseItemTables(files)
}

function loadStrings(): ReturnType<typeof parseStringTable> {
  const rows = JSON.parse(fs.readFileSync(`${TABLE_DIR}strings_item-modifiers.json`, 'utf8'))
  return parseStringTable(rows)
}

const tables = loadTables()
const index: ItemIndex = createItemIndex(tables, { strings: loadStrings() })

function base(code: string): ItemItemBase {
  const found = index.bases.get(code)
  if (found === undefined) throw new Error(`no base item ${code}`)
  return found
}
type ItemItemBase = NonNullable<ReturnType<ItemIndex['bases']['get']>>

function roll(seed: number): Random {
  return createRandom(seed)
}

function itemOf(context: Parameters<typeof makeItem>[0]): Item {
  return makeItem(context)
}

const AFFIX_GROUPS = (affixes: readonly Affix[]): number[] =>
  affixes.map((affix) => affix.group).filter((group) => group !== 0)

describe('base items', () => {
  it('reads a weapon row the way the tables spell it', () => {
    const hax = base('hax')
    expect(hax.name).toBe('Hand Axe')
    expect(hax.kind).toBe('weapon')
    expect(hax.type).toBe('axe')
    expect(hax.tier).toBe('normal')
    expect(hax.level).toBe(3)
    expect(hax.minDamage).toBe(3)
    expect(hax.maxDamage).toBe(6)
    expect(hax.sockets).toBe(2)
    expect(hax.spawnable).toBe(true)
    expect(hax.quest).toBe(false)
  })

  it('derives the tier family from normcode/ubercode/ultracode', () => {
    expect(base('9ha').tier).toBe('exceptional')
    expect(base('7ha').tier).toBe('elite')
    expect(index.tierFamily(base('9ha'))).toEqual({
      normal: 'hax',
      exceptional: '9ha',
      elite: '7ha',
    })
  })

  it('caps sockets by both the item and its type at the item level', () => {
    // Double Axe: gemsockets 5, axe type 4/5/6 below 25 / below 40 / above.
    const twoAx = base('2ax')
    expect(twoAx.sockets).toBe(5)
    expect(maxSockets(index, twoAx, 10)).toBe(4)
    expect(maxSockets(index, twoAx, 30)).toBe(5)
    expect(maxSockets(index, twoAx, 60)).toBe(5)
    // Military Pick reaches the type's six sockets only above level 40.
    const pick = base('mpi')
    expect(pick.sockets).toBe(6)
    expect(maxSockets(index, pick, 10)).toBe(4)
    expect(maxSockets(index, pick, 30)).toBe(5)
    expect(maxSockets(index, pick, 60)).toBe(6)
    // A hand axe never exceeds its own two sockets.
    expect(maxSockets(index, base('hax'), 60)).toBe(2)
  })

  it('never rolls a quality above normal for a type declared Normal', () => {
    const random = roll(7)
    for (let i = 0; i < 200; i += 1) {
      expect(rollRarity(index, base('gcv'), 85, 500, NO_QUALITY_FACTORS, random)).toBe('normal')
    }
  })

  it('always rolls at least magic for a type declared Magic', () => {
    const random = roll(11)
    const rarity = rollRarity(index, base('rin'), 5, 0, NO_QUALITY_FACTORS, random)
    expect(['magic', 'rare', 'set', 'unique', 'superior']).toContain(rarity)
    expect(rarity).not.toBe('normal')
  })
})

describe('affix level', () => {
  it('adds magic lvl, then pushes the quality level out of the way', () => {
    expect(affixLevel(1, 1, 1)).toBe(2) // Short Staff: magic lvl 1
    expect(affixLevel(85, 3, 0)).toBe(84)
    expect(affixLevel(50, 60, 0)).toBe(30) // ilvl + qlvl/2 pushed the item up
    expect(affixLevel(99, 90, 0)).toBe(99) // 2*ilvl-99, clamped
  })
})

describe('affix counts per rarity', () => {
  const magicCounts = new Map<number, number>()
  const rareCounts = new Map<number, number>()
  const rareSideCounts = new Map<string, number>()

  it('gives magic items one or two affixes and rare items three to six', () => {
    const random = roll(20241013)
    for (let i = 0; i < 10_000; i += 1) {
      const magic = itemOf({ index, random, ilvl: 80, code: 'hax', quality: 'magic' })
      const magicTotal = magic.prefixes.length + magic.suffixes.length
      magicCounts.set(magicTotal, (magicCounts.get(magicTotal) ?? 0) + 1)
      expect(magicTotal).toBeGreaterThanOrEqual(1)
      expect(magicTotal).toBeLessThanOrEqual(2)

      const rare = itemOf({ index, random, ilvl: 80, code: 'hax', quality: 'rare' })
      const rareTotal = rare.prefixes.length + rare.suffixes.length
      rareCounts.set(rareTotal, (rareCounts.get(rareTotal) ?? 0) + 1)
      expect(rareTotal).toBeGreaterThanOrEqual(3)
      expect(rareTotal).toBeLessThanOrEqual(6)
      expect(rare.prefixes.length).toBeLessThanOrEqual(3)
      expect(rare.suffixes.length).toBeLessThanOrEqual(3)
      const side = `${rare.prefixes.length}p${rare.suffixes.length}s`
      rareSideCounts.set(side, (rareSideCounts.get(side) ?? 0) + 1)
    }

    // Every count in the game's ranges shows up, and neither end is a one-off.
    expect([...magicCounts.keys()].sort()).toEqual([1, 2])
    expect([...rareCounts.keys()].sort()).toEqual([3, 4, 5, 6])
    const magicOne = magicCounts.get(1) ?? 0
    const magicTwo = magicCounts.get(2) ?? 0
    expect(magicOne / 10_000).toBeGreaterThan(0.4)
    expect(magicTwo / 10_000).toBeGreaterThan(0.4)
    for (const count of [3, 4, 5, 6]) {
      expect(rareCounts.get(count) ?? 0).toBeGreaterThan(1000)
    }

    // Report the raw histogram: this is the evidence for the counts in the docs.
    console.log('magic affix counts:', [...magicCounts.entries()].sort((a, b) => a[0] - b[0]))
    console.log('rare affix counts:', [...rareCounts.entries()].sort((a, b) => a[0] - b[0]))
    console.log('rare prefix/suffix split:', [...rareSideCounts.entries()].sort())
  })

  it('keeps every rolled affix legal for the item', () => {
    const random = roll(4242)
    let checked = 0
    for (let i = 0; i < 300; i += 1) {
      const rarity: ItemRarity = i % 2 === 0 ? 'magic' : 'rare'
      const item = itemOf({ index, random, ilvl: 85, code: '7ha', quality: rarity })
      const groups = AFFIX_GROUPS([...item.prefixes, ...item.suffixes])
      expect(new Set(groups).size).toBe(groups.length)
      for (const affix of [...item.prefixes, ...item.suffixes]) {
        expect(affix.spawnable).toBe(true)
        expect(affix.frequency).toBeGreaterThan(0)
        expect(affix.level).toBeLessThanOrEqual(item.affixLevel)
        if (affix.maxLevel !== 0) expect(item.affixLevel).toBeLessThanOrEqual(affix.maxLevel)
        if (rarity === 'rare') expect(affix.rare).toBe(true)
        expect(affix.types.some((type) => index.hasType(item.base.type, type))).toBe(true)
        expect(affix.excludedTypes.some((type) => index.hasType(item.base.type, type))).toBe(false)
        if (affix.classes.length > 0) {
          expect(affix.classes).toContain(index.itemClass(item.base.type))
        }
        checked += 1
      }
    }
    expect(checked).toBeGreaterThan(500)
  })
})

describe('quality distribution', () => {
  function histogram(ilvl: number, magicFind: number, seed: number): Record<ItemRarity, number> {
    const random = roll(seed)
    const counts: Record<ItemRarity, number> = {
      low: 0,
      normal: 0,
      superior: 0,
      magic: 0,
      rare: 0,
      set: 0,
      unique: 0,
    }
    const item = base('7ha')
    for (let i = 0; i < 10_000; i += 1) {
      const rarity = rollRarity(index, item, ilvl, magicFind, NO_QUALITY_FACTORS, random)
      counts[rarity] += 1
    }
    return counts
  }

  it('finds unique <. set < rare < magic with no magic find', () => {
    const counts = histogram(85, 0, 99)
    console.log('quality at mlvl 85, 0% MF:', counts)
    expect(counts.unique).toBeGreaterThan(0)
    expect(counts.unique / 10_000).toBeLessThan(0.02)
    expect(counts.unique).toBeLessThan(counts.set)
    expect(counts.set).toBeLessThan(counts.rare)
    expect(counts.rare).toBeLessThan(counts.magic)
    expect(counts.magic / 10_000).toBeGreaterThan(0.01)
    expect(counts.magic + counts.rare + counts.set + counts.unique).toBeLessThan(10_000)
  })

  it('trades normal drops for uniques as magic find rises', () => {
    const none = histogram(85, 0, 1234)
    const plenty = histogram(85, 300, 1234)
    console.log('quality at mlvl 85, 300% MF:', plenty)
    expect(plenty.unique).toBeGreaterThan(none.unique)
    expect(plenty.rare).toBeGreaterThan(none.rare)
    // Diminishing returns: 300% magic find cannot triple the unique rate.
    expect(plenty.unique).toBeLessThan(none.unique * 3)
  })
})

describe('unique items', () => {
  it('knows The Gnasher and builds it from its own row', () => {
    const gnasher = (index.uniquesByCode.get('hax') ?? []).find((u) => u.name === 'The Gnasher')
    expect(gnasher).toBeDefined()
    expect(gnasher?.code).toBe('hax')
    expect(gnasher?.level).toBe(7)
    expect(gnasher?.levelReq).toBe(5)

    const item = itemOf({ index, random: roll(5150), ilvl: 10, code: 'hax', quality: 'unique' })
    expect(item.rarity).toBe('unique')
    expect(item.unique?.name).toBe('The Gnasher')
    expect(item.name).toBe('The Gnasher')
    expect(item.base.code).toBe('hax')
    // The item level is raised to the unique's own level.
    expect(item.ilvl).toBeGreaterThanOrEqual(7)
    expect(item.reqLevel).toBe(5)

    const text = item.tooltip.join('\n')
    expect(text).toContain('The Gnasher')
    expect(text).toContain('Hand Axe')
    expect(text).toContain('+8 to Strength')
    expect(text).toContain('Chance of Open Wounds')
    expect(text).toContain('Chance of Crushing Blow')
    expect(text).toContain('Enhanced Damage')
    console.log('The Gnasher tooltip:', item.tooltip)

    const strength = item.stats.find((stat) => stat.stat === 'strength')
    expect(strength?.value).toBe(8)
    const openWounds = item.stats.find((stat) => stat.stat === 'item_openwounds')
    expect(openWounds?.value).toBe(50)
    const crushingBlow = item.stats.find((stat) => stat.stat === 'item_crushingblow')
    expect(crushingBlow?.value).toBe(20)
    const enhanced = item.stats.find((stat) => stat.stat === 'item_maxdamage_percent')
    expect(enhanced?.value).toBeGreaterThanOrEqual(60)
    expect(enhanced?.value).toBeLessThanOrEqual(70)
    // Enhanced damage is what the tooltip's damage lines must show.
    expect(item.maxDamage).toBeGreaterThanOrEqual(base('hax').maxDamage)
  })

  it('falls back to a rare when the base has no unique at that item level', () => {
    const item = itemOf({ index, random: roll(3), ilvl: 1, code: 'hax', quality: 'unique' })
    expect(item.rarity).toBe('rare')
    expect(item.unique).toBeNull()
    // The game's compensation for a lost unique roll is triple durability.
    expect(item.maxDurability).toBe(base('hax').durability * 3)
  })

  it('builds a set item from its own row, set name and partial bonuses included', () => {
    const ward = (index.setItemsByCode.get('lrg') ?? []).find((item) => item.name === "Civerb's Ward")
    expect(ward).toBeDefined()
    expect(ward?.setName).toBe("Civerb's Vestments")
    expect(index.sets.get("Civerb's Vestments")?.items).toContain('lrg')
    expect((ward?.partialMods.length ?? 0)).toBeGreaterThan(0)

    const item = itemOf({ index, random: roll(808), ilvl: 20, code: 'lrg', quality: 'set' })
    expect(item.rarity).toBe('set')
    expect(item.name).toBe("Civerb's Ward")
    expect(item.setName).toBe("Civerb's Vestments")
    expect(item.base.code).toBe('lrg')
    expect(item.reqLevel).toBe(9)
    expect(item.tooltip.join('\n')).toContain("Civerb's Ward")
    console.log("Civerb's Ward tooltip:", item.tooltip)
  })
})

describe('treasure class quality factors', () => {
  it('improves every quality when the class asks for it', () => {
    const random = roll(616)
    const plain: Record<ItemRarity, number> = {
      low: 0,
      normal: 0,
      superior: 0,
      magic: 0,
      rare: 0,
      set: 0,
      unique: 0,
    }
    const boosted: Record<ItemRarity, number> = { ...plain }
    const axe = base('7ha')
    const champion = { unique: 800, set: 800, rare: 800, magic: 1024 }
    for (let i = 0; i < 5000; i += 1) {
      plain[rollRarity(index, axe, 85, 0, NO_QUALITY_FACTORS, random)] += 1
      boosted[rollRarity(index, axe, 85, 0, champion, random)] += 1
    }
    console.log('plain:', plain, 'champion factors:', boosted)
    // A champion class factor of 800/1024 out of 1024 cuts the denominator hard.
    expect(boosted.unique).toBeGreaterThan(plain.unique * 3)
    expect(boosted.magic).toBeGreaterThan(plain.magic)
    expect(boosted.normal).toBeLessThan(plain.normal)
  })
})

describe('sockets and socketables', () => {
  it('caps a forced socket count at what the item allows', () => {
    const item = itemOf({
      index,
      random: roll(21),
      ilvl: 10,
      code: '2ax',
      quality: 'normal',
      sockets: 9,
    })
    expect(item.sockets).toBe(4)
    expect(item.tooltip.join('\n')).toContain('Socketed (4)')
  })

  it('applies a rune differently in a weapon and in armour', () => {
    const weapon = itemOf({
      index,
      random: roll(31),
      ilvl: 10,
      code: 'hax',
      quality: 'normal',
      sockets: 1,
      socketed: ['r01'],
    })
    expect(weapon.socketed).toHaveLength(1)
    expect(weapon.socketed[0].kind).toBe('rune')
    expect(weapon.socketed[0].name).toBe('El Rune')
    const weaponToHit = weapon.stats.find((stat) => stat.stat === 'tohit')
    expect(weaponToHit?.value).toBe(50) // gems.txt weaponMod for El
    expect(weapon.tooltip.join('\n')).toContain('+50 to Attack Rating')

    const armor = base('qui')
    expect(armor.gemApplyType).toBe(1)
    const armour = itemOf({
      index,
      random: roll(32),
      ilvl: 10,
      code: 'qui',
      quality: 'normal',
      sockets: 1,
      socketed: ['r01'],
    })
    const armorClass = armour.stats.find((stat) => stat.stat === 'armorclass')
    expect(armorClass?.value).toBe(15) // gems.txt helmMod for El
  })
})

describe('automagic', () => {
  it('rolls the automagic affix group the base item asks for', () => {
    const caster = [...index.bases.values()].find((item) => item.autoPrefix > 0)
    expect(caster).toBeDefined()
    if (caster === undefined) return
    let withAffix = 0
    for (let seed = 0; seed < 100; seed += 1) {
      const item = itemOf({
        index,
        random: roll(seed),
        ilvl: 90,
        code: caster.code,
        quality: 'normal',
      })
      if (item.autoAffix !== null) {
        withAffix += 1
        expect(item.autoAffix.group).toBe(caster.autoPrefix)
        expect(item.autoAffix.level).toBeLessThanOrEqual(item.affixLevel)
      }
    }
    expect(withAffix).toBeGreaterThan(50)
    console.log(`${caster.name}: ${withAffix}/100 normal items had an automagic affix`)
  })
})

describe('every base item', () => {
  it('builds at several item levels without throwing or producing junk numbers', () => {
    let built = 0
    for (const item of index.bases.values()) {
      for (const ilvl of [1, 25, 60, 90]) {
        const generated = itemOf({
          index,
          random: roll(ilvl * 31 + item.code.charCodeAt(0)),
          ilvl,
          code: item.code,
        })
        expect(generated.name.length).toBeGreaterThan(0)
        expect(generated.tooltip.length).toBeGreaterThan(0)
        expect(generated.tooltip.join('\n')).not.toContain('undefined')
        expect(generated.tooltip.join('\n')).not.toContain('NaN')
        expect(Number.isFinite(generated.defense)).toBe(true)
        expect(Number.isFinite(generated.minDamage)).toBe(true)
        expect(Number.isFinite(generated.maxDamage)).toBe(true)
        expect(generated.maxDamage).toBeGreaterThanOrEqual(generated.minDamage)
        expect(Number.isFinite(generated.reqLevel)).toBe(true)
        expect(generated.reqLevel).toBeGreaterThanOrEqual(0)
        expect(generated.sockets).toBeLessThanOrEqual(item.sockets)
        expect(generated.ilvl).toBeGreaterThanOrEqual(Math.min(ilvl, item.level))
        for (const stat of generated.stats) {
          expect(Number.isFinite(stat.value)).toBe(true)
          expect(Number.isFinite(stat.param)).toBe(true)
        }
        built += 1
      }
    }
    console.log(`generated ${built} items across ${index.bases.size} base items`)
    expect(built).toBeGreaterThan(1000)
  })
})

describe('determinism', () => {
  it('produces the same item for the same seed and the same request', () => {
    const once = itemOf({ index, random: roll(777), ilvl: 60, code: '7ha', quality: 'rare' })
    const twice = itemOf({ index, random: roll(777), ilvl: 60, code: '7ha', quality: 'rare' })
    expect(twice.name).toBe(once.name)
    expect(twice.tooltip).toEqual(once.tooltip)
    expect(twice.stats).toEqual(once.stats)

    const different = itemOf({ index, random: roll(778), ilvl: 60, code: '7ha', quality: 'rare' })
    expect(different.name === once.name && different.tooltip.join() === once.tooltip.join()).toBe(
      false
    )
  })
})
