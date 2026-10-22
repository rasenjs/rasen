/**
 * `monpreset.txt` — which monster a `.ds1`'s type-1 record places.
 *
 * A type-1 record does not name a monster directly. The id indexes this table
 * within the file's act, and the `Place` value is then either a `monstats.txt`
 * id or a directive. Act 1's rows 0..8 are `gheed cain1 akara chicken rogue1
 * kashya cow warriv1 charsi`, and `global/tiles/act1/town/towne1.ds1` places
 * exactly ids 0, 2, 3, 4, 5, 7, 8 and 13 — the Rogue Encampment's roster, with
 * the guards, the livestock and the merchants that act 1's town is supposed to
 * have. Act 5's town resolves the same way to Malah, Qual-Kehk, Nihlathak, Cain
 * and the three injured barbarians.
 *
 * A few values are not monsters at all but instructions:
 *
 * | `Place` | meaning |
 * | --- | --- |
 * | `place_fallen`, `place_fallenshaman`, `place_champion`, `place_unique_pack`, `place_npc_pack`, `place_fallennest` | spawn from the act's own pool for that class |
 * | `place_bloodraven` | spawn the act's unique |
 * | `place_nothing` | place nothing, i.e. a reserved slot |
 *
 * Those are recognised rather than resolved, because turning them into a
 * monster is a spawn rule the tables do not contain.
 */

import type { MonsterTables } from './monsters'
import { objectById, type ObjectDef, type ObjectTable } from './objects'
import type { SuperUniqueDef, SuperUniqueTable } from './superuniques'

/**
 * The `monpreset.txt` act a `.ds1` file belongs to.
 *
 * `Ds1File.act` is the stored value, which is **0-based** — act 1's town stores
 * 0 — while `monpreset.txt`'s `Act` column is 1-based. Using the stored value
 * directly indexes the wrong act's roster, and act 1's list is long enough that
 * most placements still resolve to *a* monster, so the mistake shows as subtly
 * wrong monsters rather than as an error.
 *
 * The clamp is the `.ds1` format's own trap, documented in `original/ds1.ts`:
 * 51 retail files store 5 for act 5 and rely on the reader clamping to 4. Here
 * that means `expansion/siege/*.ds1`, which would otherwise ask for an act 6
 * that `monpreset.txt` does not have.
 */
export function monPresetAct(ds1Act: number): number {
  const highestZeroBasedAct = 4
  const zeroBased = Math.min(highestZeroBasedAct, Math.max(0, ds1Act))
  return zeroBased + 1
}

export interface PlaceTable {
  /** Act (1-based) → `Place` values, indexed by the `.ds1` id. */
  byAct: ReadonlyMap<number, readonly string[]>
  /** Every `Place` value the table names, in file order. */
  all: readonly string[]
}

export function parseMonPreset(rows: readonly Readonly<Record<string, string | null>>[]): PlaceTable {
  const byAct = new Map<number, string[]>()
  const all: string[] = []
  for (const row of rows) {
    const act = Number(row.Act)
    const place = row.Place
    if (!Number.isFinite(act) || place === null || place === undefined || place === '') continue
    all.push(place)
    const bucket = byAct.get(act)
    if (bucket) bucket.push(place)
    else byAct.set(act, [place])
  }
  return { byAct, all }
}

/** The `Place` value an act's type-1 record with this id refers to. */
export function placeAt(table: PlaceTable, act: number, id: number): string | null {
  const places = table.byAct.get(act)
  if (!places) return null
  return places[id] ?? null
}

/** `Place` values that instruct a spawn rather than naming a monster. */
const DIRECTIVES = [
  'place_fallen',
  'place_fallenshaman',
  'place_champion',
  'place_unique_pack',
  'place_npc_pack',
  'place_fallennest',
  'place_bloodraven',
  'place_nothing',
  'place_',
] as const

/** True when a `Place` value is a spawn instruction rather than a monster id. */
export function isPlaceDirective(place: string): boolean {
  const lowered = place.toLowerCase()
  return DIRECTIVES.some((prefix) => lowered.startsWith(prefix))
}

/**
 * The least a `.ds1` record has to carry to be resolved.
 *
 * Structural on purpose: `Ds1Object` as the `.ds1` reader produces it satisfies
 * this, and so does `LevelObject` once the level has added tile coordinates,
 * without either module having to know about the other.
 */
export interface PlaceableRecord {
  readonly type: number
  readonly id: number
  readonly x: number
  readonly y: number
  readonly flags: number
}

/**
 * Diablo II measures object coordinates in sub-tiles, five per tile per axis,
 * so a record's `x`/`y` are `tile * 5 + sub-cell`. `levels.ts` converts the same
 * way; the rule is restated here so a placement carries both coordinate systems
 * without the caller having to reach back into the level.
 */
const SUBTILES_PER_TILE = 5

function tileOf(subtile: number): number {
  return Math.floor(subtile / SUBTILES_PER_TILE)
}

/** What one `.ds1` record turned out to be. */
export type PlacementKind = 'monster' | 'object' | 'unresolved'

/**
 * The `monstats.AI` values whose units do not fight.
 *
 * `AI` is the one column in the tables that separates a townsperson or a farm animal
 * from a threat: 64 of the 752 rows say `Idle` — the cows, the chickens and the
 * rogues standing around the camp — and five say `Npc`, `NpcBarb`, `NpcOutOfTown` or
 * `NpcStationary`. Every other value names a combat AI, and `monai` documents the
 * parameters of each.
 *
 * This matters because a `.ds1` record for a cow is a *monster* record with
 * `monstats.npc` empty, so a reader that only asks "is it an NPC" concludes it is an
 * enemy. That is what happened in the act 1 town: its two cows and five chickens
 * spawned as hostile skeletons and the player's auto-attack killed one.
 */
