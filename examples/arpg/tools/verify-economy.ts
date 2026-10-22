#!/usr/bin/env node
/**
 * Checks the three economies against the game's own data.
 *
 * `src/d2/economy.ts` reads `storepage`, `npc`, `hireling`, `monstats`, `gamble`,
 * `inventory` and the stash and mercenary layouts. This tool checks the joins and
 * the arithmetic against those files themselves, so a drift shows up here rather
 * than in a shop window:
 *
 * - every `storepage` row resolves to a page, and how many items its types hold;
 * - every `hireling` row resolves to a hireable with a level and a cost, and its
 *   `Class`/`Seller` columns join to `monstats`;
 * - every stash page's size is the `cellCount` its own layout states — the layouts
 *   are *parsed* (through `ui/jsonc.ts` and `ui/layout.ts`, the same reader the app
 *   uses for `$ItemCellSize` and `$Name` references), not estimated;
 * - the 91 advanced-stash slots are the 91 `misc.txt` rows marked
 *   `AdvancedStashStackable`;
 * - the price direction the module chose is the one the columns allow, and the
 *   column set that contradicts it is counted;
 * - the hireling name ranges partition `strings_mercenaries` key for key.
 *
 * ## What fails the run, and what is a reported exception
 *
 * Two kinds of surprise live in this data, and they are treated differently:
 *
 * - **The export's own state**, reported with its name and *not* a failure: a
 *   `storepage` row whose code no `itemtypes` row carries (Magic Page), the two
 *   `npc` rows with no quest column set, the base item rows that are on no store
 *   page at all (the quest items and the gold drop), and the all-empty marker row a
 *   few of these tables end with.
 * - **A check that must hold**, which fails the run: a page size that disagrees with
 *   its layout, an advanced slot whose code is not in `misc`, a hireling row that
 *   does not join to `monstats`, a price whose direction the columns contradict, or a
 *   name range that leaves a key uncovered.
 *
 * Usage: tsx examples/arpg/tools/verify-economy.ts
 */

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
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
} from '../src/d2/items'
import { parseStringTable, type StringRow } from '../src/d2/stats'
import { parseJsonc } from '../src/d2/ui/jsonc'
import { parseLayout, parseProfile } from '../src/d2/ui/layout'
import type { UiWidget } from '../src/d2/ui/widget'
import {
  createStash,
  hirelingAccepts,
  hirelingNameKeys,
  hirelingStatsAt,
  maxBuyFor,
  parseGamble,
  parseHirelings,
  parseNpcTerms,
  parseStorePages,
  priceOf,
  readHirelingSlots,
  readStashLayout,
  stashCell,
  stashSlot,
  vendorStock,
} from '../src/d2/economy'
import type { TableRow } from '../src/d2/monsters'

const ROOT = resolve(import.meta.dirname, '../public/original')
const LAYOUTS = join(ROOT, 'ui', 'global', 'ui', 'layouts')

function rows(file: string): TableRow[] {
  return JSON.parse(readFileSync(join(ROOT, file), 'utf8')) as TableRow[]
}

function strings(file: string): StringRow[] {
  return JSON.parse(readFileSync(join(ROOT, file), 'utf8')) as StringRow[]
}

function layout(name: string): UiWidget {
  const globals = parseProfile(readFileSync(join(LAYOUTS, '_profilehd.json'), 'utf8'))
  return parseLayout(readFileSync(join(LAYOUTS, name), 'utf8'), globals)
}

/** Every plain object in a raw (unresolved) layout tree, depth first. */
function rawWidgets(value: unknown): Record<string, unknown>[] {
  if (value === null || typeof value !== 'object') return []
  const node = value as Record<string, unknown>
  const out: Record<string, unknown>[] = [node]
  const children = node['children']
  if (Array.isArray(children)) for (const child of children) out.push(...rawWidgets(child))
  return out
}

