/**
 * The stash, a vendor and a hireling, asserted against the real exported tables
 * and the real layouts.
 *
 * The first half of every group reads the game's own data — `storepage`, `npc`,
 * `hireling`, `monstats`, `gamble`, `misc`, `inventory`, and the layout JSON
 * through the same reader the app uses — so a test fails when the model drifts from
 * the retail files rather than from an expectation written by hand. The second half
 * of each group is synthetic, and covers the cases the export cannot produce: a page
 * with no room, a slot that will not take the item, a withdraw of more than is
 * stored, a gamble row with no base item, and a hireling row with no level.
 */

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createItemIndex,
  createRandom,
  ITEM_TABLE_NAMES,
  itemTableFile,
  makeItem,
  parseItemTables,
  type Item,
  type ItemIndex,
  type ItemTableName,
  type ItemTables,
} from '../items'
import { parseStringTable, type StringRow } from '../stats'
import { parseLayout, parseProfile, type LayoutGlobals } from '../ui/layout'
import { findByName, type UiWidget } from '../ui/widget'
import { parseHirelings, hirelingAccepts } from '../economy'
import {
  createStash,
  hirelingNameKeys,
  hirelingStatsAt,
  itemCost,
  maxBuyFor,
  parseGamble,
  parseNpcTerms,
  parseStorePages,
  priceOf,
  readHirelingSlots,
  readStashLayout,
  resurrectCost,
  stashCell,
  stashSlot,
  vendorStock,
} from '../economy'
import type { TableRow } from '../monsters'

/**
 * The extracted files, found relative to the working directory so the suite passes
 * whether vitest runs from the repository root or from `examples/arpg`.
 */
function tableDirectory(): string {
  const candidates = [
    path.resolve(process.cwd(), 'examples/arpg/public/original'),
    path.resolve(process.cwd(), 'public/original'),
    path.resolve(process.cwd(), '../public/original'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'table_weapons.json'))) return candidate
  }
  throw new Error(`the extracted tables were not found from ${process.cwd()}`)
}

const ROOT = tableDirectory()
const LAYOUTS = path.join(ROOT, 'ui', 'global', 'ui', 'layouts')

function rows(file: string): TableRow[] {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')) as TableRow[]
}

function strings(file: string): StringRow[] {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')) as StringRow[]
}

function loadTables(): ItemTables {
  const files: Partial<Record<ItemTableName, string>> = {}
  for (const name of ITEM_TABLE_NAMES) {
    const file = path.join(ROOT, itemTableFile(name))
    files[name] = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  }
  return parseItemTables(files)
}

const tables = loadTables()
const index: ItemIndex = createItemIndex(tables, {
  strings: parseStringTable(strings('strings_item-modifiers.json')),
})

function base(code: string): NonNullable<ReturnType<ItemIndex['bases']['get']>> {
  const found = index.bases.get(code)
  if (found === undefined) throw new Error(`no base item ${code}`)
  return found
}

function item(code: string, seed = 1, quality?: Item['rarity']): Item {
  return makeItem({ index, random: createRandom(seed), ilvl: 40, code, quality })
}

function layout(name: string): UiWidget {
  const globals: LayoutGlobals = parseProfile(
    fs.readFileSync(path.join(LAYOUTS, '_profilehd.json'), 'utf8'),
  )
  return parseLayout(fs.readFileSync(path.join(LAYOUTS, name), 'utf8'), globals)
}

const stashLayout = readStashLayout(layout('bankexpansionlayouthd.json'), { sharedPages: 3 })
const hirelingPanel = layout('hirelinginventorypanelhd.json')

