/**
 * Assembling a real level from the retail tables and the retail files.
 *
 * Three tables and two file formats meet here:
 *
 * - `LvlPrest.txt` names the presets. Each row has `SizeX`/`SizeY`, up to six
 *   `.ds1` filenames in `File1..File6`, a `Dt1Mask`, and a `LevelId`.
 * - `Levels.txt` maps a level to its `LevelType` and its dimensions.
 * - `LvlTypes.txt` lists the 32 `.dt1` files a level type may draw from.
 * - the `.ds1` files hold the tile grid; the `.dt1` files hold what those tiles
 *   look like and where they block.
 *
 * ## What the tables say about assembling a preset
 *
 * Measured across all 1,093 presets in retail, every preset that names more than
 * one `.ds1` names files of **identical dimensions** — 490 of 490, no
 * exceptions. `File1..File6` are therefore *variants* of one room, not parts of
 * one room: `Act 1 - Cave W` offers `CaveW.ds1` and `CaveW2.ds1`, both 25x25,
 * and the generator draws one. A preset is a room; a level is the generator's
 * arrangement of rooms, and that arrangement lives in the game's program, not in
 * these tables. `loadLevel` therefore assembles *the preset*: it picks a variant
 * from the seed and returns that room's grid. The tables agree with the chosen
 * variant about the room's size — `SizeX`/`SizeY` equal its width and height
 * minus one, in all 1,052 presets that state a size.
 *
 * The town is the case worth stating out loud, because it looks like the
 * counter-example and is not: `Act 1 - Town 1` lists four 57x41 files whose
 * object counts differ by three (41/42/43/44) and whose tile counts are
 * identical (2,337). They are the Rogue Encampment with each of its four exits
 * open — four variants of one town, not four quadrants.
 *
 * ## Where walkability comes from
 *
 * From the `.dt1` sub-tile flags, at sub-tile resolution: five cells per tile in
 * each direction, 25 flag bytes per tile, OR'd together for every layer placed
 * on the cell, exactly as the game's own `COLL_CopyTemplateToGrid` does it. Bit
 * 0 of a flag byte is the blocking bit. Nothing in the retail data names the
 * bits, so the test suite measures this rather than asserting it as lore: in the
 * Rogue Encampment the flagged cells are precisely the solid filler the town is
 * padded with and the river it contains, and the clear cells are the streets.
 *
 * ## Honest limits
 *
 * - A tile whose key no loaded tileset provides falls back to the whole tile
 *   tree, because retail's `LvlTypes` lists are incomplete: `Act 1 - Cave` names
 *   one tileset, yet its presets fill their surrounds with the blank solid tile
 *   that only `Act1/Outdoors/Blank.dt1` defines. What the fallback resolves is
 *   counted in `stats.fallbackResolved`, and a cell that still resolves nowhere
 *   uses the `.ds1`'s own `unwalkable` bit (bit 17 of the cell) and is counted in
 *   `stats.unresolved`.
 * - The six legacy `4/1` tilesets cannot be read at all (see `dt1.ts`). No
 *   `LvlTypes` row names one, so a level never needs them; they are counted and
 *   reported anyway.
 * - The generator's room placement, monster spawning and maze layout are in the
 *   game's program. This module assembles what the shipped data describes.
 */

import { parseDs1, decodeDs1Cell, ds1SubtileToTile, type Ds1File } from '../original/ds1'
import { dt1BlockKey, dt1FlagIndex, dt1KeyOf, parseDt1, type Dt1Block, type Dt1File } from './dt1'

/** One row of `LvlPrest.txt`, with the columns level assembly needs. */
export interface LvlPrestRow {
  /** The table's own label, e.g. `Act 1 - Town 1`. */
  name: string
  /** `Def` — the preset id `loadLevel` takes. */
  id: number
  /** `LevelId`: which level this preset belongs to, or 0 for a generator room. */
  levelId: number
  /** `SizeX`/`SizeY`: the preset's size in tiles. 0 when the level decides. */
  sizeX: number
  sizeY: number
  /** `File1..File6`, the variants, in table order. Empty slots dropped. */
  files: string[]
  /** `Dt1Mask`: a bit per `LvlTypes` file column; bit *i* selects `File i+1`. */
  dt1Mask: number
  /** `AutoMap`, kept because a renderer cares whether a preset is drawn. */
  autoMap: boolean
}

/** One row of `LvlTypes.txt`. */
export interface LvlTypeRow {
  id: number
  name: string
  /**
   * The 32 `File N` columns, in order, with empty columns kept as `''`.
   *
   * The slots are kept because `Dt1Mask` addresses them by position: bit 0 means
   * `File 1`. Retail's town type leaves `File 7` empty and its preset mask clears
   * bit 6, and a compacted array would silently renumber everything after the
   * hole.
   */
  files: string[]
  act: number
}

/**
 * One row of `Levels.txt`, with the columns level assembly and travel need.
 *
 * `name` is the file's own `Name` — the *developer* name the tables join on
 * (`Act 1 - Wilderness 1`) — while `levelName` is the `LevelName` string key the
 * character sees (`Blood Moor`). The two are not interchangeable: `Act 2 - Town`
 * is `Lut Gholein`, and three act-1 rows share no word with their display name.
 *
 * The travel columns are carried here rather than re-parsed by `travel.ts`
 * because they are the same row: `vis`/`warp` are the eight column *pairs* that
 * link an area to its neighbours, `waypoint` is the area's index within its
 * act's waypoint list (255 for none), and `drlgType`, `monsterLevel` and
 * `monsterDensity` are what decides whether an area can be assembled and
 * whether it is populated.
 */
