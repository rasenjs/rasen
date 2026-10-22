/**
 * The generator, against the real tables and the real `.ds1` pieces.
 *
 * Every number here was measured from the export while this suite was written,
 * and every rule it pins is a rule `drlg.ts` states: a maze's rooms come from
 * `LvlMaze.txt`'s count on a grid whose pieces are chosen by door pattern, an
 * outdoor area is `SizeX`x`SizeY` of ground with the `LvlSub` border set around
 * it, the exits of a generated level are real orientation-10 tiles whose count
 * equals the level's `Vis`/`Warp` slot count, and the ambient population comes
 * from `Levels.txt`'s `MonDen` and `mon1..mon25` rather than from `.ds1` records.
 *
 * What is *not* asserted is the layout: the retail engine keeps its room graph
 * and placement loop in its own code, so a generated area reproduces the tables'
 * parameters and not the retail map. That is why the checks below are about
 * properties a player feels — connected, not empty, doors where the slots are —
 * rather than about a golden map.
 *
 * The corpus is `public/original`; `D2R_ROMFS` widens the tile tree. Without a
 * corpus the suite reports that it skipped rather than failing.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  assembleLevelFromDs1,
  levelTablesFromJson,
  type Level,
  type LevelSource,
  type LevelTables,
} from '../levels'
import {
  DIRECTIONS,
  composeArea,
  doorSourceFor,
  dt1PathOf,
  isDoorPattern,
  parseLvlMaze,
  parseLvlSub,
  planArea,
  populateMonsters,
  roomPrefixCandidates,
  type DrlgPlan,
} from '../drlg'
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
} from '../travel'

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = join(HERE, '..', '..', '..')
const TABLES_DIR = join(PACKAGE_ROOT, 'public', 'original')
const ROMFS = process.env.D2R_ROMFS
const TILES_ROOT = ROMFS ? join(ROMFS, 'global', 'tiles') : join(TABLES_DIR, 'tiles')
const tablesFile = (name: string) => join(TABLES_DIR, `table_${name}.json`)
const hasCorpus = existsSync(TILES_ROOT) && existsSync(tablesFile('levels'))

type Row = Readonly<Record<string, unknown>>

function readTable<T>(name: string): T {
  return JSON.parse(readFileSync(tablesFile(name), 'utf8')) as T
}

function listTiles(): string[] {
  const out: string[] = []
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name), `${prefix}${entry.name}/`)
      else if (entry.name.toLowerCase().endsWith('.dt1')) out.push(`${prefix}${entry.name}`)
    }
  }
  walk(TILES_ROOT, '')
  return out
}

let tables: LevelTables
let context: TravelContext
let areas: AreaRef[]

/** A source over the corpus, with the tile tree enumerable or not. */
function sourceOf(enumerable: boolean): LevelSource {
  return {
    tables: () => tables,
    readTiles: (relativePath) =>
      new Uint8Array(readFileSync(join(TILES_ROOT, relativePath.toLowerCase()))),
    ...(enumerable ? { listTiles } : {}),
  }
}

function assemble(plan: DrlgPlan, enumerable = false): Level {
  const source = sourceOf(enumerable)
  const composed = composeArea(plan, (path) => {
    const file = join(TILES_ROOT, path.toLowerCase())
    return existsSync(file) ? new Uint8Array(readFileSync(file)) : null
  })
  if (!composed.ok) throw new Error(`compose refused: ${composed.reason} — ${composed.detail}`)
  return assembleLevelFromDs1(
    composed.ds1,
    {
      presetId: -1,
      presetName: `generated ${plan.kind}`,
      levelId: plan.level.id,
      levelTypeId: plan.level.levelType,
      variantIndex: 0,
      variantFile: '',
      tilesets: composed.tilesets,
    },
    source,
  )
}

/** The map's own rule: a cell that resolved nowhere is not walkable. */
function walkable(level: Level, x: number, y: number): boolean {
  const tile = level.tileAt(x, y)
  return tile !== null && tile.resolved && level.walkable(x, y)
}