describe('the stash layout', () => {
  it('reads the pages the layout states, in tab order', () => {
    expect(stashLayout).not.toBeNull()
    const pages = stashLayout?.pages ?? []
    expect(pages.map((page) => page.id)).toEqual([
      'personal',
      'shared:1',
      'shared:2',
      'shared:3',
      'gems',
      'materials',
      'runes',
      'cube',
    ])
    expect(pages.map((page) => page.label)).toEqual([
      '@personal',
      '@shared',
      '@shared',
      '@shared',
      '@gems',
      '@materials',
      '@runes',
      'advancedstash_horadriccube',
    ])
    expect(stashLayout?.tabs).toEqual(['@personal', '@shared', '@gems', '@materials', '@runes'])
  })

  it('gives the personal page the grid its own cellCount states', () => {
    const personal = stashLayout?.pages.find((page) => page.id === 'personal')
    expect(personal?.columns).toBe(10)
    expect(personal?.rows).toBe(10)
    expect(personal?.cells).toBe(100)
    expect(personal?.tab).toBe(0)
  })

  it('states the same grid for every shared page, and none at all when none is asked for', () => {
    for (const page of stashLayout?.pages.filter((entry) => entry.kind === 'shared') ?? []) {
      expect(page.columns).toBe(10)
      expect(page.rows).toBe(10)
      expect(page.cells).toBe(100)
    }
    const without = readStashLayout(layout('bankexpansionlayouthd.json'))
    expect(without?.pages.some((page) => page.kind === 'shared')).toBe(false)
    expect(without?.unmodelled.join(' ')).toContain('sharedPages')
  })

  it('reads the cube as the 3 x 4 the layout and inventory.txt both state', () => {
    const cube = stashLayout?.pages.find((page) => page.id === 'cube')
    // The layout says cellCount {x: 3, y: 4}; inventory.txt's Transmogrify Box
    // Page 1 says gridX 3, gridY 4. Twelve cells, not the nine a 3 x 3 would give.
    expect(cube?.columns).toBe(3)
    expect(cube?.rows).toBe(4)
    expect(cube?.cells).toBe(12)
    expect(cube?.tab).toBeNull()

    const inventory = rows('table_inventory.json')
    const row = inventory.find((entry) => entry['class'] === 'Transmogrify Box Page 1')
    expect(Number(row?.['gridX'])).toBe(cube?.columns)
    expect(Number(row?.['gridY'])).toBe(cube?.rows)
  })

  it('agrees with inventory.txt about the expansion stash grid too', () => {
    const inventory = rows('table_inventory.json')
    const bigBank = inventory.find((entry) => entry['class'] === 'Big Bank Page 1')
    const personal = stashLayout?.pages.find((page) => page.id === 'personal')
    expect(Number(bigBank?.['gridX'])).toBe(personal?.columns)
    expect(Number(bigBank?.['gridY'])).toBe(personal?.rows)
  })

  it('names the operations the panel carries', () => {
    const messages = (stashLayout?.operations ?? []).map((entry) => entry.message).sort()
    expect(messages).toEqual([
      'BankPanelMessage:Convert',
      'BankPanelMessage:SharedStashLeft',
      'BankPanelMessage:SharedStashRight',
      'BankPanelMessage:TogglePreviousSeasonTabs',
      'BankPanelMessage:Withdraw',
      'BankPanelMessage:WithdrawStash',
    ])
    expect(stashLayout?.unmodelled.join(' ')).toContain('cubemain.txt')
  })

  it('gives every advanced slot a code that misc.txt marks stackable in the stash', () => {
    const pages = stashLayout?.pages.filter((page) => page.kind === 'advanced') ?? []
    expect(pages.map((page) => [page.id, page.cells])).toEqual([
      ['gems', 35],
      ['materials', 23],
      ['runes', 33],
    ])
    const codes = pages.flatMap((page) => page.slots.map((slot) => slot.itemCode))
    expect(codes).toHaveLength(91)
    expect(new Set(codes).size).toBe(91)

    // The 91 codes are exactly the misc.txt rows whose AdvancedStashStackable is 1.
    const stackable = tables.misc
      .filter((row) => row['AdvancedStashStackable'] === '1')
      .map((row) => row['code'] as string)
    expect(new Set(stackable)).toEqual(new Set(codes))
    for (const code of codes) expect(index.bases.has(code)).toBe(true)
  })

  it('splits those 91 codes into the layout\u2019s three groups by UICategory', () => {
    const pages = stashLayout?.pages.filter((page) => page.kind === 'advanced') ?? []
    const categoryOf = (code: string): string | null => {
      const row = tables.misc.find((entry) => entry['code'] === code)
      const override = row?.['UICatOverride']
      if (override !== null && override !== undefined && override !== '') return override
      const type = row?.['type'] ?? null
      for (const typeRow of tables.itemtypes) {
        if (typeRow['Code'] === type) return typeRow['UICategory'] ?? null
      }
      return null
    }
    for (const page of pages) {
      const categories = new Set(page.slots.map((slot) => categoryOf(slot.itemCode)))
      if (page.id === 'gems') expect([...categories]).toEqual(['gems'])
      if (page.id === 'runes') expect([...categories]).toEqual(['runes'])
      if (page.id === 'materials') {
        expect([...categories].sort()).toEqual(['absol', 'potis', 'terrt', 'uberm'])
      }
    }
  })

  it('returns null for a layout with no personal grid', () => {
    const synthetic: UiWidget = { type: 'Panel', name: 'Nothing', fields: {}, children: [] }
    expect(readStashLayout(synthetic)).toBeNull()
  })
})

