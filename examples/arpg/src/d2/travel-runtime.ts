/**
 * Travel, wired: the tables a load needs, the area the player is in, and `travelTo`.
 *
 * `d2/travel.ts` answers every question about travel that the game's own data can
 * answer — what an area's doors are, where each one leads, which tiles of an
 * assembled level are doors, and where the hero stands on arrival. It holds no
 * state and does no I/O. This module is the piece that owns both: it keeps the
 * level source, the travel context, the tables a load needs and the seed, knows
 * which area the game is in, and turns a request to go somewhere into a
 * {@link TravelOutcome} the caller can act on.
 *
 * It is deliberately free of DOM and drawing so it can be tested, and it never
 * touches the game's entities: the caller owns those, receives the
 * {@link LoadedArea} a successful travel produced, and adopts it.
 *
 * ## 1. `hasWarpTiles`: what the flag means, and why it is measured
 *
 * `travel.ts`'s `linksOf` applies the act-entry rule — "an act's town leads to the
 * area `ActInfo.txt` calls its act's first area" — only when
 * `context.hasWarpTiles === true`, because the rule is about a town whose `.ds1`
 * carries the orientation-10 marker tiles rather than about the tables. The flag
 * therefore has one honest reading: **this area's own `.ds1` has at least one
 * orientation-10 tile**. This runtime never declares it — it measures it with
 * `warpTilesOf(level)` on whatever level it has, and a load passes the same answer
 * on to `loadArea`. There is no fallback to `true`: an area whose `.ds1` is not in
 * hand has no doors, rather than doors by assumption.
 *
 * Measured against this export, that rule is not a formality. The Rogue
 * Encampment's `.ds1` (`Act 1 - Town 1`, 57x41) holds **three** orientation-10
 * tiles — (30,13), (32,13) and (34,20), all three on walkable ground — and its
 * `Vis0..7` are 0 while its `Warp0..7` are -1, so the flag is what decides whether
 * the town has any way out at all. With it, `exitSites` binds all three tiles to
 * the Blood Moor through the act-entry rule and the player can walk onto any of
 * them; without it the town is a sealed box. (Note the placement: the town's tiles
 * include *unwalkable* markers elsewhere in the game — `Act 1 - Courtyard 2`'s
 * single tile is not walkable — which is why the game's own door check is "on the
 * tile or beside it" rather than "on the tile".)
 *
 * ## 2. What `travelTo` uses for the door it travelled through
 *
 * `loadArea` wants `fromAreaId` and `usedWarp` so the hero can enter the
 * destination at the door that leads back where they came from, shifted by the
 * door shape's `ExitWalk` offset. Both are read from the *current* area's own
 * options — the door or waypoint that names the destination — so a travel through
 * a shaped door arrives in the right place, and a travel by waypoint falls back to
 * the destination's first door. When the caller asks to go somewhere no current
 * option names, the current area's id is still passed (so the destination's own
 * door back is found) and no warp type is.
 *
 * ## 3. One travel at a time
 *
 * Assembling an area is asynchronous — `.dt1` files are fetched — and the caller
 * is a game loop that may see the same door on every frame. A second request
 * while one is in flight is answered with `reason: 'busy'` rather than queued, so
 * the cost of a travel stays one travel.
 */

import type { Level, LevelSource, LevelTables } from './levels'
import type { MonsterTables } from './monsters'
import type { ObjectTable } from './objects'
import type { PlaceTable } from './places'
import type { SuperUniqueTable } from './superuniques'
import type { Palette } from './tileart'
import type { TerrainArt } from '../world'
import {
  areaById as findArea,
  areasOf,
  availabilityOf,
  exitSites,
  linksOf,
  loadArea,
  parseActInfo,
  parseWarpTypes,
  travelOptions,
  warpTilesOf,
  type AreaAvailability,
  type AreaLink,
  type AreaRef,
  type ExitSite,
  type LoadAreaRequest,
  type LoadAreaResult,
  type LoadedArea,
  type TravelContext,
  type TravelOption,
} from './travel'

/** The tables a load needs, and the settings it runs with. */
export interface TravelRuntimeOptions {
  /** A browsing level source — `createBrowserLevelSource`'s result. */
  source: LevelSource
  /** The parsed `lvlprest`/`lvltypes`/`levels` tables, from that source. */
  tables: LevelTables
  /** `lvlwarp.txt` rows, for the door shapes. */
  warpRows?: readonly Readonly<Record<string, unknown>>[]
  /** `actinfo.txt` rows, for the act-entry rule and the waypoint lists. */
  actRows?: readonly Readonly<Record<string, unknown>>[]
  /**
   * The seed an area is assembled with, so leaving and returning is the same
   * area rather than a fresh roll of the same preset.
   */
  seed?: number
  /** The tables `resolvePlacements` needs, for the area's own NPCs and monsters. */
  places: PlaceTable
  objects: ObjectTable
  monsters?: MonsterTables | null
  superUniques?: SuperUniqueTable | null
  /** The game's palette, without which a level has no tile pictures. */
  palette?: Palette | null
  /** Terrain art, for a level that has no tile picture of its own. */
  terrain?: TerrainArt
  /**
   * How an area is assembled. Defaults to `travel.ts`'s `loadArea`, which is what
   * the game uses; a test hands in its own so the rules above can be checked
   * without building tile pictures.
   */
  load?: (request: LoadAreaRequest) => Promise<LoadAreaResult>
}

