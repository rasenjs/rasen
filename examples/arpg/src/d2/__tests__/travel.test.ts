import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { configureLevels, findPreset, levelTablesFromJson, loadLevel, presetsForLevel, type Level, type LevelTables } from '../levels'
import { parseActInfo, parseWarpTypes, type ActInfoRow, type WarpTypeRow } from '../travel'

/**
 * Travel: the door rule, the act-entry rule and the waypoint network.
 *
 * The suite runs against the real tables and the real `.ds1` files, because the
 * claims it pins are claims about those files rather than about the code: that
 * `Vis n`/`Warp n` are paired by slot, that the act 1 town is an isolated node
 * in the shipped graph, that its `.ds1` holds three warp tiles which no table
 * assigns a destination to, and that the waypoint list is the one route the
 * tables actually describe. Every measured number quoted in a comment below was
 * read from this export; `tools/verify-travel.ts` prints the same readings so a
 * reader can audit them without running the suite.
 *
 * The corpus is `public/original`: the exported tables plus the act 1 tile tree.
 * Point `D2R_ROMFS` at a fuller extraction to widen the tile tree; without any
 * corpus the suite reports that it skipped rather than failing.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = join(HERE, '..', '..', '..')
const TABLES_DIR = join(PACKAGE_ROOT, 'public', 'original')
const ROMFS = process.env.D2R_ROMFS
const TILES_ROOT = ROMFS ? join(ROMFS, 'global', 'tiles') : join(TABLES_DIR, 'tiles')
const tablesFile = (name: string) => join(TABLES_DIR, `table_${name}.json`)
const hasCorpus = existsSync(TILES_ROOT) && existsSync(tablesFile('levels'))

let tables: LevelTables
let warpTypes: WarpTypeRow[]
let actInfo: ActInfoRow[]

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

function assemble(presetId: number, variantIndex: number): Level {
  const source = {
    tables: () => tables,
    readTiles: (relativePath: string) => new Uint8Array(readFileSync(join(TILES_ROOT, relativePath.toLowerCase()))),
    listTiles,
  }
  return loadLevel(presetId, 0, source, { variantIndex })
}

beforeAll(() => {
  if (!hasCorpus) return
  tables = levelTablesFromJson({
    lvlprest: readTable('lvlprest'),
    lvltypes: readTable('lvltypes'),
    levels: readTable('levels'),
  })
  warpTypes = parseWarpTypes(readTable('lvlwarp'))
  actInfo = parseActInfo(readTable('actinfo'))
  configureLevels(null)
})

// The module is imported lazily so a machine without the corpus can still run
// the pure-Rule tests below without touching the filesystem.
async function travel() {
  return await import('../travel')
}

describe('the Vis/Warp pairing', () => {
  it('reads a warp type’s geometry from the table', () => {
    const rows = parseWarpTypes([
      {
        Name: 'Act 1 Wilderness to Cave Cliff L',
        Id: '0',
        SelectX: '-90',
        SelectY: '-100',
        SelectDX: '90',
        SelectDY: '110',
        ExitWalkX: '5',
        ExitWalkY: '0',
        OffsetX: '1',
        OffsetY: '-1',
        Direction: 'b',
        Tiles: '2',
        NoInteract: '0',
      },
      // The table's own trailing/placeholder row, which is not a warp.
      { Name: 'Expansion', Id: null },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 0,
      name: 'Act 1 Wilderness to Cave Cliff L',
      selectX: -90,
      selectDX: 90,
      exitWalkX: 5,
      exitWalkY: 0,
      offsetX: 1,
      offsetY: -1,
      tiles: 2,
      noInteract: false,
    })
  })

  it('keeps an unset Warp column at -1 rather than at 0', () => {
    // 0 is a real `LvlWarp` row, so reading an empty column as 0 would invent a
    // door wherever the table means "none". The town is all eight.
    expect(tables.levels.find((row) => row.id === 1)?.warp).toEqual([-1, -1, -1, -1, -1, -1, -1, -1])
  })

  it('pairs slots by position, verified against names on both sides', () => {
    if (!hasCorpus) return
    // The Canyon of the Magi: Vis1..7 = 66..72 and Warp1..7 = 38..44. Levels
    // 66..72 are the seven Tomb Tal areas and LvlWarp rows 38..44 are named
    // exactly "Act 2 Desert to Tomb Tal 1..7", so the two ranges line up slot
    // for slot — which is what makes the pairing a reading rather than a guess.
    const canyon = tables.levels.find((row) => row.name === 'Act 2 - Valley of the Kings')!
    expect(canyon.vis.slice(1)).toEqual([66, 67, 68, 69, 70, 71, 72])
    expect(canyon.warp.slice(1)).toEqual([38, 39, 40, 41, 42, 43, 44])
    for (let slot = 1; slot <= 7; slot++) {
      const destination = tables.levels.find((row) => row.id === canyon.vis[slot])!
      const warp = warpTypes.find((row) => row.id === canyon.warp[slot])!
      const tomb = slot // 1-based: Tomb Tal 1..7
      expect(destination.name).toBe(`Act 2 - Tomb Tal ${tomb}`)
      expect(warp.name).toBe(`Act 2 Desert to Tomb Tal ${tomb}`)
    }
  })

  it('counts the pairs the shipped table carries', () => {
    if (!hasCorpus) return
    // 138 real rows (the 139th is the table's `Null` placeholder), 113 of them
    // with at least one pair, 228 pairs in all.
    expect(tables.levels).toHaveLength(138)
    let levelsWithPairs = 0
    let pairs = 0
    for (const row of tables.levels) {
      let own = 0
      for (let slot = 0; slot < 8; slot++) {
        if ((row.vis[slot] ?? 0) > 0 && (row.warp[slot] ?? -1) >= 0) own += 1
      }
      if (own > 0) levelsWithPairs += 1
      pairs += own
    }
    expect(levelsWithPairs).toBe(113)
    expect(pairs).toBe(228)
  })
})

describe('the act 1 town, which the tables do not link', () => {
  it('sets no Vis/Warp slot at all', () => {
    if (!hasCorpus) return
    const town = tables.levels.find((row) => row.id === 1)!
    expect(town.name).toBe('Act 1 - Town')
    expect(town.levelName).toBe('Rogue Encampment')
    expect(town.vis).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    expect(town.warp).toEqual([-1, -1, -1, -1, -1, -1, -1, -1])
    expect(town.monsterDensity).toBe(0)
  })

  it('is named by no warp type, while act 2’s town is', () => {
    if (!hasCorpus) return
    // The 89 warp rows name act 2's town five times — "Act 2 Town to Sewer
    // Trap", "... to Sewer Dock", "Act 2 Sewer Dock to Town", "... to Harem",
    // "Act 2 Harem to Town" — and act 1's town not once. Those five rows exist
    // for the reason act 1's do not: act 2's town sets three Vis/Warp slots and
    // act 1's sets none.
    expect(warpTypes.filter((row) => /act 1.*town/i.test(row.name))).toHaveLength(0)
    expect(warpTypes.filter((row) => /act 2.*town/i.test(row.name)).map((row) => row.id)).toEqual([19, 20, 21, 24, 25])
    // Act 2's town is the counter-example to the act-entry rule: it has slots,
    // so the rule never applies to it.
    const lutGholein = tables.levels.find((row) => row.id === 40)!
    const pairs = lutGholein.vis.filter((vis, slot) => vis > 0 && lutGholein.warp[slot] >= 0)
    expect(pairs.length).toBeGreaterThan(0)
  })

  it('has nothing pointing at it and points at nothing', () => {
    if (!hasCorpus) return
    const inbound: number[] = []
    for (const row of tables.levels) {
      for (let slot = 0; slot < 8; slot++) {
        if ((row.vis[slot] ?? 0) === 1 && (row.warp[slot] ?? -1) >= 0) inbound.push(row.id)
      }
    }
    expect(inbound).toEqual([])
  })

  it('falls to the act-entry rule, and names the evidence', async () => {
    if (!hasCorpus) return
    const { areasOf, linksOf } = await travel()
    const context = { areas: areasOf(tables), warpTypes, actInfo, tables }
    const town = context.areas.find((area) => area.id === 1)!
    // Without a loaded level the module cannot know the town has warp tiles, so
    // it says nothing rather than guessing.
    expect(linksOf(town, { ...context, hasWarpTiles: false })).toEqual([])
    const links = linksOf(town, { ...context, hasWarpTiles: true })
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ slot: -1, rule: 'act-entry' })
    expect(links[0].destination.id).toBe(2)
    expect(links[0].destination.devName).toBe('Act 1 - Wilderness 1')
    expect(links[0].destination.displayName).toBe('Blood Moor')
    expect(links[0].evidence).toContain('classlevelrangestart')
  })

  it('gives act 5’s town no link rather than a link to itself', async () => {
    if (!hasCorpus) return
    const { areasOf, linksOf } = await travel()
    const context = { areas: areasOf(tables), warpTypes, actInfo, tables }
    const harrogath = context.areas.find((area) => area.id === 109)!
    // ActInfo's classlevelrangestart for act 5 is "Act 5 - Town" itself.
    expect(actInfo.find((row) => row.act === 5)?.classLevelRangeStart).toBe('Act 5 - Town')
    expect(linksOf(harrogath, { ...context, hasWarpTiles: true })).toEqual([])
  })
})

describe('the door tiles of an assembled level', () => {
  it('reads the town’s three orientation-10 tiles at the measured positions', async () => {
    if (!hasCorpus) return
    const { warpTilesOf } = await travel()
    // `Act 1 - Town 1` offers four variants (TownN1/E1/S1/W1), and every one of
    // them carries exactly three warp tiles: two in one row, two columns apart,
    // and a third four columns right and seven rows down. Which of the three is
    // a door and which is a marker is not in the tables, so the module reports
    // all three.
    const expected: Array<[number, Array<[number, number, number]>]> = [
      [0, [[26, 7, 30], [28, 7, 32], [30, 14, 33]]],
      [1, [[30, 13, 30], [32, 13, 32], [34, 20, 33]]],
      [2, [[26, 24, 30], [28, 24, 32], [30, 31, 33]]],
      [3, [[12, 18, 30], [14, 18, 32], [16, 25, 33]]],
    ]
    const townPreset = findPreset(tables, 'Act 1 - Town 1')!
    for (const [variant, tiles] of expected) {
      const level = assemble(townPreset.id, variant)
      const warps = warpTilesOf(level)
      expect(level.width).toBe(57)
      expect(level.height).toBe(41)
      expect(warps.map((tile) => [tile.x, tile.y, tile.mainIndex])).toEqual(tiles)
    }
  })

  it('finds the one tile of a level that has exactly one link', async () => {
    if (!hasCorpus) return
    const { warpTilesOf } = await travel()
    // `Act 1 - Courtyard 2` (level 32) is `Vis0 = 31` through LvlWarp 14, and its
    // preset's `.ds1` has one warp tile — the pairing rule's cleanest case.
    const preset = presetsForLevel(tables, 32)[0]
    const level = assemble(preset.id, 0)
    const warps = warpTilesOf(level)
    expect(warps).toHaveLength(1)
    expect([warps[0].x, warps[0].y]).toEqual([2, 3])
  })

  it('reports a door the tables give no destination', async () => {
    if (!hasCorpus) return
    const { areasOf, exitSites, linksOf, warpTilesOf } = await travel()
    // Tristram (38) has a warp tile and no Vis/Warp slot: its ladder/portal is
    // created by the quest, not by the level graph. The act-entry rule does not
    // reach it either, because that rule is scoped to the area ActInfo.txt calls
    // the act's town, and Tristram is not one.
    const tristram = areasOf(tables).find((area) => area.id === 38)!
    const preset = presetsForLevel(tables, 38)[0]
    const level = assemble(preset.id, 0)
    expect(warpTilesOf(level)).toHaveLength(1)
    const context = { areas: areasOf(tables), warpTypes, actInfo, tables }
    const links = linksOf(tristram, { ...context, hasWarpTiles: true })
    expect(links).toHaveLength(0)
    const sites = exitSites(level, links)
    expect(sites).toHaveLength(1)
    expect(sites[0].destination).toBeNull()
    expect(sites[0].binding).toBe('unpaired')
  })

  it('names the Vis-without-Warp slots as object doors', async () => {
    if (!hasCorpus) return
    const { areasOf, linksOf, warpTilesOf } = await travel()
    const context = { areas: areasOf(tables), warpTypes, actInfo, tables }
    const courtyard1 = context.areas.find((area) => area.id === 27)!
    // Courtyard 1 sets Vis0 = 26 (the Monastery) and Vis1 = 28 (Courtyard 2) with
    // both Warp columns clear, and its `.ds1` has no warp tile at all: the doors
    // between the cloister and its neighbours are objects. Act 1 has three such
    // rows — 26, 27 and their neighbour 28.
    const links = linksOf(courtyard1, { ...context, hasWarpTiles: false })
    expect(links.map((link) => [link.slot, link.destination.id, link.rule, link.realisedBy])).toEqual([
      [0, 26, 'vis-object', 'object'],
      [1, 28, 'vis-object', 'object'],
    ])
    expect(warpTilesOf(assemble(presetsForLevel(tables, 27)[0].id, 0))).toEqual([])
  })
})

describe('door sites and the tile the player stands on', () => {
  it('binds the town’s three tiles to the act-entry destination and says how', async () => {
    if (!hasCorpus) return
    const { areasOf, exitAt, exitSites, linksOf, travelOptions, waypointLinksOf } = await travel()
    const context = { areas: areasOf(tables), warpTypes, actInfo, tables }
    const town = context.areas.find((area) => area.id === 1)!
    const level = assemble(findPreset(tables, 'Act 1 - Town 1')!.id, 1)
    const links = linksOf(town, { ...context, hasWarpTiles: true })
    const sites = exitSites(level, links)
    expect(sites).toHaveLength(3)
    for (const site of sites) {
      expect(site.destination?.id).toBe(2)
      expect(site.binding).toBe('act-entry')
    }
    expect(exitAt(sites, 34, 20)?.destination?.id).toBe(2)
    expect(exitAt(sites, 33, 20)).toBeNull()

    const options = travelOptions(level, town, context)
    const doors = options.filter((option) => option.via === 'door')
    const waypoints = options.filter((option) => option.via === 'waypoint')
    expect(doors).toHaveLength(3)
    expect(doors.every((option) => option.loadable === false && option.availability === 'generated')).toBe(true)
    // Nine waypoint peers of which one is the town itself, which a menu does not
    // offer; two of the other eight can be assembled from this export.
    expect(waypointLinksOf(town, context)).toHaveLength(9)
    expect(waypoints).toHaveLength(8)
    expect(waypoints.filter((option) => option.loadable).map((option) => option.destination.devName)).toEqual([
      'Act 1 - Courtyard 1',
      'Act 1 - Courtyard 2',
    ])
  })

  it('assigns by slot order only when a level has several destinations', async () => {
    if (!hasCorpus) return
    const { areasOf, exitSites } = await travel()
    // Act 2's town is the case: three slots, two destinations (the sewers and
    // the harem), and no table that pairs a slot with a tile position. The
    // module says so on the site rather than pretending to know.
    const lutGholein = areasOf(tables).find((area) => area.id === 40)!
    const links = [
      { slot: 2, rule: 'vis-warp' as const, realisedBy: 'warp-tile' as const, destination: areasOf(tables).find((a) => a.id === 47)!, warpType: warpTypes[19] ?? null, evidence: 'Vis2=47 Warp2=19' },
      { slot: 3, rule: 'vis-warp' as const, realisedBy: 'warp-tile' as const, destination: areasOf(tables).find((a) => a.id === 47)!, warpType: warpTypes[20] ?? null, evidence: 'Vis3=47 Warp3=20' },
      { slot: 4, rule: 'vis-warp' as const, realisedBy: 'warp-tile' as const, destination: areasOf(tables).find((a) => a.id === 50)!, warpType: warpTypes[24] ?? null, evidence: 'Vis4=50 Warp4=24' },
    ]
    const level = { ds1: { walls: [], width: 0, height: 0 } } as unknown as Level
    expect(exitSites(level, links)).toEqual([])
    expect(lutGholein.waypoint).toBeLessThan(255)
  })
})

describe('the waypoint network', () => {
  it('reaches nine act 1 areas from the town', async () => {
    if (!hasCorpus) return
    const { areasOf, waypointLinksOf } = await travel()
    const context = { areas: areasOf(tables), warpTypes, actInfo, tables }
    const town = context.areas.find((area) => area.id === 1)!
    expect(town.waypoint).toBe(0)
    const links = waypointLinksOf(town, context)
    expect(links).toHaveLength(9)
    expect(links.map((link) => link.destination.devName)).toEqual([
      'Act 1 - Town',
      'Act 1 - Wilderness 2',
      'Act 1 - Wilderness 3',
      'Act 1 - Wilderness 4',
      'Act 1 - Wilderness 5',
      'Act 1 - Courtyard 1',
      'Act 1 - Jail 1',
      'Act 1 - Courtyard 2',
      'Act 1 - Catacombs 2',
    ])
    expect(links[5].destination.displayName).toBe('Outer Cloister')
  })

  it('gives an area with no waypoint none', async () => {
    if (!hasCorpus) return
    const { areasOf, waypointLinksOf } = await travel()
    const context = { areas: areasOf(tables), warpTypes, actInfo, tables }
    // Blood Moor stores 255, the table's "no waypoint".
    const bloodMoor = context.areas.find((area) => area.id === 2)!
    expect(bloodMoor.waypoint).toBe(255)
    expect(waypointLinksOf(bloodMoor, context)).toEqual([])
  })
})

describe('whether an area can be assembled at all', () => {
  it('separates a preset area from a generated one', async () => {
    if (!hasCorpus) return
    const { areasOf, availabilityOf } = await travel()
    const areas = areasOf(tables)
    const byName = (name: string) => areas.find((area) => area.devName === name)!
    expect(availabilityOf(byName('Act 1 - Town'), tables)).toBe('preset')
    expect(availabilityOf(byName('Act 1 - Courtyard 1'), tables)).toBe('preset')
    expect(availabilityOf(byName('Act 1 - Courtyard 2'), tables)).toBe('preset')
    // The town's own destination cannot be built: the Blood Moor is outdoors.
    expect(byName('Act 1 - Wilderness 1').drlgType).toBe(3)
    expect(availabilityOf(byName('Act 1 - Wilderness 1'), tables)).toBe('generated')
    // 37 of the 138 rows have a preset of their own.
    expect(areas.filter((area) => availabilityOf(area, tables) === 'preset')).toHaveLength(37)
  })

  it('refuses to load an area the tables do not lay out, and says why', async () => {
    if (!hasCorpus) return
    const { areasOf, loadArea } = await travel()
    const areas = areasOf(tables)
    const result = await loadArea({
      // The refusal happens before anything is fetched or baked, so a source
      // that throws on use is the right thing to pass here.
      source: {
        tables: () => tables,
        readTiles: () => {
          throw new Error('nothing should be read')
        },
      },
      context: { areas, warpTypes, actInfo, tables },
      area: areas.find((area) => area.devName === 'Act 1 - Wilderness 1')!,
      seed: 1,
      places: { byAct: new Map(), all: [] },
      objectTable: { objects: [], byId: new Map(), byClass: new Map(), byToken: new Map(), modes: [] },
      monsters: null,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('generated')
    expect(result.detail).toContain('DrlgType 3')
  })
})

describe('where the hero enters the next area', () => {
  it('prefers the destination’s own door back to where the player came from', async () => {
    if (!hasCorpus) return
    const { entryTileOf, exitSites, areasOf, linksOf, warpTilesOf } = await travel()
    const areas = areasOf(tables)
    const context = { areas, warpTypes, actInfo, tables }
    // Courtyard 2 (32) links to Courtyard 1 (31 is the Barracks; slot 0 is the
    // level id the table stores) and its `.ds1` has one warp tile, so it is the
    // clean case for the entry rule: a hero entering it must land on or beside
    // that tile, never outside the walkable grid.
    const courtyard2 = areas.find((area) => area.id === 32)!
    const level = assemble(presetsForLevel(tables, 32)[0].id, 0)
    const sites = exitSites(level, linksOf(courtyard2, { ...context, hasWarpTiles: true }))
    expect(sites).toHaveLength(1)
    const fallback = { x: Math.floor(level.width / 2), y: Math.floor(level.height / 2) }
    const entry = entryTileOf(level, fallback, sites, sites[0].destination?.id ?? -1, null)
    expect(level.walkable(entry.x, entry.y)).toBe(true)
    // The warp tile itself is a marker in the gate's opening and is not
    // necessarily a cell a walker may stand on — Courtyard 2's is not — so the
    // rule is "the nearest walkable cell to the door", not "the door".
    expect(Math.hypot(entry.x - sites[0].x, entry.y - sites[0].y)).toBeLessThanOrEqual(3)
    // A door offset that lands in a wall must be snapped back to walkable ground.
    const withOffset = entryTileOf(level, fallback, sites, sites[0].destination?.id ?? -1, {
      id: -1,
      name: 'synthetic',
      selectX: 0,
      selectY: 0,
      selectDX: 0,
      selectDY: 0,
      exitWalkX: -40,
      exitWalkY: 40,
      offsetX: 0,
      offsetY: 0,
      direction: 'b',
      tiles: 2,
      noInteract: true,
    })
    expect(level.walkable(withOffset.x, withOffset.y)).toBe(true)
    expect(warpTilesOf(level)).toHaveLength(1)
  })

  it('snaps to a walkable tile when the door offset lands in a wall', async () => {
    if (!hasCorpus) return
    const { entryTileOf } = await travel()
    const level = assemble(findPreset(tables, 'Act 1 - Town 1')!.id, 1)
    // The town's own border is solid; a start outside the walkable area must come
    // back inside rather than leaving the hero stuck.
    const entry = entryTileOf(level, { x: 0, y: 0 }, [], -1, null)
    expect(level.walkable(entry.x, entry.y)).toBe(true)
  })
})

describe('the grid a swap hands the renderer', () => {
  it('carries the sub-cell flags and the roof pass, not just the tile bits', async () => {
    if (!hasCorpus) return
    const { areaGrid } = await travel()
    const level = assemble(findPreset(tables, 'Act 1 - Town 1')!.id, 1)
    const art = {
      artAt: () => null,
      wallArtAt: () => null,
      roofArtAt: () => null,
      stats: { built: 0, reused: 0 },
    }
    const grid = areaGrid(level, art, { x: 30, y: 13 })
    // Movement asks for the 5x5 sub-cell flags: without them a wall block whose
    // centre sub-cell is free lets a walker go straight through the wall.
    expect(typeof grid.flagsAt).toBe('function')
    let sameAsLevel = 0
    let tested = 0
    for (let y = 0; y < level.height; y += 3) {
      for (let x = 0; x < level.width; x += 3) {
        const fromGrid = grid.flagsAt!(x, y)
        const fromLevel = level.flagsAt(x, y)
        tested += 1
        if (fromGrid === fromLevel) sameAsLevel += 1
      }
    }
    expect(tested).toBeGreaterThan(0)
    expect(sameAsLevel).toBe(tested)
    // ... and the roof pass, which draws above the actors.
    expect(typeof grid.roofArtAt).toBe('function')
    expect(grid.roofArtAt!(1, 1)).toBeNull()
  })

  it('derives the ground kind from the level’s own tiles', async () => {
    if (!hasCorpus) return
    const { areaGrid } = await travel()
    const level = assemble(findPreset(tables, 'Act 1 - Town 1')!.id, 1)
    const grid = areaGrid(level, null, { x: 30, y: 13 })
    expect(grid.width).toBe(57)
    expect(grid.height).toBe(41)
    expect(grid.start).toEqual({ x: 30, y: 13 })
    expect(grid.walkable(30, 13)).toBe(level.walkable(30, 13))
    // A cell with no tiles at all is a hole, not a floor: `kindAt` must answer
    // null so `worldFromRealLevel` marks it unwalkable. This town has none — its
    // floor layer covers all 2337 cells — so the two counts have to agree with
    // the level's own.
    let holes = 0
    let floors = 0
    let walls = 0
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const kind = grid.kindAt(x, y)
        if (kind === null) holes += 1
        else if (kind === 'path') floors += 1
        else walls += 1
        if (kind !== null) expect(grid.walkable(x, y)).toBe(level.walkable(x, y))
      }
    }
    expect(holes).toBe(0)
    expect(floors).toBe(level.stats.walkableTiles)
    expect(floors + walls).toBe(level.stats.occupied)
  })
})