describe('the stash model', () => {
  const stash = (): ReturnType<typeof createStash> => {
    if (stashLayout === null) throw new Error('the stash layout did not load')
    return createStash(stashLayout, { gold: 500 })
  }

  it('deposits an item into a cell and hands it back on withdraw', () => {
    const model = stash()
    const ring = item('rin', 7)
    const placed = model.deposit('personal', ring, stashCell(0, 0))
    expect(placed.ok).toBe(true)
    expect(model.placements('personal')).toHaveLength(1)
    const taken = model.withdraw('personal', stashCell(0, 0))
    expect(taken.ok).toBe(true)
    expect(taken.item?.name).toBe(ring.name)
    expect(taken.count).toBe(1)
    expect(model.placements('personal')).toHaveLength(0)
  })

  it('refuses a cell that the item\u2019s own footprint would leave', () => {
    const model = stash()
    const bow = base('lwb')
    expect(bow.invHeight).toBeGreaterThan(1)
    const refused = model.deposit('personal', item('lwb'), stashCell(9, 9))
    expect(refused.ok).toBe(false)
    expect(refused.refusal).toBe('out-of-bounds')
    // At the top-left corner the same item fits, and covers an invwidth x invheight
    // block.
    expect(model.deposit('personal', item('lwb'), stashCell(0, 0)).ok).toBe(true)
    expect(model.placements('personal')).toHaveLength(1)
  })

  it('refuses a cell another item already covers', () => {
    const model = stash()
    const bow = item('lwb')
    expect(model.deposit('personal', bow, stashCell(0, 0)).ok).toBe(true)
    const refused = model.deposit('personal', item('rin', 3), stashCell(0, 0))
    expect(refused.refusal).toBe('occupied')
  })

  it('says a page is full when nothing fits, and never when it has room', () => {
    const model = stash()
    const ring = item('rin', 11)
    let placed = 0
    for (let column = 0; column < 10; column += 1) {
      for (let row = 0; row < 10; row += 1) {
        if (model.deposit('personal', ring, stashCell(column, row)).ok) placed += 1
      }
    }
    expect(placed).toBe(100)
    expect(model.freePositions('personal', ring)).toBe(0)
    const refused = model.deposit('personal', ring, stashCell(4, 4))
    expect(refused.refusal).toBe('full')
    expect(refused.message).toContain('full')

    // A page with one cell free is not full.
    expect(model.withdraw('personal', stashCell(4, 4)).ok).toBe(true)
    expect(model.freePositions('personal', ring)).toBe(1)
    expect(model.deposit('personal', ring, stashCell(4, 4)).ok).toBe(true)
  })

  it('stacks a stackable base up to the maxstack column and stops there', () => {
    const model = stash()
    const arrows = item('aqv', 5)
    const cap = base('aqv').maxStack
    expect(cap).toBe(500)
    expect(arrows.quantity).toBe(250)
    const first = model.deposit('personal', arrows, stashCell(2, 2))
    expect(first.ok).toBe(true)
    expect(model.placements('personal')[0]?.count).toBe(250)
    const second = model.deposit('personal', arrows, stashCell(2, 2))
    expect(second.ok).toBe(true)
    expect(model.placements('personal')[0]?.count).toBe(500)
    const third = model.deposit('personal', arrows, stashCell(2, 2))
    expect(third.ok).toBe(false)
    expect(third.refusal).toBe('full')
    expect(model.placements('personal')[0]?.count).toBe(500)
  })

  it('takes exactly the slot\u2019s own item code, and only that', () => {
    const model = stash()
    const gem = item('gcv', 3)
    expect(model.deposit('gems', gem, stashSlot('gcv')).ok).toBe(true)
    const wrong = model.deposit('gems', item('gcv', 4, 'normal'), stashSlot('gfr'))
    expect(wrong.refusal).toBe('wrong-item')
    const unknown = model.deposit('gems', gem, stashSlot('zzz'))
    expect(unknown.refusal).toBe('unknown-slot')
    // A grid address on a slot page, and a slot address on a grid page, are both
    // reported rather than silently accepted.
    expect(model.deposit('gems', gem, stashCell(0, 0)).refusal).toBe('slot-address')
    expect(model.deposit('personal', gem, stashSlot('gcv')).refusal).toBe('cell-address')
  })

  it('stacks a slot page without a cap, because no column states one', () => {
    const model = stash()
    const rune = item('r01', 9)
    expect(model.deposit('runes', rune, stashSlot('r01')).ok).toBe(true)
    expect(model.deposit('runes', rune, stashSlot('r01')).ok).toBe(true)
    expect(model.placements('runes')[0]?.count).toBe(2)
  })

  it('refuses a withdraw of more than the slot holds, and takes a part of it', () => {
    const model = stash()
    const rune = item('r01', 9)
    model.deposit('runes', rune, stashSlot('r01'))
    model.deposit('runes', rune, stashSlot('r01'))
    model.deposit('runes', rune, stashSlot('r01'))
    const tooMany = model.withdraw('runes', stashSlot('r01'), 4)
    expect(tooMany.ok).toBe(false)
    expect(tooMany.refusal).toBe('short-stack')
    expect(tooMany.message).toContain('holds 3')
    const part = model.withdraw('runes', stashSlot('r01'), 1)
    expect(part.ok).toBe(true)
    expect(part.count).toBe(1)
    expect(part.item?.quantity).toBe(1)
    expect(model.placements('runes')[0]?.count).toBe(2)
  })

  it('reports an empty cell, an unknown page and a withdraw of nothing', () => {
    const model = stash()
    expect(model.withdraw('personal', stashCell(1, 1)).refusal).toBe('empty')
    expect(model.deposit('nowhere', item('rin'), stashCell(0, 0)).refusal).toBe('unknown-page')
    expect(model.withdraw('personal', stashCell(0, 0), 0).refusal).toBe('empty')
  })

  it('moves an item between pages, and puts it back when the destination refuses', () => {
    const model = stash()
    const gem = item('gfr', 2)
    expect(model.deposit('personal', gem, stashCell(6, 6)).ok).toBe(true)
    expect(model.move('personal', stashCell(6, 6), 'gems', stashSlot('gfr')).ok).toBe(true)
    expect(model.placements('personal')).toHaveLength(0)
    expect(model.placements('gems')).toHaveLength(1)

    // A move into an occupied cell fails and leaves the item where it was.
    expect(model.move('gems', stashSlot('gfr'), 'personal', stashCell(1, 1)).ok).toBe(true)
    const blocker = item('rin', 21)
    expect(model.deposit('personal', blocker, stashCell(2, 2)).ok).toBe(true)
    const refused = model.move('personal', stashCell(1, 1), 'personal', stashCell(2, 2))
    expect(refused.refusal).toBe('occupied')
    expect(model.placements('personal')).toHaveLength(2)
  })

  it('holds gold, and refuses to give back more than it holds', () => {
    const model = stash()
    expect(model.gold()).toBe(500)
    const refused = model.withdrawGold(501)
    expect(refused.refusal).toBe('short-stack')
    expect(refused.message).toContain('500')
    expect(model.depositGold(250).ok).toBe(true)
    expect(model.gold()).toBe(750)
    expect(model.withdrawGold(750).ok).toBe(true)
    expect(model.gold()).toBe(0)
  })

  it('refuses the cube\u2019s transmute, naming the table it would need', () => {
    const model = stash()
    const refused = model.transmute()
    expect(refused.ok).toBe(false)
    expect(refused.refusal).toBe('not-modelled')
    expect(refused.message).toContain('cubemain.txt')
  })
})

