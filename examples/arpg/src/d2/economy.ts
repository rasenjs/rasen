/**
 * The three economies the retail export describes and this build had no model of:
 * the stash, a vendor's store page, and a hireling.
 *
 * Everything below is the game's own data. Each part is independent and optional:
 * a missing table or a missing layout leaves that part at "not modelled" and says
 * which source is absent, rather than filling the gap with a plausible number.
 *
 * ## What the data says, and where that was established
 *
 * ### The stash
 *
 * `bankexpansionlayouthd` (the Resurrected stash, `basedOn` the classic bank) is a
 * `BankPanel` whose content the layout states outright:
 *
 * - `BankTabs` — a `TabBarWidget` with `tabCount: 5` and `textStrings`
 *   `@personal`, `@shared`, `@gems`, `@materials`, `@runes`;
 * - `basicstash_container > grid` — an `InventoryGridWidget` with
 *   `cellCount: {x: 10, y: 10}` and `cellSize: $ItemCellSize` (98 units): the
 *   personal page, and the same grid the shared tabs show (its panel background is
 *   `PANEL\Stash\StashPanel_BG_Personal`);
 * - `SharedStashTabContainer > StashNavigation` — the *only* thing the layout says
 *   about shared pages: a left button, a right button and a `@SharedStashPage`
 *   caption ("Page %u / %u"). **No exported table states how many shared pages
 *   there are**, so the count is a parameter of {@link readStashLayout};
 * - `advancedstash_gems` (35 slots), `advancedstash_materials` (23) and
 *   `advancedstash_runes` (33) — `AdvancedStashSlotWidget`s, each with an
 *   `itemCode` and a rect. Those 91 codes are *exactly* the set of `misc.txt` rows
 *   whose `AdvancedStashStackable` column is 1 (91 rows, verified by
 *   `tools/verify-economy.ts`), and their `UICategory` splits them the way the
 *   layout does: gems 35 = `gems`, runes 33 = `runes`, and the remaining 23 span
 *   `uberm` (11), `terrt` (5), `absol` (5) and `potis` (2);
 * - `advancedstash_horadriccube > horadriccube_grid` — an `InventoryGridWidget`
 *   with `cellCount: {x: 3, y: 4}`, i.e. **3 columns by 4 rows, 12 cells**. That is
 *   not a guess: `inventory.txt`'s own `Transmogrify Box Page 1` row states
 *   `gridX: 3`, `gridY: 4`, and the classic `horadriccubelayouthd` states the same
 *   3 x 4. (The 1.09-era stash, `Bank Page 1`, is 6 x 4 and the expansion stash,
 *   `Big Bank Page 1`, is 10 x 10 — the same `inventory.txt` columns, which is what
 *   fixes the orientation of the layout's `cellCount`: `x` is across, `y` is down.)
 *
 * The layout's `onClickMessage` fields name the operations the panel has:
 * `BankPanelMessage:Withdraw` (the gold button), `WithdrawStash` (the cube's
 * withdraw button), `Convert` (the cube's transmute), `SharedStashLeft`,
 * `SharedStashRight`, `TogglePreviousSeasonTabs`. This module models deposit,
 * withdraw and move; see {@link StashLayout.unmodelled} for the rest.
 *
 * ### A vendor
 *
 * `storepage` maps a page's name to a code — four rows in this export: `Armor Page`
 * (`armo`), `Weapons Page` (`weap`), `Magic Page` (`mag`) and `Misc Page` (`misc`) —
 * and that code is `itemtypes.StorePage`'s vocabulary. A page is therefore a set of
 * item types (`itemtypes` marks 14 types `armo`, 18 `weap` and 47 `misc`) and so a
 * set of base items: 217 armor rows for `armo`, 270 weapon rows for `weap` and 161
 * rows (125 `misc` and 36 `weapons`) for `misc`. **Magic Page is the export's own
 * gap**: no `itemtypes` row carries the code `mag`, so the page has no types and no
 * items, and the verification tool names it rather than inventing stock for it.
 *
 * A base item is taken by the page its *own* `type` cell names. `itemtypes`'s
 * `Equiv1`/`Equiv2` point upward (`Axe` is equivalent to `mele`, `Boots` to `armo`),
 * so following them would put the 30 throwing weapons — whose own types `tkni`,
 * `taxe`, `jave` and `ajav` are misc types — on the weapons page as well; that
 * wider reading is reported per page as {@link StorePage.relatedBases} instead of
 * being merged in.
 *
 * What a vendor *always* stocks is a column, not a guess: `PermStoreItem` is 1 on
 * 24 `misc.txt` rows (the potion and scroll tiers, tomes, keys, arrows and bolts),
 * on 6 `weapons.txt` rows (the throwing potions) and on 6 `armor.txt` rows (four
 * pairs of boots and two belts) — the last six all of whose types are marked
 * `armo`, which is why the armour page has a permanent stock and the weapons page
 * has none.
 *
 * Prices come from `npc` (17 rows, one per selling NPC, keyed by the name
 * `monstats` gives the same `Id`). Its columns are `buy mult`, `sell mult`,
 * `rep mult` — all in 1024ths of the item's `cost` — three `questflag`/`quest…mult`
 * column sets, and `max buy`, `max buy (N)`, `max buy (H)` (with a space: `monstats`
 * spells the same difficulty `Level(N)` with none). The direction is documented on
 * {@link TradeDirection}; the 15 rows whose quest set contradicts it are counted by
 * the verification tool rather than hidden.
 *
 * `gamble` lists 121 base items in 122 rows (the last is the usual all-empty marker
 * row, named `Expansion`), and each has the item's own `gamble cost` column in
 * `weapons`/`armor`/`misc` — the vendor panel's refresh button is
 * `Gambling_Refresh_Button`, which is the same screen.
 *
 * ### A hireling
 *
 * `hireling` has 135 rows and 77 columns; each row is (kind, sub-type, version, act,
 * difficulty, level). `Class` is a `monstats` `*hcIdx` — 271 `roguehire`, 338
 * `act2hire`, 359 `act3hire`, 560 `act5hire1`, 561 `act5hire2` — and `Seller` is
 * `monstats` `*hcIdx` of the NPC who offers them (150 Kashya, 198 Greiz, 252
 * Asheara, 515 Qual-Kehk). `NameFirst`/`NameLast` are a *range* of
 * `strings_mercenaries` keys (`merc01` … `merc41`), the four ranges partitioning
 * that file's 149 keys exactly; `HireDesc` is a string key that resolves in
 * `strings_ui` (`strhirespecial1` = "Fire Arrow") or `strings_skills`
 * (`skillname99` = "Prayer").
 *
 * The equipment slots are the layout's: `hirelinginventorypanelhd` has four
 * `InventorySlotWidget`s with `location` fields — `head`, `torso`, `right_arm`,
 * `left_arm` — and `inventory.txt`'s `Hireling` row names the same four (head,
 * torso, rArm, lArm). What each arm may hold is `monstats`' own
 * `rightArmItemType`/`leftArmItemType` (`bow`/`none` for the Rogue, `sppl`/`none`
 * for the Desert Mercenary, `swor`/`shie` for the Iron Wolf).
 *
 * ## How a caller wires it up
 *
 * ```ts
 * // The stash: the panel's own widget tree, then a model over generated items.
 * const stash = readStashLayout(panelOf(loaded, 'bankexpansionlayouthd')?.widget, { sharedPages: 3 })
 * if (stash !== null) {
 *   const model = createStash(stash, { gold: game.hud.gold.value })
 *   model.deposit('personal', item, stashCell(0, 0))
 * }
 *
 * // A vendor: its page, its own row in `npc`, and the item level the caller knows.
 * const pages = parseStorePages(tableRows('table_storepage.json'), index)
 * const terms = parseNpcTerms(tableRows('table_npc.json'))
 * const stock = vendorStock({
 *   index, pages, page: 'armo', ilvl: 20, random, count: 10, terms: terms.byName.get('charsi'),
 * })
 *
 * // A hireling: the roster, its stats, and the panel's four slots.
 * const hirelings = parseHirelings(tableRows('table_hireling.json'), { monstats, strings })
 * const slots = readHirelingSlots(panelOf(loaded, 'hirelinginventorypanelhd')?.widget)
 * ```
 *
 * Three numbers come from the caller because **no table states them**: how many
 * shared pages exist, the shop's item level (`monstats`' 59 `npc: 1` rows carry no
 * `Level` at all) and how many items a shop stocks (the panel's grid is 10 x 10 and
 * `inventory.txt`'s trade page is 10 x 4, and neither says how many are filled).
 *
 * ## What is not modelled
 *
 * - **How many shared pages exist, and how much gold a stash holds.** No table
 *   states either; both are parameters. The gold figure the panel shows has no cap
 *   column in this export.
 * - **Which store pages an NPC offers.** The tables state pages and NPC price rows
 *   separately; nothing joins them (`monstats`' `npc` rows carry flags only:
 *   `interact`, `inventory`, `inTown`). The caller names the page it opens.
 * - **How many items a vendor stocks, and when it restocks.** `inventory.txt`'s
 *   trade page is 10 x 4 and the vendor panel's grid is 10 x 10, but no column says
 *   how many are stocked; the panel's `VendorPanelMessage:RefreshAll` button is the
 *   only refresh the export names. `PermStoreItem` is modelled as "always stocked".
 * - **The cube's recipes.** `cubemain.txt` (227 rows) is exported; matching it is
 *   not part of this module, and {@link Stash.transmute} refuses and says so.
 * - **Affix and socket contributions to an item's price.** `magicprefix`,
 *   `magicsuffix` and `automagic` carry no cost columns at all, so a price is the
 *   base item's `cost` (plus a unique's or set item's own two columns — see
 *   {@link itemCost}).
 * - **A mercenary's skill levels between the table's rows.** `hireling`'s `Level1`…
 *   `Level6` state a skill's level at that row's own level, and `LvlPerLvl1`… carry
 *   a per-level growth whose unit (10, 5, 7 and 0 all occur) no export describes.
 * - **A mercenary's stats between the table's rows.** The `/Lvl` columns do not
 *   survive their own table: `base + perLevel * ΔLevel` reproduces the next row's
 *   stated value for `HP/Lvl` and `AR/Lvl` 59 times out of 60, for `Def/Lvl` 44 of
 *   60, and for `Str/Lvl`, `Dex/Lvl`, `Dmg/Lvl` and all four `Resist…/Lvl` **0 of
 *   60**. So {@link HirelingRow.stats} are the stated values and
 *   {@link hirelingStatsAt} grows a column only when a caller asks, using the
 *   evidence in {@link HirelingTable.growth}.
 */

