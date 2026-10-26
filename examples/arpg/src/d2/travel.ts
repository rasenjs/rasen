/**
 * Travel: the doors a level has, where each one leads, and loading the next area.
 *
 * ## What the tables say about a link between two areas
 *
 * `Levels.txt` carries eight **column pairs** per area, `Vis0`..`Vis7` and
 * `Warp0`..`Warp7`, and they are paired **by slot**, not by value:
 *
 * ```
 * Vis3 = 46   Warp3 = 25     →   slot 3 leads to level 46 through LvlWarp row 25
 * ```
 *
 * `Vis n` is the **destination level id** and `Warp n` is the `LvlWarp.txt` row
 * that shapes the door itself (its hit box, where the player stands after using
 * it, and the offset to the paired door at the other end). Measured over the
 * shipped tables: **113 of the 138 real rows carry at least one pair, 228 pairs
 * in all**, and the pairing is verifiable against names rather than asserted:
 * the Canyon of the Magi (`Act 2 - Valley of the Kings`, level 46) names
 * `Vis1..7 = 66..72` with `Warp1..7 = 38..44`, while levels 66..72 are the seven
 * `Act 2 - Tomb Tal 1..7` areas and `LvlWarp` rows 38..44 are named exactly
 * `Act 2 Desert to Tomb Tal 1..7`. Seven slots, seven tombs, seven door shapes,
 * and the two ranges line up slot for slot.
 *
 * A slot is a link only when **both** halves are set: `Vis n > 0` and
 * `Warp n >= 0`. `Vis 0` is the table's `Null` level and `Warp -1` is "no door
 * shape in this slot"; the two are used together for 228 slots, and those pairs
 * are the cave mouths (`Act 1 Wilderness to Cave Cliff L` and friends, four of
 * them per wilderness area, one per cave mouth) and the tomb entrances.
 *
 * A `Vis` **without** a `Warp` is the third case, and its own: the Monastery
 * (26) sets `Vis1 = 27` and Courtyard 1 (27) sets `Vis0 = 26, Vis1 = 28`, all
 * three `Warp` columns clear, and neither level has a single warp tile in its
 * `.ds1`. Those are the doors and staircases you walk through as *objects*, and
 * a running copy of the game confirms the mechanism: clicking the exit tile at
 * such a place does not change level, while clicking the staircase object
 * standing on it does. The tables name the destination and never name the
 * object, so the module reports these as {@link AreaLink}s with
 * `realisedBy: 'object'` and **no tile**: a caller can show them, and cannot walk
 * onto them without deciding for itself which object class is the door.
 *
 * ## What the tables say about the door *in the level*
 *
 * Nothing at all — and this is the part worth stating, because it is the part
 * that looks like an omission and is not.
 *
 * The `.ds1` does not store a destination. A door in a `.ds1` is an
 * **orientation-10 tile in a wall layer**, and those tiles have *no picture at
 * all*: `assembleTile` paints nothing for the warp blocks of
 * `Act1/Barracks/Warp.dt1`, because they are markers, not art. Measured with
 * `tools/verify-travel.ts`: 1 warp tile means one door (`Act 1 - Courtyard 2`
 * has one and one `Vis`/`Warp` pair, `Act 1 - Tower 2` has two and two pairs),
 * so the tile count and the pair count agree wherever both can be read.
 *
 * The destination of a door is therefore the level's own `Vis`/`Warp` pair:
 * the engine numbers a level's doors and pairs them with those slots. Nothing
 * in the file says *which* slot a given tile is, and the tables cannot say: a
 * level with more than one distinct destination has no positional information
 * to pair a slot with a tile — `LvlWarp`'s `SelectX/SelectY/SelectDX/SelectDY`
 * is the door's screen-space hit box (that is why they are negative), not a
 * place on the map. So {@link exitSites} assigns by slot order and says so.
 *
 * ## The rule used where the data has no link — stated, not hidden
 *
 * Five rows — the five towns, level ids 1, 40, 75, 103 and 109 — carry **no
 * slots at all**: all eight `Vis` are 0 and all eight `Warp` are -1. In the
 * shipped tables the act 1 town is not merely unlinked *outward*; it is an
 * isolated node with in-degree and out-degree both 0, and `tools/verify-travel.ts`
 * prints that as a count rather than as a claim.
 *
 * `LvlWarp.txt` does not fill the gap either. Act 2's town *is* named by warp
 * rows — 19 `Act 2 Town to Sewer Trap`, 20 `Act 2 Town to Sewer Dock`, 21
 * `Act 2 Sewer Dock to Town`, 24 `Act 2 Town to Harem`, 25 `Act 2 Harem to
 * Town` — and those five rows exist for exactly the reason act 1's do not: act
 * 2's town sets three slots and act 1's sets none. Of the 89 warp rows, **none
 * names act 1's town**, and none names acts 3, 4 or 5's towns.
 *
 * The rule used here, for an act's **town** that has warp tiles and no slot, is:
 *
 * > the door leads to the area `ActInfo.txt` names as its act's first area —
 * > the level in the act's `classlevelrangestart` column.
 *
 * This is a rule, not a link, and it is stated because the repository's standard
 * is that a chosen rule is visible. Its evidence is a table rather than a guess:
 * `ActInfo.txt` names each act's `town` and its `classlevelrangestart`, and for
 * act 1 those are `Act 1 - Town` and `Act 1 - Wilderness 1` — the Rogue
 * Encampment and the Blood Moor, in that order, in the act's own data. The rule
 * is scoped to the area that `town` column names, so it cannot leak: Tristram
 * (38), the Monastery (26) and Moo Moo Farm (39) also have warp tiles and no
 * slot, and each is left with a door and no destination rather than being handed
 * the Blood Moor. Act 5's `classlevelrangestart` is `Act 5 - Town` itself, so for
 * that town the rule would name the town, and the module returns no link instead
 * of a loop.
 *
 * ## The second travel network, which *is* in the data
 *
 * `Levels.txt`'s `Waypoint` column gives an area's index within its act's
 * waypoint list (255 for none) and `ActInfo.txt`'s `waypoint1`..`waypoint9`
 * columns name the areas at those indices. That is a complete, data-driven
 * travel network and it needs no assembled level to be read. In act 1 the town
 * is waypoint 0 and the list reaches nine areas: `Act 1 - Courtyard 1` (the
 * Outer Cloister, `MonDen` 600), `Act 1 - Courtyard 2` (the Inner Cloister, 720)
 * and — since `drlg.ts` — the six generated areas the list names (`Wilderness
 * 2..5`, `Jail 1` and `Catacombs 2`), which is what makes the waypoint network
 * reach the Jail and the Catacombs as well.
 *
 * ## How an area comes to exist: two grids, one assembler
 *
 * `LvlPrest.txt` names a preset for **37 of the 138 levels**. The other 101 are
 * `DrlgType 1` (a maze of rooms) or `DrlgType 3` (outdoors), and neither has a
 * `.ds1` to read: the retail engine *builds* them when the area loads, from the
 * level's own row plus `LvlMaze.txt` and `LvlSub.txt`. `d2/drlg.ts` is that
 * generator written to the same tables.
 *
 * {@link loadArea} therefore has two sources of grids and one assembler:
 *
 * - a `DrlgType 2` area reads its preset's `.ds1`, as it always has;
 * - a `DrlgType 1`/`3` area asks `drlg.ts` to plan it from the tables, fetches
 *   the `.ds1` *pieces* the plan names, composes them into one grid, and hands
 *   that grid to `levels.ts`'s `assembleLevelFromDs1` — the same resolution, the
 *   same 25-sub-tile collision grid, the same object list a preset gets.
 *
 * The two halves answer different questions, and the split is deliberate:
 *
 * - **Is it enterable?** (`loadable`, and `travelOptions`'s note.) A question
 *   about the tables, answered by `planArea` with no I/O at all, so a HUD can
 *   answer it before anything is loaded. Measured over the export: **76 of the
 *   101 generated areas plan**, and 25 do not — 18 for want of an act-matched
 *   `LvlSub` border set, 5 for want of a `LvlPrest` room set named after the
 *   area's family, 2 for want of a size in `Levels.txt`.
 * - **Can this export build it?** A question about the bytes, answered when the
 *   area is loaded: of the 76, **26 have every piece and tileset they name in
 *   this export** — all of act 1, plus its mazes — and the other 50 are acts 2
 *   to 5, whose `.ds1` pieces and `.dt1` tilesets the export does not carry.
 *   Those fail with `assembly-failed` and the first missing file named.
 *
 * So the act 1 town's own exit now leads to the Blood Moor, the waypoints reach
 * the Jail and the Catacombs, and an area that still refuses says which table —
 * or which file — is short.
 *
 * ## Cost of a swap, and what is cached
 *
 * Assembling a level is the cheap half — the town's 57x41 grid takes ~40 ms
 * from the prefetched bytes — and building tile pictures is the expensive half,
 * because a picture is a 16x16-sub-tile composition per `(tileset, block)` pair
 * that the level references thousands of times. Both are cached **for the page's
 * lifetime, not per area**:
 *
 * - the `.dt1` bytes and their parsed files, keyed by table path;
 * - the assembled picture of a `(tileset, blockIndex)`, keyed by both — this is
 *   what makes a revisit free and a first visit proportional to the tilesets the
 *   two areas do *not* share;
 * - the palette.
 *
 * What is **not** cached, and is left for the caller because it is the caller's
 * object: the `WorldMap`. A swap builds a new one, and `bakeGround` paints every
 * cell into one big offscreen canvas — the town's is ~6300x3300 pixels, because
 * bake size is `(width + height) * 32` tall whatever the tile count. Two maps
 * therefore cost two bitmaps at once; a caller that wants an area to be free to
 * return to should keep the `LoadedArea` it already has rather than re-request
 * it.
 *
 * ## The API
 *
 * ```
 * areasOf(tables)                        every area, from Levels.txt
 * areaById / areaByName                  the same, by id or by either name
 *
 * linksOf(area, context)                 where the area's doors lead (the rules above)
 * warpTilesOf(level)                     the orientation-10 tiles of an assembled level
 * exitSites(level, links)                door sites, each with its destination
 * exitAt(sites, x, y)                    which site the player is standing on
 *
 * waypointLinksOf(area, context)         the area's waypoint peers
 * travelOptions(level|null, area, ctx)   every way out, each marked loadable or why not
 *
 * createAreaArt(level, tilesets, palette) tile pictures, cached across areas
 * areaGrid(level, art)                   the renderer's grid for a loaded level
 * loadArea(request)                      assemble + bake + place an area, or say why not
 *
 * generatableOf(area, tables)            can drlg.ts lay this area out?
 * planAreaFor(area, tables)              the plan, or the reason there is none
 * ```
 *
 * `loadArea` is the only part that needs a DOM (it bakes the map), and it is
 * asynchronous because the level's own files are fetched through the level
 * source's prefetch. Everything else is a pure function of the tables and a
 * loaded level, which is what makes it testable and what `verify-travel.ts` and
 * `verify-drlg.ts` audit.
 */

