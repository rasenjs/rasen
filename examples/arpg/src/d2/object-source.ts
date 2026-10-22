/**
 * The browser side of the object and NPC data: fetch the tables, build the index.
 *
 * `objects.ts`, `places.ts` and `dialogue.ts` all take parsed rows, so this is
 * the piece that knows where the rows come from. Each part is independent — a
 * build with no `objects.txt` still gets its NPCs, and one with no `vo.json`
 * still gets the props — because a partial export should degrade rather than
 * take the whole world down.
 */

import { parseObjectModes, parseObjectTable, type ObjectTable } from './objects'
import { parseMonPreset, type PlaceTable } from './places'
import { parseDialogue, type DialogueIndex } from './dialogue'
import type { MonsterTables, TableRow } from './monsters'

export interface WorldDataSource {
  objects: ObjectTable
  places: PlaceTable
  dialogue: DialogueIndex | null
  /** Tables that were not found, so a partial export is visible. */
  missing: string[]
}

export interface WorldDataOptions {
  /** Language column for the dialogue; defaults to the table's English column. */
  language?: string
}

async function fetchJson(base: string, name: string): Promise<TableRow[] | null> {
  try {
    const response = await fetch(`${base}original/${name}`, { cache: 'no-store' })
    if (!response.ok) return null
    return (await response.json()) as TableRow[]
  } catch {
    return null
  }
}

/**
 * The `monstats` ids a dialogue line may be attributed to.
 *
 * Only ids, and deliberately so: `forSpeaker` is asked about the id of an NPC an
 * area actually placed, so a bucket keyed by anything else is unreachable. The
 * string tables are useless here for a second reason — their keys are names
 * (`Warriv`, `Meshif`, `tyrael`) which beat the id form on the longest-match rule
 * and take the lines with them, leaving `warriv1` with none.
 *
 * The tables' own spellings still resolve, because a `monstats` id is tried both
 * whole and with its per-act digits removed (`warriv1` as `warriv`).
 */
function speakerCandidates(monsters: MonsterTables | null): string[] {
  const names: string[] = []
  if (monsters !== null) {
    for (const def of monsters.monsters) {
      if (def.flags.npc) names.push(def.id)
    }
  }
  return names
}

/**
 * Loads everything a level's placements need.
 *
 * Returns null only when there is no `objects.txt` at all, since without it not
 * a single type-2 record can be drawn.
 */
export async function createWorldDataSource(
  base: string,
  monsters: MonsterTables | null,
  options: WorldDataOptions = {},
): Promise<WorldDataSource | null> {
  const missing: string[] = []
  const [objects, objmode, monpreset, vo] = await Promise.all([
    fetchJson(base, 'table_objects.json'),
    fetchJson(base, 'table_objmode.json'),
    fetchJson(base, 'table_monpreset.json'),
    fetchJson(base, 'strings_vo.json'),
  ])
  for (const [name, rows] of [
    ['objects', objects],
    ['objmode', objmode],
    ['monpreset', monpreset],
    ['strings_vo', vo],
  ] as const) {
    if (rows === null) missing.push(name)
  }

  if (objects === null || monpreset === null) return null

  const objectTable = parseObjectTable(objects, parseObjectModes(objmode ?? []))
  const placeTable = parseMonPreset(monpreset)
  const dialogue =
    vo === null ? null : parseDialogue(vo, speakerCandidates(monsters), options.language)

  return { objects: objectTable, places: placeTable, dialogue, missing }
}
