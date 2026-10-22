/**
 * The browser side of the three economies: fetch the tables, build the models.
 *
 * `d2/economy.ts` takes table *rows* and a layout's widget tree, so it works the
 * same in a test and in a page. This is the piece that knows where both come from.
 *
 * It reports which tables were missing rather than failing, for the same reason
 * `item-source.ts` does: a vendor's stock is useful without the hireling roster, and
 * a build with a partial export should still open a shop. Each part that is absent
 * ends up `null` in the result instead of being filled with a plausible number.
 *
 * The stash is the one part that needs something other than a table — its page sizes
 * come from `bankexpansionlayouthd` itself — so `layoutFor` is a callback rather than
 * a fetch: the caller already has the parsed UI layouts, and re-fetching and re-parsing
 * them here would be a second reader of the same file.
 */

import {
  createStash,
  parseGamble,
  parseHirelings,
  parseNpcTerms,
  parseStorePages,
  readStashLayout,
  type GambleTable,
  type HirelingStrings,
  type HirelingTable,
  type NpcTermsTable,
  type Stash,
  type StorePageTable,
} from './economy'
import type { ItemIndex } from './items'
import type { UiWidget } from './ui/widget'

/** The tables the economy reads, by the file the export wrote them to. */
export const ECONOMY_TABLE_FILES = {
  storePage: 'table_storepage.json',
  npc: 'table_npc.json',
  hireling: 'table_hireling.json',
  gamble: 'table_gamble.json',
  itemTypes: 'table_itemtypes.json',
  inventory: 'table_inventory.json',
} as const

export type EconomyTableKey = keyof typeof ECONOMY_TABLE_FILES

export interface EconomySource {
  readonly storePages: StorePageTable | null
  readonly npcTerms: NpcTermsTable | null
  readonly hirelings: HirelingTable | null
  readonly gamble: GambleTable | null
  readonly stash: Stash | null
  /** Every table that was not found, so a partial export is visible rather than assumed. */
  readonly missing: readonly string[]
}

export interface EconomySourceOptions {
  /**
   * The parsed widget tree of `bankexpansionlayouthd`.
   *
   * Null when the layout was not loaded, and the stash is then null: a page's size
   * exists only in the layout, and inventing one would make the grid and the model
   * disagree about how many cells there are.
   */
  readonly layoutFor?: (name: string) => UiWidget | null
  /**
   * How many shared stash pages to model.
   *
   * **No table states this**; see `StashLayoutOptions.sharedPages`. Three is the
   * number the retail panel's own tab bar shows next to `@shared` in the interface
   * this build draws from, and it is passed in rather than defaulted inside the
   * model so that the choice is visible at the one place it is made.
   */
  readonly sharedPages?: number
  /** The mercenary name ranges, from `strings_mercenaries.json`. */
  readonly hirelingStrings?: HirelingStrings
  /** `monstats` rows, for the hireling classes and sellers. */
  readonly monstats?: readonly never[]
}

/**
 * Builds every economy the export can support.
 *
 * `index` is the item index `item-source.ts` already built — the store pages need it
 * to turn their type codes into base items, and the gamble table needs it to turn its
 * codes into items.
 */
export async function createEconomySource(
  base: string,
  index: ItemIndex | null,
  options: EconomySourceOptions = {},
): Promise<EconomySource> {
  const missing: string[] = []
  // Without the item tables there is nothing to stock a shop with and nothing to
  // gamble for; the stash is the one part that does not need them, so it is still
  // built. Returning early here would take the stash down with the shops.
  if (index === null) {
    missing.push('item tables')
  }
  const rows = new Map<EconomyTableKey, never[]>()

  await Promise.all(
    (Object.keys(ECONOMY_TABLE_FILES) as EconomyTableKey[]).map(async (key) => {
      try {
        const response = await fetch(`${base}original/${ECONOMY_TABLE_FILES[key]}`, {
          cache: 'no-store',
        })
        if (!response.ok) {
          missing.push(key)
          return
        }
        rows.set(key, (await response.json()) as never[])
      } catch {
        missing.push(key)
      }
    }),
  )

  const storePageRows = rows.get('storePage') ?? []
  const npcRows = rows.get('npc') ?? []
  const hirelingRows = rows.get('hireling') ?? []

  let storePages: StorePageTable | null = null
  try {
    if (index !== null) storePages = parseStorePages(storePageRows, index)
  } catch {
    storePages = null
  }

  let npcTerms: NpcTermsTable | null = null
  try {
    npcTerms = parseNpcTerms(npcRows)
  } catch {
    npcTerms = null
  }

  let hirelings: HirelingTable | null = null
  try {
    hirelings = parseHirelings(hirelingRows, {
      monstats: options.monstats ?? [],
      ...(options.hirelingStrings === undefined ? {} : { strings: options.hirelingStrings }),
    })
  } catch {
    hirelings = null
  }

  let gamble: GambleTable | null = null
  try {
    if (index !== null) gamble = parseGamble(rows.get('gamble') ?? [], index)
  } catch {
    gamble = null
  }

  let stash: Stash | null = null
  const panel = options.layoutFor?.('bankexpansionlayouthd') ?? null
  if (panel !== null) {
    try {
      const layout = readStashLayout(panel, { sharedPages: options.sharedPages ?? 3 })
      if (layout !== null) stash = createStash(layout)
    } catch {
      stash = null
    }
  }

  return { storePages, npcTerms, hirelings, gamble, stash, missing }
}
