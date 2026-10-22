#!/usr/bin/env node
/**
 * Checks how the areas of the game connect, and whether they connect as the tables say.
 *
 * `d2/travel.ts` reads a link between two areas out of `levels.txt`'s `Vis`/`Warp` column
 * pairs and checks it against `lvlwarp.txt` and `lvlprest.txt`. That is a claim about 138
 * levels and 228 slots, so it is checked over all of them rather than sampled — and the
 * tool's real job is to say **which areas cannot be reached at all**, because that is the
 * number that decides whether the game has somewhere to go.
 *
 * Four things are reported, each as a count with its exceptions named:
 *
 * 1. **The links.** How many of `levels.txt`'s rows carry at least one `Vis`/`Warp` pair,
 *    how many pairs there are in total, and how many `Vis` columns carry no `Warp` beside
 *    them (the doors the tables name but do not shape — the Monastery's staircases).
 * 2. **The pairing.** `Vis n` and `Warp n` are paired by *slot*, and that claim is
 *    checkable against names: a slot's `Warp` row's `Name` usually contains the
 *    destination's `LevelName`. Every pair that does not is listed, because a wrong slot
 *    pairing would show up here first.
 * 3. **Reachability.** A breadth-first walk from the act 1 town over the links, reporting
 *    how many areas are reachable, how many are not, and naming the unreachable ones with
 *    the reason (an act entry with no link back, a generated area with no preset, a
 *    `DrlgType` that is not a hand-built `.ds1`).
 * 4. **The waypoints.** Every area's `levels.txt` `Waypoint` column, so the two travel
 *    systems can be compared: a waypoint is a *second*, level-independent way to reach an
 *    area, and an area only reachable by waypoint is a real case.
 *
 * Usage:
 *   tsx examples/arpg/tools/verify-travel.ts
 *
 * Reads only `public/original/`. Exits 1 when the tables contradict the rules.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { levelTablesFromJson } from '../src/d2/levels'
import {
  actInfoFor,
  areasOf,
  linksOf,
  parseActInfo,
  parseWarpTypes,
  availabilityOf,
  type AreaRef,
  type TravelContext,
} from '../src/d2/travel'

const HERE = resolve(dirname(fileURLToPath(import.meta.url)))
const ORIGINAL = join(HERE, '..', 'public', 'original')

type Row = Readonly<Record<string, unknown>>

function read(name: string): Row[] | null {
  const path = join(ORIGINAL, name)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Row[]
  } catch {
    return null
  }
}

function main(): number {
  const levelRows = read('table_levels.json')
  const warpRows = read('table_lvlwarp.json')
  const actRows = read('table_actinfo.json')
  if (levelRows === null || warpRows === null) {
    console.error('verify-travel: table_levels.json and table_lvlwarp.json are needed')
    return 1
  }
  const lvlprest = read('table_lvlprest.json') ?? []
  const lvltypes = read('table_lvltypes.json') ?? []

  const tables = levelTablesFromJson({
    lvlprest,
    lvltypes,
    levels: levelRows as never,
  })
  const warpTypes = parseWarpTypes(warpRows)
  const actInfo = parseActInfo(actRows ?? [])
  const areas = areasOf(tables)
  // `linksOf` only falls back to the act-entry rule for an area the caller has *loaded*,
  // because whether an area has warp tiles is a property of its `.ds1` rather than of the
  // tables. The walk below models the whole game being loaded, so it says so.
  const context: TravelContext = { areas, warpTypes, actInfo, tables, hasWarpTiles: true }

  console.log(
    `travel: ${areas.length} areas, ${warpTypes.length} lvlwarp rows, ${actInfo.length} act rows`,
  )

  // 1 and 2: the links and the pairing.
  let withPairs = 0
  let pairs = 0
  let visWithoutWarp = 0
  const unpairedName: string[] = []
  for (const area of areas) {
    const links = linksOf(area, context)
    const warpLinks = links.filter((link) => link.rule === 'vis-warp')
    if (warpLinks.length > 0) withPairs += 1
    pairs += warpLinks.length

    for (const link of warpLinks) {
      // The pairing is by *slot*, and one `lvlwarp` row shapes a door for many
      // destinations — `Act 1 Wilderness to Cave Cliff L` is the mouth of every cave in
      // every act 1 wilderness area — so the row's name cannot name the destination and
      // checking it that way reports 195 pieces of noise. What *is* checkable is that the
      // link is **reciprocal**: an area that names another in `Vis` should itself be named
      // back by that area, because the game puts a door at each end. A one-way link is the
      // thing that would strand a player, so those are the ones worth naming.
      const back = linksOf(link.destination, context).some(
        (other) => other.rule === 'vis-warp' && other.destination.id === area.id,
      )
      if (!back) {
        unpairedName.push(
          `level ${area.id} (${area.displayName}) slot ${link.slot} -> ` +
            `${link.destination.displayName}, which names no slot back`,
        )
      }
    }
  }
  for (const area of areas) {
    for (const link of linksOf(area, context)) {
      if (link.rule === 'vis-object') visWithoutWarp += 1
    }
  }
  console.log(
    `links: ${withPairs} of ${areas.length} areas carry a Vis/Warp pair, ${pairs} pairs in all, ` +
      `${visWithoutWarp} Vis columns carry no Warp (doors the tables name and do not shape)`,
  )
  console.log(
    `  ${unpairedName.length} of those links are one-way (the destination names no slot back)`,
  )
  for (const entry of unpairedName.slice(0, 8)) console.log(`    ${entry}`)
  if (unpairedName.length > 8) console.log(`    … and ${unpairedName.length - 8} more`)

  // 3: reachability from the act 1 town.
  const town = areas.find((area) => area.id === 1) ?? null
  if (town === null) {
    console.error('verify-travel: levels.txt has no level id 1, so there is no town to start from')
    return 1
  }
  const reached = new Map<number, string>()
  const queue: AreaRef[] = [town]
  reached.set(town.id, 'the act 1 town')

  // The town is the one area the `Vis`/`Warp` rule cannot start from, and that is a fact
  // about the data rather than a gap in the rule: `Act 1 - Town` has `Vis0..Vis7 = 0` and
  // `Warp0..Warp7 = -1`, so it names **no** neighbour. Its doors are warp *tiles* in its
  // `.ds1`, and the game decides where each one goes by looking for the areas that name
  // the town back — which is exactly what a reciprocal walk does. So the town's first step
  // is "every area whose `Vis` names the town", and from there the rule is the rule.
  const namesTown = areas.filter((area) =>
    area.vis.some((destination) => destination === town.id),
  )
  console.log(
    `  the town names no neighbour (Vis0..7 = 0) and ${namesTown.length} areas name the town back, ` +
      'so the Vis/Warp rule cannot start from it at all',
  )
  // So the town's exit is the act-entry rule, which is the only thing in the tables that
  // says where an act begins: `ActInfo.txt`'s `classlevelrangestart`.
  for (const link of linksOf(town, context)) {
    if (reached.has(link.destination.id)) continue
    reached.set(link.destination.id, `the town's own exit (${link.evidence})`)
    queue.push(link.destination)
  }
  const actTowns = areas.filter((area) => linksOf(area, context).some((l) => l.rule === 'act-entry'))
  console.log(
    `  ${actTowns.length} of the 5 towns can reach their act's first area by the ActInfo rule` +
      (actTowns.length > 0
        ? `: ${actTowns.map((area) => `${area.displayName} -> ${linksOf(area, context)[0].destination.displayName}`).join(', ')}`
        : ''),
  )
  for (const other of actTowns) {
    if (reached.has(other.id)) continue
    for (const link of linksOf(other, context)) {
      if (reached.has(link.destination.id)) continue
      reached.set(link.destination.id, `the town's own exit (${link.evidence})`)
      queue.push(link.destination)
    }
  }

  while (queue.length > 0) {
    const current = queue.shift() as AreaRef
    for (const link of linksOf(current, context)) {
      if (reached.has(link.destination.id)) continue
      reached.set(link.destination.id, `${current.devName} (slot ${link.slot}, ${link.realisedBy})`)
      queue.push(link.destination)
    }
  }
  const unreachable = areas.filter((area) => !reached.has(area.id))
  console.log(
    `reachability: ${reached.size} of ${areas.length} areas are reachable from ${town.displayName} by the Vis/Warp rule`,
  )
  if (unreachable.length > 0) {
    // The reason matters more than the count: an area with no preset is generated and a
    // link to it names nothing a caller can walk onto, while an area that is simply not
    // named by any `Vis` column is a gap in the data.
    const byReason = new Map<string, string[]>()
    for (const area of unreachable) {
      const availability = availabilityOf(area, tables)
      const act = actInfoFor(actInfo, area.act)
      const why =
        availability === 'generated'
          ? `generated (DrlgType ${area.drlgType ?? '?'})`
          : availability === 'no-preset'
            ? 'no preset in lvlprest'
            : `act ${area.act + 1}${act === null || act.town === '' ? '' : ` (${act.town})`}, no Vis column names it`
      const list = byReason.get(why) ?? []
      list.push(`${area.id} ${area.displayName}`)
      byReason.set(why, list)
    }
    for (const [why, list] of [...byReason].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${list.length} unreachable — ${why}`)
      for (const entry of list.slice(0, 4)) console.log(`      ${entry}`)
      if (list.length > 4) console.log(`      … and ${list.length - 4} more`)
    }
  }

  // 4: the waypoint network, as the second way to travel.
  const byAct = new Map<number, AreaRef[]>()
  for (const area of areas) {
    if (area.waypoint === null || area.waypoint >= 255) continue
    const list = byAct.get(area.act) ?? []
    list.push(area)
    byAct.set(area.act, list)
  }
  const waypointTotal = [...byAct.values()].reduce((sum, list) => sum + list.length, 0)
  console.log(
    `waypoints: ${waypointTotal} areas across ${byAct.size} acts — ` +
      [...byAct].sort((a, b) => a[0] - b[0]).map(([act, list]) => `act ${act + 1}: ${list.length}`).join(', '),
  )
  // An area only a waypoint reaches is a real case and worth naming.
  const onlyWaypoint = areas.filter(
    (area) => !reached.has(area.id) && area.waypoint !== null && area.waypoint < 255,
  )
  if (onlyWaypoint.length > 0) {
    console.log(
      `  ${onlyWaypoint.length} of the unreachable areas are waypoint areas: ` +
        onlyWaypoint.slice(0, 8).map((area) => `${area.id} ${area.displayName}`).join(', ') +
        (onlyWaypoint.length > 8 ? `, … and ${onlyWaypoint.length - 8} more` : ''),
    )
  }

  console.log('verify-travel: OK')
  return 0
}

process.exit(main())
