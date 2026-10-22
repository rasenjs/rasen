import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { configureLevels, levelTablesFromJson, loadLevel, type Level, type LevelSource, type LevelTables } from '../levels'
import type { AreaRef, LoadAreaRequest, LoadAreaResult, LoadedArea } from '../travel'
import {
  createTravelRuntime,
  describeTravelFailure,
  describeTravelOption,
  type TravelFailure,
  type TravelRuntime,
} from '../travel-runtime'

/**
 * Travel, wired to a runtime: what the tables say a player can reach, and what
 * `travelTo` does about it.
 *
 * The suite runs against the real tables and the real `.ds1` files, because the
 * numbers it pins are readings from those files: the Rogue Encampment's `.ds1`
 * carries three orientation-10 door tiles — which is what makes `hasWarpTiles`
 * measurable rather than assumed — all three bound to the Blood Moor by the
 * `ActInfo` rule, and the town's waypoint list reaches exactly two areas this
 * export can assemble (the Outer and Inner Cloisters). Everything a successful
 * travel *assembles* is stubbed, because a real one bakes a bitmap and that needs
 * a canvas this suite does not have; what the stub checks is the request the
 * runtime builds and the state a success leaves behind.
 *
 * The corpus is `public/original`. Without it the suite reports that it skipped.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = join(HERE, '..', '..', '..')
const TABLES_DIR = join(PACKAGE_ROOT, 'public', 'original')
const TILES_ROOT = join(TABLES_DIR, 'tiles')
const ROMFS = process.env.D2R_ROMFS
const TILES = ROMFS ? join(ROMFS, 'global', 'tiles') : TILES_ROOT
const tablesFile = (name: string) => join(TABLES_DIR, `table_${name}.json`)
const hasCorpus = existsSync(TILES) && existsSync(tablesFile('levels'))
/** The seed `main.tsx` hands the game and this runtime, so both load one variant. */
const GAME_SEED = 20261013

let tables: LevelTables
let rows: { warpRows: Record<string, unknown>[]; actRows: Record<string, unknown>[] }

function readTable<T>(name: string): T {
  return JSON.parse(readFileSync(tablesFile(name), 'utf8')) as T
}

/** A `LevelSource` over the exported tables and the exported tile tree. */
function fileSource(): LevelSource {
  return {
    tables: () => tables,
    readTiles: (relativePath: string) =>
      new Uint8Array(readFileSync(join(TILES, relativePath.toLowerCase()))),
  }
}

/**
 * Assemble an area with the seed the game itself runs with.
 *
 * The seed matters to the numbers below rather than being decoration: a preset with
 * several variants is laid out differently per seed, and the town has more than one
 * (`Act 1 - Town 1`, `Act 1 - Town 2`, …). The three tile coordinates this suite
 * pins are the ones the app loads.
 */
function assembleLevel(area: AreaRef, seed = GAME_SEED): Level {
  const preset = tables.presets.find((entry) => entry.levelId === area.id)
  if (!preset) throw new Error(`no preset for ${area.displayName}`)
  return loadLevel(preset.id, seed, fileSource())
}

/** The empty placement tables, for a runtime that is never asked to place. */
const emptyTables = {
  places: { byAct: new Map(), all: [] },
  objects: { objects: [], byId: new Map(), byClass: new Map(), byToken: new Map(), modes: [] },
} as unknown as Pick<Parameters<typeof createTravelRuntime>[0], 'places' | 'objects'>

function runtimeWith(
  load?: (request: LoadAreaRequest) => Promise<LoadAreaResult>,
): TravelRuntime {
  return createTravelRuntime({
    source: fileSource(),
    tables,
    warpRows: rows.warpRows,
    actRows: rows.actRows,
    seed: GAME_SEED,
    places: emptyTables.places,
    objects: emptyTables.objects,
    monsters: null,
    load,
  })
}

/** A `LoadedArea` for a stub loader: real level, fabricated map and placements. */
function fakeLoaded(area: AreaRef, level: Level): LoadedArea {
  return {
    ok: true,
    area,
    level,
    map: {} as LoadedArea['map'],
    placements: [],
    sites: [],
    entry: { x: 0, y: 0 },
    timing: { assemble: 1, tilesets: 2, art: 3, bake: 4 },
  }
}