import {
  makeItem,
  type Item,
  type ItemBase,
  type ItemIndex,
  type ItemTableRow,
  type Random,
} from './items'
import { tableNumber, tableString, type Difficulty, type TableRow } from './monsters'
import { difficultySuffix, type DifficultyName } from './difficulty'
import type { StringTable } from './stats'
import { findByName, fieldPair, type UiWidget } from './ui/widget'
import { rectOf } from './ui/layout'

/* -------------------------------------------------------------------------- */
/* Cells                                                                      */
/* -------------------------------------------------------------------------- */

/** A cell read as a string, or null when it is blank. */
function cellText(row: TableRow | ItemTableRow, column: string): string | null {
  return tableString(row[column] ?? null)
}

/** A cell read as a number, or null when it is blank or not a number. */
function cellNumber(row: TableRow | ItemTableRow, column: string): number | null {
  return tableNumber(row[column] ?? null)
}

/** A cell read as the game's flag: only a `1` is true, an empty cell is not. */
function cellFlag(row: TableRow | ItemTableRow, column: string): boolean {
  return cellNumber(row, column) === 1
}

/* -------------------------------------------------------------------------- */
/* Stash: the layout                                                          */
/* -------------------------------------------------------------------------- */

/** Which of the layout's own sections a page came from. */
export type StashPageKind = 'personal' | 'shared' | 'advanced' | 'cube'

/**
 * One named slot of an advanced-stash page, as the layout states it.
 *
 * The slot's `itemCode` is the layout's field name for the item's base code
 * (`gcw`, `r01`, …). Every one of the 91 slots names a `misc.txt` row whose
 * `AdvancedStashStackable` column is 1, and the two sets are equal.
 */