export interface LevelRow {
  id: number
  name: string
  /** Index into `LvlTypes.txt`. */
  levelType: number
  act: number
  /** `LevelName`: the string key of the area's displayed name. */
  levelName: string
  /** `LevelGroup`: the area's group, e.g. `Act 1 - Blood Moor`. */
  levelGroup: string
  /**
   * `DrlgType` — 1 maze, 2 preset, 3 outdoor.
   *
   * 2 means the level *is* a preset and `LvlPrest` names it; 1 and 3 are built
   * by the generator from a room or border set, which is why most areas have no
   * preset of their own.
   */
  drlgType: number
  /** `SizeX`/`SizeY` in tiles. 0 when the preset decides. */
  sizeX: number
  sizeY: number
  /**
   * `SizeX(N)`/`SizeY(N)` and `SizeX(H)`/`SizeY(H)`: the same size per difficulty.
   *
   * This table spells its difficulty columns with a suffix — `SizeX(N)`,
   * `MonLvl(H)` — the way `difficulty.ts`'s `difficultySuffix` spells them. The
   * generator lays an area out at the **normal** size; the two extras are carried
   * so a caller can report whether they differ rather than assume they do not.
   */
  sizeXNightmare: number
  sizeYNightmare: number
  sizeXHell: number
  sizeYHell: number
  /** `OffsetX`/`OffsetY`: where the area sits in its act's own coordinate space. */
  offsetX: number
  offsetY: number
  /** `MonLvl`: the level the area's monsters scale to. */
  monsterLevel: number
  /** `MonDen`: monsters per 1000 tiles. 0 means the area is unpopulated — a town. */
  monsterDensity: number
  /**
   * `SubType`, `SubTheme`, `SubWaypoint`, `SubShrine`: how `LvlSub.txt` is indexed.
   *
   * `SubType` is the `Type` of the scenery rows this area draws from, `SubTheme`
   * is the 0-based column of their `Prob`/`Trials`/`Max` trios, and
   * `SubWaypoint`/`SubShrine` are the `Type` of the waypoint and shrine rows.
   * -1 in any of them means the area draws from none. Checkable against the
   * table rather than taken on trust: the two waypoint rows are `Type 4` and all
   * six act 1 wilderness areas ask for `SubWaypoint 4`; the four shrine rows are
   * `Type 5` and they ask for `SubShrine 5`.
   */
  subType: number
  subTheme: number
  subWaypoint: number
  subShrine: number
  /**
   * `NumMon`: how many of the `mon1..mon25` classes the area spawns.
   *
   * 0 in the five towns, which says the same thing `monsterDensity` 0 does: no
   * ambient population.
   */
  numMon: number
  /** `mon1..mon25`: the monster classes the area spawns, empty slots dropped. */
  monsterClasses: readonly string[]
  /**
   * `Themes`: the per-mille chance that a maze room uses a `Theme` variant.
   *
   * 8 for the crypts, jail and barracks and 60 for the catacombs in the shipped
   * table. Nothing in the data says what the column counts; the generator reads
   * it as that chance, which is the only reading of it that changes a room and
   * not a parameter, and the reading is stated where it is used.
   */
  themes: number
  /** `Waypoint`: the area's index in its act's waypoint list, or 255. */
  waypoint: number
  /** `Portal`: 1 for the areas the game allows a quest/town portal to open in. */
  portal: boolean
  /**
   * `Vis0..Vis7`: the level id each of the eight exit slots leads to, or 0.
   *
   * Paired by *slot* with {@link warp}, not by value: slot 3's `vis` is reached
   * through `LvlWarp` row `warp[3]`. Most areas leave the unused slots at 0.
   */
  vis: readonly number[]
  /**
   * `Warp0..Warp7`: the `LvlWarp.txt` row that shapes the slot's door, or -1.
   *
   * A slot is a link only when both halves are set — `vis > 0 && warp >= 0` —
   * which is how the tables mark "no door in this slot".
   */
  warp: readonly number[]
}

/** The three tables, already parsed and normalised. */
export interface LevelTables {
  presets: readonly LvlPrestRow[]
  levelTypes: readonly LvlTypeRow[]
  levels: readonly LevelRow[]
  /**
   * `LvlMaze.txt` and `LvlSub.txt`, as their own rows, when the source carries them.
   *
   * They are kept **raw** rather than parsed here because only the generator reads
   * them and only the generator should have to know their columns; `d2/drlg.ts`
   * parses them. A source that does not ship them leaves this undefined, and the
   * generator then refuses a `DrlgType 1`/`3` area with a reason that names the
   * missing table rather than guessing at its parameters.
   */
  drlg?: {
    maze: readonly Readonly<Record<string, unknown>>[]
    subs: readonly Readonly<Record<string, unknown>>[]
  }
}