beforeAll(() => {
  if (!hasCorpus) return
  tables = levelTablesFromJson({
    lvlprest: readTable('lvlprest'),
    lvltypes: readTable('lvltypes'),
    levels: readTable('levels'),
  })
  rows = { warpRows: readTable('lvlwarp'), actRows: readTable('actinfo') }
  configureLevels(null)
})

describe('the state a runtime owns', () => {
  it('knows every area of every act before anything is loaded', () => {
    if (!hasCorpus) return
    const runtime = runtimeWith()
    expect(runtime.areas).toHaveLength(138)
    expect(runtime.current).toBeNull()
    expect(runtime.currentLevel).toBeNull()
    expect(runtime.doorSites).toEqual([])
    // Nothing is a way out of nowhere.
    expect(runtime.options()).toEqual([])
  })

  it('adopts the area the game started in, and measures whether it has door tiles', () => {
    if (!hasCorpus) return
    const runtime = runtimeWith()
    const town = runtime.areaById(1)!
    expect(town.devName).toBe('Act 1 - Town')
    const level = assembleLevel(town)
    runtime.adopt(town, level)

    expect(runtime.current).toBe(town)
    expect(runtime.currentLevel).toBe(level)
    // Measured from `Act 1 - Town 1`'s own `.ds1`: three orientation-10 tiles, all
    // three on ground a walker may stand on. This is the reading that decides
    // whether the act-entry rule applies to the town at all.
    expect(runtime.doorSites.map((site) => `${site.x},${site.y}`)).toEqual(['30,13', '32,13', '34,20'])
    for (const site of runtime.doorSites) expect(level.walkable(site.x, site.y)).toBe(true)
    // `Vis0..7 = 0` and `Warp0..7 = -1` on that row, so every one of the three is
    // the ActInfo rule's door: the act's first area, bound by the rule and not by a slot.
    expect(runtime.areaLinks).toHaveLength(1)
    expect(runtime.areaLinks[0].rule).toBe('act-entry')
    expect(runtime.doorSites.map((site) => site.destination?.displayName)).toEqual([
      'Blood Moor',
      'Blood Moor',
      'Blood Moor',
    ])
    expect(runtime.doorSites.every((site) => site.binding === 'act-entry')).toBe(true)
  })

  it('reports no door tiles for an area whose `.ds1` has none', () => {
    if (!hasCorpus) return
    const runtime = runtimeWith()
    // The Outer Cloister is the counter-case to the town: a preset with real
    // monsters, and not one orientation-10 tile in it. Its doors are objects.
    const cloister = runtime.areaById(27)!
    runtime.adopt(cloister, assembleLevel(cloister))
    expect(runtime.doorSites).toEqual([])
    expect(runtime.areaLinks.every((link) => link.realisedBy === 'object')).toBe(true)
  })
})

describe('the ways out of the act 1 town', () => {
  it('offers three doors to the Blood Moor and the act’s nine waypoints', () => {
    if (!hasCorpus) return
    const runtime = runtimeWith()
    const town = runtime.areaById(1)!
    runtime.adopt(town, assembleLevel(town))
    const options = runtime.options()

    const doors = options.filter((option) => option.via === 'door')
    expect(doors).toHaveLength(3)
    expect(doors.every((option) => option.tile !== null)).toBe(true)
    // The town's only named destination is the Blood Moor, and it is `DrlgType 3`:
    // the tables describe it and no preset lays it out, so no door out of the
    // town can be walked through in this build.
    expect(doors.every((option) => option.destination.displayName === 'Blood Moor')).toBe(true)
    expect(doors.every((option) => option.availability === 'generated')).toBe(true)
    expect(doors.every((option) => option.loadable === false)).toBe(true)

    // `ActInfo.txt` names nine waypoint areas for act 1 and `travelOptions` drops the
    // one the player is standing in — the town is waypoint 0 of its own list — so a
    // player in the town sees eight rows.
    const waypoints = options.filter((option) => option.via === 'waypoint')
    expect(waypoints).toHaveLength(8)
    expect(waypoints.map((option) => option.destination.displayName)).toEqual([
      'Cold Plains',
      'Stony Field',
      'Dark Wood',
      'Black Marsh',
      'Outer Cloister',
      'Jail Level 1',
      'Inner Cloister',
      'Catacombs Level 2',
    ])
    // Exactly two of the act's nine waypoint areas have a preset in this export.
    expect(waypoints.filter((option) => option.loadable).map((option) => option.destination.id)).toEqual([
      27, 32,
    ])
  })
})