/** The `cellCount` a raw layout states for one named widget, or null. */
function rawCellCount(raw: unknown, name: string): { x: number; y: number } | null {
  for (const node of rawWidgets(raw)) {
    if (node['name'] !== name) continue
    const fields = node['fields'] as Record<string, unknown> | undefined
    const count = fields?.['cellCount'] as { x?: unknown; y?: unknown } | undefined
    if (typeof count?.x === 'number' && typeof count?.y === 'number') {
      return { x: count.x, y: count.y }
    }
  }
  return null
}

function main(): void {
  const index: ItemIndex = createItemIndex(
    parseItemTables(
      Object.fromEntries(
        ITEM_TABLE_NAMES.map((name: ItemTableName) => [
          name,
          readFileSync(join(ROOT, itemTableFile(name)), 'utf8'),
        ]),
      ),
    ),
  )
  const problems: string[] = []
  const exceptions: string[] = []

  /** One real item of a base code, through the generator the game uses. */
  const item = (code: string, quality?: Item['rarity']): Item =>
    makeItem({ index, random: createRandom(11), ilvl: 30, code, quality })

  console.log(`economy: ${index.bases.size} base items in weapons/armor/misc`)

  /* --------------------------------------------------------------- storepage */

  const storeRows = rows('table_storepage.json')
  const pages = parseStorePages(storeRows, index)
  const stocked = pages.pages.filter((page) => page.bases.length > 0)
  console.log(
    `economy: storepage ${storeRows.length} rows → ${pages.pages.length} pages, ` +
      `${stocked.length} holding items, ${pages.pages.length - stocked.length} holding none`,
  )
  for (const page of pages.pages) {
    console.log(
      `  ${String(page.name).padEnd(13)} ${page.code.padEnd(5)} ` +
        `${String(page.types.length).padStart(2)} types, ${String(page.bases.length).padStart(3)} base items` +
        (page.relatedBases.length > 0
          ? ` (+${page.relatedBases.length} a wider reading through Equiv would add)`
          : ''),
    )
  }
  for (const page of pages.pages.filter((entry) => entry.bases.length === 0)) {
    exceptions.push(
      `storepage ${String(page.name)} (${page.code}) holds no items: no itemtypes row is marked ${page.code}`,
    )
  }
  const onAPage = new Set(pages.pages.flatMap((page) => page.bases.map((base) => base.code)))
  const offPage = [...index.bases.values()].filter((base) => !onAPage.has(base.code))
  console.log(
    `economy: ${onAPage.size} of ${index.bases.size} base rows are on a page; ${offPage.length} are on none ` +
      `(${offPage.filter((base) => base.type === 'ques').length} of type "ques", ` +
      `${offPage.filter((base) => base.type !== 'ques').map((base) => base.code).join(', ')})`,
  )

  // Permanent stock is a column, so it can be counted per page; and the four lists a
  // page's bases fall into have to add up to the page.
  for (const page of pages.pages) {
    const stock = vendorStock({ index, pages, page: page.code, ilvl: 30, random: createRandom(7), count: 0 })
    if (stock.permanent.length > 0) {
      console.log(
        `  ${page.code.padEnd(5)} permanent stock (PermStoreItem 1): ${stock.permanent.length} ` +
          `[${stock.permanent.map((entry) => entry.item.base.code).join(', ')}]`,
      )
    }
    const total =
      stock.candidates.length +
      stock.aboveLevel.length +
      stock.unspawnable.length +
      stock.permanent.length
    if (total !== page.bases.length) {
      problems.push(
        `page ${page.code}: candidates ${stock.candidates.length} + above-level ${stock.aboveLevel.length} + ` +
          `unspawnable ${stock.unspawnable.length} + permanent ${stock.permanent.length} ≠ ${page.bases.length} bases`,
      )
    }
    const rolled = vendorStock({ index, pages, page: page.code, ilvl: 30, random: createRandom(3), count: 10 })
    const codes = new Set(page.bases.map((base) => base.code))
    for (const entry of rolled.rolled) {
      if (!codes.has(entry.item.base.code)) {
        problems.push(`page ${page.code} rolled ${entry.item.base.code}, which is not one of its bases`)
      }
    }
    if (page.bases.length > 0 && rolled.rolled.length !== 10) {
      problems.push(`page ${page.code} rolled ${rolled.rolled.length} items where 10 were asked for`)
    }
  }

  /* ------------------------------------------------------- the vendor panel */

  // The vendor panel states the *other* half of the store-page join: its tab bar
  // names four page slots and its grid is a different size from inventory.txt's
  // trade page. Both are printed, because neither the tabs nor the grid say which
  // page an NPC offers or how many items the vendor fills.
  const vendorRaw = parseJsonc(readFileSync(join(LAYOUTS, 'vendorpanellayouthd.json'), 'utf8'))
  const vendorTabs =
    rawWidgets(vendorRaw).find((node) => node['name'] === 'tabs')?.['fields'] ?? undefined
  const tabTexts = Array.isArray((vendorTabs as Record<string, unknown>)?.['textStrings'])
    ? ((vendorTabs as Record<string, unknown>)['textStrings'] as unknown[]).filter(
        (entry): entry is string => typeof entry === 'string',
      )
    : []
  const vendorMessages = rawWidgets(vendorRaw)
    .map((node) => (node['fields'] as Record<string, unknown> | undefined)?.['onClickMessage'])
    .filter((message): message is string => typeof message === 'string')
  const vendorGrid = rawCellCount(vendorRaw, 'grid')
  const tradeRow = rows('table_inventory.json').find((entry) => entry['class'] === 'Trade Page 1')
  console.log(
    `economy: vendor panel names ${tabTexts.length} tab slots [${tabTexts.join(', ')}] and sends ` +
      `[${vendorMessages.join(', ')}]`,
  )
  console.log(
    `economy: its grid is ${String(vendorGrid?.x)} x ${String(vendorGrid?.y)} = ` +
      `${(vendorGrid?.x ?? 0) * (vendorGrid?.y ?? 0)} drawn cells, while inventory.txt's Trade Page 1 is ` +
      `${String(tradeRow?.['gridX'])} x ${String(tradeRow?.['gridY'])} — two real numbers, and no table says how ` +
      'many the vendor fills',
  )
  if (!vendorMessages.includes('VendorPanelMessage:RefreshAll')) {
    problems.push('the vendor panel carries no VendorPanelMessage:RefreshAll, which is the restock button this model documents')
  }
  console.log(
    `economy: reported, not a failure: no table joins a tab to a page — the third tab repeats ` +
      `${String(tabTexts[2])} and no tab names the Magic Page`,
  )

  /* ------------------------------------------------------------------- prices */

  const terms = parseNpcTerms(rows('table_npc.json'))
  let reversed = 0
  const questRows: string[] = []
  for (const row of terms.rows) {
    if (row.buyMultiplier >= row.sellMultiplier) reversed += 1
    const quest = row.quest[0]
    if (quest !== undefined && (quest.buyMultiplier ?? 0) > (quest.sellMultiplier ?? 0)) {
      questRows.push(`${row.name} (${quest.buyMultiplier} vs ${quest.sellMultiplier})`)
    }
  }
  if (reversed > 0) {
    problems.push(`${reversed} npc rows pay more than they charge, so no price direction fits them`)
  }
  console.log(
    `economy: npc ${terms.rows.length} rows; buy mult is below sell mult on ${terms.rows.length - reversed} ` +
      'of them, which is why "the player buys at sell mult and sells at buy mult"',
  )
  console.log(
    `economy: the quest column set reverses that on ${questRows.length} rows and is not applied: ${questRows.join(', ')}`,
  )
  for (const row of terms.rows.filter((entry) => entry.quest.length === 0)) {
    exceptions.push(`npc ${row.name} carries no quest column set`)
  }

  // The difficulty columns' spelling is the table's own: `max buy (N)`.
  const allDifficulties = terms.rows.filter(
    (row) =>
      maxBuyFor(row, 'normal') !== null &&
      maxBuyFor(row, 'nightmare') !== null &&
      maxBuyFor(row, 'hell') !== null,
  )
  if (allDifficulties.length !== terms.rows.length) {
    problems.push(
      `${terms.rows.length - allDifficulties.length} npc rows carry no "max buy" column for all three difficulties`,
    )
  }
  const monstats = rows('table_monstats.json')
  const joined = terms.rows.filter((row) => monstats.some((monster) => monster['Id'] === row.name))
  if (joined.length !== terms.rows.length) {
    problems.push(
      `npc rows that are no monstats Id: ${terms.rows
        .filter((row) => !joined.includes(row))
        .map((row) => row.name)
        .join(', ')}`,
    )
  }
  console.log(`economy: npc rows that name a monstats Id: ${joined.length} of ${terms.rows.length}`)

  // A price, end to end: a Minor Healing Potion is 30 in misc.txt and Akara's sell
  // mult is 1024, so a vendor charges its own cost.
  const akara = terms.byName.get('akara')
  const potion = index.bases.get('hp1')
  if (akara === undefined || potion === undefined) {
    problems.push('the price check has no akara row or no hp1 base item')
  } else {
    const built = item('hp1', 'normal')
    const charged = priceOf(index, built, akara, 'player-buys')
    const paid = priceOf(index, built, akara, 'player-sells')
    if (charged !== potion.cost || paid > charged) {
      problems.push(
        `Akara charges ${charged} and pays ${paid} for a ${potion.cost}-cost potion ` +
          `(sell mult ${akara.sellMultiplier}, buy mult ${akara.buyMultiplier})`,
      )
    }
    console.log(
      `economy: a Minor Healing Potion costs ${potion.cost} in misc.txt; Akara charges ${charged} and pays ` +
        `${paid} (sell mult ${akara.sellMultiplier}/1024, buy mult ${akara.buyMultiplier}/1024)`,
    )
  }

  /* ------------------------------------------------------------------- gamble */

  const gamble = parseGamble(rows('table_gamble.json'), index)
  const priced = gamble.entries.filter((entry) => entry.cost > 0)
  console.log(
    `economy: gamble ${gamble.entries.length + gamble.unpriced.length + gamble.markers.length} rows → ` +
      `${gamble.entries.length} base items, ${priced.length} with a gamble cost, ` +
      `${gamble.markers.length} marker row(s)`,
  )
  if (gamble.missing.length > 0) problems.push(`gamble codes with no base item: ${gamble.missing.join(', ')}`)
  if (gamble.unpriced.length > 0) {
    exceptions.push(`gamble rows with no gamble cost: ${gamble.unpriced.join(', ')}`)
  }
  for (const marker of gamble.markers) {
    exceptions.push(`gamble marker row with no code: ${marker}`)
  }

  /* -------------------------------------------------------------------- stash */

  const stashRaw = parseJsonc(readFileSync(join(LAYOUTS, 'bankexpansionlayouthd.json'), 'utf8'))
  const stashRoot = stashRaw as Record<string, unknown>
  console.log(
    `economy: stash layout ${String(stashRoot['type'])} "${String(stashRoot['name'])}"` +
      (stashRoot['basedOn'] === undefined ? '' : `, basedOn ${String(stashRoot['basedOn'])}`),
  )
  const stash = readStashLayout(layout('bankexpansionlayouthd.json'), { sharedPages: 3 })
  if (stash === null) {
    problems.push('bankexpansionlayouthd has no basicstash_container > grid')
  } else {
    console.log(`economy: stash tabs ${stash.tabs.join(', ')}`)
    for (const page of stash.pages) {
      const size =
        page.columns === null
          ? `${page.cells} named slots`
          : `${page.columns} x ${page.rows} = ${page.cells} cells`
      console.log(`  ${page.id.padEnd(9)} ${size}${page.tab === null ? '' : ` (tab ${page.tab})`}`)
    }

    // Every page size is the cellCount its own layout states, read from the raw
    // JSONC tree rather than from the model.
    const personalCells = rawCellCount(stashRaw, 'grid')
    const cubeCells = rawCellCount(stashRaw, 'horadriccube_grid')
    const personal = stash.pages.find((page) => page.id === 'personal')
    const cube = stash.pages.find((page) => page.id === 'cube')
    if (personalCells === null) {
      problems.push('the stash layout states no cellCount for its personal grid')
    } else if (personal?.columns !== personalCells.x || personal.rows !== personalCells.y) {
      problems.push(
        `the personal page is ${String(personal?.columns)} x ${String(personal?.rows)} but the layout states ` +
          `${personalCells.x} x ${personalCells.y}`,
      )
    }
    if (cubeCells === null) {
      problems.push('the stash layout states no cellCount for horadriccube_grid')
    } else if (cube?.columns !== cubeCells.x || cube?.rows !== cubeCells.y) {
      problems.push(
        `the cube page is ${String(cube?.columns)} x ${String(cube?.rows)} but the layout states ` +
          `${cubeCells.x} x ${cubeCells.y}`,
      )
    }
    for (const shared of stash.pages.filter((page) => page.kind === 'shared')) {
      if (shared.columns !== personalCells?.x || shared.rows !== personalCells?.y) {
        problems.push(`the shared page ${shared.id} is not the personal grid the layout states`)
      }
    }
    console.log(
      `economy: the cube is ${cubeCells?.x} x ${cubeCells?.y} = ` +
        `${(cubeCells?.x ?? 0) * (cubeCells?.y ?? 0)} cells; the layout and inventory.txt agree, and a 3 x 3 ` +
        'would be 9',
    )

    // The same page sizes, from inventory.txt's own gridX/gridY columns.
    const inventory = rows('table_inventory.json')
    const crossChecks: readonly (readonly [string, string])[] = [
      ['Big Bank Page 1', 'personal'],
      ['Transmogrify Box Page 1', 'cube'],
    ]
    for (const [className, pageId] of crossChecks) {
      const row = inventory.find((entry) => entry['class'] === className)
      const page = stash.pages.find((entry) => entry.id === pageId)
      if (row === undefined) {
        problems.push(`inventory.txt has no ${className} row to check the ${pageId} page against`)
        continue
      }
      if (Number(row['gridX']) !== page?.columns || Number(row['gridY']) !== page?.rows) {
        problems.push(
          `inventory.txt's ${className} is ${String(row['gridX'])} x ${String(row['gridY'])} but the ${pageId} ` +
            `page is ${String(page?.columns)} x ${String(page?.rows)}`,
        )
      }
      console.log(
        `economy: inventory.txt ${className} ${String(row['gridX'])} x ${String(row['gridY'])} = the ${pageId} page`,
      )
    }

    // The advanced slots are the misc.txt rows the AdvancedStashStackable column marks.
    const slots = stash.pages.filter((page) => page.kind === 'advanced').flatMap((page) => page.slots)
    const marked = index.tables.misc
      .filter((row) => row['AdvancedStashStackable'] === '1')
      .map((row) => row['code'] as string)
    const slotCodes = new Set(slots.map((slot) => slot.itemCode))
    const unmarked = [...slotCodes].filter((code) => !marked.includes(code))
    const unused = marked.filter((code) => !slotCodes.has(code))
    if (unmarked.length > 0) {
      problems.push(`stash slots whose code misc.txt does not mark stackable: ${unmarked.join(', ')}`)
    }
    if (unused.length > 0) {
      problems.push(`misc.txt rows marked stackable with no stash slot: ${unused.join(', ')}`)
    }
    for (const slot of slots) {
      if (!index.bases.has(slot.itemCode)) {
        problems.push(`stash slot ${slot.name} names ${slot.itemCode}, which is no base item`)
      }
    }
    console.log(
      `economy: ${slots.length} advanced-stash slots and ${marked.length} misc.txt rows with ` +
        'AdvancedStashStackable 1 — the same set',
    )

    // The model itself: fill the personal page, use a named slot, refuse what will not fit.
    const model = createStash(stash, { gold: 0 })
    const columns = personalCells?.x ?? 0
    const rowCount = personalCells?.y ?? 0
    let placed = 0
    for (let column = 0; column < columns; column += 1) {
      for (let row = 0; row < rowCount; row += 1) {
        if (model.deposit('personal', item('rin', 'normal'), stashCell(column, row)).ok) placed += 1
      }
    }
    const overfull = model.deposit('personal', item('rin', 'normal'), stashCell(0, 0))
    if (placed !== columns * rowCount || overfull.refusal !== 'full') {
      problems.push(
        `the personal page took ${placed} single-cell items and answered ${String(overfull.refusal)} to one more`,
      )
    }
    const gemPage = stash.pages.find((page) => page.id === 'gems')
    const gemSlot = gemPage?.slots[0]
    if (gemPage === undefined || gemSlot === undefined) {
      problems.push('the layout names no gems page with a slot')
    } else {
      const own = model.deposit(gemPage.id, item(gemSlot.itemCode, 'normal'), stashSlot(gemSlot.itemCode))
      const wrong = model.deposit(gemPage.id, item('rin', 'normal'), stashSlot(gemSlot.itemCode))
      if (!own.ok || wrong.refusal !== 'wrong-item') {
        problems.push(
          `the ${gemSlot.itemCode} slot answered ${String(own.refusal)} to its own item and ` +
            `${String(wrong.refusal)} to a ring`,
        )
      }
      if (!model.withdraw('personal', stashCell(0, 0)).ok) {
        problems.push('withdrawing a filled cell did not work')
      }
      if (model.withdraw('personal', stashCell(0, 0)).refusal !== 'empty') {
        problems.push('withdrawing an emptied cell did not answer "empty"')
      }
      if (model.withdrawGold(1).refusal !== 'short-stack') {
        problems.push('withdrawing gold the stash does not hold did not answer "short-stack"')
      }
      console.log(
        `economy: the stash model fills ${placed} cells, answers "full" to one more, takes ` +
          `${gemSlot.itemCode} only in its own slot, and refuses gold it does not hold`,
      )
    }
  }

  // The classic bank layout, which the expansion one is based on, states 6 x 4 —
  // which is inventory.txt's Bank Page 1.
  const classicCells = rawCellCount(
    parseJsonc(readFileSync(join(LAYOUTS, 'bankoriginallayouthd.json'), 'utf8')),
    'grid',
  )
  const bankRow = rows('table_inventory.json').find((entry) => entry['class'] === 'Bank Page 1')
  if (classicCells !== null && Number(bankRow?.['gridX']) !== classicCells.x) {
    problems.push(
      `bankoriginallayouthd's grid is ${classicCells.x} x ${classicCells.y} but inventory.txt says ` +
        `${String(bankRow?.['gridX'])} x ${String(bankRow?.['gridY'])}`,
    )
  }
  console.log(
    `economy: bankoriginallayouthd grid ${String(classicCells?.x)} x ${String(classicCells?.y)}, ` +
      `inventory.txt Bank Page 1 ${String(bankRow?.['gridX'])} x ${String(bankRow?.['gridY'])}`,
  )

  /* ----------------------------------------------------------------- hireling */

  const hirelingRows = rows('table_hireling.json')
  const hirelings = parseHirelings(hirelingRows, {
    monstats,
    strings: {
      names: parseStringTable(strings('strings_mercenaries.json')),
      descriptions: parseStringTable([
        ...strings('strings_ui.json'),
        ...strings('strings_skills.json'),
      ]),
    },
  })
  const withCost = hirelings.rows.filter((row) => row.gold > 0)
  console.log(
    `economy: hireling ${hirelingRows.length} rows → ${hirelings.rows.length} hireable, ` +
      `${withCost.length} with a cost, ${hirelings.rows.length - withCost.length} without`,
  )
  for (const row of hirelings.rows.filter((entry) => entry.gold <= 0)) {
    problems.push(`hireling ${row.kind} act ${row.act} level ${String(row.level)} has no cost`)
  }
  for (const problem of hirelings.problems) {
    problems.push(`hireling row (${problem.why}): ${problem.detail}`)
  }
  console.log(
    `economy: hireling Class → monstats: ${hirelings.monsters.size} Hireable monsters ` +
      `[${[...hirelings.monsters.values()].map((monster) => `${monster.index} ${monster.id}`).join(', ')}]`,
  )
  const sellerCodes = [150, 198, 252, 515]
  console.log(
    `economy: hireling Seller → monstats npc: [${sellerCodes
      .map((code) => `${code} ${hirelings.sellers.get(code) ?? '(unresolved)'}`)
      .join(', ')}]`,
  )
  for (const code of sellerCodes) {
    if (hirelings.sellers.get(code) === undefined) {
      problems.push(`no monstats npc row for Seller ${code}`)
    }
  }
  for (const act of [1, 2, 3, 5]) {
    for (const difficulty of [1, 2, 3]) {
      const roster = hirelings.roster(act, difficulty)
      if (roster.length === 0) {
        problems.push(`act ${act} difficulty ${difficulty} has no hireable row`)
        continue
      }
      if (difficulty === 1) {
        console.log(
          `  act ${act} normal: ${roster.length} rows, ` +
            `${[...new Set(roster.map((row) => row.kind))].join('/')}, ` +
            `levels ${[...new Set(roster.map((row) => row.level))].join(', ')}, ` +
            `costs ${[...new Set(roster.map((row) => row.gold))].join(', ')}`,
        )
      }
    }
  }
  // Every row's description key has to resolve in one of the two string tables, since
  // the panel shows it.
  const described = hirelings.rows.filter((row) => row.hireDesc !== null)
  const missingDesc = described.filter((row) => row.hireDescText === null)
  if (missingDesc.length > 0) {
    problems.push(
      'hireling HireDesc keys that resolve in neither strings_ui nor strings_skills: ' +
        [...new Set(missingDesc.map((row) => row.hireDesc))].join(', '),
    )
  }
  console.log(
    `economy: hireling HireDesc keys resolved ${described.length - missingDesc.length} of ${described.length} ` +
      `(the other ${hirelings.rows.length - described.length} rows have no key)`,
  )

  // The name ranges partition strings_mercenaries.
  const names = parseStringTable(strings('strings_mercenaries.json'))
  const reachable = new Set<string>()
  for (const row of hirelings.rows) for (const key of hirelingNameKeys(row, names)) reachable.add(key)
  const keys = strings('strings_mercenaries.json')
    .map((row) => row['Key'])
    .filter((key): key is string => typeof key === 'string')
  const missed = keys.filter((key) => !reachable.has(key))
  if (missed.length > 0) problems.push(`strings_mercenaries keys no hireling row can draw: ${missed.join(', ')}`)
  const ranges = new Set(hirelings.rows.map((row) => `${String(row.nameFirst)}…${String(row.nameLast)}`))
  console.log(
    `economy: hireling names: ${ranges.size} ranges covering ${reachable.size} of strings_mercenaries' ${keys.length} keys`,
  )

  // What the /Lvl columns actually reproduce.
  for (const entry of hirelings.growth) {
    const note =
      entry.confirmed === entry.pairs
        ? 'every pair'
        : entry.confirmed === 0
          ? 'no pair'
          : `${entry.confirmed} of ${entry.pairs}`
    console.log(
      `economy: growth ${`${entry.column} (${entry.levelColumn})`.padEnd(30)} reproduces the next row ${note}` +
        (entry.exceptions.length > 0 ? `; e.g. ${entry.exceptions[0]}` : ''),
    )
  }
  const rogue = hirelings.roster(1, 1).find((row) => row.level === 3 && row.subType === 'Fire - Normal')
  const later = hirelings.roster(1, 1).find((row) => row.level === 36 && row.subType === 'Fire - Normal')
  if (rogue === undefined || later === undefined) {
    problems.push('the act 1 Rogue Scout has no level 3 and level 36 row to check growth against')
  } else {
    const hp = hirelings.growth.filter((entry) => entry.stat === 'hp')
    const grown = hirelingStatsAt(rogue, 36, hp).hp
    if (grown !== later.stats.hp) {
      problems.push(`HP/Lvl at level 36 gives ${grown}, but the level 36 row states ${later.stats.hp}`)
    }
    if (hirelingStatsAt(rogue, 36).hp !== rogue.stats.hp) {
      problems.push('hirelingStatsAt grew a column without being asked to')
    }
    console.log(
      `economy: HP/Lvl: the level 3 row states ${rogue.stats.hp}, growing it to level 36 gives ${grown}, ` +
        `and the level 36 row states ${later.stats.hp}`,
    )
  }

  /* ------------------------------------------------------- hireling equipment */

  const slots = readHirelingSlots(layout('hirelinginventorypanelhd.json'))
  const inventorySlots = ['head', 'torso', 'rArm', 'lArm']
  const hirelingRow = rows('table_inventory.json').find((entry) => entry['class'] === 'Hireling')
  if (slots.slots.length !== 4) {
    problems.push(`hirelinginventorypanelhd names ${slots.slots.length} slots with a location, not 4`)
  }
  console.log(
    `economy: hireling slots ${slots.slots
      .map((slot) => `${slot.name} (${slot.location} -> ${String(slot.bodyLocation)})`)
      .join(', ')}`,
  )
  for (const field of inventorySlots) {
    const width = Number(hirelingRow?.[`${field}Width`])
    if (!Number.isFinite(width) || width <= 0) {
      problems.push(`inventory.txt's Hireling row has no ${field} slot`)
    }
  }
  console.log(
    `economy: inventory.txt Hireling row names ${inventorySlots.join(', ')} — the same four slots`,
  )

  const ironWolf = hirelings.monsters.get(359)
  const rogueMonster = hirelings.monsters.get(271)
  const shield = index.bases.get('bsh')
  const rightArm = slots.slots.find((slot) => slot.location === 'right_arm')
  const leftArm = slots.slots.find((slot) => slot.location === 'left_arm')
  const head = slots.slots.find((slot) => slot.location === 'head')
  const sword = index.bases.get('ssd')
  const bow = index.bases.get('lwb')
  const cap = index.bases.get('cap')
  if (
    ironWolf === undefined ||
    rogueMonster === undefined ||
    shield === undefined ||
    rightArm === undefined ||
    leftArm === undefined ||
    head === undefined ||
    sword === undefined ||
    bow === undefined ||
    cap === undefined
  ) {
    problems.push('the arm-slot check has no Iron Wolf, Rogue, arm slot, head slot, sword, shield, bow or cap')
  } else {
    const checks: readonly (readonly [boolean, string])[] = [
      [hirelingAccepts(ironWolf, rightArm, sword, index), "the Iron Wolf's right arm refused a sword"],
      [hirelingAccepts(ironWolf, leftArm, shield, index), "the Iron Wolf's left arm refused a shield"],
      [!hirelingAccepts(ironWolf, leftArm, bow, index), "the Iron Wolf's left arm took a bow"],
      [hirelingAccepts(rogueMonster, rightArm, bow, index), "the Rogue's right arm refused a bow"],
      [!hirelingAccepts(rogueMonster, leftArm, bow, index), "the Rogue's left arm (none) took a bow"],
      [hirelingAccepts(rogueMonster, head, cap, index), "the Rogue's head slot refused a cap"],
    ]
    for (const entry of checks) if (!entry[0]) problems.push(entry[1])
    console.log(
      `economy: arm slots: Rogue ${String(rogueMonster.rightArmItemType)}/${String(rogueMonster.leftArmItemType)}, ` +
        `Iron Wolf ${String(ironWolf.rightArmItemType)}/${String(ironWolf.leftArmItemType)} — the monstats columns`,
    )
  }

  /* --------------------------------------------------------------------- done */

  console.log(`economy: reported exceptions (the export's own state, not failures): ${exceptions.length}`)
  for (const exception of exceptions) console.log(`  ${exception}`)
  for (const problem of problems) console.error(`  ${problem}`)
  if (problems.length > 0) {
    console.error('verify-economy: FAILED')
    process.exitCode = 1
    return
  }
  console.log('verify-economy: OK')
}

main()