describe('a vendor\u2019s store pages', () => {
  const pages = parseStorePages(rows('table_storepage.json'), index)

  it('reads the four pages storepage names, with the bases their types hold', () => {
    expect(pages.pages.map((page) => [page.name, page.code, page.bases.length])).toEqual([
      ['Armor Page', 'armo', 217],
      ['Weapons Page', 'weap', 270],
      // Magic Page is the counter-example: no itemtypes row is marked `mag`, so the
      // page resolves to no types and no items at all.
      ['Magic Page', 'mag', 0],
      ['Misc Page', 'misc', 161],
    ])
    expect(pages.pages[0]?.types.length).toBe(14)
    expect(pages.pages[1]?.types.length).toBe(18)
    expect(pages.pages[3]?.types.length).toBe(47)
  })

  it('names the codes only one side of the join knows about', () => {
    // storepage names `mag`, which itemtypes never uses; itemtypes marks `armo`,
    // `weap` and `misc`, all of which storepage names. So nothing is derived.
    expect(pages.derived).toEqual([])
    expect([...pages.all.keys()].sort()).toEqual(['armo', 'mag', 'misc', 'weap'])
    expect(pages.byCode.get('mag')?.bases).toEqual([])
  })

  it('takes a page\u2019s base by its own type, and names what the wider reading would add', () => {
    // A Cap's own type is `helm`, which is an armo type.
    expect(pages.byCode.get('armo')?.bases.some((entry) => entry.code === 'cap')).toBe(true)
    expect(pages.byCode.get('weap')?.bases.some((entry) => entry.code === 'cap')).toBe(false)
    // A throwing axe's own type (`taxe`) is a misc type, so it is on the misc page;
    // its Equiv chain reaches `axe`, a weapons type, and that reading is reported
    // rather than merged in: 30 weapons rows are related to the weapons page.
    const throwing = index.bases.get('bal')
    expect(throwing?.type).toBe('taxe')
    expect(pages.all.get('misc')?.bases.some((entry) => entry.code === 'bal')).toBe(true)
    expect(pages.byCode.get('weap')?.relatedBases.some((entry) => entry.code === 'bal')).toBe(true)
    expect(pages.byCode.get('weap')?.bases.some((entry) => entry.code === 'bal')).toBe(false)
    expect(pages.byCode.get('weap')?.relatedBases).toHaveLength(30)
    // Only the four throwing types whose chain reaches a weapons type are related,
    // and all of them are on the misc page. The throwing potions (`tpot`) are *not*
    // among them: their chain stops at `thro`, which is no page's type.
    const miscTypes = new Set(pages.all.get('misc')?.bases.map((entry) => entry.type))
    expect(new Set(pages.byCode.get('weap')?.relatedBases.map((entry) => entry.type))).toEqual(
      new Set(['tkni', 'taxe', 'jave', 'ajav']),
    )
    for (const entry of pages.byCode.get('weap')?.relatedBases ?? []) {
      expect(miscTypes.has(entry.type)).toBe(true)
    }
    // The two sets never overlap.
    for (const page of pages.pages) {
      const direct = new Set(page.bases.map((entry) => entry.code))
      for (const entry of page.relatedBases) expect(direct.has(entry.code)).toBe(false)
    }
  })

  it('gives every base item row exactly one page, or none at all', () => {
    const owned = new Map<string, string>()
    const both: string[] = []
    for (const page of pages.pages) {
      for (const entry of page.bases) {
        const previous = owned.get(entry.code)
        if (previous !== undefined && previous !== page.code) both.push(entry.code)
        owned.set(entry.code, page.code)
      }
    }
    expect(both).toEqual([])
    // 217 + 270 + 161 = 648 of the 692 rows are on a page. The 44 that are not are
    // the quest items, the gold drop and the untitled marker rows — none of which a
    // vendor sells.
    expect(owned.size).toBe(648)
    expect(index.bases.size).toBe(692)
    const orphans = [...index.bases.values()].filter((entry) => !owned.has(entry.code))
    expect(orphans).toHaveLength(44)
    expect(orphans.filter((entry) => entry.type === 'ques')).toHaveLength(43)
    expect(orphans.map((entry) => entry.code)).toContain('gld')
  })

  it('leaves a page with no types and no bases when nothing marks its code', () => {
    const synthetic = parseStorePages([{ 'Store Page': 'Nothing Page', Code: 'zzz' }], index)
    expect(synthetic.pages).toEqual([
      { name: 'Nothing Page', code: 'zzz', types: [], bases: [], relatedBases: [] },
    ])
    // The codes itemtypes marks are still derived from the same index.
    expect(synthetic.derived.map((page) => page.code).sort()).toEqual(['armo', 'misc', 'weap'])
  })
})

describe('a vendor\u2019s stock', () => {
  const pages = parseStorePages(rows('table_storepage.json'), index)
  const terms = parseNpcTerms(rows('table_npc.json'))

  it('stocks the items PermStoreItem marks, and only on the page their types are on', () => {
    const misc = vendorStock({
      index,
      pages,
      page: 'misc',
      ilvl: 30,
      random: createRandom(3),
      count: 5,
    })
    // 24 misc rows (the potion and scroll tiers, tomes, keys, arrows and bolts) plus
    // the 6 throwing potions, whose type is a misc type although the rows are in
    // weapons.txt.
    expect(misc.permanent).toHaveLength(30)
    expect(misc.permanent.map((entry) => entry.item.base.code)).toContain('hp5')
    expect(misc.permanent.map((entry) => entry.item.base.code)).toContain('gps')
    // PermStoreItem is a column of the item's own row, so the same list is derivable
    // from the tables directly.
    expect(tables.misc.filter((row) => row['PermStoreItem'] === '1')).toHaveLength(24)
    expect(tables.weapons.filter((row) => row['PermStoreItem'] === '1')).toHaveLength(6)
    expect(tables.armor.filter((row) => row['PermStoreItem'] === '1')).toHaveLength(6)

    // The armour page's permanent stock is the six boots and belts the column marks;
    // the weapons page's is the six throwing potions.
    const armor = vendorStock({
      index,
      pages,
      page: 'armo',
      ilvl: 30,
      random: createRandom(3),
      count: 5,
    })
    expect(armor.permanent.map((entry) => entry.item.base.code)).toEqual([
      'xvb',
      'xmb',
      'xtb',
      'xhb',
      'zlb',
      'zvb',
    ])
    const weapons = vendorStock({
      index,
      pages,
      page: 'weap',
      ilvl: 30,
      random: createRandom(3),
      count: 5,
    })
    // The six PermStoreItem rows in weapons.txt are all `tpot`, a misc type, so the
    // weapons page has no permanent stock at all.
    expect(weapons.permanent).toEqual([])
    // A Magic Page has no types at all, so it stocks nothing.
    const magic = vendorStock({
      index,
      pages,
      page: 'mag',
      ilvl: 30,
      random: createRandom(3),
      count: 5,
    })
    expect(magic.permanent).toEqual([])
    expect(magic.rolled).toEqual([])
  })

  it('rolls `count` items from the page\u2019s own bases, through the item generator', () => {
    const stock = vendorStock({
      index,
      pages,
      page: 'Armor Page',
      ilvl: 20,
      random: createRandom(11),
      count: 10,
      terms: terms.byName.get('charsi'),
    })
    expect(stock.rolled).toHaveLength(10)
    const codes = new Set(stock.candidates.map((entry) => entry.code))
    for (const entry of stock.rolled) {
      expect(codes.has(entry.item.base.code)).toBe(true)
      expect(entry.item.base.level).toBeLessThanOrEqual(20)
      expect(entry.price).toBeGreaterThan(0)
    }
    // Every base of the page is either a candidate, above the item level, something
    // a shop does not stock, or permanent stock — the four lists add up.
    expect(
      stock.candidates.length +
        stock.aboveLevel.length +
        stock.unspawnable.length +
        stock.permanent.length,
    ).toBe(stock.page.bases.length)
  })

  it('names the bases a shop cannot stock at all', () => {
    const stock = vendorStock({
      index,
      pages,
      page: 'misc',
      ilvl: 40,
      random: createRandom(1),
      count: 1,
    })
    // `hpo` and `mpo` exist only as store items: spawnable 0, so they are permanent
    // stock and never part of the rolled draw.
    expect(stock.unspawnable).not.toContain('hpo')
    expect(index.bases.get('hpo')?.spawnable).toBe(false)
    expect(stock.permanent.map((entry) => entry.item.base.code)).toContain('hpo')
    // The quest items are on no page at all, and some misc rows are non-spawnable
    // and on no page either.
    expect(stock.aboveLevel.length + stock.unspawnable.length).toBeGreaterThan(0)
  })

  it('returns an empty stock for a page that does not exist', () => {
    const stock = vendorStock({
      index,
      pages,
      page: 'zzz',
      ilvl: 10,
      random: createRandom(1),
      count: 3,
    })
    expect(stock.rolled).toEqual([])
    expect(stock.permanent).toEqual([])
    expect(stock.priceOf(item('rin'))).toBeNull()
  })
})

