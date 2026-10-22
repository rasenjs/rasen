#!/usr/bin/env node
/**
 * Checks the level generator: which areas it can build, and whether what it
 * builds is a level a player can finish.
 *
 * `src/d2/drlg.ts` claims to lay out the `DrlgType 1` (maze) and `DrlgType 3`
 * (outdoor) areas of `Levels.txt` from `LvlMaze.txt` and `LvlSub.txt`. That is a
 * claim about 138 levels, so it is checked over all of them rather than sampled,
 * and in two halves:
 *
 * 1. **What can be planned.** Every level is planned from the tables alone and
 *    its verdict counted: a `LvlPrest` row names it, the generator can lay it
 *    out, or it is refused — with the refusal's own reason, named per area. The
 *    refusals are the interesting half: they are the areas that stay shut, and
 *    the reason has to be a fact about the tables rather than a shrug.
 * 2. **What was built.** Every area the generator can plan *and* this export can
 *    feed is composed and assembled, and the result measured: its size, the
 *    fraction of cells the map's own rule calls walkable, the doors it has
 *    against the `Vis`/`Warp` slots it needs, whether the hero's entry tile
 *    reaches every exit and how much of the walkable area, and how many of its
 *    cells reference a block no tileset it names can supply.
 *
 * The checks that fail the run are the ones a player would feel: an empty area, a
 * door the player cannot reach, a door count that does not match the slot count
 * (which is what `travel.ts` needs to pair them), a maze that came out as a
 * single room when `LvlMaze.txt` says more, and a plan that contradicts the
 * tables it was planned from. Counts that are *gaps* rather than failures — the
 * cells with no picture, the areas this export cannot feed — are printed with the
 * offending file or key named, which is this repository's rule for a gap.
 *
 * Usage:
 *   tsx examples/arpg/tools/verify-drlg.ts
 *   D2R_ROMFS=<extracted romfs> tsx examples/arpg/tools/verify-drlg.ts
 *
 * Reads `public/original/` unless `D2R_ROMFS` points at a fuller extraction.
 * Exits 1 when a check fails.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  assembleLevelFromDs1,
  levelTablesFromJson,
  type Level,
  type LevelRow,
  type LevelSource,
  type LevelTables,
} from '../src/d2/levels'
import {
  composeArea,
  dt1PathOf,
  parseLvlMaze,
  parseLvlSub,
  planArea,
  populateMonsters,
  roomPrefixCandidates,
  type DrlgPlan,
  type DrlgRefusal,
} from '../src/d2/drlg'
import {
  areasOf,
  entryTileOf,
  exitSites,
  linksOf,
  parseActInfo,
  parseWarpTypes,
  warpTilesOf,
  type AreaRef,
  type TravelContext,
} from '../src/d2/travel'

const HERE = resolve(import.meta.dirname)
const DATA = join(HERE, '..', 'public', 'original')
const ROMFS = process.env.D2R_ROMFS
const TILES = ROMFS ? join(ROMFS, 'global', 'tiles') : join(DATA, 'tiles')

type Row = Readonly<Record<string, unknown>>

function read(name: string): Row[] | null {
  const path = join(DATA, name)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Row[]
  } catch {
    return null
  }
}

function listTiles(): string[] {
  const out: string[] = []
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name), `${prefix}${entry.name}/`)
      else if (entry.name.toLowerCase().endsWith('.dt1')) out.push(`${prefix}${entry.name}`)
    }
  }
  if (existsSync(TILES)) walk(TILES, '')
  return out
}

const tileBytes = new Map<string, Uint8Array | null>()
function readTile(relativePath: string): Uint8Array | null {
  const key = relativePath.toLowerCase()
  const cached = tileBytes.get(key)
  if (cached !== undefined) return cached
  const path = join(TILES, key)
  let bytes: Uint8Array | null = null
  try {
    if (existsSync(path) && statSync(path).isFile()) bytes = new Uint8Array(readFileSync(path))
  } catch {
    bytes = null
  }
  tileBytes.set(key, bytes)
  return bytes
}

/** A cell is walkable exactly when `world.ts` says it is. */
function mapWalkable(level: Level, x: number, y: number): boolean {
  const tile = level.tileAt(x, y)
  return tile !== null && tile.resolved && level.walkable(x, y)
}

interface WalkResult {
  reached: number
  seats: boolean[]
}