import { decodeDs1Cell } from '@rasenjs/assets'
import type { Dt1File } from './dt1'
import { parseDt1 } from './dt1'
import {
  composeArea,
  monsterPlacement,
  planArea,
  populateMonsters,
  type DrlgPlan,
  type DrlgPlanResult,
} from './drlg'
import {
  assembleLevelFromDs1,
  presetsForLevel,
  type Level,
  type LevelRow,
  type LevelSource,
  type LevelTables,
  type LvlPrestRow,
} from './levels'
import { loadLevelWithFetch } from './level-source'
import type { MonsterTables } from './monsters'
import type { ObjectTable } from './objects'
import { monPresetAct, resolvePlacements, type Placement, type PlaceTable } from './places'
import type { SuperUniqueTable } from './superuniques'
import { assembleTile, bitmapToCanvas, blockLayer, isWallBlock, type Palette } from './tileart'
import type { TileArt } from '../world'
import { generateWorld, type RealLevelGrid, type TerrainArt, type WorldMap } from '../world'

/**
 * The wall-layer orientation that marks a door.
 *
 * Retail's `Act1/Barracks/Warp.dt1` defines its warp blocks at orientation 10,
 * and every `.ds1` in this export whose level has a `Vis`/`Warp` pair has at
 * least one of them.
 */
export const WARP_TILE_ORIENTATION = 10

/** One row of `LvlWarp.txt`: the shape of a door, never its destination. */
export interface WarpTypeRow {
  id: number
  name: string
  /** The door's screen-space selection box, relative to the tile. */
  selectX: number
  selectY: number
  selectDX: number
  selectDY: number
  /** Where the player is placed after using the door, relative to the tile. */
  exitWalkX: number
  exitWalkY: number
  /** The offset to the paired door at the other end of the link. */
  offsetX: number
  offsetY: number
  direction: string
  /** How many tiles of the door's own art the type covers. 2 in 85 of 89 rows. */
  tiles: number
  /** `true` when the door is walked through rather than interacted with. */
  noInteract: boolean
}