describe('a vendor\u2019s prices', () => {
  const terms = parseNpcTerms(rows('table_npc.json'))

  it('reads the 17 rows and the three multiplier columns', () => {
    expect(terms.rows).toHaveLength(17)
    expect(terms.byName.get('charsi')).toMatchObject({
      buyMultiplier: 512,
      sellMultiplier: 960,
      repairMultiplier: 128,
    })
    expect(terms.byName.get('gheed')?.sellMultiplier).toBe(1088)
    expect(terms.byName.get('malah')?.sellMultiplier).toBe(2048)
    // The npc column is a monstats Id, so every row names a monster the export has.
    const monstats = rows('table_monstats.json')
    for (const row of terms.rows) {
      expect(monstats.some((monster) => monster['Id'] === row.name)).toBe(true)
    }
  })

  it('charges through `sell mult` and pays through `buy mult`, because the other way round loses money', () => {
    for (const row of terms.rows) {
      expect(row.buyMultiplier).toBeLessThan(row.sellMultiplier)
    }
    const potion = item('hp1', 2, 'normal')
    const akara = terms.byName.get('akara')
    if (akara === undefined) throw new Error('no akara')
    // A Minor Healing Potion costs 30 in weapons/armor/misc, and Akara's sell mult
    // is 1024: the shop price is the item's own cost.
    expect(potion.base.cost).toBe(30)
    expect(priceOf(index, potion, akara, 'player-buys')).toBe(30)
    expect(priceOf(index, potion, akara, 'player-sells')).toBe(15)
    const malah = terms.byName.get('malah')
    if (malah === undefined) throw new Error('no malah')
    expect(priceOf(index, potion, malah, 'player-buys')).toBe(60)
  })

  it('reports the quest column set that reverses the two multipliers', () => {
    // All 15 rows that carry a quest set A put questbuymult above questsellmult,
    // which is the reverse of the base columns: 11 rows (acts 1-3) say 1024 against
    // 922, and 4 rows (act 5: malah, drehya, larzuk, nihlathak) say 1024 against
    // 512. So the set is kept and not applied. Two rows carry no quest columns at
    // all: jamella and halbu.
    const withQuest = terms.rows.filter((row) => row.quest.length > 0)
    expect(withQuest).toHaveLength(15)
    for (const row of withQuest) {
      const quest = row.quest[0]
      expect(quest?.letter).toBe('A')
      expect(quest?.flag).toBeGreaterThan(0)
      expect(quest?.buyMultiplier).toBe(1024)
      expect(quest?.repairMultiplier).toBe(1024)
      expect(quest?.sellMultiplier).toBeLessThan(1024)
    }
    expect(withQuest.filter((row) => row.quest[0]?.sellMultiplier === 922)).toHaveLength(11)
    expect(
      withQuest
        .filter((row) => row.quest[0]?.sellMultiplier === 512)
        .map((row) => row.name),
    ).toEqual(['malah', 'drehya', 'larzuk', 'nihlathak'])
    expect(terms.rows.filter((row) => row.quest.length === 0).map((row) => row.name)).toEqual([
      'jamella',
      'halbu',
    ])
    // The B and C sets are empty on every row of this export.
    expect(terms.rows.every((row) => row.fields['questbuymult B'] === undefined)).toBe(true)
    expect(terms.rows.every((row) => row.fields['questbuymult C'] === undefined)).toBe(true)
  })

  it('reads max buy per difficulty, which npc spells with a space', () => {
    if (terms.rows[0] === undefined) throw new Error('no npc rows')
    expect(maxBuyFor(terms.rows[0], 'normal')).toBe(5000)
    expect(maxBuyFor(terms.rows[0], 'nightmare')).toBe(30000)
    expect(maxBuyFor(terms.rows[0], 'hell')).toBe(35000)
    // The rows' own keys, which is why the suffix carries a space.
    expect(Object.keys(terms.rows[0].row)).toContain('max buy (N)')
    expect(Object.keys(terms.rows[0].row)).toContain('max buy (H)')
  })

  it('adds a unique\u2019s own cost mult and cost add to its base cost', () => {
    const uniqueRow = tables.uniqueitems.find(
      (row) => row['cost mult'] === '5' && row['cost add'] === '5000' && row['spawnable'] === '1',
    )
    if (uniqueRow === undefined) throw new Error('no spawnable 5/5000 unique')
    const code = uniqueRow['code'] as string
    const name = uniqueRow['index'] as string
    const rolled = makeItem({
      index,
      random: createRandom(4),
      ilvl: 99,
      code,
      quality: 'unique',
      unique: name,
    })
    expect(rolled.unique?.name).toBe(name)
    expect(itemCost(index, rolled)).toBe(base(code).cost * 5 + 5000)
    // A plain item is worth exactly its own cost column.
    expect(itemCost(index, item('rin', 6, 'normal'))).toBe(base('rin').cost)
  })
})

