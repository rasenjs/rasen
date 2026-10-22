/**
 * The browser side of item generation: fetch the tables, build the index.
 *
 * `items.ts` and `treasure.ts` take table *text*, so they work the same in a test
 * and in a page. This is the piece that knows where the text comes from, and it
 * reports which tables were missing rather than failing: items and treasure
 * classes are useful separately, and a build with a partial export should still
 * drop something.
 */

import {
  createItemIndex,
  parseItemTables,
  ITEM_TABLE_NAMES,
  itemTableFile,
  type ItemIndex,
  type ItemTableName,
} from './items'
import { createDropResolver, type DropResolver } from './treasure'
import type { Random } from './items'

export interface ItemDataSource {
  index: ItemIndex
  resolver: DropResolver
  /** Tables that were not found, so a partial export is visible. */
  missing: string[]
}

export async function createItemDataSource(base: string): Promise<ItemDataSource | null> {
  const files: Partial<Record<ItemTableName, string>> = {}
  const missing: string[] = []

  await Promise.all(
    ITEM_TABLE_NAMES.map(async (name) => {
      try {
        const response = await fetch(`${base}original/${itemTableFile(name)}`, { cache: 'no-store' })
        if (!response.ok) {
          missing.push(name)
          return
        }
        files[name] = await response.text()
      } catch {
        missing.push(name)
      }
    }),
  )

  // Without the base item tables there is nothing to generate: that is the one
  // case where the caller must keep its own content.
  if (!files.weapons && !files.armor && !files.misc) return null

  const tables = parseItemTables(files)
  const index = createItemIndex(tables)
  return { index, resolver: createDropResolver({ index }), missing }
}

/**
 * A drop table name for a monster, by the game's own convention.
 *
 * `monstats` names its class in `TreasureClass` columns; without that link a
 * level-appropriate act table is the honest choice, and `treasureclassex` groups
 * by act and monster class, so the name is built the way the tables spell it.
 */
export function treasureClassFor(monsterLevel: number, act = 1): string {
  // The four bands the tables use are levels 1-3, 4-6, 7-9 and 10+, spelled
  // `weap3`/`weap6`/`weap9`/`weap12`; the class component is a body type.
  const band = monsterLevel <= 3 ? 3 : monsterLevel <= 6 ? 6 : monsterLevel <= 9 ? 9 : 12
  // `H2H` is the melee class, which every act has.
  return `Act ${act} H2H ${band === 3 ? 'A' : band === 6 ? 'B' : band === 9 ? 'C' : 'A'}`
}

export type { Random }