function asString(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

function asNumber(value: unknown): number {
  const text = asString(value)
  return text === '' ? 0 : Number(text)
}

/** Normalises `table_lvlwarp.json`. Rows with a null `Id` are the table's tail. */
export function parseWarpTypes(rows: readonly Readonly<Record<string, unknown>>[]): WarpTypeRow[] {
  const out: WarpTypeRow[] = []
  for (const row of rows) {
    const name = asString(row.Name)
    if (!name || row.Id === null || row.Id === undefined) continue
    out.push({
      id: asNumber(row.Id),
      name,
      selectX: asNumber(row.SelectX),
      selectY: asNumber(row.SelectY),
      selectDX: asNumber(row.SelectDX),
      selectDY: asNumber(row.SelectDY),
      exitWalkX: asNumber(row.ExitWalkX),
      exitWalkY: asNumber(row.ExitWalkY),
      offsetX: asNumber(row.OffsetX),
      offsetY: asNumber(row.OffsetY),
      direction: asString(row.Direction),
      tiles: asNumber(row.Tiles),
      noInteract: asNumber(row.NoInteract) !== 0,
    })
  }
  return out
}

/**
 * One act's row of `ActInfo.txt`.
 *
 * `act` is **1-based** here, as the file stores it, while `Levels.txt`'s `Act`
 * column is 0-based in this export (`Act 1 - Town` stores 0). The two spaces meet
 * only here, in {@link actInfoFor}, which is the one place the +1 is applied.
 */
export interface ActInfoRow {
  act: number
  /** The act's town, as a `Levels.txt` `Name`. */
  town: string
  /** Where a character of the act starts. */
  start: string
  /** The first area of the act outside its town. */
  classLevelRangeStart: string
  /** `waypoint1`..`waypoint9`, in order, empty slots dropped. */
  waypoints: readonly string[]
}

/** Normalises `table_actinfo.json`. */
export function parseActInfo(rows: readonly Readonly<Record<string, unknown>>[]): ActInfoRow[] {
  const out: ActInfoRow[] = []
  for (const row of rows) {
    const act = asNumber(row.act)
    if (!act) continue
    const waypoints: string[] = []
    for (let i = 1; i <= 9; i++) {
      const name = asString(row[`waypoint${i}`])
      if (name) waypoints.push(name)
    }
    out.push({
      act,
      town: asString(row.town),
      start: asString(row.start),
      classLevelRangeStart: asString(row.classlevelrangestart),
      waypoints,
    })
  }
  return out
}

/** The act's row, taking `Levels.txt`'s stored (0-based) act number. */
export function actInfoFor(table: readonly ActInfoRow[], storedAct: number): ActInfoRow | null {
  return table.find((row) => row.act === storedAct + 1) ?? null
}

/** An area, as the travel rules need it. */
export interface AreaRef {
  id: number
  /** `Levels.txt`'s `Name`: `Act 1 - Wilderness 1`. The tables' own key. */
  devName: string
  /** `LevelName`: `Blood Moor`. The name a player sees. */
  displayName: string
  /** The stored (0-based) act. Act 1 is 0. */
  act: number
  /** `LevelGroup`: `Act 1 - Blood Moor`. */
  group: string
  /** `DrlgType`: 1 maze, 2 preset, 3 outdoor. */
  drlgType: number
  /** Index into `LvlTypes.txt`. */
  levelType: number
  sizeX: number
  sizeY: number
  /** The level the area's monsters scale to. */
  monsterLevel: number
  /** Monsters per 1000 tiles. 0 for a town. */
  monsterDensity: number
  /** The area's index within its act's waypoint list, or 255. */
  waypoint: number
  portal: boolean
  vis: readonly number[]
  warp: readonly number[]
}

function areaFrom(row: LevelRow): AreaRef {
  return {
    id: row.id,
    devName: row.name,
    displayName: row.levelName,
    act: row.act,
    group: row.levelGroup,
    drlgType: row.drlgType,
    levelType: row.levelType,
    sizeX: row.sizeX,
    sizeY: row.sizeY,
    monsterLevel: row.monsterLevel,
    monsterDensity: row.monsterDensity,
    waypoint: row.waypoint,
    portal: row.portal,
    vis: row.vis,
    warp: row.warp,
  }
}

/** Every area `Levels.txt` names, in table order. */
export function areasOf(tables: LevelTables): AreaRef[] {
  return tables.levels.map(areaFrom)
}

export function areaById(areas: readonly AreaRef[], id: number): AreaRef | null {
  return areas.find((area) => area.id === id) ?? null
}

/** Look an area up by either of its names, case-insensitively. */
export function areaByName(areas: readonly AreaRef[], name: string): AreaRef | null {
  const wanted = name.trim().toLowerCase()
  if (!wanted) return null
  return (
    areas.find((area) => area.devName.toLowerCase() === wanted) ??
    areas.find((area) => area.displayName.toLowerCase() === wanted) ??
    null
  )
}

/** How a link was established. */
export type LinkRule = 'vis-warp' | 'vis-object' | 'act-entry'

/** What in the level actually opens the link. */
export type DoorRealisation = 'warp-tile' | 'object' | 'unknown'

/** One door of an area, and the area it leads to. */
export interface AreaLink {
  /** The `Vis`/`Warp` slot, or -1 for the act-entry rule. */
  slot: number
  rule: LinkRule
  destination: AreaRef
  /** The `LvlWarp` row shaping the door, when the slot named one. */
  warpType: WarpTypeRow | null
  /** What opens the link in the level's own data. */
  realisedBy: DoorRealisation
  /** What the link rests on, for a report to quote. */
  evidence: string
}

/** Everything the rules need besides the level itself. */
export interface TravelContext {
  areas: readonly AreaRef[]
  warpTypes: readonly WarpTypeRow[]
  actInfo: readonly ActInfoRow[]
  tables: LevelTables
  /** Whether the area's `.ds1` carries warp tiles. Only known once it is loaded. */
  hasWarpTiles?: boolean
}

/** The `(Vis, Warp)` slots an area's row sets, as links. */
export function slotLinks(area: AreaRef, context: TravelContext): AreaLink[] {
  const out: AreaLink[] = []
  for (let slot = 0; slot < area.vis.length; slot++) {
    const destinationId = area.vis[slot] ?? 0
    const warpId = area.warp[slot] ?? -1
    if (destinationId <= 0) continue
    const destination = areaById(context.areas, destinationId)
    if (!destination) continue

    if (warpId < 0) {
      // `Vis` set with `Warp` clear is its own case, and a measured one: the
      // Monastery (26) and Courtyard 1 (27) both name their neighbours this way,
      // neither has a single warp tile in its `.ds1`, and both are areas you
      // enter through a door or a staircase object rather than a warp. The
      // tables name the destination and say nothing about the object, so the
      // link is reported with its realisation unknown rather than dropped.
      out.push({
        slot,
        rule: 'vis-object',
        destination,
        warpType: null,
        realisedBy: 'object',
        evidence: `Vis${slot}=${destinationId} with Warp${slot} unset: the slot names the area, and the door is an object in the level rather than a warp tile`,
      })
      continue
    }

    const warpType = context.warpTypes.find((row) => row.id === warpId) ?? null
    out.push({
      slot,
      rule: 'vis-warp',
      destination,
      warpType,
      realisedBy: 'warp-tile',
      evidence: `Vis${slot}=${destinationId} Warp${slot}=${warpId}${warpType ? ` (LvlWarp "${warpType.name}")` : ' (no LvlWarp row)'}`,
    })
  }
  return out
}

/**
 * Every door of an area, from the rules the module header states.
 *
 * `slotLinks` first — that is the data, and it covers 228 `Vis`/`Warp` slots.
 * The act-entry rule is applied to **an act's town only**, the area
 * `ActInfo.txt`'s `town` column names, and only when the level it was assembled
 * from has warp tiles: that is what the rule says, and applying it to any area
 * with warp tiles and no slot would hand Tristram and the Monastery the Blood
 * Moor, which nothing supports.
 */
export function linksOf(area: AreaRef, context: TravelContext): AreaLink[] {
  const slots = slotLinks(area, context)
  if (slots.length > 0) return slots
  if (context.hasWarpTiles !== true) return []
  const info = actInfoFor(context.actInfo, area.act)
  if (!info || !info.classLevelRangeStart) return []
  // The town, to the letter: `ActInfo.txt`'s own `town` column has to name it.
  if (info.town && info.town.toLowerCase() !== area.devName.toLowerCase()) return []
  const destination = areaByName(context.areas, info.classLevelRangeStart)
  if (!destination || destination.id === area.id) return []
  return [
    {
      slot: -1,
      rule: 'act-entry',
      destination,
      warpType: null,
      realisedBy: 'unknown',
      evidence:
        `no Vis/Warp slot is set; the rule in this module's header takes the act's ` +
        `classlevelrangestart from ActInfo.txt: "${info.classLevelRangeStart}"`,
    },
  ]
}

/** One orientation-10 tile of an assembled level. */
export interface WarpTile {
  x: number
  y: number
  /** The `.ds1` cell's key, for a reader who wants to check the art. */
  mainIndex: number
  subIndex: number
  /** The wall layer's orientation byte, as stored. */
  storedOrientation: number
}

/**
 * The door tiles of an assembled level.
 *
 * Read from the `.ds1` directly rather than from the level's primary tile: the
 * primary tile of a cell is its floor, and a door is a *wall*. One tile is one
 * door — the count agrees with the level's pair count wherever both can be read
 * (`Act 1 - Courtyard 2`: one and one; `Act 1 - Tower 2`: two and two) — so no
 * grouping is invented.
 *
 * Grouping is deliberately *not* invented for the one level that needs it: the
 * act 1 town has three warp tiles and no pair, two of them two columns apart and
 * a third seven rows away, and nothing in the tables says whether that is one
 * door and a marker, three doors, or a door whose halves sit apart. The module
 * reports the three tiles.
 */
export function warpTilesOf(level: Level): WarpTile[] {
  const out: WarpTile[] = []
  const ds1 = level.ds1
  for (let y = 0; y < ds1.height; y++) {
    for (let x = 0; x < ds1.width; x++) {
      const i = y * ds1.width + x
      for (const wall of ds1.walls) {
        const raw = wall.cells[i]
        if ((raw & 0xffff) === 0) continue
        const stored = wall.orientations[i] ?? 0
        const cell = decodeDs1Cell(raw, stored)
        // `stored` is a byte, but only its low nibble is the direction; the
        // engine masks it the same way (see `ds1.ts`'s orientation stream).
        if ((cell.orientation & 0xf) !== WARP_TILE_ORIENTATION) continue
        out.push({
          x,
          y,
          mainIndex: cell.mainIndex,
          subIndex: cell.subIndex,
          storedOrientation: stored,
        })
      }
    }
  }
  return out
}

/** A door the player can stand on, with where it leads. */
export interface ExitSite {
  tiles: readonly WarpTile[]
  /** The tile a walker is measured against — the first of the site's tiles. */
  x: number
  y: number
  destination: AreaRef | null
  rule: LinkRule | null
  warpType: WarpTypeRow | null
  /**
   * How the destination was bound to this tile.
   *
   * `only-destination` — the level has one destination and this is one of its
   * doors, which is the case for 112 of the 113 linked levels. `slot-order` —
   * the level has several destinations, and the tables contain nothing that
   * pairs a slot with a position, so the slots are used in table order.
   * `act-entry` — the rule from this module's header. `unpaired` — no rule
   * applied, and the site is a marker with nowhere to go.
   */
  binding: 'only-destination' | 'slot-order' | 'act-entry' | 'unpaired'
  evidence: string
}

/**
 * The door sites of an assembled level.
 *
 * @param level The assembled level, whose `.ds1` holds the tiles.
 * @param links The area's links, from {@link linksOf}. Only links a warp tile
 *   can realise are bound to a tile: a `vis-object` link's door is an object the
 *   tables do not name, so binding it to a warp tile would be a guess.
 */
export function exitSites(level: Level, links: readonly AreaLink[]): ExitSite[] {
  const tiles = warpTilesOf(level)
  if (tiles.length === 0) return []

  const bindable = links.filter((link) => link.realisedBy !== 'object')
  const destinations: AreaRef[] = []
  for (const link of bindable) {
    if (!destinations.some((area) => area.id === link.destination.id)) destinations.push(link.destination)
  }

  const sites: ExitSite[] = []
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i]
    let destination: AreaRef | null = null
    let rule: LinkRule | null = null
    let warpType: WarpTypeRow | null = null
    let binding: ExitSite['binding'] = 'unpaired'
    let evidence = links.some((link) => link.realisedBy === 'object')
      ? 'the level has a warp tile and its only slots name areas whose doors are objects in the level, not warps'
      : 'the level has a warp tile and its row sets no Vis/Warp slot'

    if (destinations.length === 1) {
      const link = bindable.find((entry) => entry.destination.id === destinations[0].id)
      if (link) {
        destination = link.destination
        rule = link.rule
        warpType = link.warpType
        binding = link.rule === 'act-entry' ? 'act-entry' : 'only-destination'
        evidence =
          bindable.length === 1
            ? link.evidence
            : `${link.evidence}; all ${bindable.length} slots of this level name the same area`
      }
    } else if (destinations.length > 1 && tiles.length === bindable.length) {
      const link = bindable[i]
      destination = link.destination
      rule = link.rule
      warpType = link.warpType
      binding = link.rule === 'act-entry' ? 'act-entry' : 'slot-order'
      evidence = `${link.evidence}; slot order is the only pairing the tables have (${bindable.length} slots, ${tiles.length} tiles)`
    } else if (destinations.length > 1) {
      evidence = `${bindable.length} slots but ${tiles.length} tiles, ${destinations.length} distinct destinations: nothing pairs a slot with a position`
    }

    sites.push({ tiles: [tile], x: tile.x, y: tile.y, destination, rule, warpType, binding, evidence })
  }
  return sites
}