describe('a vendor\u2019s gamble list', () => {
  it('resolves all 121 named rows to real base items with a price', () => {
    const gamble = parseGamble(rows('table_gamble.json'), index)
    expect(rows('table_gamble.json')).toHaveLength(122)
    expect(gamble.entries).toHaveLength(121)
    expect(gamble.missing).toEqual([])
    // The 122nd row is the same all-empty marker row the other retail tables end
    // with, so it is named rather than dropped.
    expect(gamble.markers).toEqual(['Expansion'])
    // Six of the 121 are misc rows (rings, amulets, charms); the rest are weapons
    // and armour, and one weapons row has no gamble cost at all.
    expect(gamble.unpriced.length).toBeLessThanOrEqual(1)
    const ring = gamble.entries.find((entry) => entry.code === 'rin')
    expect(ring?.cost).toBe(50000)
    expect(ring?.name).toBe('ring')
  })

  it('names a code the item tables do not hold', () => {
    const gamble = parseGamble(
      [
        { name: 'Nonsense', code: 'zzz' },
        { name: 'ring', code: 'rin' },
        { name: 'Expansion', code: null },
      ],
      index,
    )
    expect(gamble.missing).toEqual(['zzz'])
    expect(gamble.markers).toEqual(['Expansion'])
    expect(gamble.entries).toHaveLength(1)
  })
})