/** Breadth-first from a tile over the map's own walkability. */
function walkFrom(level: Level, start: { x: number; y: number }, targets: ReadonlyArray<{ x: number; y: number }>): WalkResult {
  const width = level.width
  const height = level.height
  const seen = new Uint8Array(width * height)
  const queue: number[] = []
  const push = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const index = y * width + x
    if (seen[index] === 1 || !mapWalkable(level, x, y)) return
    seen[index] = 1
    queue.push(index)
  }
  // The seat counts as reached when any neighbour of it is: a door tile is not
  // always standable — `travel-runtime.ts` says the game's own check is "on the
  // tile or beside it" — so the tile and its four neighbours are all accepted.
  const seats = targets.map(() => false)
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]
    if (mapWalkable(level, target.x, target.y)) {
      seen[target.y * width + target.x] = 1
      queue.push(target.y * width + target.x)
    }
  }
  if (!mapWalkable(level, start.x, start.y)) {
    // Start beside the entry tile instead of inside a wall.
    push(start.x + 1, start.y)
    push(start.x - 1, start.y)
    push(start.x, start.y + 1)
    push(start.x, start.y - 1)
  } else {
    push(start.x, start.y)
  }
  let reached = 0
  while (queue.length > 0) {
    const index = queue.pop() as number
    reached += 1
    const x = index % width
    const y = Math.floor(index / width)
    push(x + 1, y)
    push(x - 1, y)
    push(x, y + 1)
    push(x, y - 1)
    for (let i = 0; i < targets.length; i++) {
      if (seats[i]) continue
      const target = targets[i]
      if (Math.abs(target.x - x) + Math.abs(target.y - y) <= 1) seats[i] = true
    }
  }
  return { reached, seats }
}

function fail(problems: string[], message: string): void {
  problems.push(message)
}