const PASSIVE_AIS: ReadonlySet<string> = new Set([
  'Idle',
  'Npc',
  'NpcBarb',
  'NpcOutOfTown',
  'NpcStationary',
])

export interface Placement {
  kind: PlacementKind
  /** The raw `.ds1` record this came from. */
  source: PlaceableRecord
  /** The tile the record stands on, i.e. `source.x`/`y` divided by five. */
  tileX: number
  tileY: number
  /** `monstats.txt` id for a monster, `objects.txt` class for an object. */
  name: string
  /** The monster is an NPC the player talks to rather than fights. */
  npc: boolean
  /**
   * The monster will fight.
   *
   * False for the passive AIs above, which is what keeps a town's livestock and its
   * wandering rogues from being spawned as enemies. A placement with `hostile: false`
   * is drawn and can be walked past; it is never attacked and never attacks.
   */
  hostile: boolean
  /** `true` when the monster has a `monstats` row at all. */
  known: boolean
  /** Set for `kind === 'object'`. */
  object: ObjectDef | null
  /** Set when the placement is a named superunique rather than a base class. */
  superUnique: SuperUniqueDef | null
  /** Set for a directive, so a caller can report why it placed nothing. */
  directive: string | null
}

/**
 * Turns a level's `.ds1` records into placements.
 *
 * Nothing is dropped silently: a record that resolves to no monster gets a
 * `kind` of `unresolved` with the directive or the missing id attached, because
 * "the town has no NPCs" and "the town's NPCs are all `place_nothing`" are very
 * different states and only the caller can decide what to draw.
 *
 * A `Place` value is looked up in `monstats` first and `superuniques` second. The
 * two name spaces overlap only in appearance — `Coldcrow` is the superunique,
 * `cr_archer1` is the class it spawns as — so testing `monstats` first cannot
 * shadow a base monster.
 */
export function resolvePlacements(
  objects: readonly PlaceableRecord[],
  act: number,
  places: PlaceTable,
  objectTable: ObjectTable,
  monsters: MonsterTables | null,
  superUniques: SuperUniqueTable | null = null,
): readonly Placement[] {
  const out: Placement[] = []
  for (const source of objects) {
    if (source.type === 1) {
      const place = placeAt(places, act, source.id)
      if (place === null) {
        out.push({
          kind: 'unresolved',
          source,
          tileX: tileOf(source.x),
          tileY: tileOf(source.y),
          name: `monpreset id ${source.id}`,
          npc: false,
          hostile: false,
          known: false,
          object: null,
          superUnique: null,
          directive: null,
        })
        continue
      }
      if (isPlaceDirective(place)) {
        out.push({
          kind: 'unresolved',
          source,
          tileX: tileOf(source.x),
          tileY: tileOf(source.y),
          name: place,
          npc: false,
          hostile: false,
          known: false,
          object: null,
          superUnique: null,
          directive: place,
        })
        continue
      }
      const def = monsters?.byId.get(place) ?? null
      if (def !== null) {
        out.push({
          kind: 'monster',
          source,
          tileX: tileOf(source.x),
          tileY: tileOf(source.y),
          name: place,
          npc: def.flags.npc,
          hostile: !PASSIVE_AIS.has(def.ai),
          known: true,
          object: null,
          superUnique: null,
          directive: null,
        })
        continue
      }
      const unique = superUniques?.byName.get(place) ?? null
      const uniqueDef = unique === null ? null : (monsters?.byId.get(unique.monsterId) ?? null)
      out.push({
        kind: unique === null ? 'unresolved' : 'monster',
        source,
        tileX: tileOf(source.x),
        tileY: tileOf(source.y),
        name: unique?.monsterId ?? place,
        npc: uniqueDef?.flags.npc ?? false,
        hostile: uniqueDef === null ? false : !PASSIVE_AIS.has(uniqueDef.ai),
        known: uniqueDef !== null,
        object: null,
        superUnique: unique,
        directive: null,
      })
      continue
    }

    if (source.type === 2) {
      const def = objectById(objectTable, source.id)
      out.push({
        kind: def === null ? 'unresolved' : 'object',
        source,
        tileX: tileOf(source.x),
        tileY: tileOf(source.y),
        name: def?.className ?? `objects id ${source.id}`,
        npc: false,
        hostile: false,
        known: def !== null,
        object: def,
        superUnique: null,
        directive: null,
      })
      continue
    }

    out.push({
      kind: 'unresolved',
      source,
      tileX: tileOf(source.x),
      tileY: tileOf(source.y),
      name: `record type ${source.type}`,
      npc: false,
      hostile: false,
      known: false,
      object: null,
      superUnique: null,
      directive: null,
    })
  }
  return out
}

/** Counts per outcome, for a caller that wants to report what it placed. */
export interface PlacementSummary {
  monsters: number
  npcs: number
  objects: number
  unresolved: number
  /** Named superuniques among the monsters. */
  superUniques: number
  /** Monster ids in the order first met. */
  monsterIds: readonly string[]
}

export function summarisePlacements(placements: readonly Placement[]): PlacementSummary {
  const monsterIds: string[] = []
  const seen = new Set<string>()
  let monsters = 0
  let npcs = 0
  let objects = 0
  let unresolved = 0
  let superUniques = 0
  for (const placement of placements) {
    if (placement.kind === 'object') objects += 1
    else if (placement.kind === 'unresolved') unresolved += 1
    else {
      monsters += 1
      if (placement.npc) npcs += 1
      if (placement.superUnique !== null) superUniques += 1
      if (!seen.has(placement.name)) {
        seen.add(placement.name)
        monsterIds.push(placement.name)
      }
    }
  }
  return { monsters, npcs, objects, unresolved, superUniques, monsterIds }
}