describe('a hireling roster', () => {
  const monstats = rows('table_monstats.json')
  const table = parseHirelings(rows('table_hireling.json'), {
    monstats,
    strings: {
      names: parseStringTable(strings('strings_mercenaries.json')),
      descriptions: parseStringTable([
        ...strings('strings_ui.json'),
        ...strings('strings_skills.json'),
      ]),
    },
  })

  it('reads all 135 rows, with all 77 columns\u2019 cells accounted for', () => {
    const raw = rows('table_hireling.json')
    expect(raw).toHaveLength(135)
    expect(raw[0]).toHaveProperty('Hireling')
    for (const column of [
      'Hireling',
      '*SubType',
      'Version',
      'Id',
      'Class',
      'Act',
      'Difficulty',
      'Level',
      'Seller',
      'NameFirst',
      'NameLast',
      'Gold',
      'Exp/Lvl',
      'HP',
      'HP/Lvl',
      'Defense',
      'Def/Lvl',
      'Str',
      'Str/Lvl',
      'Dex',
      'Dex/Lvl',
      'AR',
      'AR/Lvl',
      'Dmg-Min',
      'Dmg-Max',
      'Dmg/Lvl',
      'ResistFire',
      'ResistCold',
      'ResistLightning',
      'ResistPoison',
      'HireDesc',
      'DefaultChance',
      'HiringMaxLevelDifference',
      'resurrectcostmultiplier',
      'resurrectcostdivisor',
      'resurrectcostmax',
      'equivalentcharclass',
    ]) {
      expect(Object.keys(raw[0] as object)).toContain(column)
    }
    expect(table.rows).toHaveLength(135)
    expect(table.problems).toEqual([])
  })

  it('gives the roster of one act and difficulty, in level order', () => {
    const normal = table.roster(1, 1)
    expect(normal.map((row) => row.level)).toEqual([3, 3, 36, 36, 67, 67])
    expect(normal.map((row) => row.subType)).toEqual([
      'Fire - Normal',
      'Ice - Normal',
      'Fire - Normal',
      'Ice - Normal',
      'Fire - Normal',
      'Ice - Normal',
    ])
    expect(table.roster(1, 1, { version: 0 }).map((row) => row.level)).toEqual([3, 3, 25, 25, 49, 49])
    expect(table.roster(1, 3).map((row) => row.level)).toEqual([67, 67])
    expect(table.roster(4, 1)).toEqual([])
  })

  it('reads the cost, the level and the kind from the columns\u2019 own names', () => {
    const fire = table.roster(1, 1)[0]
    if (fire === undefined) throw new Error('no act 1 rows')
    expect(fire.kind).toBe('Rogue Scout')
    expect(fire.act).toBe(1)
    expect(fire.difficulty).toBe(1)
    expect(fire.difficultyName).toBe('Normal')
    expect(fire.version).toBe(100)
    expect(fire.id).toBe(0)
    const rows0 = table.roster(1, 1).filter((row) => row.id === 0)
    expect(rows0.map((row) => [row.level, row.gold])).toEqual([
      [3, 100],
      [36, 6000],
      [67, 12500],
    ])
  })

  it('joins Class and Seller to monstats by hcIdx', () => {
    const fire = table.roster(1, 1)[0]
    if (fire === undefined) throw new Error('no act 1 rows')
    expect(fire.monsterIndex).toBe(271)
    const monster = table.monsters.get(271)
    expect(monster?.id).toBe('roguehire')
    expect(monster?.name).toBe('Rogue')
    expect(monster?.ai).toBe('Hireable')
    expect(monster?.rightArmItemType).toBe('bow')
    expect(monster?.leftArmItemType).toBe('none')
    expect(monster?.levels.get('Normal')).toBe(1)
    expect(monster?.levels.get('Nightmare')).toBe(34)
    expect(fire.sellerIndex).toBe(150)
    expect(table.sellers.get(150)).toBe('kashya')
    // Every act's rows name the NPC that offers them.
    for (const [act, expected] of [
      [1, 'kashya'],
      [2, 'greiz'],
      [3, 'asheara'],
      [5, 'qual-kehk'],
    ] as const) {
      const roster = table.roster(act, 1)
      expect(roster.length).toBeGreaterThan(0)
      for (const row of roster) {
        expect(table.sellers.get(row.sellerIndex ?? -1)).toBe(expected)
      }
    }
    expect(table.monsters.size).toBe(5)
  })

  it('counts what the /Lvl columns reproduce, and names the pairs that break them', () => {
    const growth = table.growth
    const byColumn = new Map(growth.map((entry) => [entry.column, entry]))
    const hp = byColumn.get('HP')
    expect(hp?.levelColumn).toBe('HP/Lvl')
    expect(hp?.pairs).toBe(60)
    expect(hp?.confirmed).toBe(59)
    expect(hp?.exceptions).toHaveLength(1)
    expect(hp?.exceptions[0]).toContain('Desert Mercenary')
    const attack = byColumn.get('AR')
    expect(attack?.confirmed).toBe(59)
    // The four the rule never reproduces, with every pair named.
    for (const column of ['Str', 'Dex', 'Dmg-Min', 'Dmg-Max', 'ResistFire', 'ResistCold', 'ResistLightning', 'ResistPoison']) {
      expect(byColumn.get(column)?.confirmed).toBe(0)
      expect(byColumn.get(column)?.pairs).toBe(60)
      expect(byColumn.get(column)?.exceptions.length).toBeGreaterThan(0)
    }
    // A Rogue Scout's Strength: 63 at level 25 and 93 at level 49 while Str/Lvl says 10.
    const strength = byColumn.get('Str')
    expect(strength?.exceptions.join(' ')).toContain('Str/Lvl 10 gives 303')
  })

  it('returns the row\u2019s own stated values, and grows only the columns a caller names', () => {
    const fire = table.roster(1, 1).find((row) => row.level === 3 && row.subType === 'Fire - Normal')
    const later = table.roster(1, 1).find((row) => row.level === 36 && row.subType === 'Fire - Normal')
    if (fire === undefined || later === undefined) throw new Error('no Fire - Normal rows')
    expect(fire.stats.hp).toBe(45)
    expect(fire.stats.hpPerLevel).toBe(9)
    // By default the stated values come back: growth is not applied behind a caller's
    // back, because the table's own rows refute it for most columns.
    expect(hirelingStatsAt(fire, 36)).toEqual(fire.stats)
    // Asked for, `HP/Lvl` reproduces the *next row's own stated value* exactly.
    const hpOnly = table.growth.filter((entry) => entry.stat === 'hp')
    expect(hirelingStatsAt(fire, 36, hpOnly).hp).toBe(later.stats.hp)
    expect(hirelingStatsAt(fire, 36, hpOnly).strength).toBe(fire.stats.strength)
    // Below the row's own level nothing grows.
    expect(hirelingStatsAt(fire, 1, hpOnly).hp).toBe(45)
  })

  it('reads the skill families and the description key', () => {
    const fire = table.roster(1, 1)[0]
    if (fire === undefined) throw new Error('no act 1 rows')
    expect(fire.skills.map((skill) => skill.name)).toContain('Inner Sight')
    expect(fire.skills.map((skill) => skill.name)).toContain('Fire Arrow')
    expect(fire.skills[0]?.mode).toBe(4)
    expect(fire.skills[0]?.chance).toBe(10)
    expect(fire.hireDesc).toBe('strhirespecial1')
    expect(fire.hireDescText).toBe('Fire Arrow')

    const desert = table.roster(2, 1).find((row) => row.subType?.startsWith('Prayer'))
    expect(desert?.hireDesc).toBe('skillname99')
    expect(desert?.hireDescText).toBe('Prayer')
    // The act 5 rows carry no HireDesc at all, and that is reported as null.
    expect(table.roster(5, 1).every((row) => row.hireDesc === null)).toBe(true)
    expect(table.rows.filter((row) => row.hireDescText === null && row.hireDesc !== null)).toEqual([])
  })

  it('resolves the NameFirst…NameLast range against strings_mercenaries', () => {
    const names = parseStringTable(strings('strings_mercenaries.json'))
    const fire = table.roster(1, 1)[0]
    if (fire === undefined) throw new Error('no act 1 rows')
    const keys = hirelingNameKeys(fire, names)
    expect(keys).toHaveLength(41)
    expect(keys[0]).toBe('merc01')
    expect(names.get(keys[0] as string)).toBe('Aliza')
    expect(names.get(keys[40] as string)).toBe('Wendy')

    // The four ranges of the export partition the whole file, key for key.
    const all = new Set<string>()
    for (const row of table.rows) for (const key of hirelingNameKeys(row, names)) all.add(key)
    const everyKey = new Set(
      strings('strings_mercenaries.json')
        .map((row) => row['Key'])
        .filter((key): key is string => typeof key === 'string'),
    )
    expect(all.size).toBe(everyKey.size)
    expect([...all].sort()).toEqual([...everyKey].sort())

    // Without a string table the range comes back as its keys, which are the
    // table's own strings; with one, only the keys it holds.
    expect(hirelingNameKeys(fire)).toHaveLength(41)
    const partial = { get: (key: string) => (key === 'merc07' ? 'Somebody' : undefined) }
    expect(hirelingNameKeys(fire, partial)).toEqual(['merc07'])
  })

  it('reports a row with no level instead of giving it one', () => {
    const synthetic: TableRow = {
      Hireling: 'Nobody',
      '*SubType': 'Nothing - Normal',
      Version: '100',
      Id: '0',
      Class: '271',
      Act: '1',
      Difficulty: '1',
      Level: null,
      Seller: '150',
      Gold: '1',
      NameFirst: 'merc01',
      NameLast: 'merc41',
    }
    const bare = parseHirelings([synthetic])
    expect(bare.rows).toEqual([])
    expect(bare.problems).toEqual([
      expect.objectContaining({ why: 'level' }),
    ])
    expect(bare.roster(1, 1)).toEqual([])
  })

  it('reports a Class monstats has no Hireable row for, and keeps the row', () => {
    const synthetic: TableRow = {
      Hireling: 'Nobody',
      '*SubType': 'Nothing - Normal',
      Version: '100',
      Id: '0',
      Class: '99999',
      Act: '1',
      Difficulty: '1',
      Level: '5',
      Seller: '99999',
      Gold: '1',
    }
    const table2 = parseHirelings([synthetic], { monstats: rows('table_monstats.json') })
    expect(table2.problems.map((problem) => problem.why)).toEqual(['class', 'seller'])
    expect(table2.rows).toHaveLength(1)
    expect(table2.roster(1, 1)[0]?.level).toBe(5)
  })

  it('reads the resurrect cost columns', () => {
    const fire = table.roster(1, 1)[0]
    if (fire === undefined) throw new Error('no act 1 rows')
    expect(fire.resurrect).toEqual({ multiplier: 15, divisor: 2, max: 50000 })
    expect(resurrectCost(fire, 50)).toBe(375)
    expect(resurrectCost(fire, 10000)).toBe(50000)
  })
})