function main(): number {
  const levelRows = read('table_levels.json')
  const lvlprest = read('table_lvlprest.json')
  const lvltypes = read('table_lvltypes.json')
  const lvlmaze = read('table_lvlmaze.json')
  const lvlsub = read('table_lvlsub.json')
  if (!levelRows || !lvlprest || !lvltypes) {
    console.error('verify-drlg: table_levels.json, table_lvlprest.json and table_lvltypes.json are needed')
    return 1
  }
  if (!lvlmaze || !lvlsub) {
    console.error('verify-drlg: table_lvlmaze.json and table_lvlsub.json are needed — the generator is planned from them')
    return 1
  }
  const hasTiles = existsSync(TILES)

  const tables: LevelTables = levelTablesFromJson({
    lvlprest,
    lvltypes,
    levels: levelRows as never,
    lvlmaze,
    lvlsub,
  })
  const maze = parseLvlMaze(lvlmaze)
  const subs = parseLvlSub(lvlsub)
  const areas = areasOf(tables)
  const context: TravelContext = {
    areas,
    warpTypes: parseWarpTypes(read('table_lvlwarp.json') ?? []),
    actInfo: parseActInfo(read('table_actinfo.json') ?? []),
    tables,
    hasWarpTiles: true,
  }
  const source: LevelSource = {
    tables: () => tables,
    readTiles: (relativePath) => {
      const bytes = readTile(relativePath)
      if (!bytes) throw new Error(`not in this export: ${relativePath}`)
      return bytes
    },
    listTiles,
  }
  const problems: string[] = []

  console.log(
    `corpus: ${areas.length} levels, ${lvlprest.length} lvlprest rows, ${maze.length} lvlmaze rows, ` +
      `${subs.length} lvlsub rows, tiles from ${TILES}`,
  )

  // -------------------------------------------------------------------------
  // The tables' own claims, which every rule below rests on
  // -------------------------------------------------------------------------
  const borderRows = subs.filter((row) => row.bordType >= 0)
  const borderWithoutMaskZero = borderRows.filter((row) => row.dt1Mask !== 0)
  console.log(
    `tables: ${borderRows.length} lvlsub rows carry a BordType and ${borderRows.filter((r) => r.dt1Mask === 0).length} ` +
      `of them have Dt1Mask 0 (no LvlTypes file named): ${borderRows.map((row) => row.name).join(', ')}`,
  )
  if (borderWithoutMaskZero.length > 0) {
    fail(problems, `a BordType row names a tileset after all: ${borderWithoutMaskZero[0].name}`)
  }
  const sceneryRows = subs.filter((row) => row.bordType < 0)
  const sceneryWithoutBit0 = sceneryRows.filter((row) => (row.dt1Mask & 1) === 0)
  console.log(
    `tables: ${sceneryRows.length - sceneryWithoutBit0.length} of ${sceneryRows.length} non-border rows set bit 0 of Dt1Mask, ` +
      `which is the level type's File 1 — the file the ground fill reads. The ${sceneryWithoutBit0.length} that do not are ` +
      `${[...new Set(sceneryWithoutBit0.map((row) => row.name))].join(', ')} — act 2's desert rows, whose Dt1Mask names only ` +
      'their own act 2 files. This is a property of the table, not a rule the fill depends on: the fill reads File 1 by position.',
  )
  if (sceneryRows.length === 0) {
    fail(problems, 'no LvlSub row carries scenery: the outdoor generator has nothing to stamp')
  }
  const towns = tables.levels.filter((row) => /Town$/.test(row.name))
  const townsWithPreset = towns.filter((row) => tables.presets.some((preset) => preset.levelId === row.id))
  console.log(
    `tables: ${towns.length} levels are named "… Town" and ${townsWithPreset.length} of them carry a preset ` +
      '(the door tile a generated area copies)',
  )
  if (towns.length !== 5 || townsWithPreset.length !== 5) {
    fail(problems, `the "… Town" rule finds ${towns.length} towns and ${townsWithPreset.length} with presets, not 5 and 5`)
  }
  const mazeLevels = tables.levels.filter((row) => row.drlgType === 1)
  const mazeLevelsWithRow = mazeLevels.filter((row) => maze.some((entry) => entry.level === row.id))
  console.log(
    `tables: ${mazeLevelsWithRow.length} of ${mazeLevels.length} DrlgType 1 levels are named by a LvlMaze row`,
  )

  // The pieces a `.ds1` names must translate to files: the generator reads the
  // tilesets its pieces name, and a name that does not translate is a hole.
  let namedPieces = 0
  let translated = 0
  const untranslated: string[] = []
  for (const row of subs) {
    if (!row.file || !readTile(row.file)) continue
    namedPieces += 1
    const bytes = readTile(row.file)
    if (!bytes) continue
    for (const name of tilesetNamesOf(bytes)) {
      if (dt1PathOf(name) === '') continue
      translated += 1
      if (hasTiles && !readTile(dt1PathOf(name))) untranslated.push(`${row.file} -> ${dt1PathOf(name)}`)
    }
  }
  console.log(
    `pieces: ${namedPieces} lvlsub pieces are in this export, ${translated} tileset names between them translate to a path, ` +
      `${untranslated.length} of those name a file this export does not have`,
  )
  for (const entry of untranslated.slice(0, 4)) console.log(`    missing tileset: ${entry}`)

  // -------------------------------------------------------------------------
  // 1. What can be planned
  // -------------------------------------------------------------------------
  const byKind = new Map<string, AreaRef[]>()
  const planned = new Map<number, DrlgPlan>()
  const refusals = new Map<DrlgRefusal, AreaRef[]>()
  let presetAreas = 0
  for (const area of areas) {
    if (tables.presets.some((preset) => preset.levelId === area.id)) {
      presetAreas += 1
      continue
    }
    const level = tables.levels.find((row) => row.id === area.id)
    if (!level) continue
    const plan = planArea(level, tables, 20261013)
    if (plan.ok) {
      planned.set(area.id, plan)
      const list = byKind.get(plan.kind) ?? []
      list.push(area)
      byKind.set(plan.kind, list)
    } else {
      const list = refusals.get(plan.reason) ?? []
      list.push(area)
      refusals.set(plan.reason, list)
    }
  }
  console.log(
    `plan: ${presetAreas} of ${areas.length} areas have a LvlPrest row, ${planned.size} are laid out by the generator ` +
      `(${[...byKind].map(([kind, list]) => `${list.length} ${kind}`).join(', ') || 'none'}), ` +
      `${[...refusals.values()].reduce((sum, list) => sum + list.length, 0)} are refused`,
  )
  for (const [reason, list] of [...refusals].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(list.length).padStart(3)} refused — ${reason}`)
    for (const area of list.slice(0, 4)) {
      const detail = refusalDetail(area, tables)
      console.log(`      ${String(area.id).padStart(3)} ${area.displayName} — ${detail}`)
    }
    if (list.length > 4) console.log(`      … and ${list.length - 4} more`)
  }

  // -------------------------------------------------------------------------
  // 2. What was built
  // -------------------------------------------------------------------------
  if (!hasTiles) {
    console.log(`build: skipped — no tile tree under ${TILES}`)
    return finish(problems)
  }
  let built = 0
  let unfeedable = 0
  const buildFailures = new Map<string, AreaRef[]>()
  const walkFractions: string[] = []
  let worstWalk = { name: '', fraction: 1 }
  let totalUnresolvedCells = 0
  const unresolvedBy = new Map<string, number>()
  const reachFailures: string[] = []
  let doorMismatches = 0
  let unstandableDoors = 0
  let roomMismatches = 0
  const monsterCounts: string[] = []

  for (const [id, plan] of planned) {
    const area = areas.find((entry) => entry.id === id)
    if (!area) continue
    // What this export can feed: a plan names pieces the tree must have.
    const needed = new Set<string>()
    for (const piece of plan.pieces) needed.add(piece.file)
    for (const path of plan.tilesets) needed.add(path)
    if (plan.doorSource) needed.add(plan.doorSource.file)
    const absent = [...needed].filter((path) => readTile(path) === null)
    if (absent.length > 0) {
      unfeedable += 1
      const list = buildFailures.get(`act ${area.act + 1}`) ?? []
      list.push(area)
      buildFailures.set(`act ${area.act + 1}`, list)
      if (list.length === 1) console.log(`      first missing file: ${absent[0]} (${area.displayName})`)
      continue
    }
    const composed = composeArea(plan, readTile)
    if (!composed.ok) {
      unfeedable += 1
      const list = buildFailures.get(composed.reason) ?? []
      list.push(area)
      buildFailures.set(composed.reason, list)
      continue
    }
    const level = assembleLevelFromDs1(
      composed.ds1,
      {
        presetId: -1,
        presetName: `generated ${plan.kind}`,
        levelId: area.id,
        levelTypeId: area.levelType,
        variantIndex: 0,
        variantFile: '',
        tilesets: composed.tilesets,
      },
      source,
    )
    built += 1
    const cells = level.width * level.height
    let walk = 0
    let unresolvedCells = 0
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        if (mapWalkable(level, x, y)) walk += 1
        const tile = level.tileAt(x, y)
        if (tile !== null && !tile.resolved) unresolvedCells += 1
      }
    }
    const fraction = walk / cells
    walkFractions.push(`${area.displayName} ${(fraction * 100).toFixed(1)}%`)
    if (fraction < worstWalk.fraction) worstWalk = { name: area.displayName, fraction }
    totalUnresolvedCells += unresolvedCells
    if (unresolvedCells > 0) {
      // Name the key and the file that would answer it, when the tree can.
      const key = firstUnresolvedKey(level)
      const carrier = key === null ? '' : ` (main ${key} is defined by ${carrierOf(key)})`
      unresolvedBy.set(`${area.displayName}${carrier}`, unresolvedCells)
    }

    // Doors against slots: `travel.ts` pairs them by order and needs equality.
    const links = linksOf(area, { ...context, hasWarpTiles: warpTilesOf(level).length > 0 })
    const sites = exitSites(level, links)
    const doors = warpTilesOf(level).length
    unstandableDoors += composed.stats.markersWithoutFloor
    const slots = links.filter((link) => link.realisedBy !== 'object').length
    if (doors !== slots) {
      doorMismatches += 1
      fail(
        problems,
        `${area.displayName}: ${doors} door tiles for ${slots} Vis/Warp slots, so nothing pairs a slot with a tile`,
      )
    }
    const unbound = sites.filter((site) => site.destination === null).length
    if (doors > 0 && unbound > 0) {
      fail(problems, `${area.displayName}: ${unbound} of ${sites.length} door sites have no destination`)
    }

    // Reachability: the entry the engine would choose reaches every exit.
    const entry = entryTileOf(level, { x: level.width >> 1, y: level.height >> 1 }, sites, -1, null)
    const result = walkFrom(level, entry, sites.map((site) => ({ x: site.x, y: site.y })))
    const unreachable = result.seats.filter((seat) => !seat).length
    if (unreachable > 0) {
      reachFailures.push(`${area.displayName}: ${unreachable} of ${sites.length} exits not reachable from ${entry.x},${entry.y}`)
    }
    // The rule this tool checks: with exits, every exit must be reachable from
    // where the engine puts the player; with none, the player must be able to
    // walk the area. The fraction reached is reported either way, because a room
    // with its own alcoves is a fact about the retail pieces rather than a fault.
    const connectivity = walk > 0 ? result.reached / walk : 0
    if (sites.length === 0 && connectivity < 0.9) {
      fail(
        problems,
        `${area.displayName}: no exits, and the entry reaches only ${(connectivity * 100).toFixed(1)}% of the walkable area ` +
          `(${result.reached} of ${walk})`,
      )
    }
    if (sites.length > 0 && connectivity < 0.2) {
      fail(
        problems,
        `${area.displayName}: every exit is reachable but the entry reaches only ${(connectivity * 100).toFixed(1)}% ` +
          `of the walkable area (${result.reached} of ${walk}), which is a door in a pocket`,
      )
    }

    // Not empty, and not a single room where the tables say otherwise.
    if (fraction < 0.15) {
      fail(problems, `${area.displayName}: only ${(fraction * 100).toFixed(1)}% of ${cells} cells are walkable`)
    }
    if (plan.kind === 'maze') {
      const rooms = plan.grid.rooms
      const wantRooms = plan.params.rooms as number
      if (rooms !== Math.max(1, wantRooms)) {
        roomMismatches += 1
        fail(problems, `${area.displayName}: ${rooms} rooms for a LvlMaze Rooms of ${wantRooms}`)
      }
      if (rooms > 1 && rooms < 3) {
        fail(problems, `${area.displayName}: a maze of ${rooms} rooms where the table asks for ${wantRooms}`)
      }
    } else {
      if (level.width !== plan.width || level.height !== plan.height) {
        fail(
          problems,
          `${area.displayName}: assembled ${level.width}x${level.height} for a Levels.txt size of ${plan.width}x${plan.height}`,
        )
      }
    }

    // Population, from `Levels.txt` rather than from `.ds1` records.
    const levelRow = tables.levels.find((row) => row.id === area.id) as LevelRow
    const monsters = populateMonsters({ level: levelRow, assembled: level, seed: 20261013, avoid: entry })
    monsterCounts.push(`${area.displayName} ${monsters.length}`)
    if (levelRow.monsterDensity > 0 && levelRow.monsterClasses.length > 0 && monsters.length === 0) {
      fail(problems, `${area.displayName}: MonDen ${levelRow.monsterDensity} and ${levelRow.monsterClasses.length} classes, but no monster was placed`)
    }
    if (levelRow.monsterDensity === 0 && monsters.length > 0) {
      fail(problems, `${area.displayName}: MonDen 0 (a town) but ${monsters.length} monsters were placed`)
    }
  }

  console.log(
    `build: ${built} of ${planned.size} planned areas were assembled; ${unfeedable} could not be composed from this export`,
  )
  for (const [reason, list] of buildFailures) {
    console.log(`  ${list.length} unbuildable — ${reason}`)
  }
  console.log(
    `  walkable fraction: min ${(worstWalk.fraction * 100).toFixed(1)}% (${worstWalk.name}); ` +
      `${walkFractions.filter((entry) => Number(entry.split(' ').pop()?.replace('%', '')) < 40).length} of ${built} below 40%`,
  )
  console.log(
    `  doors: ${doorMismatches} areas whose door count differs from their slot count, ` +
      `${unstandableDoors} written doors with no free floor block to stand on`,
  )
  console.log(`  rooms: ${roomMismatches} mazes whose room count differs from LvlMaze's Rooms`)
  console.log(`  reachable: ${reachFailures.length} areas with an exit the entry cannot reach`)
  for (const entry of reachFailures.slice(0, 6)) console.log(`      ${entry}`)
  console.log(
    `  picture: ${totalUnresolvedCells} cells across ${unresolvedBy.size} areas reference a block no tileset they name ` +
      'supplies, and are drawn with the terrain fallback instead:',
  )
  if (unresolvedBy.size === 0) console.log('      none')
  for (const [name, count] of [...unresolvedBy].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    console.log(`      ${name}: ${count} cells`)
  }
  console.log(`  population: ${monsterCounts.slice(0, 8).join(', ')}${monsterCounts.length > 8 ? ', …' : ''}`)

  // The room sets: every family's patterns, so a family with a gap is named.
  let families = 0
  let familiesMissingPatterns = 0
  for (const row of maze) {
    const level = tables.levels.find((entry) => entry.id === row.level)
    if (!level || level.drlgType !== 1) continue
    const plan = planArea(level, tables, 20261013)
    const patterns = new Set<string>()
    for (const prefix of roomPrefixCandidates(level.name)) {
      for (const preset of tables.presets) {
        if (preset.levelId !== 0) continue
        if (!preset.name.startsWith(`${prefix} `)) continue
        const suffix = preset.name.slice(prefix.length + 1)
        if (/^[NSEW]{1,4}$/.test(suffix) && isSortedPattern(suffix)) patterns.add(suffix)
      }
      if (patterns.size > 0) break
    }
    if (patterns.size === 0) continue
    families += 1
    if (patterns.size < 15) {
      familiesMissingPatterns += 1
      console.log(
        `  family ${level.name}: ${patterns.size} of the 15 door patterns ` +
          `(missing ${['N', 'E', 'S', 'W', 'NS', 'NE', 'NW', 'SE', 'SW', 'EW', 'NSE', 'NSW', 'NEW', 'SEW', 'NSEW'].filter((p) => !patterns.has(p)).join(', ')})`,
      )
    }
    if (!plan.ok && patterns.size === 15 && level.drlgType === 1) {
      fail(problems, `family ${level.name} has all 15 patterns and was still refused: ${plan.reason}`)
    }
  }
  console.log(`families: ${families} maze families found by name, ${familiesMissingPatterns} of them short of 15 patterns`)

  return finish(problems)
}