/** The site the player is standing on, or `null`. */
export function exitAt(sites: readonly ExitSite[], x: number, y: number): ExitSite | null {
  return sites.find((site) => site.x === x && site.y === y) ?? null
}

/** One area an area's waypoint reaches. */
export interface WaypointLink {
  /** The index within the act, which is what `Levels.txt`'s `Waypoint` stores. */
  index: number
  destination: AreaRef
}

/**
 * The areas the area's waypoint reaches, from `Levels.txt`'s `Waypoint` column
 * and `ActInfo.txt`'s `waypoint1`..`waypoint9` columns.
 *
 * The act's list is returned whole, including the area the player is standing
 * in, because that is what the table says; a caller drawing a waypoint menu is
 * the one that filters.
 */
export function waypointLinksOf(area: AreaRef, context: TravelContext): WaypointLink[] {
  if (area.waypoint === 255) return []
  const info = actInfoFor(context.actInfo, area.act)
  if (!info) return []
  const out: WaypointLink[] = []
  for (let index = 0; index < info.waypoints.length; index++) {
    const destination = areaByName(context.areas, info.waypoints[index])
    if (destination) out.push({ index, destination })
  }
  return out
}

/** How the tables describe an area's layout. */
export type AreaAvailability = 'preset' | 'generated' | 'no-preset'