/**
 * Where the bytes come from.
 *
 * Synchronous on purpose: assembling a level is a pure function of the files,
 * so tests and tools read from a directory while a browser build fills the same
 * shape from preloaded buffers. A `fetch`-backed source belongs in the wiring
 * step, not here.
 */
export interface LevelSource {
  tables(): LevelTables
  /** Read a `.ds1` or `.dt1` by its table-relative path, e.g. `Act1/Town/TownN1.ds1`. */
  readTiles(relativePath: string): Uint8Array
  /**
   * Every `.dt1` in the tile tree, table-relative.
   *
   * Optional, and only consulted when a cell's key is in none of the level
   * type's tilesets. A source that cannot enumerate the tree simply leaves those
   * cells unresolved.
   */
  listTiles?(): string[]
}

/** Where a tile came from, and how it blocks. */
export interface LevelTile {
  /** The `.ds1` cell's key: the three numbers a `.dt1` answers to. */
  orientation: number
  mainIndex: number
  subIndex: number
  /** The layer this reference was read from. */
  layer: 'floor' | 'wall' | 'shadow' | 'tag'
  /** The tileset that answered, or `null` when nothing did. */
  tileset: string | null
  /** The block's index within its tileset, or `null`. */
  blockIndex: number | null
  /**
   * How many blocks in the loaded tilesets offer this key. Retail picks among
   * them by `rarity`; a reproducible level takes the first.
   */
  variants: number
  /** `true` when a tileset supplied a block for this key. */
  resolved: boolean
  /**
   * `true` when the block came from the whole-tile-tree fallback rather than
   * from a tileset the level type itself names.
   */
  fallback: boolean
  /**
   * The 25 sub-tile flags of this tile alone, or `null` when unresolved. The
   * cell-level grid ORs every layer's contribution; this is one layer's.
   */
  flags: Uint8Array | null
  /**
   * Every resolved reference of this cell — all the DS1 layers: the floors,
   * the walls, and the roof blocks the wall layer carries at orientation 15 —
   * in draw order (floors under walls). The cell's PICTURE is the composition
   * of these; the fields above are the single primary layer, which is the one
   * the walkability rules read. Art that is not in here was discarded after
   * its flags were OR-ed in, and a house came out as a floor with no walls.
   */
  refs: readonly LevelLayerRef[]
}

/** One resolved DS1 layer reference of a cell, for the art pass. */
export interface LevelLayerRef {
  layer: 'floor' | 'wall' | 'shadow' | 'tag'
  orientation: number
  tileset: string
  blockIndex: number
}

/** A monster, an object or an item, in both coordinate systems. */
export interface LevelObject {
  /** 1 = monster/NPC, 2 = object, 4 = item. */
  type: number
  id: number
  /** Sub-tile position, as stored (x * 5 + sub-cell). */
  x: number
  y: number
  /** The tile the object stands on. */
  tileX: number
  tileY: number
  flags: number
}

/** Counts a caller can report without walking the grid again. */
export interface LevelStats {
  /** Cells in the assembled grid. */
  cells: number
  /** Cells carrying at least one tile. */
  occupied: number
  /** Tile references read from the `.ds1`. */
  tileRefs: number
  /** References a tileset resolved. */
  resolved: number
  /** References nothing could resolve. */
  unresolved: number
  /** Tiles whose centre sub-cell is free. */
  walkableTiles: number
  /** Sub-tiles that are free to stand on. */
  walkableSubtiles: number
  /** Sub-tiles that block. */
  blockedSubtiles: number
  /** Sub-tiles of unresolved tiles, which the fallback decided. */
  fallbackSubtiles: number
  /** Distinct tilesets loaded for this level. */
  tilesetsLoaded: number
  /** Tilesets named by the level type that could not be read. */
  tilesetsUnreadable: string[]
  /** References that only the whole-tile-tree fallback could resolve. */
  fallbackResolved: number
  /** Tilesets the fallback had to reach for, in load order. */
  fallbackTilesets: string[]
  /** Lowest and highest `mainIndex` seen, or -1 when the grid is empty. */
  mainIndexRange: [number, number]
}

/** A level, assembled. */
export interface Level {
  /** `Def` of the preset. */
  presetId: number
  presetName: string
  /** The level the preset belongs to, or 0 for a generator room. */
  levelId: number
  /** The level type whose tilesets were loaded. */
  levelTypeId: number
  /** Which of the preset's variants the seed chose. */
  variantIndex: number
  /** The variant's table path. */
  variantFile: string
  /** The `.ds1` header, for callers that want layers, groups or NPC paths. */
  ds1: Ds1File
  width: number
  height: number
  /** The tilesets the level type selected, in table order. */
  tilesets: string[]
  objects: LevelObject[]
  stats: LevelStats
  /** The tile reference at a cell, or `null` for an empty cell. */
  tileAt(x: number, y: number): LevelTile | null
  /**
   * The cell's 25 collision bytes, every layer OR'd in, or `null` for a cell
   * with no tiles. Sub-tile index is `xGrid + (4 - yGrid) * 5`.
   */
  flagsAt(x: number, y: number): Uint8Array | null
  /**
   * Is a walker standing at the tile's centre sub-cell unimpeded? A wall tile
   * flags the line it stands on, not its whole cell, so the centre is the honest
   * tile-level question — `walkableSubtile` is the real grid.
   */
  walkable(x: number, y: number): boolean
  /** The precise answer, at the resolution the game itself uses. */
  walkableSubtile(x: number, y: number): boolean
}