describe('travelTo', () => {
  it('refuses an area the tables do not have', async () => {
    if (!hasCorpus) return
    const runtime = runtimeWith()
    runtime.adopt(runtime.areaById(1)!, assembleLevel(runtime.areaById(1)!))
    const outcome = await runtime.travelTo(9999)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toBe('unknown-area')
    expect(outcome.area).toBeNull()
    // A refused travel is not a lost one: the player is still in the town.
    expect(runtime.current?.id).toBe(1)
  })

  it('reports a generated destination as generated, through the real loader', async () => {
    if (!hasCorpus) return
    // No `load` override: this is `travel.ts`'s `loadArea` refusing, which is the
    // refusal the player sees when they walk onto one of the town's three doors.
    const runtime = runtimeWith()
    runtime.adopt(runtime.areaById(1)!, assembleLevel(runtime.areaById(1)!))
    const outcome = await runtime.travelTo(2)
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toBe('generated')
    expect(outcome.detail).toContain('DrlgType 3')
    expect(outcome.via).toBe('door')
    expect(runtime.current?.id).toBe(1)
    expect(runtime.busy).toBe(false)
  })

  it('hands the loader the door that names the destination, so the hero lands at it', async () => {
    if (!hasCorpus) return
    const requests: LoadAreaRequest[] = []
    const runtime = runtimeWith(async (request) => {
      requests.push(request)
      return fakeLoaded(request.area, assembleLevel(request.area))
    })
    const town = runtime.areaById(1)!
    runtime.adopt(town, assembleLevel(town))

    const outcome = await runtime.travelTo(27)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(requests).toHaveLength(1)
    // The waypoint list is how the Cloister is reached, so there is no door shape
    // to shift by — but the area the player came from is passed either way, which
    // is what puts them at the destination's own door back.
    expect(requests[0].area.id).toBe(27)
    expect(requests[0].fromAreaId).toBe(1)
    expect(requests[0].usedWarp).toBeNull()
    expect(requests[0].seed).toBe(GAME_SEED)
    expect(outcome.via).toBe('waypoint')
    expect(outcome.from?.id).toBe(1)
    expect(outcome.timing).toEqual({ assemble: 1, tilesets: 2, art: 3, bake: 4 })
    // The current area is now the destination, and its doors are its own: the
    // Outer Cloister has no warp tiles, so its ways out carry no tile.
    expect(runtime.current?.id).toBe(27)
    expect(runtime.doorSites).toEqual([])
    expect(runtime.options().every((option) => option.tile === null)).toBe(true)
    expect(runtime.options().map((option) => option.destination.displayName)).toContain(
      'Monastery Gate',
    )
  })

  it('passes the door shape when the destination is reached through a door', async () => {
    if (!hasCorpus) return
    const requests: LoadAreaRequest[] = []
    // The loader is stubbed to refuse, because the only door tile a player can reach
    // in this export leads to Jail Level 3, which is `DrlgType 1` and has no preset —
    // so there is no level to hand back. What is being checked is the *request*: the
    // door row, which is what shifts the hero's arrival.
    const runtime = runtimeWith(async (request) => {
      requests.push(request)
      return {
        ok: false,
        area: request.area,
        reason: 'generated',
        detail: 'DrlgType 1, no preset',
      }
    })
    // The Inner Cloister's one warp tile leads to Jail Level 3, whose door shape is
    // `LvlWarp` "Act 1 Jail Down".
    const cloister = runtime.areaById(32)!
    runtime.adopt(cloister, assembleLevel(cloister))
    const option = runtime.options().find((entry) => entry.tile !== null)
    expect(option?.destination.displayName).toBe('Jail Level 3')
    expect(option?.warpType?.name).toBe('Act 1 Jail Down')

    const outcome = await runtime.travelTo(option!.destination.id)
    expect(requests[0].usedWarp?.name).toBe('Act 1 Jail Down')
    expect(requests[0].fromAreaId).toBe(32)
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.via).toBe('door')
      expect(outcome.reason).toBe('generated')
    }
    // A refusal from the loader leaves the current area where it was.
    expect(runtime.current?.id).toBe(32)
  })

  it('answers a second request while one is in flight instead of queueing it', async () => {
    if (!hasCorpus) return
    // A loader that is held open, so a second request arrives while the first is
    // still assembling.
    const deferred: { settle?: (result: LoadAreaResult) => void } = {}
    const runtime = runtimeWith(
      () =>
        new Promise<LoadAreaResult>((resolve) => {
          deferred.settle = resolve
        }),
    )
    runtime.adopt(runtime.areaById(1)!, assembleLevel(runtime.areaById(1)!))
    const first = runtime.travelTo(27)
    expect(runtime.busy).toBe(true)
    const second = await runtime.travelTo(32)
    expect(second.ok).toBe(false)
    if (!second.ok) {
      expect(second.reason).toBe('busy')
      // The area the caller asked for is still named, so the message can say which
      // travel was dropped.
      expect(second.area?.id).toBe(32)
    }
    const settle = deferred.settle
    settle?.(fakeLoaded(runtime.areaById(27)!, assembleLevel(runtime.areaById(27)!)))
    await first
    expect(runtime.busy).toBe(false)
    expect(runtime.current?.id).toBe(27)
  })
})