describe('a hireling\u2019s equipment slots', () => {
  const slots = readHirelingSlots(hirelingPanel)

  it('reads the four the layout names, with its own location field', () => {
    expect(slots.slots.map((slot) => [slot.name, slot.location, slot.bodyLocation])).toEqual([
      ['slot_head', 'head', 'head'],
      ['slot_torso', 'torso', 'tors'],
      ['slot_right_arm', 'right_arm', 'rarm'],
      ['slot_left_arm', 'left_arm', 'larm'],
    ])
    expect(slots.slots.map((slot) => slot.width)).toEqual([196, 196, 196, 196])
    // The same four slots inventory.txt's Hireling row names.
    const inventory = rows('table_inventory.json')
    const hirelingRow = inventory.find((entry) => entry['class'] === 'Hireling')
    expect(hirelingRow).toBeDefined()
    for (const field of ['head', 'torso', 'rArm', 'lArm']) {
      expect(Number(hirelingRow?.[`${field}Width`])).toBeGreaterThan(0)
    }
    expect(slots.unmodelled.length).toBeGreaterThan(0)
  })

  it('takes what monstats says each arm takes, and what itemtypes says head and torso take', () => {
    const table = parseHirelings(rows('table_hireling.json'), { monstats: rows('table_monstats.json') })
    const rogue = table.monsters.get(271) ?? null
    const ironWolf = table.monsters.get(359) ?? null
    const head = slots.slots.find((slot) => slot.location === 'head')
    const torso = slots.slots.find((slot) => slot.location === 'torso')
    const rightArm = slots.slots.find((slot) => slot.location === 'right_arm')
    const leftArm = slots.slots.find((slot) => slot.location === 'left_arm')
    if (head === undefined || torso === undefined || rightArm === undefined || leftArm === undefined) {
      throw new Error('the panel did not name all four slots')
    }
    // The Rogue's right arm is a bow and her left arm takes nothing.
    expect(hirelingAccepts(rogue, rightArm, base('lwb'), index)).toBe(true)
    expect(hirelingAccepts(rogue, leftArm, base('lwb'), index)).toBe(false)
    expect(hirelingAccepts(rogue, rightArm, base('ssd'), index)).toBe(false)
    // The Iron Wolf takes a sword and a shield.
    expect(hirelingAccepts(ironWolf, rightArm, base('ssd'), index)).toBe(true)
    expect(hirelingAccepts(ironWolf, leftArm, base('bsh'), index)).toBe(true)
    // Head and torso are itemtypes body locations.
    expect(hirelingAccepts(rogue, head, base('cap'), index)).toBe(true)
    expect(hirelingAccepts(rogue, torso, base('lea'), index)).toBe(true)
    expect(hirelingAccepts(rogue, torso, base('cap'), index)).toBe(false)
    expect(hirelingAccepts(rogue, head, base('ssd'), index)).toBe(false)
    // Without a monstats row the arms answer false rather than guessing.
    expect(hirelingAccepts(null, rightArm, base('lwb'), index)).toBe(false)
  })
})

describe('the hireling table with no monstats', () => {
  it('still reads the rows, and reports the joins it could not make', () => {
    const table = parseHirelings(rows('table_hireling.json'))
    expect(table.rows).toHaveLength(135)
    expect(table.monsters.size).toBe(0)
    expect(table.sellers.size).toBe(0)
    // With no monstats to check against, no row is called unresolvable.
    expect(table.problems).toEqual([])
    const act5 = table.roster(5, 3)
    expect(act5.map((row) => row.monsterIndex)).toEqual([561, 561, 560])
    expect(act5.every((row) => row.kind === 'Barbarian')).toBe(true)
    expect(new Set(table.rows.map((row) => row.monsterIndex))).toEqual(new Set([271, 338, 359, 560, 561]))
  })
})

describe('the hireling panel\u2019s own name', () => {
  it('is the panel the layout names, with its four slots and its stat fields', () => {
    expect(hirelingPanel.type).toBe('HirelingInventoryPanel')
    expect(findByName(hirelingPanel, 'HPStat')).toBeDefined()
    expect(findByName(hirelingPanel, 'slot_head')).toBeDefined()
  })
})