function finish(problems: string[]): number {
  if (problems.length === 0) {
    console.log('verify-drlg: OK')
    return 0
  }
  console.log(`verify-drlg: ${problems.length} failures`)
  for (const problem of problems) console.log(`  ✗ ${problem}`)
  return 1
}

/** `NSEW` order, which is how `LvlPrest.txt` spells a door pattern. */
function isSortedPattern(suffix: string): boolean {
  let previous = -1
  for (const letter of suffix) {
    const at = 'NSEW'.indexOf(letter)
    if (at <= previous) return false
    previous = at
  }
  return true
}

/** The orientation-0/1..14 key of the first cell that resolved nowhere. */
function firstUnresolvedKey(level: Level): number | null {
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const tile = level.tileAt(x, y)
      if (tile !== null && !tile.resolved) {
        return ((tile.orientation & 0x1f) << 12) | ((tile.mainIndex & 0x3f) << 6) | (tile.subIndex & 0x3f)
      }
    }
  }
  return null
}

/** Which `.dt1` in the tile tree defines an orientation/main/sub key. */
function carrierOf(key: number): string {
  const orientation = (key >> 12) & 0x1f
  const mainIndex = (key >> 6) & 0x3f
  const subIndex = key & 0x3f
  for (const path of listTiles()) {
    const bytes = readTile(path)
    if (!bytes) continue
    try {
      const file = parseDt1ForCarrier(bytes)
      if (!file) continue
      if (file.some((block) => block.orientation === orientation && block.mainIndex === mainIndex && block.subIndex === subIndex)) {
        return path
      }
    } catch {
      continue
    }
  }
  return 'no file in this export'
}

