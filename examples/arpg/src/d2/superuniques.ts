/**
 * `superuniques.txt` — the named monsters a map places by name.
 *
 * A `.ds1` type-1 record indexes `monpreset.txt`, and most of those values are
 * `monstats.txt` ids. The rest are superuniques, which are named here instead:
 * act 1's Barracks places `The Smith`, and the Jail places `Pitspawn Fouldog`.
 * Resolving only `monstats` leaves 591 of the 1,688 monster placements in the
 * package unexplained; every one of them is a row in this table.
 *
 * A superunique is not a new monster. It is an ordinary `monstats` row —
 * `The Smith` is the `smith` class, `Coldcrow` is `cr_archer1` — promoted with
 * modifiers and its own treasure class.
 */

import { tableNumber, tableString, type TableRow } from './monsters'

export interface SuperUniqueDef {
  /** `Superunique`, the `.ds1`-visible name. */
  name: string
  /** `Name`, the display name; equal to `name` in all 67 retail rows. */
  displayName: string
  /** `Class` — the `monstats.txt` id this superunique instantiates. */
  monsterId: string
  /** `hcIdx` — the game's own index for the unique, used to track the kill. */
  hardcodedIndex: number
  /** `TC` — the treasure class, which overrides the base monster's. */
  treasureClass: string | null
  /** `Utrans` — the colour transform that makes it visually distinct. */
  colourTransform: number
  /** `Mod1`..`Mod3` — `monumod.txt` ids, e.g. Extra Strong, Cold Enchanted. */
  modifierIds: readonly number[]
  /** `MinGrp`/`MaxGrp` — how many it spawns with. */
  minGroup: number
  maxGroup: number
  /** `AutoPos` — the level generator may place it automatically. */
  autoPosition: boolean
}

export interface SuperUniqueTable {
  entries: readonly SuperUniqueDef[]
  byName: ReadonlyMap<string, SuperUniqueDef>
}

export function parseSuperUniques(rows: readonly TableRow[]): SuperUniqueTable {
  const entries: SuperUniqueDef[] = []
  const byName = new Map<string, SuperUniqueDef>()
  for (const row of rows) {
    const name = tableString(row.Name)
    const monsterId = tableString(row.Class)
    if (name === null || monsterId === null) continue
    const modifierIds: number[] = []
    for (let index = 1; index <= 3; index += 1) {
      const value = tableNumber(row[`Mod${index}`])
      // 0 is "no modifier" in this table rather than a modifier id.
      if (value !== null && value !== 0) modifierIds.push(value)
    }
    const def: SuperUniqueDef = {
      name: tableString(row.Superunique) ?? name,
      displayName: name,
      monsterId,
      hardcodedIndex: tableNumber(row.hcIdx) ?? 0,
      treasureClass: tableString(row.TC),
      colourTransform: tableNumber(row.Utrans) ?? 0,
      modifierIds,
      minGroup: tableNumber(row.MinGrp) ?? 1,
      maxGroup: tableNumber(row.MaxGrp) ?? 1,
      autoPosition: (tableNumber(row.AutoPos) ?? 0) !== 0,
    }
    entries.push(def)
    byName.set(def.name, def)
  }
  return { entries, byName }
}