function planOf(id: number): DrlgPlan {
  const level = tables.levels.find((row) => row.id === id)
  if (!level) throw new Error(`no level ${id}`)
  const result = planArea(level, tables, 20261013)
  if (!result.ok) throw new Error(`refused: ${result.reason} — ${result.detail}`)
  return result
}

function planResultOf(id: number): ReturnType<typeof planArea> {
  const level = tables.levels.find((row) => row.id === id)
  if (!level) throw new Error(`no level ${id}`)
  return planArea(level, tables, 20261013)
}

beforeAll(() => {
  if (!hasCorpus) return
  tables = levelTablesFromJson({
    lvlprest: readTable<Row[]>('lvlprest'),
    lvltypes: readTable<Row[]>('lvltypes'),
    levels: readTable<Row[]>('levels'),
    lvlmaze: readTable<Row[]>('lvlmaze'),
    lvlsub: readTable<Row[]>('lvlsub'),
  })
  areas = areasOf(tables)
  context = {
    areas,
    warpTypes: parseWarpTypes(readTable<Row[]>('lvlwarp')),
    actInfo: parseActInfo(readTable<Row[]>('actinfo')),
    tables,
    hasWarpTiles: true,
  }
})

describe('the tables the generator reads', () => {
  it('names a maze for every DrlgType 1 level, and a border set for act 1', () => {
    if (!hasCorpus) return
    const maze = parseLvlMaze(readTable<Row[]>('lvlmaze'))
    const subs = parseLvlSub(readTable<Row[]>('lvlsub'))
    // `LvlMaze.txt` is the authority for a maze: without a row there are no room
    // sizes and no room count, and the generator refuses rather than guessing.
    for (const level of tables.levels.filter((row) => row.drlgType === 1)) {
      expect(maze.some((entry) => entry.level === level.id), `no LvlMaze row for ${level.name}`).toBe(true)
    }
    // `LvlSub`'s border rows are the only pieces that belong to no `Type` group,
    // and they are act 1's art: the fifth row with a BordType is act 5's
    // `Barricade`, which the act filter keeps out of an act 1 wilderness area.
    const borders = subs.filter((row) => row.bordType >= 0)
    expect(borders.map((row) => row.name)).toEqual([
      'Border - Cliffs',
      'Border - Middle',
      'Border - Corner',
      'Border - Border',
      'Barricade',
    ])
    expect(borders.every((row) => row.dt1Mask === 0)).toBe(true)
  })

  it('spells a door pattern north, south, east, west', () => {
    if (!hasCorpus) return
    // The order is not cosmetic: `LvlPrest.txt` names `Act 1 - Cave SE`, and with
    // compass order a room connected east and south would ask for an `ES` piece
    // that does not exist.
    expect(DIRECTIONS).toBe('NSEW')
    expect(isDoorPattern('SE')).toBe(true)
    expect(isDoorPattern('NSEW')).toBe(true)
    expect(isDoorPattern('ES')).toBe(false)
    const sets = new Map<string, Set<string>>()
    for (const preset of tables.presets) {
      const suffix = preset.name.slice(preset.name.lastIndexOf(' ') + 1)
      if (!isDoorPattern(suffix)) continue
      const family = preset.name.slice(0, preset.name.lastIndexOf(' '))
      const list = sets.get(family) ?? new Set<string>()
      list.add(suffix)
      sets.set(family, list)
    }
    // Every act 1 maze family ships all fifteen non-empty subsets of N/E/S/W,
    // which is what makes a room for any connection set reachable.
    for (const family of ['Act 1 - Cave', 'Act 1 - Crypt', 'Act 1 - Jail', 'Act 1 - Catacombs', 'Act 1 - Barracks']) {
      expect(sets.get(family)?.size, family).toBe(15)
    }
  })

  it('joins a maze row to its rooms by name, with a refusal when there are none', () => {
    if (!hasCorpus) return
    expect(roomPrefixCandidates('Act 1 - Jail 1')).toContain('Act 1 - Jail')
    expect(roomPrefixCandidates('Act 2 - Tomb 1 Treasure')).toContain('Act 2 - Tomb')
    // Act 5's Hell levels have no `LevelId 0` room rows under any prefix: a real
    // gap, and one the generator names rather than working around.
    const hell = planResultOf(125)
    expect(hell.ok).toBe(false)
    if (hell.ok) return
    expect(hell.reason).toBe('no-room-set')
    expect(hell.detail).toContain('Act 5 - Hell 1')
  })

  it('translates a piece\'s own tileset names to the export\'s paths', () => {
    if (!hasCorpus) return
    // A `.ds1` spells its tilesets absolutely and with a `.tg1` extension; the
    // extracted tree has only the `.dt1` beside them.
    expect(dt1PathOf('\\D2\\Data\\GLOBAL\\TILES\\ACT1\\OUTDOORS\\border.tg1')).toBe(
      'ACT1/OUTDOORS/border.dt1',
    )
    expect(dt1PathOf('C:\\D2\\DATA\\GLOBAL\\TILES\\ACT1\\TOWN\\trees.tg1')).toBe('ACT1/TOWN/trees.dt1')
    expect(dt1PathOf('nothing/here.tg1')).toBe('')
  })
})