describe('what a refusal reads like', () => {
  it('quotes the tables’ own reason for a generated area', () => {
    const area = { displayName: 'Blood Moor', drlgType: 3 } as AreaRef
    const failure: TravelFailure = {
      ok: false,
      area,
      reason: 'generated',
      detail: 'no LvlPrest row names level 2',
      via: 'door',
    }
    expect(describeTravelFailure(failure)).toContain('DrlgType 3')
    expect(describeTravelFailure(failure)).toContain('Blood Moor')
    expect(
      describeTravelFailure({ ...failure, reason: 'no-preset', area: { displayName: 'X' } as AreaRef }),
    ).toBe('X has no tiles in this export: no LvlPrest row names it')
    expect(describeTravelFailure({ ...failure, reason: 'busy' })).toBe('already travelling')
    expect(
      describeTravelFailure({ ...failure, reason: 'assembly-failed' }),
    ).toBe('Blood Moor could not be assembled from this export')
  })

  it('names the way out and why it does not work', () => {
    const town = { id: 1, displayName: 'Rogue Encampment' } as AreaRef
    const destination = { id: 2, displayName: 'Blood Moor', drlgType: 3 } as AreaRef
    expect(
      describeTravelOption(
        {
          via: 'door',
          tile: { x: 30, y: 13 },
          destination,
          rule: 'act-entry',
          warpType: null,
          loadable: false,
          availability: 'generated',
          evidence: '',
        },
        town,
      ),
    ).toBe('door 30,13 · DrlgType 3, generated')
    expect(
      describeTravelOption(
        {
          via: 'waypoint',
          tile: null,
          destination: { id: 27, displayName: 'Outer Cloister' } as AreaRef,
          rule: null,
          warpType: null,
          loadable: true,
          availability: 'preset',
          evidence: '',
        },
        town,
      ),
    ).toBe('waypoint')
    // An option that leads back where the player is says so rather than pretending
    // to be a way out.
    expect(
      describeTravelOption(
        {
          via: 'waypoint',
          tile: null,
          destination: town,
          rule: null,
          warpType: null,
          loadable: true,
          availability: 'preset',
          evidence: '',
        },
        town,
      ),
    ).toBe('waypoint, where you are')
  })
})