export interface StashSlot {
  /** The layout's widget name, which is the same string as `itemCode` in all 91. */
  readonly name: string
  readonly itemCode: string
  /** The layout's own rect, in layout units, not pixels. */
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface StashPage {
  /** `personal`, `shared:1`…, the section's own name (`gems`), or `cube`. */
  readonly id: string
  readonly kind: StashPageKind
  /** The tab caption's string key (`@gems`) where the layout has one, else its widget name. */
  readonly label: string
  /** The page's index in the layout's `BankTabs` bar, or null when it has no tab. */
  readonly tab: number | null
  /** Grid pages: `cellCount.x`, columns across. Null for a slot page. */
  readonly columns: number | null
  /** Grid pages: `cellCount.y`, rows down. Null for a slot page. */
  readonly rows: number | null
  /** Grid pages: the grid's area. Slot pages: the number of slots the layout names. */
  readonly cells: number
  /** The named slots, in the layout's order. Empty for a grid page. */
  readonly slots: readonly StashSlot[]
}

/** A button the layout itself carries, named by the message it sends. */
export interface StashOperation {
  readonly widget: string
  readonly message: string
}

export interface StashLayoutOptions {
  /**
   * How many shared pages to model.
   *
   * **No exported table states a number.** The layout gives the shared stash
   * navigation (`StashNavigation`'s two arrows and `@SharedStashPage` = "Page
   * %u / %u") and the tab bar's `@shared` caption, and nothing else; the shared
   * tabs show the same `basicstash_container > grid` the personal page does. So the
   * count is the caller's, and with none stated there are no shared pages rather
   * than three invented ones.
   */
  readonly sharedPages?: number
}

export interface StashLayout {
  /** The pages, in the layout's tab order: personal, shared, gems, materials, runes, cube. */
  readonly pages: readonly StashPage[]
  /** The `BankTabs` bar's own `textStrings`, in tab order. */
  readonly tabs: readonly string[]
  /** Every `onClickMessage` the panel carries. */
  readonly operations: readonly StashOperation[]
  /** What the layout has that this model does not use, with the reason. */
  readonly unmodelled: readonly string[]
  readonly sharedPages: number
}

/** The advanced-stash section names, which are also the page ids. */
const ADVANCED_SECTIONS: readonly string[] = ['gems', 'materials', 'runes']

/** Collects a widget's `onClickMessage`, if it has one. */
function messageOf(widget: UiWidget): string | null {
  const value = widget.fields['onClickMessage']
  return typeof value === 'string' && value !== '' ? value : null
}

/** Every `onClickMessage` in a widget tree, depth first. */
function collectOperations(root: UiWidget): StashOperation[] {
  const out: StashOperation[] = []
  const stack: UiWidget[] = [root]
  while (stack.length > 0) {
    const current = stack.pop() as UiWidget
    const message = messageOf(current)
    if (message !== null) out.push({ widget: current.name, message })
    for (const child of current.children) stack.push(child)
  }
  return out
}

/** The `textStrings` of a tab bar, as strings. */
function tabStrings(widget: UiWidget | undefined): readonly string[] {
  const value = widget?.fields['textStrings']
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

/** The `AdvancedStashSlotWidget` children of a section, in file order. */
function slotsOf(section: UiWidget | undefined): StashSlot[] {
  if (section === undefined) return []
  const out: StashSlot[] = []
  for (const child of section.children) {
    if (child.type !== 'AdvancedStashSlotWidget') continue
    const code = child.fields['itemCode']
    if (typeof code !== 'string' || code === '') continue
    const rect = rectOf(child)
    out.push({
      name: child.name,
      itemCode: code,
      x: rect.x ?? 0,
      y: rect.y ?? 0,
      width: rect.width ?? 0,
      height: rect.height ?? 0,
    })
  }
  return out
}

/**
 * Reads the stash out of the layout the panel loads.
 *
 * `root` is the layout's own widget tree — `ui/layout.ts`'s `ResolvedWidget.widget`
 * when the caller has already resolved the panel — and the returned model is plain
 * data, so it can be built and tested without a DOM.
 *
 * Returns null when the panel's own personal grid is absent: the layout is the
 * only source for a page's size, so without it there is nothing to model and the
 * caller keeps whatever it drew before.
 */
export function readStashLayout(
  root: UiWidget,
  options: StashLayoutOptions = {},
): StashLayout | null {
  const container = findByName(root, 'basicstash_container')
  const grid = container === undefined ? undefined : findByName(container, 'grid')
  const gridCells = grid === undefined ? undefined : fieldPair(grid.fields, 'cellCount')
  if (gridCells === undefined || gridCells.x <= 0 || gridCells.y <= 0) return null

  const tabs = tabStrings(findByName(root, 'BankTabs'))
  const sharedPages = Math.max(0, Math.trunc(options.sharedPages ?? 0))
  const unmodelled: string[] = []

  const pages: StashPage[] = []
  const gridPage = (id: string, kind: StashPageKind, tab: number | null, label: string): StashPage => ({
    id,
    kind,
    label,
    tab,
    columns: gridCells.x,
    rows: gridCells.y,
    cells: gridCells.x * gridCells.y,
    slots: [],
  })
  pages.push(gridPage('personal', 'personal', tabs.length > 0 ? 0 : null, tabs[0] ?? '@personal'))
  for (let page = 1; page <= sharedPages; page += 1) {
    // The shared tabs show the personal grid: the layout states one grid and the
    // shared container holds navigation only.
    pages.push(gridPage(`shared:${page}`, 'shared', tabs.length > 0 ? 1 : null, tabs[1] ?? '@shared'))
  }
  if (sharedPages === 0 && findByName(root, 'SharedStashTabContainer') !== undefined) {
    unmodelled.push(
      'shared pages: the layout states navigation only (StashNavigation arrows, ' +
        '"@SharedStashPage" = "Page %u / %u") and no count, so pass `sharedPages`',
    )
  }

  for (const name of ADVANCED_SECTIONS) {
    const section = findByName(root, `advancedstash_${name}`)
    if (section === undefined) {
      unmodelled.push(`page ${name}: the layout has no advancedstash_${name} widget`)
      continue
    }
    const slots = slotsOf(section)
    const tab = tabs.indexOf(`@${name}`)
    pages.push({
      id: name,
      kind: 'advanced',
      label: tab >= 0 ? (tabs[tab] as string) : name,
      tab: tab >= 0 ? tab : null,
      columns: null,
      rows: null,
      cells: slots.length,
      slots,
    })
  }

  const cubeGrid = findByName(root, 'horadriccube_grid')
  const cubeCells = cubeGrid === undefined ? undefined : fieldPair(cubeGrid.fields, 'cellCount')
  if (cubeCells !== undefined && cubeCells.x > 0 && cubeCells.y > 0) {
    pages.push({
      id: 'cube',
      kind: 'cube',
      label: 'advancedstash_horadriccube',
      tab: null,
      columns: cubeCells.x,
      rows: cubeCells.y,
      cells: cubeCells.x * cubeCells.y,
      slots: [],
    })
  } else {
    unmodelled.push('the Horadric Cube: the layout has no horadriccube_grid with a cellCount')
  }

  const operations = collectOperations(root)
  if (operations.some((entry) => entry.message === 'BankPanelMessage:Convert')) {
    unmodelled.push(
      "transmute: the cube's Convert button sends BankPanelMessage:Convert, and the recipes it " +
        'would match against live in cubemain.txt, which this module does not read',
    )
  }

  return { pages, tabs, operations, unmodelled, sharedPages }
}

/* -------------------------------------------------------------------------- */
/* Stash: the model                                                           */
/* -------------------------------------------------------------------------- */

/** Where in a page something goes. */
export type StashAddress =
  | { readonly kind: 'cell'; readonly column: number; readonly row: number }
  | { readonly kind: 'slot'; readonly slot: string }

/** A grid address. */
export function stashCell(column: number, row: number): StashAddress {
  return { kind: 'cell', column, row }
}

/** A named-slot address, by the slot's name or by its item code (they agree here). */
export function stashSlot(slot: string): StashAddress {
  return { kind: 'slot', slot }
}

/** One item sitting in a page, at the address it was put at. */
export interface StashPlacement {
  readonly address: StashAddress
  readonly item: Item
  /** How many of `item` sit there: a stack's size, 1 for a single item. */
  readonly count: number
}

/** Why a stash operation did not happen. */
export type StashRefusal =
  | 'unknown-page'
  | 'unknown-slot'
  | 'cell-address'
  | 'slot-address'
  | 'out-of-bounds'
  | 'occupied'
  | 'full'
  | 'empty'
  | 'wrong-item'
  | 'short-stack'
  | 'not-modelled'

export interface StashResult {
  readonly ok: boolean
  /** Null when `ok`. */
  readonly refusal: StashRefusal | null
  /** A sentence naming the page, the address and the item, for a panel or a log. */
  readonly message: string
  /** The item the operation moved or handed back, when it moved one. */
  readonly item: Item | null
  /** How many of it, for a stack. */
  readonly count: number
}

/**
 * The stash as a pure model over generated items: no DOM, no layout resolution.
 *
 * Grid pages (personal, shared, the cube) place an item's `invwidth` x `invheight`
 * footprint and stack a `stackable` base up to its `maxstack`, both of which are
 * `weapons`/`armor`/`misc` columns. Advanced pages take one base code per slot —
 * the layout's `itemCode` — and hold a stack of it uncapped, because
 * `AdvancedStashStackable` says stackable and no column states a cap.
 */
export interface Stash {
  readonly layout: StashLayout
  /** The pages, as read. */
  pages(): readonly StashPage[]
  /** What is on one page. A copy; mutating it changes nothing. */
  placements(pageId: string): readonly StashPlacement[]
  /** How many legal origins a page has left for this item — 0 means full. */
  freePositions(pageId: string, item: Item): number
  /**
   * Puts an item at an address, stacking it onto a matching item already there.
   *
   * How many arrive is the item's own `quantity` for a stackable base (an Arrows
   * drop carries 250) and one otherwise. A refusal changes nothing.
   */
  deposit(pageId: string, item: Item, address: StashAddress): StashResult
  /**
   * Takes an item (or `count` of a stack) out, or refuses with `'empty'` when there
   * is nothing at that address and `'short-stack'` when there is less than asked.
   */
  withdraw(pageId: string, address: StashAddress, count?: number): StashResult
  /** Withdraw and deposit in one step; a refused destination leaves the source alone. */
  move(
    fromPage: string,
    from: StashAddress,
    toPage: string,
    to: StashAddress,
  ): StashResult
  /** Gold in the stash. The panel draws it in `basicstash_container > gold_amount`. */
  gold(): number
  depositGold(amount: number): StashResult
  /** `basicstash_container > gold_withdraw` (`BankPanelMessage:Withdraw`). */
  withdrawGold(amount: number): StashResult
  /**
   * The cube's `Convert` button (`BankPanelMessage:Convert`).
   *
   * Always refuses: `cubemain.txt` holds the recipes and this module does not match
   * them. It exists so a caller can wire the button up and show the panel's own
   * answer instead of a silent no-op.
   */
  transmute(): StashResult
}

interface PageState {
  readonly page: StashPage
  readonly placements: StashPlacement[]
}

function ok(message: string, item: Item | null = null, count = 0): StashResult {
  return { ok: true, refusal: null, message, item, count }
}

function refuse(refusal: StashRefusal, message: string): StashResult {
  return { ok: false, refusal, message, item: null, count: 0 }
}

/** The cell keys a placement covers. */
function coveredCells(address: StashAddress, item: Item): string[] {
  if (address.kind !== 'cell') return []
  const keys: string[] = []
  for (let column = 0; column < Math.max(1, item.base.invWidth); column += 1) {
    for (let row = 0; row < Math.max(1, item.base.invHeight); row += 1) {
      keys.push(`${address.column + column},${address.row + row}`)
    }
  }
  return keys
}

/** How many of one item a cell holds: `maxstack` for a stackable base, else 1. */
function stackCap(item: Item): number {
  if (!item.base.stackable) return 1
  return Math.max(1, item.base.maxStack)
}

/**
 * Builds the stash over a layout, with an optional starting gold.
 *
 * The model is the storage only: it never looks at the player's inventory, so a
 * caller moves an item in with `deposit` and out with `withdraw`, which is the same
 * pair of operations the layout's own buttons send (`BankPanelMessage:Withdraw`,
 * `WithdrawStash`).
 */
export function createStash(layout: StashLayout, options: { gold?: number } = {}): Stash {
  const states = new Map<string, PageState>()
  for (const page of layout.pages) states.set(page.id, { page, placements: [] })
  let gold = Math.max(0, Math.trunc(options.gold ?? 0))

  const stateOf = (pageId: string): PageState | null => states.get(pageId) ?? null

  const slotOf = (page: StashPage, name: string): StashSlot | null =>
    page.slots.find((slot) => slot.name === name || slot.itemCode === name) ?? null

  const occupancy = (state: PageState): Set<string> => {
    const taken = new Set<string>()
    for (const placement of state.placements) {
      for (const key of coveredCells(placement.address, placement.item)) taken.add(key)
    }
    return taken
  }

  /** Whether a placement can go at `address`, and why not when it cannot. */
  const check = (
    state: PageState,
    item: Item,
    count: number,
    address: StashAddress,
  ): StashRefusal | null => {
    const page = state.page
    if (page.slots.length > 0) {
      if (address.kind !== 'slot') return 'slot-address'
      const slot = slotOf(page, address.slot)
      if (slot === null) return 'unknown-slot'
      if (slot.itemCode !== item.base.code) return 'wrong-item'
      return null
    }
    if (address.kind !== 'cell') return 'cell-address'
    const columns = page.columns ?? 0
    const rows = page.rows ?? 0
    if (
      address.column < 0 ||
      address.row < 0 ||
      address.column >= columns ||
      address.row >= rows ||
      address.column + Math.max(1, item.base.invWidth) > columns ||
      address.row + Math.max(1, item.base.invHeight) > rows
    ) {
      return 'out-of-bounds'
    }
    const taken = occupancy(state)
    const own = state.placements.find(
      (placement) =>
        placement.address.kind === 'cell' &&
        placement.address.column === address.column &&
        placement.address.row === address.row &&
        placement.item.base.code === item.base.code,
    )
    // A same-code stack at the very cell is a merge, which is legal while it fits.
    if (own !== undefined) return own.count + count > stackCap(own.item) ? 'full' : null
    if (coveredCells(address, item).some((key) => taken.has(key))) return 'occupied'
    return null
  }

  /** Whether the page has room for this item anywhere. */
  const hasRoom = (state: PageState, item: Item): boolean => {
    const page = state.page
    if (page.slots.length > 0) {
      return page.slots.some(
        (slot) =>
          slot.itemCode === item.base.code &&
          state.placements.every((placement) => placement.address.kind !== 'slot' || placement.address.slot !== slot.name),
      )
    }
    const columns = page.columns ?? 0
    const rows = page.rows ?? 0
    for (let column = 0; column < columns; column += 1) {
      for (let row = 0; row < rows; row += 1) {
        if (check(state, item, 1, { kind: 'cell', column, row }) === null) return true
      }
    }
    return false
  }

  const place = (state: PageState, item: Item, count: number, address: StashAddress): void => {
    const page = state.page
    if (page.slots.length > 0 && address.kind === 'slot') {
      const slot = slotOf(page, address.slot)
      const existing = state.placements.find(
        (placement) => placement.address.kind === 'slot' && placement.address.slot === slot?.name,
      )
      if (existing !== undefined) {
        state.placements.splice(state.placements.indexOf(existing), 1, {
          address: existing.address,
          item: existing.item,
          count: existing.count + count,
        })
        return
      }
    }
    if (address.kind === 'cell') {
      const merge = state.placements.find(
        (placement) =>
          placement.address.kind === 'cell' &&
          placement.address.column === address.column &&
          placement.address.row === address.row &&
          placement.item.base.code === item.base.code,
      )
      if (merge !== undefined) {
        state.placements.splice(state.placements.indexOf(merge), 1, {
          address: merge.address,
          item: merge.item,
          count: merge.count + count,
        })
        return
      }
    }
    state.placements.push({ address, item, count })
  }

  const describe = (address: StashAddress): string =>
    address.kind === 'cell' ? `cell ${address.column},${address.row}` : `slot "${address.slot}"`

  const deposit = (pageId: string, item: Item, address: StashAddress): StashResult => {
    const state = stateOf(pageId)
    if (state === null) return refuse('unknown-page', `no page "${pageId}" in the layout`)
    const count = Math.max(1, Math.trunc(item.quantity) || 1)
    const refusal = check(state, item, count, address)
    if (refusal === 'occupied' && !hasRoom(state, item)) {
      return refuse('full', `page "${pageId}" is full: ${state.page.cells} cells, none free for ${item.base.code}`)
    }
    if (refusal !== null) {
      return refuse(refusal, `cannot deposit ${item.name} at ${describe(address)} of "${pageId}": ${refusal}`)
    }
    place(state, item, count, address)
    return ok(`deposited ${item.name} x${count} at ${describe(address)} of "${pageId}"`, item, count)
  }

  const withdraw = (pageId: string, address: StashAddress, count?: number): StashResult => {
    const state = stateOf(pageId)
    if (state === null) return refuse('unknown-page', `no page "${pageId}" in the layout`)
    const index = state.placements.findIndex((placement) => {
      if (placement.address.kind === 'slot' && address.kind === 'slot') {
        return placement.address.slot === address.slot
      }
      if (placement.address.kind === 'cell' && address.kind === 'cell') {
        return coveredCells(placement.address, placement.item).includes(
          `${address.column},${address.row}`,
        )
      }
      return false
    })
    if (index < 0) return refuse('empty', `nothing at ${describe(address)} of "${pageId}"`)
    const placement = state.placements[index] as StashPlacement
    const available = Math.max(1, placement.count)
    const wanted = count === undefined ? available : Math.trunc(count)
    if (wanted <= 0) return refuse('empty', `withdrawing ${wanted} of ${placement.item.name}`)
    if (wanted > available) {
      return refuse(
        'short-stack',
        `${describe(address)} of "${pageId}" holds ${available} of ${placement.item.name}, not ${wanted}`,
      )
    }
    const taken: Item =
      wanted === available ? placement.item : { ...placement.item, quantity: wanted }
    if (wanted === available) state.placements.splice(index, 1)
    else {
      state.placements.splice(index, 1, {
        address: placement.address,
        item: placement.item,
        count: available - wanted,
      })
    }
    return ok(`withdrew ${taken.name} x${wanted} from ${describe(address)} of "${pageId}"`, taken, wanted)
  }

  const freePositions = (pageId: string, item: Item): number => {
    const state = stateOf(pageId)
    if (state === null) return 0
    const page = state.page
    if (page.slots.length > 0) {
      return page.slots.filter(
        (slot) =>
          slot.itemCode === item.base.code &&
          state.placements.every(
            (placement) => placement.address.kind !== 'slot' || placement.address.slot !== slot.name,
          ),
      ).length
    }
    let free = 0
    for (let column = 0; column < (page.columns ?? 0); column += 1) {
      for (let row = 0; row < (page.rows ?? 0); row += 1) {
        if (check(state, item, 1, { kind: 'cell', column, row }) === null) free += 1
      }
    }
    return free
  }

  return {
    layout,
    pages: (): readonly StashPage[] => layout.pages,
    placements: (pageId: string): readonly StashPlacement[] => [
      ...(stateOf(pageId)?.placements ?? []),
    ],
    freePositions,
    deposit,
    withdraw,
    move: (fromPage, from, toPage, to): StashResult => {
      // Withdraw first, then deposit; if the destination refuses, the item goes back
      // where it came from, so a refused move changes nothing.
      const taken = withdraw(fromPage, from)
      if (!taken.ok) return taken
      const placed = deposit(toPage, taken.item as Item, to)
      if (!placed.ok) {
        const state = stateOf(fromPage)
        if (state !== null && taken.item !== null) place(state, taken.item, taken.count, from)
        return placed
      }
      return ok(`moved ${taken.item?.name ?? 'item'} from ${describe(from)} of "${fromPage}" to ${describe(to)} of "${toPage}"`, taken.item, taken.count)
    },
    gold: (): number => gold,
    depositGold: (amount: number): StashResult => {
      const value = Math.trunc(amount)
      if (value <= 0) return refuse('empty', `nothing to deposit: ${value} gold`)
      gold += value
      return ok(`deposited ${value} gold, the stash holds ${gold}`, null, value)
    },
    withdrawGold: (amount: number): StashResult => {
      const value = Math.trunc(amount)
      if (value <= 0) return refuse('empty', `nothing to withdraw: ${value} gold`)
      if (value > gold) {
        return refuse('short-stack', `the stash holds ${gold} gold, not ${value}`)
      }
      gold -= value
      return ok(`withdrew ${value} gold, the stash holds ${gold}`, null, value)
    },
    transmute: (): StashResult =>
      refuse(
        'not-modelled',
        'the Horadric Cube has no recipes here: cubemain.txt holds them and this model does not match them',
      ),
  }
}

/* -------------------------------------------------------------------------- */
/* A vendor: pages                                                            */
/* -------------------------------------------------------------------------- */

/** One `storepage` row, with the base items its types hold. */
export interface StorePage {
  /** The table's `Store Page` cell ("Armor Page"), or null for a code no row names. */
  readonly name: string | null
  /** The table's `Code` cell (`armo`), which is `itemtypes.StorePage`'s vocabulary. */
  readonly code: string
  /** The `itemtypes` type codes marked with this page, in table order. */
  readonly types: readonly string[]
  /**
   * The base items whose *own* type is one of {@link types}, in table order.
   *
   * The type is read directly rather than through `Equiv1`/`Equiv2`, and the reason
   * is in the data: those columns point *upward* (`Axe` is equivalent to `mele`,
   * `Boots` to `armo`), so following them would put a Throwing Axe — type `taxe`,
   * whose `Equiv1` is `comb` and `Equiv2` is `axe` — on the **weapons** page as well
   * as the misc page its own type names, and a page that overlaps another cannot be
   * "what a vendor of that page sells". {@link relatedBases} counts those and names
   * them, so the difference is visible instead of hidden.
   */
  readonly bases: readonly ItemBase[]
  /**
   * Bases whose own type names no page but whose equivalence chain reaches one of
   * {@link types} — the reading {@link bases} does not use. In this export 36
   * weapons rows are like this (the throwing knives, axes, javelins, potions and
   * amazon javelins, all of whose chains mention a weapons type).
   */
  readonly relatedBases: readonly ItemBase[]
}

export interface StorePageTable {
  /** The pages `storepage` itself names, in its order. */
  readonly pages: readonly StorePage[]
  /**
   * The `StorePage` codes `itemtypes` marks that no `storepage` row names. Empty in
   * this export: the table names all three codes `itemtypes` uses (`armo`, `weap`,
   * `misc`) and one it does not (`mag`).
   */
  readonly derived: readonly StorePage[]
  byCode: ReadonlyMap<string, StorePage>
  /** Both lists, by code. */
  all: ReadonlyMap<string, StorePage>
}

/**
 * Reads `storepage` and joins it to `itemtypes`.
 *
 * A page's code is an `itemtypes.StorePage` value: `armo`, `weap`, `mag` and `misc`
 * are the four rows here, and `itemtypes` marks types with the first, second and
 * fourth — **`mag` is the counter-example**, a page name whose code no type carries,
 * so it resolves to no items at all. A base item belongs to a page when its own
 * `type` cell is marked with it; {@link StorePage.relatedBases} reports the wider
 * reading the `Equiv` columns would allow.
 */
export function parseStorePages(
  rows: readonly TableRow[],
  index: ItemIndex,
): StorePageTable {
  const byPage = new Map<string, string[]>()
  for (const row of index.tables.itemtypes) {
    const code = cellText(row, 'StorePage')
    const type = cellText(row, 'Code')
    if (code === null || type === null) continue
    const list = byPage.get(code) ?? []
    list.push(type)
    byPage.set(code, list)
  }

  const build = (code: string, name: string | null): StorePage => {
    const types = byPage.get(code) ?? []
    const bases: ItemBase[] = []
    const related: ItemBase[] = []
    for (const base of index.bases.values()) {
      if (types.includes(base.type)) bases.push(base)
      else if (types.some((type) => index.hasType(base.type, type))) related.push(base)
    }
    return { name, code, types, bases, relatedBases: related }
  }

  const pages: StorePage[] = []
  const named = new Set<string>()
  for (const row of rows) {
    const code = cellText(row, 'Code')
    if (code === null || named.has(code)) continue
    named.add(code)
    pages.push(build(code, cellText(row, 'Store Page')))
  }
  const derived = [...byPage.keys()].filter((code) => !named.has(code)).map((code) => build(code, null))

  const byCode = new Map(pages.map((page) => [page.code, page]))
  const all = new Map([...pages, ...derived].map((page) => [page.code, page]))
  return { pages, derived, byCode, all }
}

/* -------------------------------------------------------------------------- */
/* A vendor: prices                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Which way a vendor price goes.
 *
 * The `npc` table's columns are named from the vendor's side — `buy mult` is what
 * the vendor pays when it *buys* from the player, `sell mult` what it charges when
 * it *sells* — and that reading is the only one the table's own numbers allow: in
 * every one of the 17 rows the base `buy mult` is the smaller of the two (512
 * against 960…2048), so the other reading would have the same vendor buy an item
 * for more than it sells it for, i.e. a player could buy and immediately resell at
 * a profit.
 *
 * The three `quest…mult` column sets reverse that inequality (`questbuymult` 1024
 * against `questsellmult` 922 for all 17 rows), so they are *not* applied: the
 * module reports them, {@link parseNpcTerms} keeps them, and
 * `tools/verify-economy.ts` counts the reversal rather than hiding it. Which quest
 * state selects a set is not in the export either (`questflag A/B/C` are single
 * numbers — 4, 9, 17, 35 — with no table beside them), so a caller that has the
 * quest log can choose one and say why.
 */
export type TradeDirection = 'player-buys' | 'player-sells'

/** One `questflag X`/`quest…mult X` column set of `npc`'s row. */
export interface NpcQuestTerms {
  readonly letter: 'A' | 'B' | 'C'
  /** The `questflag` cell, or null when the column is empty for this row. */
  readonly flag: number | null
  readonly buyMultiplier: number | null
  readonly sellMultiplier: number | null
  readonly repairMultiplier: number | null
}

/** One `npc` row. Its name is a `monstats` `Id` (`charsi`, `gheed`, …). */
export interface NpcTerms {
  readonly name: string
  /** `buy mult` in 1024ths: what the vendor pays the player. */
  readonly buyMultiplier: number
  /** `sell mult` in 1024ths: what the vendor charges the player. */
  readonly sellMultiplier: number
  /** `rep mult` in 1024ths. The export states no durability arithmetic beside it. */
  readonly repairMultiplier: number
  readonly quest: readonly NpcQuestTerms[]
  /** `max buy`, `max buy (N)`, `max buy (H)`, keyed by the difficulty the name states. */
  readonly maxBuy: ReadonlyMap<DifficultyName, number>
  /** Every numeric column of the row, by the table's own spelling. */
  readonly fields: Readonly<Record<string, number>>
  /** The row itself, so a caller can reach a cell this shape does not name. */
  readonly row: TableRow
}

export interface NpcTermsTable {
  readonly rows: readonly NpcTerms[]
  byName: ReadonlyMap<string, NpcTerms>
}

/** The `quest…mult` column families, which are the only three the table has. */
const QUEST_LETTERS: readonly ('A' | 'B' | 'C')[] = ['A', 'B', 'C']

/**
 * The difficulty a row's column suffix names, in the table's own order.
 *
 * **`npc` spells its difficulty columns with a space** — `max buy (N)`, `max buy
 * (H)` — where `monstats` writes `MinHP(N)` with none. That is why `difficulty.ts`'s
 * `difficultySuffix` is not used here: its spelling is the monster tables'. The two
 * are asserted against their own tables by `tools/verify-economy.ts`.
 */
const DIFFICULTY_COLUMNS: readonly { difficulty: Difficulty; name: DifficultyName; suffix: string }[] = [
  { difficulty: 'normal', name: 'Normal', suffix: '' },
  { difficulty: 'nightmare', name: 'Nightmare', suffix: ' (N)' },
  { difficulty: 'hell', name: 'Hell', suffix: ' (H)' },
]

export function parseNpcTerms(rows: readonly TableRow[]): NpcTermsTable {
  const out: NpcTerms[] = []
  for (const row of rows) {
    const name = cellText(row, 'npc')
    if (name === null) continue
    const fields: Record<string, number> = {}
    for (const [key, value] of Object.entries(row)) {
      const amount = tableNumber(value)
      if (amount !== null) fields[key] = amount
    }
    const quest: NpcQuestTerms[] = []
    for (const letter of QUEST_LETTERS) {
      const flag = cellNumber(row, `questflag ${letter}`)
      const buy = cellNumber(row, `questbuymult ${letter}`)
      const sell = cellNumber(row, `questsellmult ${letter}`)
      const repair = cellNumber(row, `questrepmult ${letter}`)
      if (flag === null && buy === null && sell === null && repair === null) continue
      quest.push({
        letter,
        flag,
        buyMultiplier: buy,
        sellMultiplier: sell,
        repairMultiplier: repair,
      })
    }
    const maxBuy = new Map<DifficultyName, number>()
    for (const { name: label, suffix } of DIFFICULTY_COLUMNS) {
      const amount = cellNumber(row, `max buy${suffix}`)
      if (amount !== null) maxBuy.set(label, amount)
    }
    out.push({
      name,
      buyMultiplier: fields['buy mult'] ?? 0,
      sellMultiplier: fields['sell mult'] ?? 0,
      repairMultiplier: fields['rep mult'] ?? 0,
      quest,
      maxBuy,
      fields,
      row,
    })
  }
  const byName = new Map(out.map((terms) => [terms.name, terms]))
  return { rows: out, byName }
}

/** What the vendor will pay, or charge, in one difficulty (`max buy`'s column). */
export function maxBuyFor(terms: NpcTerms, difficulty: Difficulty): number | null {
  const row = DIFFICULTY_COLUMNS.find((entry) => entry.difficulty === difficulty)
  return row === undefined ? null : (terms.maxBuy.get(row.name) ?? null)
}

/**
 * What one item is worth before any vendor multiplier.
 *
 * The base item's own `cost` column. A unique or a set item has two further
 * columns — `cost mult` and `cost add` — and they are applied as
 * `cost * cost mult + cost add`, which is the only shape two columns with those
 * names admit; unlike `hireling`'s `*SubType`, neither `uniqueitems` nor `setitems`
 * carries a description row for them in this export, so this reading is named here
 * rather than presented as the table's. In this export 432 unique rows say
 * `cost mult` 5 and 114 say 3, with `cost add` 5000; the set items say `cost mult`
 * 5 with `cost add` 5000 (75 rows) or 2500 (65). Seven unique rows and one set row
 * carry neither column and keep the base cost.
 *
 * Nothing else adjusts the price: `magicprefix`, `magicsuffix` and `automagic` have
 * no cost columns at all, so an affix costs nothing here.
 */
export function itemCost(index: ItemIndex, item: Item): number {
  const base = item.base.cost
  if (item.unique !== null) {
    for (const row of index.tables.uniqueitems) {
      if (cellText(row, 'index') !== item.unique.name) continue
      if (cellText(row, 'code') !== item.base.code) continue
      return baseMultiply(base, cellNumber(row, 'cost mult'), cellNumber(row, 'cost add'))
    }
  }
  if (item.setItem !== null) {
    for (const row of index.tables.setitems) {
      if (cellText(row, 'index') !== item.setItem.name) continue
      if (cellText(row, 'item') !== item.base.code) continue
      return baseMultiply(base, cellNumber(row, 'cost mult'), cellNumber(row, 'cost add'))
    }
  }
  return base
}

function baseMultiply(base: number, mult: number | null, add: number | null): number {
  if (mult === null && add === null) return base
  return base * (mult ?? 1) + (add ?? 0)
}

/**
 * The gold one trade moves.
 *
 * The multiplier is in 1024ths (Akara's 1024 is "no change", Malah's 2048 is
 * double) and the result is floored with a floor of one gold; the export does not
 * state the rounding, so it is named here.
 */
export function priceOf(
  index: ItemIndex,
  item: Item,
  terms: NpcTerms,
  direction: TradeDirection,
): number {
  const multiplier =
    direction === 'player-buys' ? terms.sellMultiplier : terms.buyMultiplier
  return Math.max(1, Math.floor((itemCost(index, item) * multiplier) / 1024))
}

/* -------------------------------------------------------------------------- */
/* A vendor: stock                                                            */
/* -------------------------------------------------------------------------- */

export interface StockEntry {
  readonly item: Item
  /** What the vendor charges, or null when the stock was built without a vendor. */
  readonly price: number | null
}

export interface VendorStockContext {
  readonly index: ItemIndex
  readonly pages: StorePageTable
  /** A page's code (`armo`) or its name ("Armor Page"). */
  readonly page: string
  /**
   * The item level the vendor's rolled stock is generated at.
   *
   * **No table states it.** `monstats`' 59 `npc: 1` rows carry no `Level` column
   * value at all, so the item level of a shop is not in the data; a caller that
   * knows the area (its `MonsterLevel` from `levels.txt`) passes it.
   */
  readonly ilvl: number
  readonly random: Random
  /**
   * How many rolled items to stock.
   *
   * **No table states it.** The vendor panel's grid is 10 x 10 (`cellCount`) and
   * `inventory.txt`'s `Trade Page 1` row is 10 x 4; neither column says how many of
   * those the vendor fills.
   */
  readonly count: number
  /** The vendor's own row, for prices. Without one the stock has no prices. */
  readonly terms?: NpcTerms
}

export interface VendorStock {
  readonly page: StorePage
  readonly ilvl: number
  /** The page's bases whose `PermStoreItem` column is 1: always in stock. */
  readonly permanent: readonly StockEntry[]
  /** Bases rolled with `makeItem` at `ilvl`. */
  readonly rolled: readonly StockEntry[]
  /** Every base the page holds that a shop could stock at this item level. */
  readonly candidates: readonly ItemBase[]
  /** Page bases whose quality level is above the shop's item level, named. */
  readonly aboveLevel: readonly string[]
  /** Page bases marked `spawnable: 0` or `quest: 1`, named. */
  readonly unspawnable: readonly string[]
  /** What the vendor charges for an item, or null without a vendor row. */
  priceOf(item: Item): number | null
}

/**
 * A vendor's stock for one page.
 *
 * Two sources, both columns:
 *
 * - **permanent** — the page's bases with `PermStoreItem: 1` are stocked whatever
 *   the level (in this export the whole potion/scroll/tome/key list, 24 `misc` rows
 *   plus the 6 throwing potions, all of them on the `misc` page). They are built at
 *   quality `normal`, which is what a shop sells. Note that two of them (`hpo`,
 *   `mpo`) are *only* store items: their `spawnable` column is 0.
 * - **rolled** — `count` bases drawn from the page's spawnable bases at or below
 *   `ilvl`, each through `makeItem`, so the quality, the affixes and the sockets are
 *   the generator's own (`itemratio`, `magicprefix`, `magicsuffix`, `automagic`).
 *   Permanent codes are left out of the draw, which is what the column means.
 */
export function vendorStock(context: VendorStockContext): VendorStock {
  const { index, pages, random } = context
  const page = pages.all.get(context.page) ?? pages.pages.find((entry) => entry.name === context.page)
  const empty: VendorStock = {
    page: page ?? { name: null, code: context.page, types: [], bases: [], relatedBases: [] },
    ilvl: context.ilvl,
    permanent: [],
    rolled: [],
    candidates: [],
    aboveLevel: [],
    unspawnable: [],
    priceOf: () => null,
  }
  if (page === undefined) return empty

  const permanentBases = page.bases.filter((base) => permStore(index, base))
  const aboveLevel: string[] = []
  const unspawnable: string[] = []
  const candidates: ItemBase[] = []
  for (const base of page.bases) {
    if (permStore(index, base)) continue
    if (base.level > context.ilvl) {
      aboveLevel.push(base.code)
      continue
    }
    if (!base.spawnable || base.quest) {
      unspawnable.push(base.code)
      continue
    }
    candidates.push(base)
  }

  const permanent = permanentBases.map((base) => ({
    item: makeItem({ index, random, ilvl: Math.max(1, context.ilvl), code: base.code, quality: 'normal' }),
    price: null,
  }))
  const rolled: StockEntry[] = []
  for (let pick = 0; pick < Math.max(0, Math.trunc(context.count)); pick += 1) {
    if (candidates.length === 0) break
    const base = candidates[random.int(candidates.length)] as ItemBase
    rolled.push({ item: makeItem({ index, random, ilvl: context.ilvl, code: base.code }), price: null })
  }

  const terms = context.terms
  const price = (item: Item): number | null =>
    terms === undefined ? null : priceOf(index, item, terms, 'player-buys')
  const withPrices = (entries: StockEntry[]): StockEntry[] =>
    entries.map((entry) => ({ item: entry.item, price: price(entry.item) }))

  return {
    page,
    ilvl: context.ilvl,
    permanent: withPrices(permanent),
    rolled: withPrices(rolled),
    candidates,
    aboveLevel,
    unspawnable,
    priceOf: price,
  }
}

/** The base table a `kind` names: `weapons`, `armor` or `misc`. */
function tableOf(kind: ItemBase['kind']): 'weapons' | 'armor' | 'misc' {
  return kind === 'weapon' ? 'weapons' : kind
}

/** The `PermStoreItem` column of a base item's own row. */
function permStore(index: ItemIndex, base: ItemBase): boolean {
  for (const row of index.tables[tableOf(base.kind)]) {
    if (cellText(row, 'code') === base.code) return cellFlag(row, 'PermStoreItem')
  }
  return false
}

/* -------------------------------------------------------------------------- */
/* A vendor: gambling                                                         */
/* -------------------------------------------------------------------------- */

export interface GambleEntry {
  /** The `gamble` row's `name` cell. */
  readonly name: string
  readonly code: string
  readonly base: ItemBase | null
  /** The base item's own `gamble cost` column, 0 when it is empty. */
  readonly cost: number
}

export interface GambleTable {
  readonly entries: readonly GambleEntry[]
  /** `gamble` codes with no base item in `weapons`/`armor`/`misc`, named. */
  readonly missing: readonly string[]
  /** Entries whose base row carries no `gamble cost`, named. */
  readonly unpriced: readonly string[]
  /**
   * Rows with no `code` at all, by `name`. One in this export: the final row,
   * `Expansion`, which is the same all-empty marker row the other retail tables end
   * with — so 122 rows name 121 items.
   */
  readonly markers: readonly string[]
}

/**
 * The gamble screen's list.
 *
 * `gamble` names 121 base items in 122 rows and the price is the item's own
 * `gamble cost` column — the vendor panel's refresh button is
 * `Gambling_Refresh_Button`, which is the same screen. `gamble cost` is present on
 * 306 of 307 `weapons` rows, 217 of 218 `armor` rows and the 6 `misc` rows `gamble`
 * names.
 */
export function parseGamble(rows: readonly TableRow[], index: ItemIndex): GambleTable {
  const entries: GambleEntry[] = []
  const missing: string[] = []
  const unpriced: string[] = []
  const markers: string[] = []
  for (const row of rows) {
    const code = cellText(row, 'code')
    if (code === null) {
      markers.push(cellText(row, 'name') ?? '(unnamed)')
      continue
    }
    const base = index.bases.get(code) ?? null
    if (base === null) {
      missing.push(code)
      continue
    }
    const cost = gambleCost(index, base)
    if (cost <= 0) unpriced.push(code)
    entries.push({ name: cellText(row, 'name') ?? code, code, base, cost })
  }
  return { entries, missing, unpriced, markers }
}

function gambleCost(index: ItemIndex, base: ItemBase): number {
  for (const row of index.tables[tableOf(base.kind)]) {
    if (cellText(row, 'code') === base.code) return cellNumber(row, 'gamble cost') ?? 0
  }
  return 0
}

/* -------------------------------------------------------------------------- */
/* A hireling: the roster                                                     */
/* -------------------------------------------------------------------------- */

/** One `SkillN` column family of a `hireling` row. */
export interface HirelingSkill {
  /** The `SkillN` cell, which is the skill's own name (`Jab`, `Inner Sight`). */
  readonly name: string
  /** The `ModeN` cell. */
  readonly mode: number | null
  readonly chance: number | null
  readonly chancePerLevel: number | null
  /** The skill's level at this row's own hireling level. */
  readonly level: number | null
  /**
   * `LvlPerLvlN` — a per-level growth whose unit the export does not describe
   * (10, 8, 7, 6, 5 and 0 all occur in this column), so it is reported, not applied.
   */
  readonly levelPerLevel: number | null
}

/** The stat columns of a `hireling` row, base values plus their `/Lvl` growth. */
export interface HirelingStats {
  readonly hp: number
  readonly hpPerLevel: number
  readonly defense: number
  readonly defensePerLevel: number
  readonly strength: number
  readonly strengthPerLevel: number
  readonly dexterity: number
  readonly dexterityPerLevel: number
  readonly attackRating: number
  readonly attackRatingPerLevel: number
  readonly minDamage: number
  readonly maxDamage: number
  readonly damagePerLevel: number
  readonly resistFire: number
  readonly resistFirePerLevel: number
  readonly resistCold: number
  readonly resistColdPerLevel: number
  readonly resistLightning: number
  readonly resistLightningPerLevel: number
  readonly resistPoison: number
  readonly resistPoisonPerLevel: number
  /** `Exp/Lvl`, 100…140 in this export: what the mercenary needs per level. */
  readonly experiencePerLevel: number
}

/**
 * A hireling row, read.
 *
 * Every field names the column it came from. The `/Lvl` columns are the growth the
 * panel's own fields show — `hirelinginventorypanelhd` has `HPStat` (`@strchrlif`),
 * `StrengthStat` (`@strchrstr`), `DexStat` (`@strchrdex`), `DamageStat`
 * (`@strchrskm`), `ArmorClass` (`@strchrdef`) and the four resistance texts
 * (`@strchrfir`, `@strchrcol`, `@strchrlit`, `@strchrpos`) — which is why the four
 * resistances and the four stat pairs are the ones modelled here.
 */
export interface HirelingRow {
  /** `Hireling` — the kind, e.g. "Rogue Scout". */
  readonly kind: string
  /** `*SubType` — the row's own label ("Fire - Normal", "Def/Might"?): free text in the file. */
  readonly subType: string | null
  /** `Version`: 0 for the classic rows, 100 for the expansion's. */
  readonly version: number
  readonly id: number
  /** `Class` — a `monstats` `*hcIdx` (271 `roguehire`, 338 `act2hire`, …). */
  readonly monsterIndex: number | null
  /** `Act`. */
  readonly act: number
  /** `Difficulty`: the table's own 1/2/3, which `*SubType` spells out. */
  readonly difficulty: number
  readonly difficultyName: DifficultyName | null
  /** `Level` — the hireling's level for this row. Null when the cell is empty. */
  readonly level: number | null
  /** `Gold` — what hiring costs. */
  readonly gold: number
  /** `Seller` — a `monstats` `*hcIdx` of the NPC who offers the hire. */
  readonly sellerIndex: number | null
  /** `NameFirst`/`NameLast` — the first string key of the name range, or null. */
  readonly nameFirst: string | null
  readonly nameLast: string | null
  /** `HireDesc` — a string key that resolves in `strings_ui` or `strings_skills`. */
  readonly hireDesc: string | null
  /** `HireDesc` resolved, when a string table was supplied. */
  readonly hireDescText: string | null
  /** `DefaultChance`. */
  readonly defaultChance: number
  /** `HiringMaxLevelDifference` — 1 on 75 rows, 5 on 60 in this export. */
  readonly hiringMaxLevelDifference: number
  /** `equivalentcharclass` (`ama`, `bar`) or null. */
  readonly equivalentCharClass: string | null
  /** `resurrectcostmultiplier`/`…divisor`/`…max` — 15 / 2 / 50000 on all 135 rows. */
  readonly resurrect: { readonly multiplier: number; readonly divisor: number; readonly max: number }
  readonly stats: HirelingStats
  readonly skills: readonly HirelingSkill[]
  /** The row itself, so a caller can reach a column this shape does not name. */
  readonly row: TableRow
}

/** A `monstats` row of a `Hireable` monster, joined to a hireling's `Class`. */
export interface HirelingMonster {
  readonly index: number
  readonly id: string
  /** `NameStr` — "Rogue", "DesertMerc", "Iron Wolf", "Barbarian". */
  readonly name: string
  /** `AI` — "Hireable" on all five. */
  readonly ai: string | null
  /** `Level`/`Level(N)`/`Level(H)`: 1/34/67 for acts 1-3, 1/1/1 for act 5. */
  readonly levels: ReadonlyMap<DifficultyName, number>
  /** `rightArmItemType`/`leftArmItemType` — the item types the arm slots take. */
  readonly rightArmItemType: string | null
  readonly leftArmItemType: string | null
  /** `Skill1` — the monster's own first skill. */
  readonly skill1: string | null
}

export type HirelingProblemWhy = 'level' | 'class' | 'seller' | 'act' | 'difficulty'

export interface HirelingProblem {
  readonly row: TableRow
  readonly why: HirelingProblemWhy
  readonly detail: string
}

export interface HirelingStrings {
  /** `strings_mercenaries.json`, where `NameFirst`/`NameLast`'s keys live. */
  readonly names?: StringTable
  /** One table built from `strings_ui` and `strings_skills`, where `HireDesc`'s keys live. */
  readonly descriptions?: StringTable
}

export interface HirelingTable {
  readonly rows: readonly HirelingRow[]
  /** Rows the tables state that cannot be hired, named with the reason. */
  readonly problems: readonly HirelingProblem[]
  /**
   * What the table's own rows say about the `/Lvl` columns — see
   * {@link hirelingStatsAt} for what those numbers decide.
   */
  readonly growth: readonly HirelingGrowth[]
  /** `monstats` `*hcIdx` → the `Hireable` monster, for every `Class` that resolved. */
  readonly monsters: ReadonlyMap<number, HirelingMonster>
  /** `monstats` `*hcIdx` → `Id`, for any NPC a `Seller` column named. */
  readonly sellers: ReadonlyMap<number, string>
  /**
   * The hireable rows of one act and difficulty, ordered by level.
   *
   * `version` selects the column's own two values: 0 is the classic set and 100 the
   * expansion's, which is the default because this export is Resurrected's (its
   * stash is `bankexpansionlayouthd`) and act 5 has version 100 only.
   */
  roster(act: number, difficulty: number, options?: { version?: number }): readonly HirelingRow[]
}

/** The difficulty names the `*SubType` labels spell, and the numbering beside them. */
const DIFFICULTY_NAMES: readonly DifficultyName[] = ['Normal', 'Nightmare', 'Hell']

/** `monstats`' difficulty suffix, the same spelling `npc` uses for `max buy`. */
function monsterLevel(index: TableRow, difficulty: DifficultyName): number | null {
  return cellNumber(index, `Level${difficultySuffix(difficulty)}`)
}

function readStats(row: TableRow): HirelingStats {
  const read = (column: string): number => cellNumber(row, column) ?? 0
  return {
    hp: read('HP'),
    hpPerLevel: read('HP/Lvl'),
    defense: read('Defense'),
    defensePerLevel: read('Def/Lvl'),
    strength: read('Str'),
    strengthPerLevel: read('Str/Lvl'),
    dexterity: read('Dex'),
    dexterityPerLevel: read('Dex/Lvl'),
    attackRating: read('AR'),
    attackRatingPerLevel: read('AR/Lvl'),
    minDamage: read('Dmg-Min'),
    maxDamage: read('Dmg-Max'),
    damagePerLevel: read('Dmg/Lvl'),
    resistFire: read('ResistFire'),
    resistFirePerLevel: read('ResistFire/Lvl'),
    resistCold: read('ResistCold'),
    resistColdPerLevel: read('ResistCold/Lvl'),
    resistLightning: read('ResistLightning'),
    resistLightningPerLevel: read('ResistLightning/Lvl'),
    resistPoison: read('ResistPoison'),
    resistPoisonPerLevel: read('ResistPoison/Lvl'),
    experiencePerLevel: read('Exp/Lvl'),
  }
}

function readSkills(row: TableRow): HirelingSkill[] {
  const out: HirelingSkill[] = []
  for (let slot = 1; slot <= 6; slot += 1) {
    const name = cellText(row, `Skill${slot}`)
    if (name === null) continue
    out.push({
      name,
      mode: cellNumber(row, `Mode${slot}`),
      chance: cellNumber(row, `Chance${slot}`),
      chancePerLevel: cellNumber(row, `ChancePerLvl${slot}`),
      level: cellNumber(row, `Level${slot}`),
      levelPerLevel: cellNumber(row, `LvlPerLvl${slot}`),
    })
  }
  return out
}

/** The difficulty a row's `*SubType` label states, or null when it states none. */
function difficultyOfLabel(subType: string | null): DifficultyName | null {
  if (subType === null) return null
  for (const name of DIFFICULTY_NAMES) if (subType.endsWith(name)) return name
  return null
}

/**
 * Reads `hireling`, joining `Class` and `Seller` to `monstats`.
 *
 * `monstats` is optional: without it the rows still carry their own columns, the
 * two indices are reported as such, and the arm item types are absent. A row whose
 * `Level` cell is empty cannot be hired and is reported in
 * {@link HirelingTable.problems} rather than being given a level.
 */
export function parseHirelings(
  rows: readonly TableRow[],
  options: { monstats?: readonly TableRow[]; strings?: HirelingStrings } = {},
): HirelingTable {
  const monsters = new Map<number, HirelingMonster>()
  const sellers = new Map<number, string>()
  for (const monster of options.monstats ?? []) {
    const index = cellNumber(monster, '*hcIdx')
    const id = cellText(monster, 'Id')
    if (index === null || id === null) continue
    if (cellText(monster, 'npc') === '1' || cellFlag(monster, 'npc')) sellers.set(index, id)
    if (cellText(monster, 'AI') !== 'Hireable') continue
    const levels = new Map<DifficultyName, number>()
    for (const name of DIFFICULTY_NAMES) {
      const level = monsterLevel(monster, name)
      if (level !== null) levels.set(name, level)
    }
    monsters.set(index, {
      index,
      id,
      name: cellText(monster, 'NameStr') ?? id,
      ai: cellText(monster, 'AI'),
      levels,
      rightArmItemType: cellText(monster, 'rightArmItemType'),
      leftArmItemType: cellText(monster, 'leftArmItemType'),
      skill1: cellText(monster, 'Skill1'),
    })
  }

  const out: HirelingRow[] = []
  const problems: HirelingProblem[] = []
  for (const row of rows) {
    const kind = cellText(row, 'Hireling')
    const act = cellNumber(row, 'Act')
    const difficulty = cellNumber(row, 'Difficulty')
    if (kind === null || act === null || difficulty === null) continue
    const subType = cellText(row, '*SubType')
    const monsterIndex = cellNumber(row, 'Class')
    const sellerIndex = cellNumber(row, 'Seller')
    const level = cellNumber(row, 'Level')
    if (level === null) {
      problems.push({ row, why: 'level', detail: `${kind} act ${act} difficulty ${difficulty} has no Level` })
      continue
    }
    if (options.monstats !== undefined && (monsterIndex === null || !monsters.has(monsterIndex))) {
      problems.push({
        row,
        why: 'class',
        detail: `${kind} act ${act} names Class ${monsterIndex ?? '(empty)'}, which monstats has no Hireable row for`,
      })
    }
    if (options.monstats !== undefined && sellerIndex !== null && !sellers.has(sellerIndex)) {
      problems.push({
        row,
        why: 'seller',
        detail: `${kind} act ${act} names Seller ${sellerIndex}, which monstats marks as no npc`,
      })
    }
    const hireDesc = cellText(row, 'HireDesc')
    out.push({
      kind,
      subType,
      version: cellNumber(row, 'Version') ?? 0,
      id: cellNumber(row, 'Id') ?? 0,
      monsterIndex,
      act,
      difficulty,
      difficultyName: difficultyOfLabel(subType),
      level,
      gold: cellNumber(row, 'Gold') ?? 0,
      sellerIndex,
      nameFirst: cellText(row, 'NameFirst'),
      nameLast: cellText(row, 'NameLast'),
      hireDesc,
      hireDescText:
        hireDesc === null ? null : (options.strings?.descriptions?.get(hireDesc) ?? null),
      defaultChance: cellNumber(row, 'DefaultChance') ?? 0,
      hiringMaxLevelDifference: cellNumber(row, 'HiringMaxLevelDifference') ?? 0,
      equivalentCharClass: cellText(row, 'equivalentcharclass'),
      resurrect: {
        multiplier: cellNumber(row, 'resurrectcostmultiplier') ?? 0,
        divisor: cellNumber(row, 'resurrectcostdivisor') ?? 0,
        max: cellNumber(row, 'resurrectcostmax') ?? 0,
      },
      stats: readStats(row),
      skills: readSkills(row),
      row,
    })
  }

  return {
    rows: out,
    problems,
    growth: readGrowth(out),
    monsters,
    sellers,
    roster: (act: number, difficulty: number, options2: { version?: number } = {}) => {
      const version = options2.version ?? 100
      return out
        .filter(
          (entry) => entry.act === act && entry.difficulty === difficulty && entry.version === version,
        )
        .sort((left, right) => (left.level ?? 0) - (right.level ?? 0) || left.kind.localeCompare(right.kind))
    },
  }
}

/** One stat column and the `/Lvl` column that sits beside it. */
interface GrowthColumn {
  readonly stat: keyof HirelingStats
  readonly perLevelStat: keyof HirelingStats
  readonly column: string
  readonly levelColumn: string
}

/** The eleven stat columns and their growth partners, as the table spells them. */
const GROWTH_COLUMNS: readonly GrowthColumn[] = [
  { stat: 'hp', perLevelStat: 'hpPerLevel', column: 'HP', levelColumn: 'HP/Lvl' },
  { stat: 'defense', perLevelStat: 'defensePerLevel', column: 'Defense', levelColumn: 'Def/Lvl' },
  { stat: 'strength', perLevelStat: 'strengthPerLevel', column: 'Str', levelColumn: 'Str/Lvl' },
  { stat: 'dexterity', perLevelStat: 'dexterityPerLevel', column: 'Dex', levelColumn: 'Dex/Lvl' },
  { stat: 'attackRating', perLevelStat: 'attackRatingPerLevel', column: 'AR', levelColumn: 'AR/Lvl' },
  { stat: 'minDamage', perLevelStat: 'damagePerLevel', column: 'Dmg-Min', levelColumn: 'Dmg/Lvl' },
  { stat: 'maxDamage', perLevelStat: 'damagePerLevel', column: 'Dmg-Max', levelColumn: 'Dmg/Lvl' },
  { stat: 'resistFire', perLevelStat: 'resistFirePerLevel', column: 'ResistFire', levelColumn: 'ResistFire/Lvl' },
  { stat: 'resistCold', perLevelStat: 'resistColdPerLevel', column: 'ResistCold', levelColumn: 'ResistCold/Lvl' },
  {
    stat: 'resistLightning',
    perLevelStat: 'resistLightningPerLevel',
    column: 'ResistLightning',
    levelColumn: 'ResistLightning/Lvl',
  },
  {
    stat: 'resistPoison',
    perLevelStat: 'resistPoisonPerLevel',
    column: 'ResistPoison',
    levelColumn: 'ResistPoison/Lvl',
  },
]

/**
 * Whether the table's own rows support reading a `/Lvl` column as "this much per
 * hireling level", and where they do not.
 *
 * Counted over every consecutive pair of rows of the same kind, sub-type and
 * version, which is the only grouping in which the comparison means anything.
 */
export interface HirelingGrowth {
  readonly stat: keyof HirelingStats
  readonly perLevelStat: keyof HirelingStats
  /** The stat column, e.g. `HP`. */
  readonly column: string
  /** The column beside it, e.g. `HP/Lvl`. */
  readonly levelColumn: string
  /** How many consecutive pairs the rule can be tested on. */
  readonly pairs: number
  /** How many of them reproduce the next row's own value. */
  readonly confirmed: number
  /** The pairs that do not, named with both values and what the rule would say. */
  readonly exceptions: readonly string[]
}

/** How the rows that share a growth rule are grouped. */
function growthKey(row: HirelingRow): string {
  return `${row.kind}|${row.subType ?? ''}|${row.version}`
}

/** A mutable copy of {@link HirelingGrowth}, while the pairs are counted. */
interface GrowthDraft {
  stat: keyof HirelingStats
  perLevelStat: keyof HirelingStats
  column: string
  levelColumn: string
  pairs: number
  confirmed: number
  exceptions: string[]
}

/** Counts {@link HirelingGrowth} for every stat column over the whole table. */
function readGrowth(rows: readonly HirelingRow[]): HirelingGrowth[] {
  const groups = new Map<string, HirelingRow[]>()
  for (const row of rows) {
    const key = growthKey(row)
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }
  const growth: GrowthDraft[] = GROWTH_COLUMNS.map((column) => ({
    stat: column.stat,
    perLevelStat: column.perLevelStat,
    column: column.column,
    levelColumn: column.levelColumn,
    pairs: 0,
    confirmed: 0,
    exceptions: [],
  }))
  for (const list of groups.values()) {
    list.sort((left, right) => (left.level ?? 0) - (right.level ?? 0))
    for (let index = 0; index + 1 < list.length; index += 1) {
      const left = list[index] as HirelingRow
      const right = list[index + 1] as HirelingRow
      const steps = (right.level ?? 0) - (left.level ?? 0)
      if (steps <= 0) continue
      for (const entry of growth) {
        const base = left.stats[entry.stat]
        const perLevel = left.stats[entry.perLevelStat]
        const next = right.stats[entry.stat]
        entry.pairs += 1
        if (base + perLevel * steps === next) entry.confirmed += 1
        else if (entry.exceptions.length < 8) {
          entry.exceptions.push(
            `${growthKey(left)}: level ${left.level} → ${right.level}, ${entry.column} ` +
              `${base} vs ${next} (${entry.levelColumn} ${perLevel} gives ${base + perLevel * steps})`,
          )
        }
      }
    }
  }
  return growth
}

/**
 * A hireling's stats at one level.
 *
 * The rows state a base value at their own `Level` and a `/Lvl` column beside it,
 * and by default this returns those stated values: **the `/Lvl` columns are not
 * applied**, because the table's own rows contradict that reading for most of them.
 * Between two consecutive rows of the same kind, sub-type and version,
 * `base + perLevel * ΔLevel` reproduces the next row's stated value:
 *
 * | column | pairs it reproduces, in this export |
 * | --- | --- |
 * | `HP/Lvl` | 59 of 60 |
 * | `AR/Lvl` | 59 of 60 |
 * | `Def/Lvl` | 44 of 60 |
 * | `Str/Lvl`, `Dex/Lvl`, `Dmg/Lvl`, `Resist…/Lvl` | 0 of 60 each |
 *
 * A Rogue Scout's Strength is 63 at level 25 and 93 at level 49 — 30 over 24 levels
 * — while `Str/Lvl` says 10, and her fire resistance goes 0 → 44 → 86 with `ResistFire/Lvl`
 * 8 then 7. The numbers for every column, and the pairs that break the rule, are in
 * {@link HirelingTable.growth}, so a caller that wants to interpolate a column can
 * pass exactly the ones the data supports (`growth.filter(entry => entry.confirmed > 0)`,
 * or `pairs === confirmed` for the strict reading). Without a list the row's own
 * values come back unchanged, which is the only thing the tables guarantee.
 */
export function hirelingStatsAt(
  row: HirelingRow,
  level: number,
  growth?: readonly HirelingGrowth[],
): HirelingStats {
  const steps = Math.max(0, level - (row.level ?? level))
  if (steps === 0 || growth === undefined || growth.length === 0) return row.stats
  const out: Record<string, number> = { ...row.stats }
  for (const entry of growth) {
    const base = row.stats[entry.stat]
    const perLevel = row.stats[entry.perLevelStat]
    out[entry.stat] = base + perLevel * steps
  }
  return out as unknown as HirelingStats
}

/**
 * The string keys a hireling's name may be drawn from.
 *
 * `NameFirst`/`NameLast` are the *ends of a range* in `strings_mercenaries`:
 * `merc01` to `merc41` for the Rogue Scout, `merca201` to `merca221` for the Desert
 * Mercenary, `merca222` to `merca241` for the Eastern Sorceror and `MercX101` to
 * `MercX167` for the Barbarian. Both ends of a row have the same prefix and a
 * numeric tail, and the range is every integer between them — the four ranges of
 * this export partition the file's 149 keys exactly, which is what
 * `tools/verify-economy.ts` checks. With a string table supplied, a key it does not
 * hold is left out, so a partial export gives fewer names rather than invented
 * ones; without one, the range is returned as its keys, which are the table's own
 * strings.
 */
export function hirelingNameKeys(row: HirelingRow, names?: StringTable): readonly string[] {
  const first = row.nameFirst
  const last = row.nameLast
  if (first === null || last === null) return []
  const match = /^(.*?)(\d+)$/.exec(first)
  const tail = /^(.*?)(\d+)$/.exec(last)
  if (match === null || tail === null || match[1] !== tail[1]) return []
  const prefix = match[1] as string
  const from = Number.parseInt(match[2] as string, 10)
  const to = Number.parseInt(tail[2] as string, 10)
  const width = (match[2] as string).length
  const out: string[] = []
  for (let value = from; value <= to; value += 1) {
    const key = `${prefix}${String(value).padStart(width, '0')}`
    if (names === undefined || names.get(key) !== undefined) out.push(key)
  }
  return out
}

/**
 * What resurrecting a mercenary costs at one level.
 *
 * `resurrectcostmultiplier` (15), `resurrectcostdivisor` (2) and `resurrectcostmax`
 * (50000) are the same on all 135 rows, and the three names are the whole
 * specification the export carries, so this applies them as
 * `min(max, level * multiplier / divisor)` and says so rather than borrowing a
 * formula from elsewhere.
 */
export function resurrectCost(row: HirelingRow, level: number): number {
  const { multiplier, divisor, max } = row.resurrect
  if (multiplier <= 0) return 0
  const value = divisor > 0 ? (level * multiplier) / divisor : level * multiplier
  return Math.min(max > 0 ? max : Number.POSITIVE_INFINITY, Math.floor(value))
}

/* -------------------------------------------------------------------------- */
/* A hireling: equipment                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The four equipment slots of `hirelinginventorypanelhd`, in the layout's order.
 *
 * The layout's own `location` field is the authority for the names here. Its
 * vocabulary is words (`head`, `torso`, `right_arm`, `left_arm`) where
 * `itemtypes.BodyLoc1` uses four-letter codes (`head`, `tors`, `rarm`, `larm`), and
 * the export holds no table that states the correspondence, so it is named once,
 * here: it is one-to-one, and the four slots are the four locations a mercenary can
 * use. `inventory.txt`'s `Hireling` row names the same four (head, torso, rArm,
 * lArm) with the same rects as the classic `hirelinginventorypanel` layout, which
 * is what makes the reading checkable.
 */
export const HIRELING_SLOT_BODY_LOCATION: Readonly<Record<string, string>> = {
  head: 'head',
  torso: 'tors',
  right_arm: 'rarm',
  left_arm: 'larm',
}

export interface HirelingSlot {
  /** The layout's widget name, e.g. `slot_head`. */
  readonly name: string
  /** The layout's own `location` field, e.g. `head`. */
  readonly location: string
  /** `itemtypes.BodyLoc1`'s spelling, from {@link HIRELING_SLOT_BODY_LOCATION}. */
  readonly bodyLocation: string | null
  /** The layout's rect, in layout units. */
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface HirelingSlotSet {
  /** The slots, in the layout's own order. */
  readonly slots: readonly HirelingSlot[]
  /**
   * The panel's other widgets, as one line per type with its count (`TextBoxWidget x22`),
   * so that "what this module does not use" is a count rather than an impression.
   */
  readonly unmodelled: readonly string[]
}

/**
 * Reads the mercenary panel's equipment slots.
 *
 * `panel` is the panel's own widget tree (`ui/layout.ts`'s `ResolvedWidget.widget`).
 * The panel's `InventorySlotWidget`s are the slots, in the order the file lists
 * them; every other widget in it is a stat field — and those are the fields
 * {@link HirelingRow}'s columns were matched to — or a button. They are counted in
 * {@link HirelingSlotSet.unmodelled} rather than dropped silently.
 */
export function readHirelingSlots(panel: UiWidget): HirelingSlotSet {
  const slots: HirelingSlot[] = []
  const others = new Map<string, number>()
  const note = (type: string): void => {
    others.set(type, (others.get(type) ?? 0) + 1)
  }

  const walk = (widget: UiWidget): void => {
    if (widget.type === 'InventorySlotWidget') {
      const location = widget.fields['location']
      if (typeof location === 'string' && location !== '') {
        const rect = rectOf(widget)
        slots.push({
          name: widget.name,
          location,
          bodyLocation: HIRELING_SLOT_BODY_LOCATION[location] ?? null,
          x: rect.x ?? 0,
          y: rect.y ?? 0,
          width: rect.width ?? 0,
          height: rect.height ?? 0,
        })
      } else {
        note(`${widget.name} (a slot with no location)`)
      }
    } else {
      note(widget.type)
    }
    for (const child of widget.children) walk(child)
  }
  for (const child of panel.children) walk(child)

  const unmodelled = [...others.entries()]
    .map(([type, count]) => `${type} x${count}`)
    .sort((left, right) => left.localeCompare(right))
  return { slots, unmodelled }
}

/** The `itemtypes` rows' `BodyLoc1`/`BodyLoc2`, per type code. */
const BODY_LOCATIONS = new WeakMap<ItemIndex, ReadonlyMap<string, readonly string[]>>()

function bodyLocations(index: ItemIndex): ReadonlyMap<string, readonly string[]> {
  const cached = BODY_LOCATIONS.get(index)
  if (cached !== undefined) return cached
  const map = new Map<string, readonly string[]>()
  for (const row of index.tables.itemtypes) {
    const code = cellText(row, 'Code')
    if (code === null) continue
    const places: string[] = []
    for (const column of ['BodyLoc1', 'BodyLoc2']) {
      const value = cellText(row, column)
      if (value !== null) places.push(value)
    }
    map.set(code, places)
  }
  BODY_LOCATIONS.set(index, map)
  return map
}

/**
 * Whether an item may be equipped in one of a hireling's slots.
 *
 * For the two arm slots the authority is `monstats`' `rightArmItemType` /
 * `leftArmItemType`, which is per kind: `bow`/`none` for the Rogue Scout, `sppl`
 * (the spear/polearm chain) /`none` for the Desert Mercenary, `swor`/`shie` for the
 * Iron Wolf, `swor`/`swor` for the act 5 sword barbarian and `swor`/`none` for the
 * two-handed one. `'none'` is the table's own word for "this arm takes nothing".
 * For the head and torso slots it is `itemtypes`' `BodyLoc1`/`BodyLoc2`, which is
 * where `head` and `tors` are stated.
 *
 * The monster is the row's `Class` resolved through {@link HirelingTable.monsters};
 * without it the two arm slots answer false rather than guessing.
 */
export function hirelingAccepts(
  monster: HirelingMonster | null,
  slot: HirelingSlot,
  base: ItemBase,
  index: ItemIndex,
): boolean {
  if (slot.location === 'right_arm' || slot.location === 'left_arm') {
    if (monster === null) return false
    const wanted = slot.location === 'right_arm' ? monster.rightArmItemType : monster.leftArmItemType
    if (wanted === null || wanted === 'none') return false
    return index.hasType(base.type, wanted) || (base.type2 !== null && index.hasType(base.type2, wanted))
  }
  if (slot.bodyLocation === null) return false
  const places = bodyLocations(index)
  for (const type of index.typesOf(base.type)) {
    const locations = places.get(type)
    if (locations !== undefined && locations.includes(slot.bodyLocation)) return true
  }
  if (base.type2 !== null) {
    for (const type of index.typesOf(base.type2)) {
      const locations = places.get(type)
      if (locations !== undefined && locations.includes(slot.bodyLocation)) return true
    }
  }
  return false
}