describe('planning an area', () => {
  it('plans the Blood Moor as an 80x80 outdoor area with four exits', () => {
    if (!hasCorpus) return
    const plan = planOf(2)
    expect(plan.kind).toBe('outdoor')
    // `Levels.txt`'s SizeX/SizeY is the map, and the nine wilderness rows agree
    // with their (N)/(H) variants.
    expect([plan.width, plan.height]).toEqual([80, 80])
    expect(plan.level.sizeXNightmare).toBe(80)
    expect(plan.level.sizeXHell).toBe(80)
    expect(plan.pieces.some((piece) => piece.role === 'border')).toBe(true)
    // Four `Vis`/`Warp` slots, all of them doors shaped in `LvlWarp.txt`, and the
    // town is the area's `classlevelrangestart`.
    expect(plan.exits).toHaveLength(4)
    expect(plan.exits.every((exit) => exit.via === 'marker')).toBe(true)
    // A door tile is copied from the act's town, and `Levels.txt` names exactly
    // five levels "… Town".
    const door = doorSourceFor(plan.level, tables)
    expect(door?.level.id).toBe(1)
    expect(door?.file).toContain('Town')
    expect(tables.levels.filter((row) => /Town$/.test(row.name))).toHaveLength(5)
  })

  it('plans the Jail as a 12x12-room maze of the rooms LvlMaze asks for', () => {
    if (!hasCorpus) return
    const plan = planOf(29)
    expect(plan.kind).toBe('maze')
    expect(plan.family).toBe('Act 1 - Jail')
    expect(plan.grid.rooms).toBe(12)
    // Rooms on a square-ish grid, each 12x12 plus the shared boundary row.
    expect(plan.grid.cols).toBe(4)
    expect(plan.grid.rows).toBe(3)
    expect([plan.width, plan.height]).toEqual([4 * 12 + 1, 3 * 12 + 1])
    // Every room got a piece, and the two exits took dead ends so the pieces
    // they took carry a door of their own.
    expect(plan.pieces).toHaveLength(12)
    expect(plan.exits).toHaveLength(2)
    expect(plan.exits.every((exit) => exit.via === 'piece')).toBe(true)
    // A maze's graph is a spanning tree plus whatever `Merge` opens, so it can
    // never be less connected than a tree.
    expect(plan.grid.links).toBeGreaterThanOrEqual(plan.grid.rooms - 1)
  })

  it('refuses an area the tables do not describe, and says which table is short', () => {
    if (!hasCorpus) return
    // An act 2 desert: `LvlSub`'s scenery rows for act 2 exist, but no
    // `BordType` row names an act 2 piece, so there is no border set.
    const desert = planResultOf(41)
    expect(desert.ok).toBe(false)
    if (desert.ok) return
    expect(desert.reason).toBe('no-border-set')
    expect(desert.detail).toContain('act 2')

    // A `DrlgType 2` area is a preset's business, not the generator's.
    const courtyard = planResultOf(27)
    expect(courtyard.ok).toBe(false)
    if (courtyard.ok) return
    expect(courtyard.reason).toBe('not-generated')

    // Two act 5 areas have no size at all in `Levels.txt`.
    const highlands = planResultOf(111)
    expect(highlands.ok).toBe(false)
    if (highlands.ok) return
    expect(highlands.reason).toBe('no-size')
  })

  it('is deterministic in the seed, and different seeds make different mazes', () => {
    if (!hasCorpus) return
    const level = tables.levels.find((row) => row.id === 29)
    if (!level) return
    const first = planArea(level, tables, 20261013)
    const again = planArea(level, tables, 20261013)
    const other = planArea(level, tables, 7)
    if (!first.ok || !again.ok || !other.ok) throw new Error('Jail 1 must plan')
    const shape = (plan: DrlgPlan) => plan.pieces.map((piece) => `${piece.label}@${piece.x},${piece.y}`)
    expect(shape(again)).toEqual(shape(first))
    expect(shape(other)).not.toEqual(shape(first))
  })
})