/**
 * How the tables describe an area: a preset, a generated level, or neither.
 *
 * `generated` says only *what kind of row this is* — a `DrlgType 1` or `3` area
 * that no `LvlPrest` row names — and not whether it is enterable. Whether it is
 * enterable is {@link generatableOf}'s answer, and for most of these areas it is
 * yes: `d2/drlg.ts` lays a maze out from `LvlMaze.txt` and a wilderness from
 * `LvlSub.txt`. `generated` remains the honest answer for the ones that stay
 * shut, which is what a caller showing a reason wants to quote.
 */
export function availabilityOf(area: AreaRef, tables: LevelTables): AreaAvailability {
  if (presetsForLevel(tables, area.id).length > 0) return 'preset'
  return area.drlgType === 2 ? 'no-preset' : 'generated'
}

/** The `Levels.txt` row behind an area, which is what the generator plans from. */
export function levelRowOf(area: AreaRef, tables: LevelTables): LevelRow | null {
  return tables.levels.find((row) => row.id === area.id) ?? null
}

/**
 * The generator's plan for an area, or the reason it will not build one.
 *
 * A pure function of the tables, with no I/O: this is what {@link travelOptions}
 * asks before it calls an area enterable, and what a caller that only wants to
 * know whether an area is worth offering should ask too.
 */
export function planAreaFor(area: AreaRef, tables: LevelTables, seed = 20261013): DrlgPlanResult | null {
  const level = levelRowOf(area, tables)
  if (!level) return null
  return planArea(level, tables, seed)
}

/** Whether the generator can lay an area out from the tables in hand. */
export function generatableOf(area: AreaRef, tables: LevelTables, seed = 20261013): boolean {
  if (presetsForLevel(tables, area.id).length > 0) return true
  return planAreaFor(area, tables, seed)?.ok === true
}

/** The preset an area is entered through, in table order. */
export function presetForArea(area: AreaRef, tables: LevelTables): LvlPrestRow | null {
  return presetsForLevel(tables, area.id)[0] ?? null
}

/** One way out of an area. */
export interface TravelOption {
  via: 'door' | 'waypoint'
  /**
   * For a warp-tile door, the tile to stand on. `null` when the link has no
   * tile: a `vis-object` link's door is an object the tables do not name, and a
   * waypoint is used where the level places one.
   */
  tile: { x: number; y: number } | null
  destination: AreaRef
  rule: LinkRule | null
  warpType: WarpTypeRow | null
  /** Whether {@link loadArea} can assemble the destination from this export. */
  loadable: boolean
  availability: AreaAvailability
  evidence: string
}

/**
 * Every way out of the area the player is in.
 *
 * Warp-tile doors come first, because they are what a `.ds1` puts on the map;
 * then the slots whose door is an object in the level, which have no tile to
 * stand on; then the waypoint network. Every option carries whether the
 * destination can be assembled, so a caller can offer the ones that work without
 * hiding the ones that do not.
 *
 * A waypoint reach that lands back on the area itself is left out: the table
 * lists the act's whole waypoint set, and a menu does not offer the place the
 * player already is.
 */