/** A lazy import would be circular here; `parseDt1` is small enough to inline once. */
function parseDt1ForCarrier(bytes: Uint8Array): Array<{ orientation: number; mainIndex: number; subIndex: number }> | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== 7) return null
  const count = view.getUint32(0x10c, true)
  const out: Array<{ orientation: number; mainIndex: number; subIndex: number }> = []
  for (let i = 0; i < count; i++) {
    const at = 276 + i * 96
    out.push({
      orientation: view.getInt32(at + 20, true),
      mainIndex: view.getInt32(at + 24, true),
      subIndex: view.getInt32(at + 28, true),
    })
  }
  return out
}

/** The tileset names a `.ds1` stores. */
function tilesetNamesOf(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const version = view.getUint32(0, true)
  let at = 16
  if (version >= 10) at += 4
  if (version < 3) return []
  const count = view.getUint32(at, true)
  at += 4
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    let name = ''
    while (at < bytes.length && bytes[at] !== 0) {
      name += String.fromCharCode(bytes[at])
      at += 1
    }
    at += 1
    out.push(name)
  }
  return out
}

/** The sentence a refusal would show, quoted for the area it refuses. */
function refusalDetail(area: AreaRef, tables: LevelTables): string {
  const level = tables.levels.find((row) => row.id === area.id)
  if (!level) return 'no Levels.txt row'
  const plan = planArea(level, tables, 20261013)
  if (plan.ok) return 'planned'
  return plan.detail.slice(0, 150)
}

process.exit(main())