describe('what the generator builds', () => {
  it('fills an outdoor area with ground, a ring and reachable exits', () => {
    if (!hasCorpus) return
    const plan = planOf(2)
    const level = assemble(plan)
    expect(level.width).toBe(80)
    expect(level.height).toBe(80)

    let walk = 0
    let unresolved = 0
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        if (walkable(level, x, y)) walk += 1
        const tile = level.tileAt(x, y)
        if (tile !== null && !tile.resolved) unresolved += 1
      }
    }
    // Not empty, and not a field of holes: measured 93.4% walkable.
    expect(walk / (level.width * level.height)).toBeGreaterThan(0.8)
    // Every cell of an outdoor area resolves: its pieces name their own tilesets.
    expect(unresolved).toBe(0)
    // The ring is the map's boundary and blocks the whole way round.
    for (let x = 0; x < level.width; x++) {
      expect(walkable(level, x, 0)).toBe(false)
      expect(walkable(level, x, level.height - 1)).toBe(false)
    }
    // The doors are real orientation-10 tiles, one per slot, and the entry the
    // engine would choose reaches every one of them.
    const area = areas.find((entry) => entry.id === 2) as AreaRef
    const links = linksOf(area, { ...context, hasWarpTiles: warpTilesOf(level).length > 0 })
    const sites = exitSites(level, links)
    expect(warpTilesOf(level)).toHaveLength(4)
    expect(sites).toHaveLength(4)
    expect(sites.every((site) => site.destination !== null)).toBe(true)
    const entry = entryTileOf(level, { x: 40, y: 40 }, sites, 1, null)
    for (const site of sites) {
      expect(reaches(level, entry, site), `exit ${site.x},${site.y}`).toBe(true)
    }
  })

  it('builds a maze whose rooms are connected, populated and all reachable', () => {
    if (!hasCorpus) return
    const plan = planOf(29)
    const level = assemble(plan)
    const area = areas.find((entry) => entry.id === 29) as AreaRef
    const links = linksOf(area, { ...context, hasWarpTiles: warpTilesOf(level).length > 0 })
    const sites = exitSites(level, links)
    // One door per slot, and `travel.ts` needs exactly that to pair them.
    expect(warpTilesOf(level)).toHaveLength(links.filter((link) => link.realisedBy !== 'object').length)
    expect(sites.every((site) => site.destination !== null)).toBe(true)

    let walk = 0
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) if (walkable(level, x, y)) walk += 1
    }
    // Measured 72.6% walkable; the rooms are 12x12 with their walls inside them.
    expect(walk / (level.width * level.height)).toBeGreaterThan(0.4)
    const entry = entryTileOf(level, { x: 24, y: 24 }, sites, -1, null)
    for (const site of sites) expect(reaches(level, entry, site)).toBe(true)
    // The whole walkable area is one room after another: measured, the entry
    // reaches 98% of it, and what it does not is the single-cell alcoves the
    // retail room pieces carry.
    const reached = reachCount(level, entry)
    expect(reached / walk).toBeGreaterThan(0.9)

    // Population: `MonDen` 680 over 1813 cells is 19 monsters, of the three
    // classes `mon1..mon3` names.
    const roster = populateMonsters({ level: plan.level, assembled: level, seed: 20261013, avoid: entry })
    expect(roster).toHaveLength(19)
    expect(new Set(roster.map((monster) => monster.name)).size).toBe(3)
    for (const monster of roster) expect(walkable(level, monster.x, monster.y)).toBe(true)
    // A town is `MonDen` 0 and gets nothing, whatever its class list says.
    const town = tables.levels.find((row) => row.id === 1) as typeof plan.level
    expect(populateMonsters({ level: town, assembled: level, seed: 20261013 })).toEqual([])
  })

  it('assembles the same walkable grid whether or not the tile tree can be listed', () => {
    if (!hasCorpus) return
    // Some pieces reference a blank solid block that only `Act1/Outdoors/Blank.dt1`
    // defines, and no table names that file. A source that can enumerate the tree
    // resolves it; a browser source cannot. The cells it fills are blocked either
    // way — resolved-and-blocking, or unresolved and therefore not walkable — so
    // the map a player walks is the same and only the picture differs.
    for (const id of [8, 29, 34]) {
      const plan = planOf(id)
      const without = assemble(plan, false)
      const with_ = assemble(plan, true)
      expect([with_.width, with_.height]).toEqual([without.width, without.height])
      for (let y = 0; y < without.height; y++) {
        for (let x = 0; x < without.width; x++) {
          expect(walkable(with_, x, y), `level ${id} at ${x},${y}`).toBe(walkable(without, x, y))
        }
      }
    }
  })

  it('puts every act 1 area it plans into a shape a player can walk', () => {
    if (!hasCorpus) return
    let built = 0
    for (const level of tables.levels) {
      if (level.drlgType !== 1 && level.drlgType !== 3) continue
      const result = planArea(level, tables, 20261013)
      if (!result.ok) continue
      // Only the areas this export carries the pieces for: act 1's.
      const needed = [
        ...result.pieces.map((piece) => piece.file),
        ...result.tilesets,
        ...(result.doorSource ? [result.doorSource.file] : []),
      ]
      if (needed.some((path) => !existsSync(join(TILES_ROOT, path.toLowerCase())))) continue
      const assembled = assemble(result)
      let walk = 0
      for (let y = 0; y < assembled.height; y++) {
        for (let x = 0; x < assembled.width; x++) if (walkable(assembled, x, y)) walk += 1
      }
      // Not empty: measured, the thinnest generated area is 36% walkable and the
      // thinnest outdoor one 91%.
      expect(walk / (assembled.width * assembled.height), `${level.name} is empty`).toBeGreaterThan(0.3)
      built += 1
    }
    // 26 of the 138 levels: the seven wilderness rows, the graveyard, the cow
    // level and the act 1 mazes.
    expect(built).toBe(26)
  })
})