export function travelOptions(
  level: Level | null,
  area: AreaRef,
  context: TravelContext,
): TravelOption[] {
  const out: TravelOption[] = []
  const hasWarpTiles = level ? warpTilesOf(level).length > 0 : context.hasWarpTiles
  // A generated destination is enterable when the generator can plan it. That is
  // a question about the tables, so it is answered here rather than at load time:
  // a caller offering a door needs it before it assembles anything.
  const loadable = (destination: AreaRef, availability: AreaAvailability): boolean =>
    availability === 'preset' || planAreaFor(destination, context.tables)?.ok === true
  const links = linksOf(area, { ...context, hasWarpTiles })
  const sites = level ? exitSites(level, links) : []
  for (const site of sites) {
    if (!site.destination) continue
    const availability = availabilityOf(site.destination, context.tables)
    out.push({
      via: 'door',
      tile: { x: site.x, y: site.y },
      destination: site.destination,
      rule: site.rule,
      warpType: site.warpType,
      loadable: loadable(site.destination, availability),
      availability,
      evidence: site.evidence,
    })
  }
  for (const link of links) {
    if (link.realisedBy !== 'object') continue
    const availability = availabilityOf(link.destination, context.tables)
    out.push({
      via: 'door',
      tile: null,
      destination: link.destination,
      rule: link.rule,
      warpType: link.warpType,
      loadable: loadable(link.destination, availability),
      availability,
      evidence: link.evidence,
    })
  }
  for (const link of waypointLinksOf(area, context)) {
    if (link.destination.id === area.id) continue
    const availability = availabilityOf(link.destination, context.tables)
    out.push({
      via: 'waypoint',
      tile: null,
      destination: link.destination,
      rule: null,
      warpType: null,
      loadable: loadable(link.destination, availability),
      availability,
      evidence: `Waypoint ${link.index} of act ${area.act + 1} is "${link.destination.devName}" (ActInfo.txt waypoint${link.index + 1})`,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Tile art, cached for the page's lifetime rather than per area
// ---------------------------------------------------------------------------

/** A `.dt1` as the level source hands it over: its bytes and its parsed blocks. */
export interface TilesetBytes {
  bytes: Uint8Array
  file: Dt1File
}

/** Where the art of a loaded level comes from. */
export interface AreaArt {
  /** The picture the level draws at a cell on the ground pass, or `null`. */
  artAt(x: number, y: number): TileArt | null
  /** The picture the level draws at a cell on the WALL pass (above actors). */
  wallArtAt(x: number, y: number): TileArt | null
  /** The picture the level draws at a cell on the ROOF pass (above actors). */
  roofArtAt(x: number, y: number): TileArt | null
  /** Pictures this call built, and how many of them were cache hits. */
  readonly stats: { built: number; reused: number }
}

/**
 * The assembled pictures, shared by every area in the page.
 *
 * A block's picture is a pure function of its bytes, its tileset and the
 * palette, so the key is the pair alone; a swap therefore pays only for the
 * blocks the two areas do not have in common. `null` is cached too — a marker
 * tile like a warp has no picture, and re-assembling it would cost a full
 * sub-tile sweep to learn nothing.
 */
const pictureCache = new Map<string, TileArt | null>()

/** Drop every cached picture. Only a test or a palette change needs this. */
export function clearPictureCache(): void {
  pictureCache.clear()
}

export function pictureCacheSize(): number {
  return pictureCache.size
}

/**
 * Build the `artAt` a `WorldMap` wants for a loaded level.
 *
 * @param level The assembled level.
 * @param tilesets Its tilesets, by table path, with their bytes.
 * @param palette The game's 256-colour palette, without which a picture has no
 *   colours; `null` yields an area of bare terrain rather than an error.
 */
export function createAreaArt(
  level: Level,
  tilesets: ReadonlyMap<string, TilesetBytes>,
  palette: Palette | null,
): AreaArt {
  const stats = { built: 0, reused: 0 }
  const canDraw = typeof document !== 'undefined'
  // A cell's picture is the composition of EVERY layer the `.ds1` resolves for
  // it, not just the first: keeping only the primary block is what left a house
  // with a floor and no walls. The roof is a separate pass because the game
  // draws it above the actors.
  //
  // There is deliberately NO per-cell cache: `bakeGround` asks for each cell
  // exactly once per layer, so a cache never hits, while each entry pins a
  // canvas of its own — 6,400 of them for an 80x80 area. Those canvases are what
  // pushed the page past the browser's canvas budget, after which it hands back
  // EMPTY canvases without an error (measured: 7,000 cell-sized canvases, every
  // sample blank), which is how an area came out with no floor at all.

  // Block pictures are cached by (tileset, block, layer), NOT per cell: a block
  // repeats across hundreds of cells, and a canvas per cell is what blew the
  // canvas budget on a large area — 6,400 cells at two blocks each meant ~12,800
  // live canvases, after which the browser hands back EMPTY canvases with no
  // error and the area bakes with no floor at all.
  const blockCache = new Map<string, { art: TileArt; roofY: number } | null>()
  const blockArt = (tileset: string, blockIndex: number, layer: 'ground' | 'walls' | 'roof'): { art: TileArt; roofY: number } | null => {
    const key = `${tileset}#${blockIndex}#${layer}`
    const cached = blockCache.get(key)
    if (cached !== undefined) {
      if (cached !== null) stats.reused += 1
      return cached
    }
    const built = buildBlockArt(tileset, blockIndex, layer)
    blockCache.set(key, built)
    return built
  }

  const buildBlockArt = (tileset: string, blockIndex: number, layer: 'ground' | 'walls' | 'roof'): { art: TileArt; roofY: number } | null => {
    if (!palette) return null
    const set = tilesets.get(tileset)
    if (!set) return null
    const block = set.file.blocks[blockIndex]
    if (!block) return null
    // Walls are their own pass (drawn over the actors); floors must not include
    // them, or a character could never stand in front of a wall.
    // The ground pass is the base picture and keeps the walls (see the same
    // rule in `main.tsx`); the wall pass re-draws them above the actors.
    const wanted =
      layer === 'walls' ? isWallBlock(block) : layer === 'ground' ? blockLayer(block) !== 'roof' : blockLayer(block) === 'roof'
    if (!wanted) return null
    const bitmap = assembleTile(block, palette, set.bytes, layer === 'roof' ? 'roof' : 'ground')
    if (!bitmap) return null
    stats.built += 1
    return { art: { canvas: bitmapToCanvas(bitmap), frameX: bitmap.frameX, frameY: bitmap.frameY }, roofY: block.roofY }
  }

  const composeCell = (x: number, y: number, layer: 'ground' | 'walls' | 'roof'): TileArt | null => {
    if (!canDraw) return null
    const tile = level.tileAt(x, y)
    let built: TileArt | null = null
    const parts: TileArt[] = []
    for (const ref of tile?.refs ?? []) {
      const part = blockArt(ref.tileset, ref.blockIndex, layer)
      if (part === null) continue
      // The roof pass: the game subtracts roof_y from the tile's screen Y,
      // which is the same as moving the picture up inside its frame.
      parts.push(
        layer === 'roof'
          ? { canvas: part.art.canvas, frameX: part.art.frameX, frameY: part.art.frameY - part.roofY }
          : part.art,
      )
    }
    if (parts.length > 0) {
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const art of parts) {
        minX = Math.min(minX, art.frameX)
        minY = Math.min(minY, art.frameY)
        maxX = Math.max(maxX, art.frameX + art.canvas.width)
        maxY = Math.max(maxY, art.frameY + art.canvas.height)
      }
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, maxX - minX)
      canvas.height = Math.max(1, maxY - minY)
      const ctx = canvas.getContext('2d')
      if (ctx) {
        for (const art of parts) ctx.drawImage(art.canvas, art.frameX - minX, art.frameY - minY)
        built = { canvas, frameX: minX, frameY: minY }
      }
    }
    return built
  }

  return {
    artAt: (x, y) => composeCell(x, y, 'ground'),
    wallArtAt: (x, y) => composeCell(x, y, 'walls'),
    roofArtAt: (x, y) => composeCell(x, y, 'roof'),
    stats,
  }
}

/**
 * The grid `generateWorld` takes, from an assembled level.
 *
 * The ground kind is derived from the same two facts `main.tsx` derives it from:
 * a cell that resolves and is walkable is path, one that resolves and blocks is
 * stone, and a cell with no tiles at all is `null` — a hole, not a floor.
 *
 * @param start Where the hero enters the area. Without it `generateWorld` picks a
 *   random walkable tile, which is fine for a generated map and wrong for a
 *   swap: the player would land anywhere in the new area.
 */
export function areaGrid(
  level: Level,
  art: AreaArt | null,
  start?: { x: number; y: number },
): RealLevelGrid {
  return {
    width: level.width,
    height: level.height,
    kindAt: (x, y) => {
      const tile = level.tileAt(x, y)
      if (!tile || !tile.resolved) return null
      return level.walkable(x, y) ? 'path' : 'stone'
    },
    walkable: (x, y) => level.walkable(x, y),
    // The 5x5 sub-cell flags: a retail wall block denies a strip along one edge
    // of its cell and leaves the centre free, so the per-tile bit alone lets a
    // walker go straight through it.
    flagsAt: (x, y) => level.flagsAt(x, y),
    artAt: art ? (x, y) => art.artAt(x, y) : undefined,
    wallArtAt: art ? (x, y) => art.wallArtAt(x, y) : undefined,
    roofArtAt: art ? (x, y) => art.roofArtAt(x, y) : undefined,
    start,
  }
}

/**
 * Where the hero stands when entering an area.
 *
 * The rule, in order: the destination's own door that leads back where the
 * player came from — that is the door the engine would put them at — shifted by
 * the `ExitWalk` offset of the door they used; failing that the destination's
 * own first door; failing that the offset applied to the level's own start.
 *
 * A position is only accepted when the level says a walker may stand there, so
 * a door whose offset lands inside a wall does not bury the hero: the search
 * walks outward from the intended tile in rings until it finds a walkable one.
 *
 * `start` is what `generateWorld` would otherwise pick at random. Passing the
 * resolved entry as the grid's `start` is what makes the map's own `heroStart`
 * the door the player came through rather than an arbitrary tile.
 */
export function entryTileOf(
  level: Level,
  fallbackStart: { x: number; y: number },
  destination: readonly ExitSite[],
  fromAreaId: number,
  usedWarp: WarpTypeRow | null,
): { x: number; y: number } {
  const back = destination.find((site) => site.destination?.id === fromAreaId) ?? destination[0] ?? null
  const candidates: Array<{ x: number; y: number }> = []
  if (back) {
    if (usedWarp) candidates.push({ x: back.x + usedWarp.exitWalkX, y: back.y + usedWarp.exitWalkY })
    candidates.push({ x: back.x, y: back.y })
  }
  if (usedWarp) {
    candidates.push({ x: fallbackStart.x + usedWarp.exitWalkX, y: fallbackStart.y + usedWarp.exitWalkY })
  }
  candidates.push(fallbackStart)

  for (const candidate of candidates) {
    const found = nearestWalkable(level, Math.round(candidate.x), Math.round(candidate.y))
    if (found) return found
  }
  return fallbackStart
}

/** The walkable tile nearest to (x, y), searched in growing rings, or `null`. */
function nearestWalkable(level: Level, x: number, y: number): { x: number; y: number } | null {
  if (x >= 0 && y >= 0 && x < level.width && y < level.height && level.walkable(x, y)) return { x, y }
  const limit = Math.max(level.width, level.height)
  for (let radius = 1; radius <= limit; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue
        const tx = x + dx
        const ty = y + dy
        if (tx < 0 || ty < 0 || tx >= level.width || ty >= level.height) continue
        if (level.walkable(tx, ty)) return { x: tx, y: ty }
      }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Loading an area
// ---------------------------------------------------------------------------

/** The `.dt1` files a level needs, fetched and parsed once per page. */
const tilesetCache = new Map<string, TilesetBytes | null>()

/** Drop the cached tileset bytes. Tests use this; nothing else needs it. */
export function clearTilesetCache(): void {
  tilesetCache.clear()
}

export interface LoadAreaRequest {
  /** A browsing level source, i.e. `createBrowserLevelSource`'s result. */
  source: LevelSource
  /** The travel context: the areas, the warp types and the act info. */
  context: TravelContext
  area: AreaRef
  seed: number
  /** The runtime terrain art, for the cases where a level has no tile picture. */
  terrain?: TerrainArt
  palette?: Palette | null
  /** The tables `resolvePlacements` needs. */
  places: PlaceTable
  objectTable: ObjectTable
  monsters: MonsterTables | null
  superUniques?: SuperUniqueTable | null
  /** The area the player came from, so the hero can enter at the right door. */
  fromAreaId?: number
  /** The door that was used, whose `ExitWalk` offset places the hero. */
  usedWarp?: WarpTypeRow | null
  /** Prefetched tilesets, to skip the fetch when the caller already has them. */
  tilesets?: ReadonlyMap<string, TilesetBytes>
}

export interface LoadedArea {
  ok: true
  area: AreaRef
  level: Level
  map: WorldMap
  placements: readonly Placement[]
  /** The area's own doors, with where each leads. */
  sites: readonly ExitSite[]
  /** Where the hero stands, in tiles. */
  entry: { x: number; y: number }
  /** What the assembly cost, in milliseconds, for a caller that wants to report it. */
  timing: { assemble: number; tilesets: number; art: number; bake: number }
}

export interface LoadFailure {
  ok: false
  area: AreaRef
  reason: 'no-preset' | 'generated' | 'assembly-failed'
  detail: string
}

export type LoadAreaResult = LoadedArea | LoadFailure

/** Fetch a tileset through the source's async reader, once per page. */
async function readTileset(source: LevelSource, path: string): Promise<TilesetBytes | null> {
  const key = path.toLowerCase()
  const cached = tilesetCache.get(key)
  if (cached !== undefined) return cached
  const withExtension = key.endsWith('.dt1') ? key : `${key}.dt1`
  const reader = (source as LevelSource & { readTilesAsync?: (p: string) => Promise<Uint8Array | null> })
    .readTilesAsync
  let bytes: Uint8Array | null = null
  if (reader) bytes = await reader(withExtension)
  else {
    try {
      bytes = source.readTiles(withExtension)
    } catch {
      bytes = null
    }
  }
  let parsed: TilesetBytes | null = null
  if (bytes && bytes.length > 0) {
    try {
      parsed = { bytes, file: parseDt1(bytes) }
    } catch {
      parsed = null
    }
  }
  tilesetCache.set(key, parsed)
  return parsed
}

/** Fetch a `.ds1` through the source's async reader, or `null`. */
async function readFile(
  source: LevelSource,
  path: string,
): Promise<Uint8Array | null> {
  const reader = (source as LevelSource & { readTilesAsync?: (p: string) => Promise<Uint8Array | null> })
    .readTilesAsync
  if (reader) return reader(path)
  try {
    return source.readTiles(path)
  } catch {
    return null
  }
}

/**
 * Assemble a generated area: plan it, compose its pieces into one `.ds1`, and
 * hand that grid to the same assembler a preset goes through.
 *
 * The pieces and the level type's ground file are fetched first, because
 * composing is synchronous; the tilesets the composed grid references are named
 * by the pieces themselves (each `.ds1` lists the tilesets it was built from) and
 * are fetched in a second round, once composing has said which they are.
 *
 * @returns the assembled level and the tilesets it resolved against, or the
 *   reason this export cannot supply it.
 */
async function loadGeneratedArea(
  request: LoadAreaRequest,
  plan: DrlgPlan,
): Promise<{ ok: true; level: Level; tilesets: Map<string, TilesetBytes> } | LoadFailure> {
  const source = request.source
  const wanted = new Set<string>()
  for (const piece of plan.pieces) wanted.add(piece.file.toLowerCase())
  for (const path of plan.tilesets) wanted.add(path.toLowerCase())
  if (plan.doorSource) wanted.add(plan.doorSource.file.toLowerCase())
  const bytes = new Map<string, Uint8Array | null>()
  for (const path of wanted) bytes.set(path, await readFile(source, path))
  const missing = [...wanted].filter((path) => !bytes.get(path))
  if (missing.length > 0) {
    return {
      ok: false,
      area: request.area,
      reason: 'assembly-failed',
      detail:
        `${missing.length} of the ${wanted.size} files ${request.area.displayName} is generated from are ` +
        `not in this export: ${missing.slice(0, 3).join(', ')}`,
    }
  }
  const composed = composeArea(plan, (path) => bytes.get(path.toLowerCase()) ?? null)
  if (!composed.ok) {
    return { ok: false, area: request.area, reason: 'assembly-failed', detail: composed.detail }
  }

  const tilesets = new Map<string, TilesetBytes>()
  for (const name of composed.tilesets) {
    const set = await readTileset(source, name)
    if (set) tilesets.set(name, set)
  }

  const level = assembleLevelFromDs1(
    composed.ds1,
    {
      presetId: -1,
      presetName: composed.plan.kind === 'maze' ? `maze of ${plan.pieces.length} rooms` : 'outdoors',
      levelId: plan.level.id,
      levelTypeId: plan.level.levelType,
      variantIndex: 0,
      variantFile: '',
      tilesets: composed.tilesets,
    },
    source,
  )
  return { ok: true, level, tilesets }
}

/**
 * Assemble an area: its level, its map, its placements and its doors.
 *
 * Fails with a reason rather than throwing, because "the Blood Moor has no
 * preset" is a fact about the shipped data that a caller shows the player, not a
 * bug. The three reasons a level is refused are `no-preset` (a `DrlgType 2` area
 * with no `LvlPrest` row), `generated` (a generated area whose tables do not
 * describe enough to lay it out — see `drlg.ts`'s refusal reasons) and
 * `assembly-failed` (the pieces or tilesets it needs are not in this export, or a
 * preset's files could not be built).
 *
 * A `DrlgType 1` or `3` area takes the second path: `d2/drlg.ts` plans it from
 * `LvlMaze.txt`/`LvlSub.txt`, composes its pieces into one `.ds1`, and the
 * composed grid is assembled exactly as a preset is. There is no second
 * assembler and no second art path — only a second source of grids.
 *
 * @returns the loaded area, or the reason it could not be loaded.
 */
export async function loadArea(request: LoadAreaRequest): Promise<LoadAreaResult> {
  const { area, context } = request
  const tables = context.tables
  const preset = presetForArea(area, tables)

  const assembleStart = Date.now()
  let level: Level | null = null
  let tilesets = request.tilesets
  if (!preset) {
    const plan = planAreaFor(area, tables, request.seed)
    if (plan === null) {
      return {
        ok: false,
        area,
        reason: 'no-preset',
        detail: `no Levels.txt row has Id ${area.id}`,
      }
    }
    if (!plan.ok) {
      return {
        ok: false,
        area,
        reason: availabilityOf(area, tables) === 'generated' ? 'generated' : 'no-preset',
        detail: plan.detail,
      }
    }
    const generated = await loadGeneratedArea(request, plan)
    if (!generated.ok) return generated
    level = generated.level
    tilesets = tilesets ?? generated.tilesets
  } else {
    level = await loadLevelWithFetch(request.source, preset.id, request.seed)
    if (!level) {
      return {
        ok: false,
        area,
        reason: 'assembly-failed',
        detail: `preset ${preset.id} "${preset.name}" could not be assembled from this export`,
      }
    }
  }
  const assemble = Date.now() - assembleStart

  const tilesetStart = Date.now()
  if (!tilesets) {
    const built = new Map<string, TilesetBytes>()
    for (const name of level.tilesets) {
      const set = await readTileset(request.source, name)
      if (set) built.set(name, set)
    }
    tilesets = built
  }
  const tilesetMs = Date.now() - tilesetStart

  const artStart = Date.now()
  const art = createAreaArt(level, tilesets, request.palette ?? null)
  const artMs = Date.now() - artStart

  const links = linksOf(area, { ...context, hasWarpTiles: warpTilesOf(level).length > 0 })
  const sites = exitSites(level, links)

  // The entry is resolved against the level before the map exists, because the
  // map is baked in one pass and re-baking it to move the hero would cost more
  // than the hero is worth.
  const fallbackStart = { x: Math.floor(level.width / 2), y: Math.floor(level.height / 2) }
  const entry = entryTileOf(level, fallbackStart, sites, request.fromAreaId ?? -1, request.usedWarp ?? null)

  const bakeStart = Date.now()
  const map = generateWorld(request.seed, request.terrain ?? {}, areaGrid(level, art, entry))
  const bake = Date.now() - bakeStart

  const placed = resolvePlacements(
    level.objects,
    monPresetAct(level.ds1.act),
    request.places,
    request.objectTable,
    request.monsters,
    request.superUniques ?? null,
  )
  // A generated area's ambient population comes from `Levels.txt` rather than
  // from `.ds1` records: `MonDen` monsters per 1000 of a 64-tile block, of the
  // classes `mon1..mon25` names. See `drlg.ts`.
  const roster = levelRowOf(area, tables)
  const generated = roster
    ? populateMonsters({ level: roster, assembled: level, seed: request.seed, avoid: entry })
    : []
  const placements = generated.length > 0 ? [...placed, ...generated.map(monsterPlacement)] : placed

  return {
    ok: true,
    area,
    level,
    map,
    placements,
    sites,
    entry,
    timing: { assemble, tilesets: tilesetMs, art: artMs, bake },
  }
}