/** Extra inputs a preset's own row cannot supply. */
export interface LoadLevelOptions {
  /**
   * The level type to take tilesets from. Needed only for generator rooms,
   * whose `LevelId` is 0 because the level they belong to is not decided until
   * the generator runs; a preset that names a level supplies its own.
   */
  levelTypeId?: number
  /** Override the variant the seed picks, for tools that want a specific one. */
  variantIndex?: number
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

function asNumber(value: unknown): number {
  const text = asString(value)
  return text === '' ? 0 : Number(text)
}

/**
 * A column whose "unset" value is -1 rather than 0.
 *
 * `SubType`, `SubTheme`, `SubWaypoint` and `SubShrine` are indexed columns: 0 is
 * a real row of `LvlSub.txt` (`Border - Cliffs` is `Type 0`), so the empty
 * spelling has to become -1 here, where the column's absence is still visible.
 * Read as 0 they would silently apply the cliffs to every area that sets none.
 */
function asColumn(value: unknown): number {
  const text = asString(value)
  return text === '' || text === '-1' ? -1 : Number(text)
}

/** `mon1..mon25`, empty slots dropped, in table order. */
function monsterClassesOf(row: Readonly<Record<string, unknown>>): string[] {
  const out: string[] = []
  for (let i = 1; i <= 25; i++) {
    const name = asString(row[`mon${i}`])
    if (name) out.push(name)
  }
  return out
}

/**
 * Normalises the three tables' raw JSON rows.
 *
 * The tables ship as JSON with the game's own column names, including the spaces
 * in `LvlTypes`' `File 1`. Rows whose name is empty are the table's trailing
 * blank lines and are dropped, as are the three presets that name no `.ds1` file
 * at all — a preset with no room is not one `loadLevel` can assemble. The id of a
 * preset is its `Def`, not its row index, because that is what a caller and the
 * game both use.
 */
export function levelTablesFromJson(raw: {
  lvlprest: readonly Record<string, unknown>[]
  lvltypes: readonly Record<string, unknown>[]
  levels: readonly Record<string, unknown>[]
  lvlmaze?: readonly Record<string, unknown>[]
  lvlsub?: readonly Record<string, unknown>[]
}): LevelTables {
  const presets: LvlPrestRow[] = []
  for (const row of raw.lvlprest) {
    const name = asString(row.Name)
    if (!name || name === 'None') continue
    const files: string[] = []
    for (let i = 1; i <= 6; i++) {
      const file = asString(row[`File${i}`])
      // A zero means "no file in this column": the town's first row has
      // `Files = 0` with four files listed, so the count column is not the
      // number of files and the empty columns are what actually delimit them.
      if (file && file !== '0') files.push(file)
    }
    if (!files.length) continue
    presets.push({
      name,
      id: asNumber(row.Def),
      levelId: asNumber(row.LevelId),
      sizeX: asNumber(row.SizeX),
      sizeY: asNumber(row.SizeY),
      files,
      dt1Mask: asNumber(row.Dt1Mask),
      autoMap: asNumber(row.AutoMap) !== 0,
    })
  }

  const levelTypes: LvlTypeRow[] = []
  for (const row of raw.lvltypes) {
    const name = asString(row.Name)
    if (!name || name === 'None') continue
    const files: string[] = []
    for (let i = 1; i <= 32; i++) {
      const file = asString(row[`File ${i}`])
      files.push(file === '0' ? '' : file)
    }
    levelTypes.push({ id: asNumber(row.Id), name, files, act: asNumber(row.Act) })
  }

  const levels: LevelRow[] = []
  for (const row of raw.levels) {
    const name = asString(row.Name)
    if (!name || name === 'Null') continue
    const vis: number[] = []
    const warp: number[] = []
    for (let i = 0; i < 8; i++) {
      vis.push(asNumber(row[`Vis${i}`]))
      // An unset `Warp n` column is empty in the export rather than -1, and
      // `asNumber` would read it as 0 — which is a *valid* `LvlWarp` row. So the
      // -1 default is applied here, where the column's absence is still visible.
      warp.push(row[`Warp${i}`] === null || row[`Warp${i}`] === undefined || row[`Warp${i}`] === '' ? -1 : asNumber(row[`Warp${i}`]))
    }
    levels.push({
      id: asNumber(row.Id),
      name,
      levelType: asNumber(row.LevelType),
      act: asNumber(row.Act),
      levelName: asString(row.LevelName),
      levelGroup: asString(row.LevelGroup),
      drlgType: asNumber(row.DrlgType),
      sizeX: asNumber(row.SizeX),
      sizeY: asNumber(row.SizeY),
      sizeXNightmare: asNumber(row['SizeX(N)']),
      sizeYNightmare: asNumber(row['SizeY(N)']),
      sizeXHell: asNumber(row['SizeX(H)']),
      sizeYHell: asNumber(row['SizeY(H)']),
      offsetX: asNumber(row.OffsetX),
      offsetY: asNumber(row.OffsetY),
      monsterLevel: asNumber(row.MonLvl),
      monsterDensity: asNumber(row.MonDen),
      subType: asColumn(row.SubType),
      subTheme: asColumn(row.SubTheme),
      subWaypoint: asColumn(row.SubWaypoint),
      subShrine: asColumn(row.SubShrine),
      numMon: asNumber(row.NumMon),
      monsterClasses: monsterClassesOf(row),
      themes: asNumber(row.Themes),
      waypoint: row.Waypoint === null || row.Waypoint === undefined || row.Waypoint === '' ? 255 : asNumber(row.Waypoint),
      portal: asNumber(row.Portal) !== 0,
      vis,
      warp,
    })
  }
  const out: LevelTables = { presets, levelTypes, levels }
  if (raw.lvlmaze?.length || raw.lvlsub?.length) {
    out.drlg = { maze: raw.lvlmaze ?? [], subs: raw.lvlsub ?? [] }
  }
  return out
}

/** Look a preset up by its table label, case-insensitively. */
export function findPreset(tables: LevelTables, name: string): LvlPrestRow | null {
  const wanted = name.trim().toLowerCase()
  return tables.presets.find((preset) => preset.name.toLowerCase() === wanted) ?? null
}

/** Every preset that names a level — i.e. the ones a level enters through. */
export function presetsForLevel(tables: LevelTables, levelId: number): LvlPrestRow[] {
  return tables.presets.filter((preset) => preset.levelId === levelId)
}

/**
 * The tilesets a preset loads.
 *
 * `Dt1Mask` is a bit per `LvlTypes` file column, so bit 0 selects `File 1`.
 * Empty columns are skipped by number, not by position: the town's level type
 * has a hole at `File 7`, and the mask's clear bit 6 is exactly that hole.
 */
export function tilesetsForPreset(
  tables: LevelTables,
  preset: LvlPrestRow,
  levelTypeId?: number
): string[] {
  const resolvedType = levelTypeId ?? tables.levels.find((l) => l.id === preset.levelId)?.levelType
  const type = tables.levelTypes.find((t) => t.id === resolvedType)
  if (!type) return []
  const out: string[] = []
  for (let bit = 0; bit < 32; bit++) {
    if (((preset.dt1Mask >>> bit) & 1) === 0) continue
    const file = type.files[bit]
    if (file) out.push(file)
  }
  return out
}

/**
 * Which variant a room ends up built from.
 *
 * Retail draws a variant per room from its own generator RNG, and the tables
 * carry no weights for that draw, so the choice is not recoverable from data.
 * Mixing the game seed with the preset id keeps it reproducible: one seed plus
 * one room always gives the same room, and a different seed usually gives a
 * different one.
 */
export function variantIndexFor(presetId: number, seed: number, count: number): number {
  if (count <= 1) return 0
  let hash = (seed | 0) ^ Math.imul(presetId | 0, 0x9e3779b1)
  hash = Math.imul(hash ^ (hash >>> 15), 0x85ebca6b)
  hash = (hash ^ (hash >>> 13)) >>> 0
  return hash % count
}

/** Parsed `.dt1` files, keyed by source and path — a tileset is read once per source. */
const dt1Cache = new WeakMap<LevelSource, Map<string, Dt1File | null>>()

interface CatalogueEntry {
  block: Dt1Block
  tileset: string
  /** How many blocks in the loaded tilesets share this key. */
  variants: number
}

function loadDt1(source: LevelSource, path: string): Dt1File | null {
  let cache = dt1Cache.get(source)
  if (!cache) {
    cache = new Map()
    dt1Cache.set(source, cache)
  }
  const key = path.toLowerCase()
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  let parsed: Dt1File | null = null
  try {
    parsed = parseDt1(source.readTiles(path))
  } catch {
    // A tileset that cannot be read is reported through `tilesetsUnreadable`
    // rather than thrown: one unreadable file must not cost a whole level.
    parsed = null
  }
  cache.set(key, parsed)
  return parsed
}

/**
 * Builds a flat catalogue of every block the level's tilesets offer, keyed by
 * the `(orientation, mainIndex, subIndex)` triple a `.ds1` cell carries.
 *
 * The first block wins, and the count of alternatives is kept, because retail
 * randomises among equal-key blocks by `rarity` at draw time while a level that
 * must be reproducible cannot.
 */
function buildCatalogue(
  source: LevelSource,
  tilesets: string[]
): { byKey: Map<number, CatalogueEntry>; loaded: number; unreadable: string[] } {
  const byKey = new Map<number, CatalogueEntry>()
  const unreadable: string[] = []
  let loaded = 0
  for (const path of tilesets) {
    const dt1 = loadDt1(source, path)
    if (!dt1) {
      unreadable.push(path)
      continue
    }
    if (dt1.layout !== 'v7') {
      // The legacy 4/1 layout's record fields are undocumented, so those
      // blocks cannot join the catalogue. No level type names such a file.
      unreadable.push(path)
      continue
    }
    loaded++
    for (const block of dt1.blocks) {
      const key = dt1KeyOf(block)
      const existing = byKey.get(key)
      if (existing) existing.variants++
      else byKey.set(key, { block, tileset: path, variants: 1 })
    }
  }
  return { byKey, loaded, unreadable }
}

function findLevelTypeId(tables: LevelTables, preset: LvlPrestRow, override?: number): number {
  if (override !== undefined) return override
  if (preset.levelId === 0) return -1
  return tables.levels.find((l) => l.id === preset.levelId)?.levelType ?? -1
}

/**
 * Assembles one preset.
 *
 * @param presetId The preset's `Def`.
 * @param seed The game seed. It selects the room variant, since that is the one
 *   choice this data can express; everything else about the room is fixed.
 * @param source Where the tables and files come from. Omit it after calling
 *   {@link configureLevels}.
 * @param options A level type for a generator room, or a forced variant.
 * @returns The room's grid, its objects, and the tilesets it resolved against.
 * @throws {Error} If no source is configured, the preset is unknown, or its
 *   `.ds1` cannot be parsed.
 */
export function loadLevel(
  presetId: number,
  seed: number,
  source?: LevelSource,
  options: LoadLevelOptions = {}
): Level {
  const resolvedSource = source ?? defaultSource
  if (!resolvedSource) {
    throw new Error(
      'loadLevel: no level source configured. Pass one, or call configureLevels(source) first.'
    )
  }
  const tables = resolvedSource.tables()
  const preset = tables.presets.find((p) => p.id === presetId)
  if (!preset) throw new Error(`loadLevel: no preset with Def ${presetId}`)
  if (!preset.files.length) throw new Error(`loadLevel: preset ${presetId} names no .ds1 file`)

  const variantIndex =
    options.variantIndex ?? variantIndexFor(presetId, seed, preset.files.length)
  if (variantIndex < 0 || variantIndex >= preset.files.length) {
    throw new Error(
      `loadLevel: preset ${presetId} has ${preset.files.length} variants, index ${variantIndex} is out of range`
    )
  }
  const variantFile = preset.files[variantIndex]
  const levelTypeId = findLevelTypeId(tables, preset, options.levelTypeId)
  return assembleLevelFromDs1(
    parseDs1(resolvedSource.readTiles(variantFile)),
    {
      presetId,
      presetName: preset.name,
      levelId: preset.levelId,
      levelTypeId,
      variantIndex,
      variantFile,
      tilesets: levelTypeId < 0 ? [] : tilesetsForPreset(tables, preset, levelTypeId),
    },
    resolvedSource,
  )
}

/** What a `.ds1` needs to know about itself before it can become a {@link Level}. */
export interface Ds1LevelMeta {
  /** The preset's `Def`, or -1 for a grid no preset named (a generated area). */
  presetId: number
  /** The preset's table label, or a generated area's own description. */
  presetName: string
  /** The level the grid belongs to, or 0 when the generator decided it. */
  levelId: number
  /** The level type whose tilesets the grid's keys resolve against. */
  levelTypeId: number
  /** Which variant the seed chose, and its table path. */
  variantIndex: number
  variantFile: string
  /**
   * The tilesets to resolve against, in table order.
   *
   * Not derived from `preset.dt1Mask` here, because a generated area has no
   * preset: its caller has already worked out the union of the level type's
   * files and the tilesets its own pieces name.
   */
  tilesets: readonly string[]
}

/**
 * Turns any `.ds1` grid into an assembled {@link Level}.
 *
 * This is `loadLevel`'s second half, split out so the generator in `d2/drlg.ts`
 * can hand over a grid it composed itself and get exactly the same treatment a
 * preset gets: the same key resolution, the same tileset fallback, the same
 * 25-sub-tile collision grid and the same object list. Nothing about the rules
 * changes with the caller — only the grid's provenance.
 */
export function assembleLevelFromDs1(
  ds1: Ds1File,
  meta: Ds1LevelMeta,
  source: LevelSource,
): Level {
  const resolvedSource = source
  const { presetId, presetName, levelId, levelTypeId, variantIndex, variantFile } = meta
  const tilesets = [...meta.tilesets]
  const { byKey, loaded, unreadable } = buildCatalogue(resolvedSource, tilesets)

  const cells = ds1.width * ds1.height
  const perCell: (LevelTile | null)[] = new Array(cells).fill(null)
  const flags: (Uint8Array | null)[] = new Array(cells).fill(null)
  const fallbackBlocked = new Uint8Array(cells)

  interface CellRef {
    layer: LevelTile['layer']
    raw: number
    orientation: number
    key: number
  }

  // Pass 1: read every layer's reference for every cell. Resolution needs two
  // passes because a key the level type's tilesets do not provide is looked up
  // again in the whole tile tree, and that catalogue is only worth building when
  // something actually needs it.
  const refs: Array<CellRef[] | null> = new Array(cells).fill(null)
  const unresolvableKeys = new Set<number>()
  let tileRefs = 0
  let occupied = 0

  for (let y = 0; y < ds1.height; y++) {
    for (let x = 0; x < ds1.width; x++) {
      const i = y * ds1.width + x
      const layers: CellRef[] = []
      for (const floor of ds1.floors) {
        const raw = floor.cells[i]
        if ((raw & 0xff) === 0) continue
        const decoded = decodeDs1Cell(raw, 0)
        layers.push({
          layer: 'floor',
          raw,
          orientation: 0,
          key: dt1BlockKey(0, decoded.mainIndex, decoded.subIndex),
        })
      }
      for (const wall of ds1.walls) {
        const raw = wall.cells[i]
        if ((raw & 0xff) === 0) continue
        const decoded = decodeDs1Cell(raw, wall.orientations[i])
        layers.push({
          layer: 'wall',
          raw,
          orientation: wall.orientations[i],
          key: dt1BlockKey(decoded.orientation, decoded.mainIndex, decoded.subIndex),
        })
      }
      if (ds1.shadow && (ds1.shadow.cells[i] & 0xff) !== 0) {
        const decoded = decodeDs1Cell(ds1.shadow.cells[i], 13)
        layers.push({
          layer: 'shadow',
          raw: ds1.shadow.cells[i],
          orientation: 13,
          key: dt1BlockKey(13, decoded.mainIndex, decoded.subIndex),
        })
      }
      // The tag layer is deliberately not read as tiles: its cells are group
      // markers, not references into a tileset.
      if (!layers.length) continue
      refs[i] = layers
      tileRefs += layers.length
      occupied++
      for (const ref of layers) if (!byKey.has(ref.key)) unresolvableKeys.add(ref.key)
    }
  }

  /**
   * The catalogue a key needs when the level type's tilesets cannot supply it.
   *
   * `Act 1 - Cave`'s type names one tileset, `Act1/Caves/Cave.dt1`, yet its
   * presets fill their surrounds with orientation-0/main-30 — the blank solid
   * tile, which only `Act1/Outdoors/Blank.dt1` defines. Without it, 373 of one
   * 25x25 room's cells would have no footprint and the room would have no
   * boundary: the blanks are exactly the cells that must block. Building the
   * fallback reads the whole tile tree once per source, so it happens only when
   * a key really is missing, and every hit is counted in `stats`.
   *
   * The town reaches for it too, three times: its warp markers (orientation 10)
   * are defined only in `Act1/Barracks/Warp.dt1` and `Expansion/Town/Waypt.dt1`,
   * and the town type names neither. When more than one tileset can answer, the
   * first in tree order wins; `LevelTile.tileset` says which one did.
   */
  let fallbackCatalogue: Map<number, CatalogueEntry> | null = null
  const fallbackTilesets = new Set<string>()
  if (unresolvableKeys.size > 0 && resolvedSource.listTiles) {
    fallbackCatalogue = new Map()
    for (const path of resolvedSource.listTiles()) {
      if (tilesets.includes(path)) continue
      const dt1 = loadDt1(resolvedSource, path)
      if (!dt1 || dt1.layout !== 'v7') continue
      for (const block of dt1.blocks) {
        const key = dt1KeyOf(block)
        if (!unresolvableKeys.has(key) || fallbackCatalogue.has(key)) continue
        fallbackCatalogue.set(key, { block, tileset: path, variants: 1 })
        fallbackTilesets.add(path)
      }
    }
  }

  // Pass 2: OR each cell's resolved footprints together, which is what the
  // game's own collision loader does, and record where each reference landed.
  let resolvedRefs = 0
  let unresolvedRefs = 0
  let fallbackResolved = 0
  let mainLo = 1 << 30
  let mainHi = -1

  for (let y = 0; y < ds1.height; y++) {
    for (let x = 0; x < ds1.width; x++) {
      const i = y * ds1.width + x
      const layers = refs[i]
      if (!layers) continue

      const grid = new Uint8Array(25)
      let anyResolved = false
      let anyUnwalkableBit = false
      let primaryTile: LevelTile | null = null
      // The primary reference is the first floor if there is one — that is the
      // surface a walker stands on — else the first wall.
      const primary =
        layers.find((l) => l.layer === 'floor') ?? layers.find((l) => l.layer === 'wall') ?? layers[0]

      const artRefs: LevelLayerRef[] = []
      for (const entry of layers) {
        const cell = decodeDs1Cell(entry.raw, entry.orientation)
        if (cell.unwalkable) anyUnwalkableBit = true
        const strict = byKey.get(entry.key)
        const hit = strict ?? fallbackCatalogue?.get(entry.key) ?? null
        if (!hit) {
          unresolvedRefs++
          continue
        }
        resolvedRefs++
        if (!strict) fallbackResolved++
        for (let k = 0; k < 25; k++) grid[k] |= hit.block.flags[k]
        anyResolved = true
        artRefs.push({
          layer: entry.layer,
          orientation: cell.orientation,
          tileset: hit.tileset,
          blockIndex: hit.block.index,
        })
        if (entry === primary) {
          primaryTile = {
            orientation: cell.orientation,
            mainIndex: cell.mainIndex,
            subIndex: cell.subIndex,
            layer: entry.layer,
            tileset: hit.tileset,
            blockIndex: hit.block.index,
            variants: hit.variants,
            resolved: true,
            fallback: strict === undefined,
            flags: hit.block.flags.slice(),
            refs: [],
          }
        }
      }
      // Painter order inside a cell: floors under walls/roofs. Storage order
      // within one layer is kept (the game composes in the same order).
      artRefs.sort((a, b) => (a.layer === 'floor' ? 0 : 1) - (b.layer === 'floor' ? 0 : 1))
      if (primaryTile) primaryTile.refs = artRefs

      const primaryCell = decodeDs1Cell(primary.raw, primary.orientation)
      if (!anyResolved) {
        // Nothing answered for this cell, so the grid has no footprint for it.
        // The `.ds1` does carry one fact about it: its own unwalkable bit.
        flags[i] = null
        fallbackBlocked[i] = anyUnwalkableBit ? 1 : 0
        perCell[i] = {
          orientation: primaryCell.orientation,
          mainIndex: primaryCell.mainIndex,
          subIndex: primaryCell.subIndex,
          layer: primary.layer,
          tileset: null,
          blockIndex: null,
          variants: 0,
          resolved: false,
          fallback: false,
          flags: null,
          refs: [],
        }
        continue
      }

      flags[i] = grid
      // When the primary reference was the unresolvable one but another layer
      // resolved, keep the cell's key but say that nothing answered for it.
      perCell[i] = primaryTile ?? {
        orientation: primaryCell.orientation,
        mainIndex: primaryCell.mainIndex,
        subIndex: primaryCell.subIndex,
        layer: primary.layer,
        tileset: null,
        blockIndex: null,
        variants: 0,
        resolved: false,
        fallback: false,
        flags: null,
        // The primary layer did not resolve, but the cell's other layers may
        // have — their art still draws.
        refs: artRefs,
      }
      mainLo = Math.min(mainLo, primaryCell.mainIndex)
      mainHi = Math.max(mainHi, primaryCell.mainIndex)
    }
  }

  // The `.ds1` stores objects in sub-tile space — five cells per tile — which is
  // the same resolution the collision grid uses, so no conversion is guessed.
  const objects: LevelObject[] = ds1.objects.map((o) => ({
    type: o.type,
    id: o.id,
    x: o.x,
    y: o.y,
    tileX: ds1SubtileToTile(o.x),
    tileY: ds1SubtileToTile(o.y),
    flags: o.flags,
  }))

  let walkableTiles = 0
  let walkableSubtiles = 0
  let blockedSubtiles = 0
  let fallbackSubtiles = 0
  for (let y = 0; y < ds1.height; y++) {
    for (let x = 0; x < ds1.width; x++) {
      const i = y * ds1.width + x
      // A cell with no tile at all is not walkable: there is nothing to stand
      // on. Only a cell whose tiles exist but did not resolve reaches the
      // `.ds1` fallback below.
      if (perCell[i] === null) {
        blockedSubtiles += 25
        continue
      }
      const grid = flags[i]
      if (!grid) {
        if (fallbackBlocked[i]) blockedSubtiles += 25
        else {
          walkableSubtiles += 25
          fallbackSubtiles += 25
          walkableTiles++
        }
        continue
      }
      let free = 0
      for (let k = 0; k < 25; k++) if ((grid[k] & 0x01) === 0) free++
      walkableSubtiles += free
      blockedSubtiles += 25 - free
      if ((grid[dt1FlagIndex(2, 2)] & 0x01) === 0) walkableTiles++
    }
  }

  const stats: LevelStats = {
    cells,
    occupied,
    tileRefs,
    resolved: resolvedRefs,
    unresolved: unresolvedRefs,
    walkableTiles,
    walkableSubtiles,
    blockedSubtiles,
    fallbackSubtiles,
    tilesetsLoaded: loaded,
    tilesetsUnreadable: unreadable,
    fallbackResolved,
    fallbackTilesets: [...fallbackTilesets],
    mainIndexRange: mainHi < 0 ? [-1, -1] : [mainLo, mainHi],
  }

  return {
    presetId,
    presetName,
    levelId,
    levelTypeId,
    variantIndex,
    variantFile,
    ds1,
    width: ds1.width,
    height: ds1.height,
    tilesets,
    objects,
    stats,
    tileAt(x: number, y: number): LevelTile | null {
      if (x < 0 || y < 0 || x >= ds1.width || y >= ds1.height) return null
      return perCell[y * ds1.width + x]
    },
    flagsAt(x: number, y: number): Uint8Array | null {
      if (x < 0 || y < 0 || x >= ds1.width || y >= ds1.height) return null
      return flags[y * ds1.width + x]
    },
    walkable(x: number, y: number): boolean {
      if (x < 0 || y < 0 || x >= ds1.width || y >= ds1.height) return false
      const i = y * ds1.width + x
      const grid = flags[i]
      if (!grid) return perCell[i] !== null && fallbackBlocked[i] === 0
      return (grid[dt1FlagIndex(2, 2)] & 0x01) === 0
    },
    walkableSubtile(x: number, y: number): boolean {
      const width = ds1.width * 5
      const height = ds1.height * 5
      if (x < 0 || y < 0 || x >= width || y >= height) return false
      const tx = Math.floor(x / 5)
      const ty = Math.floor(y / 5)
      const i = ty * ds1.width + tx
      const grid = flags[i]
      const local = dt1FlagIndex(x % 5, y % 5)
      if (!grid) return perCell[i] !== null && fallbackBlocked[i] === 0
      return (grid[local] & 0x01) === 0
    },
  }
}

let defaultSource: LevelSource | null = null

/**
 * Registers the source `loadLevel` uses when it is not passed one.
 *
 * The two-argument call in the task's API needs somewhere to read from, and
 * making that somewhere explicit keeps `loadLevel` a pure function otherwise.
 */
export function configureLevels(source: LevelSource | null): void {
  defaultSource = source
}