/**
 * The reason a travel did not happen.
 *
 * The last five are `travel.ts`'s own reasons, passed through unchanged; the first
 * two are this module's. `not-reachable` is the caller's rule rather than this
 * module's — a game whose player is in the Rogue Encampment cannot reach the
 * Catacombs, and no table says so, so the caller that knows where the player is is
 * the one that reports it.
 */
export type TravelFailureReason =
  | 'unknown-area'
  | 'busy'
  | 'not-reachable'
  | 'no-preset'
  | 'generated'
  | 'assembly-failed'

/** An area was assembled and is now the current one. */
export interface TravelSuccess {
  ok: true
  /** The area that was left, or `null` when the travel was the first one. */
  from: AreaRef | null
  area: AreaRef
  /** Everything `loadArea` produced; the caller adopts it. */
  loaded: LoadedArea
  /**
   * `loadArea`'s own breakdown, hoisted so a caller can report a stall without
   * digging into `loaded`.
   */
  timing: LoadedArea['timing']
  /** How the destination is reached: a door of the current area, or a waypoint. */
  via: TravelOption['via'] | 'start'
}

/** A travel that did not happen, with the reason the tables give. */
export interface TravelFailure {
  ok: false
  /** The area asked for, when the tables have it. */
  area: AreaRef | null
  reason: TravelFailureReason
  /** The full sentence, which is `loadArea`'s when the refusal came from it. */
  detail: string
  /** How the travel was going to happen, when the current area names the destination. */
  via: TravelOption['via'] | null
}

export type TravelOutcome = TravelSuccess | TravelFailure

/** Everything a load needs except the area, the context and the door used. */
type LoadFixture = Pick<
  LoadAreaRequest,
  'source' | 'seed' | 'palette' | 'terrain' | 'places' | 'objectTable' | 'monsters' | 'superUniques'
>

/**
 * The piece of a running game that knows where the player is and how to leave.
 *
 * One instance per page: the level source's caches live inside it, and the tileset
 * pictures are cached per page by `travel.ts`, so a second runtime would pay for
 * them twice.
 */
export class TravelRuntime {
  private readonly fixture: LoadFixture
  private readonly context: TravelContext
  private readonly load: (request: LoadAreaRequest) => Promise<LoadAreaResult>
  private area: AreaRef | null = null
  private level: Level | null = null
  private links: readonly AreaLink[] = []
  private sites: readonly ExitSite[] = []
  private inFlight = false

  constructor(options: TravelRuntimeOptions) {
    const areas = areasOf(options.tables)
    this.context = {
      areas,
      warpTypes: parseWarpTypes(options.warpRows ?? []),
      actInfo: parseActInfo(options.actRows ?? []),
      tables: options.tables,
      // Not declared here: `contextFor` answers it from the level in hand, which
      // is the only thing that can answer it honestly. See this module's header.
    }
    this.fixture = {
      source: options.source,
      seed: options.seed ?? 20261013,
      palette: options.palette ?? null,
      terrain: options.terrain,
      places: options.places,
      objectTable: options.objects,
      monsters: options.monsters ?? null,
      superUniques: options.superUniques ?? null,
    }
    this.load = options.load ?? loadArea
  }

  /** The areas `levels.txt` describes, in table order. */
  get areas(): readonly AreaRef[] {
    return this.context.areas
  }

  /** The area the game is in, or `null` before {@link adopt}. */
  get current(): AreaRef | null {
    return this.area
  }

  /** The current area's assembled level, or `null` before {@link adopt}. */
  get currentLevel(): Level | null {
    return this.level
  }

  /** The current area's door tiles, with where each leads. */
  get doorSites(): readonly ExitSite[] {
    return this.sites
  }

  /** The current area's links, as the tables and its `.ds1` give them. */
  get areaLinks(): readonly AreaLink[] {
    return this.links
  }

  /** Whether a travel is in flight, so a caller can avoid asking twice. */
  get busy(): boolean {
    return this.inFlight
  }

  /** An area by `levels.txt` id, or `null`. */
  areaById(id: number): AreaRef | null {
    return findArea(this.context.areas, id)
  }

  /** Whether this build can assemble an area, or `null` for an unknown id. */
  availabilityOf(id: number): AreaAvailability | null {
    const area = this.areaById(id)
    return area === null ? null : availabilityOf(area, this.context.tables)
  }

  /**
   * Every way out of the current area, in the order `travel.ts` gives them: the
   * door tiles of the `.ds1` first, then the doors whose object the tables do not
   * name, then the waypoint list. Each option says whether its destination can be
   * assembled, so a caller can offer the ones that work without hiding the ones
   * that do not.
   */
  options(): readonly TravelOption[] {
    if (this.area === null) return []
    return travelOptions(this.level, this.area, this.context)
  }

