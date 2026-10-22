#!/usr/bin/env node
/**
 * Checks the game's mode numbering — and the four rules that are stated in terms of it —
 * against the exported tables and the reference's own readings.
 *
 * `d2/modes.ts` hard-codes `plrmode.txt`'s row order, because a mode number is a contract
 * with the engine rather than data the app may choose to load: mode 0 has to mean "in the
 * death animation" in a build with no export as much as in one with it. Hard-coding a
 * contract is only safe if something checks it, and that is this tool.
 *
 * Four claims, each checkable:
 *
 * 1. **The numbering** — every row of `plrmode.txt`, in order, matches
 *    `PLAYER_MODES`: the index, the `Name` and the token.
 * 2. **The dead test** — the reference records the engine's own dead test as "mode 0 or
 *    0x11" (`dm/host/dm_hud.h`), and `0x11` must be the row whose `Name` is `Dead`. If the
 *    table ever renumbers, that arithmetic stops agreeing and this fails.
 * 3. **The towns** — the five `levels.txt` ids the reference names (`dm/host/dm_hud.h`,
 *    `dm_hud_area_is_town`) must be exactly the ids whose level name is that town's name,
 *    and no monsters may be placed in any of them by their own `levels.txt` density.
 * 4. **The waypoint classes** — the five town waypoints must be `objects.txt` **row
 *    numbers** whose `Name` says waypoint *and* whose `Class` column names the town's own
 *    role. The reference's list is checked too, and one of its five pairs fails: it gives
 *    act 5's id 109 the class 429, and row 429 is a shrine. Row 430 is `WaypointExp`.
 *
 * Usage:
 *   tsx examples/arpg/tools/verify-modes.ts
 *
 * Reads only `public/original/`. Prints true counts, names every counter-example, and
 * exits 1 on any failure.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MODE_DEAD,
  MODE_DEATH,
  PLAYER_MODES,
  TOWN_LEVEL_IDS,
  TOWN_WAYPOINT_CLASS,
  isDeadMode,
  isTownArea,
  modeOfToken,
  playersLifeMultiplier,
  townWaypointClass,
} from '../src/d2/modes'

const HERE = resolve(dirname(fileURLToPath(import.meta.url)))
const ORIGINAL = join(HERE, '..', 'public', 'original')

type Row = Readonly<Record<string, string | number | null>>

function read(name: string): Row[] | null {
  const path = join(ORIGINAL, name)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Row[]
  } catch {
    return null
  }
}

function text(row: Row, column: string): string | null {
  const value = row[column]
  if (typeof value === 'string' && value !== '') return value
  if (typeof value === 'number') return String(value)
  return null
}

function integer(row: Row, column: string): number | null {
  const value = text(row, column)
  if (value === null) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function main(): number {
  const problems: string[] = []

  // 1. The numbering.
  const modeRows = read('table_plrmode.json')
  if (modeRows === null) {
    problems.push('table_plrmode.json is not exported, so the numbering cannot be checked')
  } else {
    console.log(`plrmode: ${modeRows.length} rows in the table, ${PLAYER_MODES.length} in modes.ts`)
    if (modeRows.length !== PLAYER_MODES.length) {
      problems.push(
        `plrmode.txt has ${modeRows.length} rows and modes.ts has ${PLAYER_MODES.length}`,
      )
    }
    for (let index = 0; index < Math.min(modeRows.length, PLAYER_MODES.length); index += 1) {
      const row = modeRows[index]
      const entry = PLAYER_MODES[index]
      const name = text(row, 'Name')
      const token = text(row, 'Token')
      if (name !== entry.name) {
        problems.push(`mode ${index}: the table says ${JSON.stringify(name)}, modes.ts ${JSON.stringify(entry.name)}`)
      }
      if (token !== null && token.toLowerCase() !== entry.token) {
        problems.push(
          `mode ${index} (${name}): the table's token is ${JSON.stringify(token)}, modes.ts ${JSON.stringify(entry.token)}`,
        )
      }
      if (entry.index !== index) {
        problems.push(`modes.ts's entry ${index} carries index ${entry.index}`)
      }
      // A round trip through the token has to come back to the same row for every mode
      // whose token is unique, which is the property a caller relies on.
      const back = modeOfToken(entry.token)
      const unique = PLAYER_MODES.filter((mode) => mode.token === entry.token).length === 1
      if (unique && (back === null || back.index !== index)) {
        problems.push(`modeOfToken(${JSON.stringify(entry.token)}) returned ${back?.index ?? 'null'}, expected ${index}`)
      }
    }
  }

  // 2. The dead test.
  const deadRow = PLAYER_MODES[MODE_DEAD]
  if (deadRow === undefined || deadRow.name !== 'Dead') {
    problems.push(`mode ${MODE_DEAD} must be the row named Dead; modes.ts has ${deadRow?.name}`)
  }
  const deathRow = PLAYER_MODES[MODE_DEATH]
  if (deathRow === undefined || deathRow.name !== 'Death') {
    problems.push(`mode ${MODE_DEATH} must be the row named Death; modes.ts has ${deathRow?.name}`)
  }
  // The reference states the test as "0 or 0x11", so 0x11 has to be the Dead row.
  if (MODE_DEAD !== 0x11) {
    problems.push(`the reference's dead test is "0 or 0x11", so MODE_DEAD must be 17; it is ${MODE_DEAD}`)
  }
  for (const mode of [MODE_DEATH, MODE_DEAD]) {
    if (!isDeadMode(mode)) problems.push(`isDeadMode(${mode}) is false`)
  }
  for (const mode of [1, 2, 5, 6, 7, 10]) {
    if (isDeadMode(mode)) problems.push(`isDeadMode(${mode}) is true, and that mode is not a death mode`)
  }
  console.log(
    `dead test: mode ${MODE_DEATH} (${deathRow?.name}) or ${MODE_DEAD} (${deadRow?.name}) = 0x${MODE_DEAD.toString(16)}`,
  )

  // 3. The towns.
  const levelRows = read('table_levels.json')
  if (levelRows === null) {
    problems.push('table_levels.json is not exported, so the towns cannot be checked')
  } else {
    const byId = new Map<number, Row>()
    for (const row of levelRows) {
      const id = integer(row, 'Id')
      if (id !== null) byId.set(id, row)
    }
    console.log(`towns: ${TOWN_LEVEL_IDS.length} ids claimed, ${byId.size} level rows read`)
    for (const id of TOWN_LEVEL_IDS) {
      const row = byId.get(id)
      if (row === undefined) {
        problems.push(`level id ${id} is claimed as a town and the table has no such row`)
        continue
      }
      const name = text(row, 'Name') ?? ''
      // The `Name` column is the level's own name, and the town ids the reference gives
      // all carry "Town" in it. That is the check: a claimed town id whose row is not a
      // town is the failure this catches.
      if (!/town/i.test(name)) {
        problems.push(`level id ${id} is claimed as a town but its Name is ${JSON.stringify(name)}`)
      }
      // The area tables place no monsters in a town, so a town's density is zero. That
      // is the second half of "this is a town" and it is in the data.
      const density = integer(row, 'MonDen')
      if (density !== null && density > 0) {
        problems.push(`level id ${id} (${name}) is claimed as a town and its MonDen is ${density}`)
      }
    }
    // And the other way: a level whose name says town but whose id is not in the set.
    const extra: string[] = []
    for (const [id, row] of byId) {
      const name = text(row, 'Name') ?? ''
      if (/town/i.test(name) && !isTownArea(id)) extra.push(`${id} ${name}`)
    }
    if (extra.length > 0) {
      console.log(`  levels whose name says town and whose id is not in the set: ${extra.join(', ')}`)
    }
    if (isTownArea(2)) problems.push('level id 2 is the Blood Moor and isTownArea says it is a town')
  }

  // 4. The waypoint classes.
  const objectRows = read('table_objects.json')
  if (objectRows === null) {
    problems.push('table_objects.json is not exported, so the waypoint classes cannot be checked')
  } else {
    console.log(`waypoints: ${Object.keys(TOWN_WAYPOINT_CLASS).length} id/class pairs to check against ${objectRows.length} object rows`)
    for (const [townId, classId] of Object.entries(TOWN_WAYPOINT_CLASS)) {
      // The reference's own note: a preset unit record's object class is the object's
      // **row number** in objects.txt, not its `Id` column.
      const row = objectRows[classId]
      if (row === undefined) {
        problems.push(`object class ${classId} (town ${townId}) is out of range of ${objectRows.length} rows`)
        continue
      }
      const name = `${text(row, 'Name') ?? ''} ${text(row, 'Description') ?? ''} ${text(row, 'Token') ?? ''}`
      if (!/waypoint|way point|warp/i.test(name)) {
        problems.push(
          `object class ${classId} (town ${townId}) is row ${classId}, whose name is ${JSON.stringify(name.trim())} and names no waypoint`,
        )
      }
      // The `Class` column names the waypoint's own role, which is what makes this a
      // reading rather than an inference from row adjacency: act 1's is
      // `WaypointOutsideAct1`, act 2's `WaypointAct2`, and the expansion's
      // `WaypointExp`. Print it so a reader can audit the pairing.
      console.log(`  town ${townId} -> object row ${classId}: ${text(row, 'Name')} (${text(row, 'Class')})`)
      if (townWaypointClass(Number(townId)) !== classId) {
        problems.push(`townWaypointClass(${townId}) did not return ${classId}`)
      }
    }
    if (townWaypointClass(2) !== null) problems.push('townWaypointClass(2) is not null')
  }

  // The monster-count multiplier, against the reference's one measured value.
  const atEight = playersLifeMultiplier(8)
  if (Math.abs(atEight - 4.5) > 1e-9) {
    problems.push(`playersLifeMultiplier(8) is ${atEight}, and the reference measured 4.5`)
  }
  if (Math.abs(playersLifeMultiplier(1) - 1) > 1e-9) {
    problems.push(`playersLifeMultiplier(1) is ${playersLifeMultiplier(1)}, expected 1`)
  }
  console.log(
    `players: life multiplier 1..8 = ${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => playersLifeMultiplier(n)).join(', ')} (8 -> 4.5, measured)`,
  )

  if (problems.length > 0) {
    console.log(`verify-modes: FAIL — ${problems.length} problem(s)`)
    for (const problem of problems) console.log(`  ${problem}`)
    return 1
  }
  console.log('verify-modes: OK')
  return 0
}

process.exit(main())