/** Does a walk from `start` reach `target`, or a cell beside it? */
function reaches(level: Level, start: { x: number; y: number }, target: { x: number; y: number }): boolean {
  const seen = reachableSet(level, start)
  if (mapWalkable(level, target.x, target.y)) return seen.has(target.y * level.width + target.x)
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
    seen.has((target.y + dy) * level.width + target.x + dx),
  )
}

function mapWalkable(level: Level, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return false
  return walkable(level, x, y)
}

function reachCount(level: Level, start: { x: number; y: number }): number {
  return reachableSet(level, start).size
}

function reachableSet(level: Level, start: { x: number; y: number }): Set<number> {
  const seen = new Set<number>()
  const seeds: Array<[number, number]> = []
  if (mapWalkable(level, start.x, start.y)) seeds.push([start.x, start.y])
  else for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) seeds.push([start.x + dx, start.y + dy])
  for (const [x, y] of seeds) {
    if (!mapWalkable(level, x, y)) continue
    seen.add(y * level.width + x)
  }
  const queue = [...seen]
  while (queue.length > 0) {
    const index = queue.pop() as number
    const x = index % level.width
    const y = Math.floor(index / level.width)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx
      const ny = y + dy
      const next = ny * level.width + nx
      if (seen.has(next) || !mapWalkable(level, nx, ny)) continue
      seen.add(next)
      queue.push(next)
    }
  }
  return seen
}