  /**
   * Make an area the current one.
   *
   * The caller has already assembled it — the game starts in an area it built
   * itself — so this is the one entry point that takes a level rather than
   * producing one. The door sites and the links are recomputed from that level,
   * with `hasWarpTiles` measured from its `.ds1`; see this module's header.
   */
  adopt(area: AreaRef, level: Level): void {
    this.area = area
    this.level = level
    this.links = linksOf(area, this.contextFor(level))
    this.sites = exitSites(level, this.links)
  }

  /**
   * Assemble an area and make it the current one.
   *
   * Fails with a reason rather than throwing: "the Blood Moor has no preset" is a
   * fact about the shipped data that a caller shows the player, and an area this
   * build cannot assemble is the normal case — 101 of the 138 areas are laid out by
   * a generator the tables describe but do not carry. A failure leaves the current
   * area untouched, so a refused travel is not a lost one.
   */
  async travelTo(areaId: number): Promise<TravelOutcome> {
    const area = this.areaById(areaId)
    if (area === null) {
      return {
        ok: false,
        area: null,
        reason: 'unknown-area',
        detail: `levels.txt has no area with id ${areaId}`,
        via: null,
      }
    }
    if (this.inFlight) {
      return {
        ok: false,
        area,
        reason: 'busy',
        detail: `a travel is already being assembled, so this one was not started`,
        via: null,
      }
    }

    const from = this.area
    const option = this.options().find((entry) => entry.destination.id === areaId) ?? null
    this.inFlight = true
    try {
      const result = await this.load({
        ...this.fixture,
        context: this.context,
        area,
        // The door that names the destination is what places the hero on arrival:
        // its shape's `ExitWalk` offset and the destination's own door back.
        fromAreaId: from?.id ?? -1,
        usedWarp: option?.warpType ?? null,
      })
      if (!result.ok) {
        return {
          ok: false,
          area,
          reason: result.reason,
          detail: result.detail,
          via: option?.via ?? null,
        }
      }
      this.adopt(area, result.level)
      return {
        ok: true,
        from,
        area,
        loaded: result,
        timing: result.timing,
        via: option?.via ?? 'start',
      }
    } finally {
      this.inFlight = false
    }
  }

  /**
   * The context, with `hasWarpTiles` measured from the level in hand.
   *
   * A `null` level answers `false`: with no `.ds1` there is no marker, and the
   * act-entry rule is about the marker. Nothing is loaded in that state anyway —
   * every path into this class through {@link adopt} or {@link travelTo} has a
   * level.
   */
  private contextFor(level: Level | null): TravelContext {
    return { ...this.context, hasWarpTiles: level !== null && warpTilesOf(level).length > 0 }
  }
}

/** Build a travel runtime. */
export function createTravelRuntime(options: TravelRuntimeOptions): TravelRuntime {
  return new TravelRuntime(options)
}

/**
 * Why a travel did not happen, in one line, for a HUD that has one line to give.
 *
 * The numbers are quoted from the tables rather than paraphrased, because the
 * numbers are the reason: a `DrlgType 3` area is outdoors and the generator that
 * lays it out is in the game's program, and 101 of the 138 areas are that case.
 */
export function describeTravelFailure(failure: TravelFailure): string {
  const name = failure.area?.displayName ?? 'that area'
  switch (failure.reason) {
    case 'unknown-area':
      return failure.detail
    case 'busy':
      return 'already travelling'
    case 'not-reachable':
      return 'nothing here leads there'
    case 'no-preset':
      return `${name} has no tiles in this export: no LvlPrest row names it`
    case 'generated':
      return (
        `${name} is DrlgType ${failure.area?.drlgType ?? '?'} — laid out by the game's own ` +
        `generator, which this replica does not carry`
      )
    case 'assembly-failed':
      return `${name} could not be assembled from this export`
  }
}

/**
 * How one option gets there, and whether it can be entered — the note after the
 * destination's name in a travel row.
 *
 * Kept to one line, and deliberately terse: the row it belongs to is one line of a list
 * that is eleven rows long in the Rogue Encampment, and the *full* sentence — the one
 * `loadArea` would give — is what the player gets in the message log when the row is
 * used. What the note has to carry is which kind of road it is and, when the
 * destination cannot be entered, the tables' own one-word reason for it.
 */
export function describeTravelOption(option: TravelOption, currentArea: AreaRef | null): string {
  const where =
    option.via === 'waypoint'
      ? 'waypoint'
      : option.tile
        ? `door ${option.tile.x},${option.tile.y}`
        : 'door (object)'
  const back = currentArea !== null && option.destination.id === currentArea.id ? ', where you are' : ''
  if (option.loadable) return `${where}${back}`
  const why =
    option.availability === 'generated'
      ? `DrlgType ${option.destination.drlgType}, generated`
      : option.availability === 'no-preset'
        ? 'no preset'
        : option.availability
  return `${where} · ${why}`
}
