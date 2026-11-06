/**
 * The level generator: `DrlgType 1` (a maze of rooms) and `DrlgType 3` (outdoors).
 *
 * A `Levels.txt` row says how an area is laid out through its `DrlgType`. Type 2
 * means the level *is* a preset and `LvlPrest.txt` names the `.ds1`; types 1 and
 * 3 have no `.ds1` at all, and the retail game builds them when the area loads
 * from the level's own row plus two tables this module reads: `LvlMaze.txt` and
 * `LvlSub.txt`. That generator lives in the game's program, so what follows is a
 * generator written to the same tables — and the difference between the two is
 * stated here rather than glossed over.
 *
 * ## What the tables state
 *
 * **`LvlMaze.txt`** (`Level`, `Rooms`, `SizeX`/`SizeY`, `Merge`): the parameters
 * of a maze. `SizeX`x`SizeY` is the size of one *room* — and it is the same
 * number a room's preset carries: `Act 1 - Cave 2` asks for 24x24 rooms and the
 * generator rooms are `Act 1 - Cave W`, 24x24, `.ds1` 25x25. `Rooms` is how many
 * of them the maze holds (12 for `Act 1 - Jail 1`, 12/24/36 for `Act 1 - Crypt
 * 1 A` across the three difficulties). The room *set* is in `LvlPrest.txt`
 * itself: the `LevelId 0` rows whose name begins with the maze row's name, whose
 * last word is a set of the letters `N`/`E`/`S`/`W`. That word is the room's
 * **door pattern** — `Act 1 - Cave NSEW` is a cave room with four openings,
 * `Act 1 - Cave W` one — and each family also ships `Theme` variants of the same
 * patterns, `Prev`/`Next` rooms with the stairs to the neighbouring level, and
 * `Waypoint`, `Cath`, `Pitspawn`, `Chest`, `Portal`, `Bonebreak`, `Coldcrow` and
 * `Den Of Evil` rooms. Fifteen patterns exist for every act 1 family (all
 * non-empty subsets of four directions), which is what makes a maze buildable
 * from the data at all.
 *
 * **`Levels.txt`'s `Sub*` columns** index `LvlSub.txt` for an outdoor area:
 * `SubType` selects the scenery rows, `SubTheme` selects the *column* of their
 * `Prob`/`Trials`/`Max` trios, and `SubWaypoint`/`SubShrine` select the waypoint
 * and shrine rows. That reading is checkable and checks out: the two waypoint
 * rows are `Type 4` and all six act 1 wilderness areas ask for `SubWaypoint 4`;
 * the four shrine rows are `Type 5` and they ask for `SubShrine 5`; the scenery
 * rows are `Type 6`, and the six wilderness areas ask for `Type 6` with
 * `SubTheme` 0..4, which lands Puddles on the Blood Moor, Stone on the Stony
 * Field, Trees on the Dark Wood and the swamps on the Black Marsh — exactly the
 * themes those areas have.
 *
 * **`LvlSub.txt`'s other columns**, as the pieces use them: `File` is the
 * `.ds1` to place, `BordType` names the four *border* rows (0 middle, 1 cliffs
 * and corner, 2 border) which are the only scenery-scale pieces that belong to
 * no `Type` group, `Dt1Mask` is a bit per `LvlTypes` file column naming which of
 * the level type's tilesets the piece draws from (bit 0 is set in 20 of the 24
 * rows that ship a file), and `Prob`, `Trials`, `Max` are the per-theme
 * placement parameters.
 *
 * ## What the tables do not state, and what was chosen here
 *
 * Nothing in these tables says **where** anything goes, and that is not an
 * omission in this export — the retail engine keeps its generator's layout,
 * room graph and placement loop in its own code. Every rule below is therefore
 * this module's invention, constrained by the parameters above, and is written
 * down so a reader can disagree with it:
 *
 * 1. **`Rooms` rooms on a square-ish grid.** `cols = ceil(sqrt(Rooms))`,
 *    `rows = ceil(Rooms / cols)`, filled row-major, so the last row is short.
 * 2. **A spanning tree, then extra links.** Rooms are joined by a randomised
 *    depth-first spanning tree over the grid, which makes every room reachable
 *    from every other *by construction* — the property that matters most, since
 *    a maze the player cannot finish is worse than one that is not the retail
 *    shape. `Merge` then adds the remaining adjacent pairs with probability
 *    `Merge/1000`, its plainest reading: two neighbouring rooms merged into one.
 * 3. **The door pattern picks the piece.** A room's piece is the one whose
 *    pattern is the set of directions it was connected in. The family's `Theme`
 *    variant is used with probability `Levels.txt`'s `Themes` column per 1000 —
 *    another reading, since nothing states what `Themes` counts.
 * 4. **Exits are the `Next` rooms.** Each `Vis`/`Warp` slot of the level takes
 *    one dead-end room (a room with exactly one connection, so the piece's
 *    pattern matches) and replaces its piece with the family's `Next
 *    <direction>` room. That is the only family of pieces that carries an
 *    orientation-10 door tile in the shipped data — measured: `Prev` rooms carry
 *    orientation 11 (stairs) and no door at all, `Waypoint` rooms carry none.
 *    A slot with no dead end left gets a bare door marker instead, copied from
 *    the door tile of the area's own act town.
 * 5. **One door tile per piece.** A piece may carry two orientation-10 tiles
 *    (`Act 1 - Crypt Next W` carries two, a one-by-two staircase). Only the
 *    first is blitted, because `travel.ts` pairs a level's slots with its tiles
 *    *by order* and can only do that when the counts are equal. The dropped
 *    cells are counted in the composition's statistics.
 * 6. **An outdoor area is ground, a border and scenery.** `Levels.txt`'s
 *    `SizeX`x`SizeY` is the map (80x80 for every act 1 wilderness area). Every
 *    cell is first filled with the ground the level type's `File 1` supplies —
 *    bit 0 of every `LvlSub` row's `Dt1Mask` names exactly that file, so the
 *    table itself says which file the ground comes from. The four `BordType`
 *    rows are then anchored at the map's four corners (sorted by `BordType`,
 *    then by table order: middle, cliffs, corner, border at north-west,
 *    north-east, south-west, south-east), because the pieces are larger than the
 *    map and overlapping them is the only thing that covers it. The scenery rows
 *    are stamped at seeded positions, and the waypoint row is stamped only when
 *    `Levels.txt`'s `Waypoint` column gives the area a waypoint index — the
 *    table's own statement that the area has one.
 * 7. **`Prob`/`Trials`/`Max` mean attempts, chances and a cap.** A row is
 *    attempted `Trials` times, each attempt lands with probability `Prob`%, and
 *    no row is placed more than `Max` times. Where a group's `Trials` is
 *    negative (`-1` on every waypoint and shrine row) the row is placed exactly
 *    once, and **one row per group is chosen** rather than one per row: four
 *    shrines all asking to be placed once would put four shrines in one area,
 *    and two waypoint rows would put two waypoints in it, which no area in the
 *    game has. The choice is a choice, and this is where it is stated.
 * 8. **A closed ring bounds the map.** The outermost cell of an outdoor map is
 *    filled with the *solid* orientation-0 block of the ground file (14 of that
 *    file's 144 floor blocks block all 25 of their sub-tiles — measured, and the
 *    same blocks the town pads itself with), and the exits sit one cell inside
 *    it, one per `Vis`/`Warp` slot, spread over the four edges in slot order.
 * 9. **Population.** `Levels.txt`'s `MonDen`, `NumMon` and `mon1..mon25` are
 *    what the generator spawns an area's ambient monsters from, so this one does
 *    too: `MonDen` monsters per 1000 tiles of a 64-tile block, which is the
 *    unit that makes the table's numbers land on the counts the game actually
 *    has (Blood Moor: 520 x 6400 / 64000 = 52), taking the first `NumMon`
 *    classes from `mon1..mon25` in turn, on walkable cells away from where the
 *    player arrives. `MonDen` 0 — every town — places nothing.
 *
 * ## What this module does not do
 *
 * - **It does not reproduce the retail layout.** A given seed gives the same
 *   area twice, and gives the same *kind* of area the tables describe, but not
 *   the retail map's rooms in the retail map's places. Nobody can: the layout is
 *   not in the data.
 * - **It does not place monsters per room.** The retail generator fills rooms
 *   and monster packs drive each other; this one samples the whole area.
 * - **`CheckAll` and `GridSize` are read and not used.** `CheckAll` is 0 in every
 *   row that ships a file and `GridSize` is 1 in all but `Barricade`; no traced
 *   code path says what either selects, so placing by them would be a guess on
 *   top of a guess.
 * - **The five difficulty-graded columns are used at their normal value.**
 *   `MonDen(N)`/`MonDen(H)` and the `SizeX(N)`/`(H)` variants exist and are
 *   carried on the row; a generated area is laid out once, at normal, because
 *   this replica's difficulty is a runtime setting rather than a second map.
 * - **Wall and roof art is not drawn.** `LvlSub`'s cliff pieces and the maze
 *   rooms are built from orientation-1..14 blocks whose pictures are the
 *   `0x1001` wall format, which `tileart.ts` declines; the generator still
 *   places them, and the collision they carry is the same collision the retail
 *   map has. `verify-drlg.ts` counts the cells of a generated area that have no
 *   picture at all rather than pretending every cell is drawn.
 *
 * ## Keeping a plan cheap
 *
 * {@link planArea} is a pure function of the tables and reads no bytes, so a
 * caller that only wants to know whether an area is enterable — the HUD's travel
 * list, `travel.ts`'s `loadable` — pays for arithmetic and nothing else. Reading
 * the pieces, the ground file and the door template happens in
 * {@link composeArea}, and assembling the composed grid into a walkable level is
 * `levels.ts`'s `assembleLevelFromDs1`, which is the same code path a preset
 * takes.
 */

import { decodeDs1Cell, DS1_SUBTILES_PER_TILE, parseDs1, type Ds1File, type Ds1Object } from '@rasenjs/assets'
import { parseDt1, type Dt1File } from './dt1'
import type { Level, LevelRow, LevelTables, LvlTypeRow } from './levels'
import type { Placement, PlaceableRecord } from './places'

/** One row of `LvlMaze.txt`. */
export interface LvlMazeRow {
  name: string
  /** `Level`: the level id this row describes. */
  level: number
  /** `Rooms`: how many rooms the maze holds. */
  rooms: number
  /** `SizeX`/`SizeY`: the size of one room, in tiles. */
  sizeX: number
  sizeY: number
  /** `Merge`: per-mille chance that two neighbouring rooms are merged. */
  merge: number
}

/** One row of `LvlSub.txt`. */
export interface LvlSubRow {
  name: string
  /** `Type`: the substitution group, or -1 when the column is empty. */
  type: number
  /** `File`: the `.ds1` this row places. */
  file: string
  /** `BordType`: 0 middle, 1 cliffs/corner, 2 border; -1 for a scenery row. */
  bordType: number
  /** `GridSize`: how many grid cells the piece covers. 1 in all but `Barricade`. */
  gridSize: number
  /** `Dt1Mask`: a bit per `LvlTypes` file column. */
  dt1Mask: number
  /** `Prob0..Prob4`: the chance, per theme, that a placement attempt lands. */
  prob: readonly number[]
  /** `Trials0..Trials4`, or -1 for a row that is placed exactly once. */
  trials: readonly number[]
  /** `Max0..Max4`: the most instances of this row a level may hold. */
  max: readonly number[]
}

function num(value: unknown): number {
  const text = value === null || value === undefined ? '' : String(value)
  return text === '' ? 0 : Number(text)
}

function columns(row: Readonly<Record<string, unknown>>, prefix: string): number[] {
  return [0, 1, 2, 3, 4].map((i) => num(row[`${prefix}${i}`]))
}

/** Normalises `table_lvlmaze.json`. */
export function parseLvlMaze(rows: readonly Readonly<Record<string, unknown>>[]): LvlMazeRow[] {
  const out: LvlMazeRow[] = []
  for (const row of rows) {
    const name = String(row.Name ?? '')
    if (!name || name === 'None') continue
    out.push({
      name,
      level: num(row.Level),
      rooms: num(row.Rooms),
      sizeX: num(row.SizeX),
      sizeY: num(row.SizeY),
      merge: num(row.Merge),
    })
  }
  return out
}

/** Normalises `table_lvlsub.json`. Rows that name no file are dropped. */
export function parseLvlSub(rows: readonly Readonly<Record<string, unknown>>[]): LvlSubRow[] {
  const out: LvlSubRow[] = []
  for (const row of rows) {
    const name = String(row.Name ?? '')
    const file = String(row.File ?? '')
    if (!name || !file || file === '0') continue
    // `Type` 0 is a real group — the cliffs are `Type 0` — so an empty column has
    // to become -1 here, where the absence is still visible.
    const type = row.Type === null || row.Type === undefined || row.Type === '' ? -1 : num(row.Type)
    out.push({
      name,
      type,
      file,
      bordType: row.BordType === null || row.BordType === undefined || row.BordType === '' ? -1 : num(row.BordType),
      gridSize: num(row.GridSize),
      dt1Mask: num(row.Dt1Mask),
      prob: columns(row, 'Prob'),
      trials: columns(row, 'Trials'),
      max: columns(row, 'Max'),
    })
  }
  return out
}

/** The generator's two tables, or `null` when the source did not carry them. */
export function drlgTablesOf(tables: LevelTables): { maze: LvlMazeRow[]; subs: LvlSubRow[] } | null {
  if (!tables.drlg) return null
  return { maze: parseLvlMaze(tables.drlg.maze), subs: parseLvlSub(tables.drlg.subs) }
}

/** Why the generator will not build an area. Each one is a fact about the tables. */
export type DrlgRefusal =
  /** `DrlgType 2`: a `LvlPrest` row decides it, and the generator is not the way in. */
  | 'not-generated'
  /** The source carries no `LvlMaze.txt`/`LvlSub.txt`, so a maze has no parameters. */
  | 'no-drlg-tables'
  /** No `LvlTypes` row describes the area's level type. */
  | 'no-level-type'
  /** A `DrlgType 3` area whose `SizeX`/`SizeY` are 0: no size to generate at. */
  | 'no-size'
  /** No `LvlMaze` row names this level, so its rooms and parameters are unknown. */
  | 'no-maze-row'
  /** No `LevelId 0` `LvlPrest` row with a door pattern is named after this maze. */
  | 'no-room-set'
  /** No `LvlSub` row carries a `BordType`: an outdoor map with no border set. */
  | 'no-border-set'
  /** The act's town has no preset, so there is no door tile to copy. */
  | 'no-door-source'
  /** The pieces the plan named are not in this export. */
  | 'missing-pieces'

/** One `.ds1` the plan places, where it goes, and what it is for. */
export interface DrlgPiece {
  /** `room`, `room-theme`, `exit`, `waypoint`, `border` or `scenery`. */
  role: 'room' | 'room-theme' | 'exit' | 'waypoint' | 'border' | 'scenery'
  /** The table label that chose it, e.g. `Act 1 - Cave NEW` or `Trees`. */
  label: string
  /** The `.ds1`, table-relative. */
  file: string
  /** Where the piece's own cell (0,0) lands on the map. May be negative: clipped. */
  x: number
  y: number
  /**
   * A corner of the map the piece's own far corner is pinned to.
   *
   * A `LvlSub` border piece is bigger than the outdoor map it belongs to (65x103
   * against 80x80 for `Border - Border`), so where it goes cannot be a tile
   * offset: only the file itself says how big it is. The plan asks for a corner
   * and the composition, which has the bytes, resolves it.
   */
  anchor?: 'nw' | 'ne' | 'sw' | 'se'
  /**
   * Move the piece fully inside the map before placing it.
   *
   * A scenery piece placed from a random offset may hang over the edge; the
   * composition pulls it back in rather than cutting it. A piece larger than the
   * map is placed at the origin instead, and clipped.
   */
  clamp?: boolean
  /** The preset's `Def`, for a room; `null` for a `LvlSub` piece. */
  presetId: number | null
  /** For an `exit` role, the `Vis`/`Warp` slot it realises. */
  slot: number | null
}

/** Where a level's exits will be, and how each one is realised. */
export interface DrlgExit {
  slot: number
  /** Index into {@link DrlgPlan.pieces}, or -1 for a written door marker. */
  pieceIndex: number
  /** The door's tile, when it is a marker. Resolved from the composition otherwise. */
  x: number
  y: number
  /** `piece` when the piece carries the door tile, `marker` when one is written. */
  via: 'piece' | 'marker'
}

/** A plan the generator can carry out, without having read a single byte. */
export interface DrlgPlan {
  ok: true
  kind: 'maze' | 'outdoor'
  level: LevelRow
  width: number
  height: number
  /**
   * The tilesets the ground comes from: the level type's `File 1`.
   *
   * Only the outdoor path uses it. Everything else a generated grid references
   * comes from the tilesets the pieces themselves name — see
   * {@link DrlgComposition.tilesets} — because a piece's own `.ds1` lists the
   * tilesets it was built from and `LvlTypes` leaves some of them out.
   */
  tilesets: readonly string[]
  pieces: readonly DrlgPiece[]
  exits: readonly DrlgExit[]
  /** The room set's family, e.g. `Act 1 - Jail`. Empty for an outdoor area. */
  family: string
  /** Rooms on the grid and how they are arranged, for a report. */
  grid: { cols: number; rows: number; rooms: number; links: number; leaves: number }
  /**
   * The `.ds1` a written door tile is copied from: the act town's own.
   *
   * `null` when the area needs no written door (every exit is a piece that
   * carries its own, or the area has no exits).
   */
  doorSource: { levelName: string; file: string } | null
  /** The parameters the layout used, quoted from the tables. */
  params: Readonly<Record<string, number | string>>
  /** True when the area is populated by `MonDen` — see {@link populateMonsters}. */
  populated: boolean
}

export interface DrlgFailure {
  ok: false
  level: LevelRow
  reason: DrlgRefusal
  detail: string
}

export type DrlgPlanResult = DrlgPlan | DrlgFailure

// ---------------------------------------------------------------------------
// Names: the room set a maze is built from
// ---------------------------------------------------------------------------

/**
 * The four directions, in the order a door pattern spells them.
 *
 * `N`, `S`, `E`, `W` — **not** the compass order: `LvlPrest.txt` names its rooms
 * `Act 1 - Cave SE`, `Act 1 - Cave NSE`, `Act 1 - Jail SEW` and `Act 1 - Cave
 * NSEW`, so the letters run north, south, east, west and a set is written in
 * that order. Sorting a room's connections by anything else asks for a piece the
 * table does not have: with compass order, `{E, S}` sorts to `ES`, and no family
 * ships an `ES` — the room would silently have no piece at all.
 */
export const DIRECTIONS = 'NSEW' as const
export type Direction = (typeof DIRECTIONS)[number]

/** A tile offset per direction: grid rows grow southward, columns eastward. */
const STEPS: Readonly<Record<Direction, { dx: number; dy: number }>> = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 },
}

/** True when `suffix` is a set of direction letters in `NESW` order, and non-empty. */
export function isDoorPattern(suffix: string): boolean {
  if (suffix.length === 0 || suffix.length > 4) return false
  let previous = -1
  for (const letter of suffix) {
    const at = DIRECTIONS.indexOf(letter as Direction)
    if (at < 0 || at <= previous) return false
    previous = at
  }
  return true
}

/** The suffix of a `LvlPrest` name after the given prefix, or `null`. */
function suffixOf(name: string, prefix: string): string | null {
  if (!name.startsWith(`${prefix} `)) return null
  return name.slice(prefix.length + 1)
}

/**
 * The prefix a maze's room pieces are named under.
 *
 * The tables do not join a maze row to its rooms — there is no column for it —
 * so the join is by name, and the name needs trimming: the maze row is `Act 1 -
 * Cave 2` while its rooms are `Act 1 - Cave W`, and the row `Act 2 - Tomb 1
 * Treasure` is served by `Act 2 - Tomb W`. The rule is therefore "drop up to two
 * trailing words and take the longest prefix that yields a room set", which is
 * also the rule that refuses the families that have none: no `LvlPrest` row
 * named `Act 5 - Ice Cave …` exists at all, so the Ice Caves are refused rather
 * than built out of the wrong rooms.
 */
export function roomPrefixCandidates(name: string): string[] {
  const words = name.split(' ')
  const out: string[] = []
  for (let drop = 0; drop <= 2 && words.length - drop >= 3; drop++) {
    out.push(words.slice(0, words.length - drop).join(' '))
  }
  return out
}

/** The `LevelId 0` room rows of one family, keyed by door pattern. */
interface RoomSet {
  prefix: string
  /** Doors first, then specials: `Cave NEW -> Def`, `Theme NEW -> Def`, `Next W -> Def`. */
  patterns: Map<string, LvlPrestRef[]>
  specials: Map<string, LvlPrestRef>
}

interface LvlPrestRef {
  id: number
  name: string
  files: readonly string[]
}

function roomSetOf(level: LevelRow, tables: LevelTables): RoomSet | null {
  for (const prefix of roomPrefixCandidates(level.name)) {
    const patterns = new Map<string, LvlPrestRef[]>()
    const specials = new Map<string, LvlPrestRef>()
    let roomRows = 0
    for (const preset of tables.presets) {
      if (preset.levelId !== 0 || !preset.files.length) continue
      const suffix = suffixOf(preset.name, prefix)
      if (suffix === null) continue
      roomRows += 1
      const ref: LvlPrestRef = { id: preset.id, name: preset.name, files: preset.files }
      if (isDoorPattern(suffix)) {
        const list = patterns.get(suffix) ?? []
        list.push(ref)
        patterns.set(suffix, list)
        continue
      }
      // `Theme NEW` is a pattern too, kept apart so the plain room is the one
      // that is used unless `Themes` says otherwise.
      const theme = /^Theme ([NESW]{1,4})$/.exec(suffix)
      if (theme && isDoorPattern(theme[1])) {
        const list = patterns.get(`Theme ${theme[1]}`) ?? []
        list.push(ref)
        patterns.set(`Theme ${theme[1]}`, list)
        continue
      }
      if (!specials.has(suffix)) specials.set(suffix, ref)
    }
    if (roomRows === 0) continue
    const plain = [...patterns.keys()].filter((key) => !key.startsWith('Theme '))
    if (plain.length === 0) continue
    return { prefix, patterns, specials }
  }
  return null
}

// ---------------------------------------------------------------------------
// The layout
// ---------------------------------------------------------------------------

/** mulberry32: the same generator `world.ts` uses, so one seed means one map. */
function createRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface MazeRoom {
  col: number
  row: number
  /** Connected directions. */
  dirs: Direction[]
  /** Set when the room's piece was replaced by an exit's. */
  exitSlot: number | null
  /** Set when the room's piece was replaced by the level's waypoint. */
  isWaypoint: boolean
  /** True when the room uses the family's `Theme` variant of its pattern. */
  theme: boolean
}

interface MazeLayout {
  room: LvlMazeRow
  rooms: MazeRoom[]
  cols: number
  rows: number
  links: number
  patternFor: (room: MazeRoom) => string
}

/**
 * The room graph: `Rooms` rooms on a grid, joined by a spanning tree and then by
 * whatever `Merge` allows. See the module header, rules 1 and 2.
 */
function layoutMaze(
  room: LvlMazeRow,
  themes: number,
  seed: number,
  reserve?: (rooms: readonly MazeRoom[]) => ReadonlySet<MazeRoom>,
): MazeLayout {
  const random = createRandom(seed ^ Math.imul(room.level, 0x9e3779b1))
  const count = Math.max(1, room.rooms)
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)))
  const rows = Math.max(1, Math.ceil(count / cols))
  const at = (col: number, row: number): number | null => {
    const index = row * cols + col
    return col < 0 || row < 0 || col >= cols || row >= rows || index >= count ? null : index
  }
  const rooms: MazeRoom[] = []
  for (let index = 0; index < cols * rows && rooms.length < count; index++) {
    const col = index % cols
    const row = Math.floor(index / cols)
    rooms.push({
      col,
      row,
      dirs: [],
      exitSlot: null,
      isWaypoint: false,
      theme: random() * 1000 < themes,
    })
  }

  const connected = new Set<string>()
  const link = (a: MazeRoom, b: MazeRoom): void => {
    const key = `${a.col},${a.row}|${b.col},${b.row}`
    if (connected.has(key)) return
    connected.add(key)
    const dx = b.col - a.col
    const dy = b.row - a.row
    const from: Direction = dx === 1 ? 'E' : dx === -1 ? 'W' : dy === 1 ? 'S' : 'N'
    const to: Direction = from === 'E' ? 'W' : from === 'W' ? 'E' : from === 'S' ? 'N' : 'S'
    if (!a.dirs.includes(from)) a.dirs.push(from)
    if (!b.dirs.includes(to)) b.dirs.push(to)
  }

  // Randomised depth-first spanning tree: every room is reached exactly once, so
  // the maze is connected no matter what the seed does.
  const start = Math.floor(random() * rooms.length)
  const visited = new Set<number>([start])
  const stack: MazeRoom[] = [rooms[start]]
  while (stack.length > 0) {
    const current = stack[stack.length - 1]
    const options: Array<{ room: MazeRoom; index: number }> = []
    for (const direction of DIRECTIONS) {
      const step = STEPS[direction]
      const index = at(current.col + step.dx, current.row + step.dy)
      if (index === null || visited.has(index)) continue
      options.push({ room: rooms[index], index })
    }
    if (options.length === 0) {
      stack.pop()
      continue
    }
    const pick = options[Math.floor(random() * options.length)]
    visited.add(pick.index)
    link(current, pick.room)
    stack.push(pick.room)
  }

  // The rooms the caller wants left as dead ends are held back before `Merge`
  // runs, because `Merge` — which is `LvlMaze`'s own 50% in most rows — fills in
  // exactly the dead ends a stair room needs to exist.
  const reserved = reserve ? reserve(rooms) : null

  // `Merge` then opens the walls the tree left standing.
  for (const candidate of rooms) {
    for (const direction of ['E', 'S'] as const) {
      const step = STEPS[direction]
      const index = at(candidate.col + step.dx, candidate.row + step.dy)
      if (index === null) continue
      if (candidate.dirs.includes(direction)) continue
      if (reserved?.has(candidate) || reserved?.has(rooms[index])) continue
      if (random() * 1000 < room.merge) link(candidate, rooms[index])
    }
  }

  for (const room of rooms) room.dirs.sort((a, b) => DIRECTIONS.indexOf(a) - DIRECTIONS.indexOf(b))
  return {
    room,
    rooms,
    cols,
    rows,
    links: connected.size,
    patternFor: (room) => room.dirs.join(''),
  }
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/**
 * The act a `LvlSub` piece belongs to, read from its own path.
 *
 * `LvlSub.txt` has no act column and its `File` paths say it themselves: `Act1/…`
 * is act 1, `Act2/…` act 2, and the only other prefix in the table is
 * `Expansion/…`, which is act 5's Siege art. Keeping a row out of an act it does
 * not belong to is what stops the act 5 `Barricade` row joining act 1's border
 * set — it is the fifth row with a `BordType`, and taking it would put a siege
 * barricade in the Blood Moor.
 */
export function pieceAct(file: string): number {
  const match = /^Act(\d)/i.exec(file.replace(/\\/g, '/'))
  if (match) return Number(match[1])
  return /^Expansion\//i.test(file.replace(/\\/g, '/')) ? 5 : 0
}

/** A `LvlSub` row's piece, when it belongs to the area's act. */
function inAct(row: LvlSubRow, level: LevelRow): boolean {
  const act = pieceAct(row.file)
  return act === 0 || act === level.act + 1
}

/** The `LvlTypes` row an area draws from. */
export function levelTypeOf(level: LevelRow, tables: LevelTables): LvlTypeRow | null {
  return tables.levelTypes.find((type) => type.id === level.levelType) ?? null
}

/**
 * The `.ds1` an outdoor area copies its door tile from.
 *
 * The door in an outdoor area is not in any piece: `LvlSub`'s border and scenery
 * pieces carry no orientation-10 tile at all (measured across all 16 act 1
 * rows). What does carry one is the act's town — the very door the player walks
 * through to reach the area — so the generator copies that tile's key. The town
 * is found by the name the tables give it: exactly five rows in `Levels.txt` end
 * in `Town` and they are the five towns.
 */
export function doorSourceFor(level: LevelRow, tables: LevelTables): { level: LevelRow; file: string } | null {
  const town = tables.levels.find(
    (row) => row.act === level.act && /Town$/.test(row.name) && row.drlgType === 2,
  )
  if (!town) return null
  const preset = tables.presets.find((row) => row.levelId === town.id)
  if (!preset || preset.files.length === 0) return null
  return { level: town, file: preset.files[0] }
}

/**
 * Plans a generated area. Pure: reads the tables, not one byte of a tile file.
 *
 * @param level The `Levels.txt` row of the area.
 * @param tables The parsed tables, `drlg` included.
 * @param seed The game seed: the same seed plans the same area twice.
 */
export function planArea(level: LevelRow, tables: LevelTables, seed = 20261013): DrlgPlanResult {
  if (level.drlgType !== 1 && level.drlgType !== 3) {
    return {
      ok: false,
      level,
      reason: 'not-generated',
      detail: `DrlgType ${level.drlgType} is not a generated area: a LvlPrest row decides its layout`,
    }
  }
  const drlg = drlgTablesOf(tables)
  if (!drlg) {
    return {
      ok: false,
      level,
      reason: 'no-drlg-tables',
      detail:
        `it is DrlgType ${level.drlgType} and this source carries no LvlMaze.txt/LvlSub.txt, ` +
        'so the generator has no parameters for it',
    }
  }
  const levelType = levelTypeOf(level, tables)
  if (!levelType) {
    return {
      ok: false,
      level,
      reason: 'no-level-type',
      detail: `DrlgType ${level.drlgType}: no LvlTypes row has Id ${level.levelType}`,
    }
  }
  return level.drlgType === 1
    ? planMaze(level, tables, drlg, levelType, seed)
    : planOutdoor(level, tables, drlg, levelType, seed)
}

function planMaze(
  level: LevelRow,
  tables: LevelTables,
  drlg: { maze: LvlMazeRow[]; subs: LvlSubRow[] },
  levelType: LvlTypeRow,
  seed: number,
): DrlgPlanResult {
  const row = drlg.maze.find((entry) => entry.level === level.id)
  if (!row) {
    return {
      ok: false,
      level,
      reason: 'no-maze-row',
      detail:
        `DrlgType ${level.drlgType}: no LvlMaze row names level ${level.id} ("${level.name}"), ` +
        'so its room size and room count are unknown',
    }
  }
  const set = roomSetOf(level, tables)
  if (!set) {
    return {
      ok: false,
      level,
      reason: 'no-room-set',
      detail:
        `DrlgType ${level.drlgType}: no LvlPrest row with LevelId 0 is named after "${level.name}" with a door pattern ` +
        `(a trailing set of N/E/S/W), so the family has no rooms to build a maze from`,
    }
  }
  const doorSource = doorSourceFor(level, tables)
  const slots: number[] = []
  for (let slot = 0; slot < level.vis.length; slot++) {
    if (level.vis[slot] > 0 && (level.warp[slot] ?? -1) >= 0) slots.push(slot)
  }
  if (slots.length > 0 && !doorSource) {
    return {
      ok: false,
      level,
      reason: 'no-door-source',
      detail:
        `DrlgType ${level.drlgType}: act ${level.act + 1}'s town has no preset, so there is no door tile ` +
        `to copy for its ${slots.length} exits`,
    }
  }

  // Which rooms the stair and waypoint pieces take, decided **before** the layout
  // merges its dead ends away: a `Next N` piece has one door, so the room it
  // replaces must have exactly one connection, and `Merge` is what would take
  // that away. See the module header, rule 4.
  const wanted: Array<{ room: MazeRoom | null; slot: number | null; waypoint: boolean }> = []
  const usedLeaves = new Set<MazeRoom>()
  const waypointWanted = level.waypoint < 255 && set.specials.size > 0
  const target = slots.length + (waypointWanted ? 1 : 0)
  const layout = layoutMaze(row, themesOf(level), seed, (rooms) => {
    const chosen = new Set<MazeRoom>()
    const leaves = rooms.filter((room) => room.dirs.length === 1)
    let taken = 0
    for (const leaf of leaves) {
      if (taken >= target) break
      // The stair pieces are named `Next W`, `Next E`, `Next N`, `Next S`; a leaf
      // whose direction has no piece gets a marker instead, and keeps its wall.
      if (exitPiece(set, leaf.dirs[0]) === null) continue
      chosen.add(leaf)
      taken += 1
    }
    return chosen
  })
  const leaves = layout.rooms.filter((room) => room.dirs.length === 1)
  for (const slot of slots) {
    const leaf = leaves.find((room) => !usedLeaves.has(room) && exitPiece(set, room.dirs[0]) !== null)
    if (leaf) usedLeaves.add(leaf)
    wanted.push({ room: leaf ?? null, slot, waypoint: false })
  }
  if (waypointWanted) {
    const leaf = leaves.find((room) => !usedLeaves.has(room) && waypointPiece(set, room.dirs[0]) !== null)
    if (leaf) {
      usedLeaves.add(leaf)
      wanted.push({ room: leaf, slot: null, waypoint: true })
    }
  }

  const pieces: DrlgPiece[] = []
  const exits: DrlgExit[] = []
  const roomW = Math.max(1, row.sizeX)
  const roomH = Math.max(1, row.sizeY)
  for (const room of layout.rooms) {
    const pattern = layout.patternFor(room)
    const assignment = wanted.find((entry) => entry.room === room)
    let ref: LvlPrestRef | null = null
    let role: DrlgPiece['role'] = 'room'
    let label = `${set.prefix} ${pattern}`
    if (assignment?.waypoint) {
      const direction = room.dirs[0]
      ref = waypointPiece(set, direction)
      role = 'waypoint'
      label = ref?.name ?? label
    } else if (assignment) {
      const direction = room.dirs[0]
      ref = exitPiece(set, direction)
      role = 'exit'
      label = ref?.name ?? label
    } else {
      ref = pickPattern(set, pattern, room.theme)
      if (room.theme && ref?.name.includes(' Theme ')) role = 'room-theme'
    }
    if (!ref) continue
    pieces.push({
      role,
      label,
      file: ref.files[0],
      x: room.col * roomW,
      y: room.row * roomH,
      presetId: ref.id,
      slot: assignment?.slot ?? null,
    })
  }

  for (const entry of wanted) {
    if (entry.waypoint) continue
    const slot = entry.slot as number
    const index = entry.room
      ? pieces.findIndex((piece) => piece.slot === slot && piece.role === 'exit')
      : -1
    if (index >= 0) {
      // The door is the piece's own; these coordinates are only where a marker
      // goes if the piece turns out to carry none — the middle of its room.
      exits.push({
        slot,
        pieceIndex: index,
        x: pieces[index].x + Math.floor(roomW / 2),
        y: pieces[index].y + Math.floor(roomH / 2),
        via: 'piece',
      })
      continue
    }
    // No dead end left, or no stair piece for one: the slot still gets a door,
    // written in the middle of the first room that has none yet.
    const fallback = layout.rooms[Math.min(layout.rooms.length - 1, exits.length)]
    const x = fallback.col * roomW + Math.floor(roomW / 2)
    const y = fallback.row * roomH + Math.floor(roomH / 2)
    exits.push({ slot, pieceIndex: -1, x, y, via: 'marker' })
  }

  return {
    ok: true,
    kind: 'maze',
    level,
    width: layout.cols * roomW + 1,
    height: layout.rows * roomH + 1,
    tilesets: [],
    pieces,
    exits,
    family: set.prefix,
    doorSource: doorSource ? { levelName: doorSource.level.name, file: doorSource.file } : null,
    grid: {
      cols: layout.cols,
      rows: layout.rows,
      rooms: layout.rooms.length,
      links: layout.links,
      leaves: leaves.length,
    },
    params: {
      rooms: row.rooms,
      roomSizeX: row.sizeX,
      roomSizeY: row.sizeY,
      merge: row.merge,
      themes: themesOf(level),
      levelType: levelType.name,
    },
    populated: level.monsterDensity > 0 && level.monsterClasses.length > 0,
  }
}

/** `Levels.txt`'s `Themes`: the per-mille chance a room uses its theme variant. */
function themesOf(level: LevelRow): number {
  return Math.max(0, Math.min(1000, level.themes))
}

/**
 * The piece for a room with this door pattern.
 *
 * The ladder, in order: the family's `Theme` variant when the seed asked for one,
 * the plain piece for the exact pattern, and failing that the **smallest pattern
 * that contains the room's** — a room whose own pattern is missing a piece still
 * gets one that reaches every neighbour, and the extra openings are covered by
 * the neighbour's wall, which is blitted after it. The only pattern with no
 * smaller superset is the empty one, which a one-room maze has: `LvlMaze` gives
 * `Act 1 - Cave 1` exactly one room, so that room takes the single-letter piece
 * and simply has a door in one wall.
 */
function pickPattern(set: RoomSet, pattern: string, theme: boolean): LvlPrestRef | null {
  if (theme) {
    const themed = set.patterns.get(`Theme ${pattern}`)
    if (themed) return themed[0]
  }
  const exact = set.patterns.get(pattern)
  if (exact) return exact[0]
  let best: { pattern: string; refs: LvlPrestRef[] } | null = null
  for (const [candidate, refs] of set.patterns) {
    if (candidate.startsWith('Theme ')) continue
    const contains = [...pattern].every((letter) => candidate.includes(letter))
    if (!contains) continue
    if (best === null || candidate.length < best.pattern.length) best = { pattern: candidate, refs }
  }
  return best ? best.refs[0] : null
}

/** The family's `<prefix> Next <direction>` room, the one piece that carries a door. */
function exitPiece(set: RoomSet, direction: Direction): LvlPrestRef | null {
  return set.specials.get(`Next ${direction}`) ?? set.specials.get(`Prev ${direction}`) ?? null
}

function waypointPiece(set: RoomSet, direction: Direction): LvlPrestRef | null {
  return set.specials.get(`Waypoint ${direction}`) ?? null
}

function planOutdoor(
  level: LevelRow,
  tables: LevelTables,
  drlg: { maze: LvlMazeRow[]; subs: LvlSubRow[] },
  levelType: LvlTypeRow,
  seed: number,
): DrlgPlanResult {
  const width = level.sizeX
  const height = level.sizeY
  if (width <= 0 || height <= 0) {
    return {
      ok: false,
      level,
      reason: 'no-size',
      detail: `DrlgType ${level.drlgType}: SizeX/SizeY are ${level.sizeX}x${level.sizeY}, so there is no area to generate`,
    }
  }
  const ground = levelType.files.find((file) => file !== '')
  if (!ground) {
    return {
      ok: false,
      level,
      reason: 'no-level-type',
      detail: `DrlgType ${level.drlgType}: LvlTypes row ${levelType.id} ("${levelType.name}") names no tileset`,
    }
  }
  const borders = drlg.subs
    .filter((row) => row.bordType >= 0 && inAct(row, level))
    .sort((a, b) => a.bordType - b.bordType || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  if (borders.length === 0) {
    return {
      ok: false,
      level,
      reason: 'no-border-set',
      detail:
        `DrlgType ${level.drlgType}: no LvlSub row with a BordType names a piece of act ${level.act + 1}, ` +
        'so this area has no border set to lay out',
    }
  }
  const random = createRandom(seed ^ Math.imul(level.id, 0x85ebca6b))
  const pieces: DrlgPiece[] = []
  const cornerNames: Array<DrlgPiece['anchor']> = ['nw', 'ne', 'sw', 'se']
  for (let i = 0; i < borders.length; i++) {
    const row = borders[i]
    pieces.push({
      role: 'border',
      label: row.name,
      file: row.file,
      x: 0,
      y: 0,
      anchor: cornerNames[i % cornerNames.length],
      presetId: null,
      slot: null,
    })
  }

  const exits: DrlgExit[] = []
  const slots: number[] = []
  for (let slot = 0; slot < level.vis.length; slot++) {
    if (level.vis[slot] > 0 && (level.warp[slot] ?? -1) >= 0) slots.push(slot)
  }
  const doorSource = slots.length > 0 ? doorSourceFor(level, tables) : null
  if (slots.length > 0 && !doorSource) {
    return {
      ok: false,
      level,
      reason: 'no-door-source',
      detail:
        `DrlgType ${level.drlgType}: act ${level.act + 1}'s town has no preset, so there is no door tile ` +
        `to copy for its ${slots.length} exits`,
    }
  }
  for (let i = 0; i < slots.length; i++) {
    // One door per edge, in slot order, one cell inside the ring: the ring is the
    // map's own boundary and a door inside it is standable.
    const edge = i % 4
    const along = Math.floor((width - 4) * ((Math.floor(i / 4) + 1) / (Math.ceil(slots.length / 4) + 1))) + 2
    const margin = 2
    const x = edge === 1 ? width - margin : edge === 3 ? margin - 1 : along
    const y = edge === 0 ? margin : edge === 2 ? height - margin : Math.floor(height / 2)
    exits.push({ slot: slots[i], pieceIndex: -1, x, y, via: 'marker' })
  }

  const scenery =
    level.subType >= 0 ? drlg.subs.filter((row) => row.type === level.subType && inAct(row, level)) : []
  const theme = level.subTheme >= 0 ? level.subTheme : 0
  const placed: Array<{ row: LvlSubRow; x: number; y: number }> = []
  for (const row of scenery) {
    const trials = row.trials[theme] ?? 0
    const chance = row.prob[theme] ?? 0
    const cap = row.max[theme] ?? 0
    const attempts = trials < 0 ? 1 : trials
    let count = 0
    for (let attempt = 0; attempt < attempts && count < cap; attempt++) {
      if (trials >= 0 && random() * 100 > chance) continue
      const position = sceneryPosition(row, width, height, random, exits, placed)
      if (!position) continue
      placed.push({ row, x: position.x, y: position.y })
      count += 1
    }
  }
  for (const entry of placed) {
    pieces.push({
      role: 'scenery',
      label: entry.row.name,
      file: entry.row.file,
      x: entry.x,
      y: entry.y,
      clamp: true,
      presetId: null,
      slot: null,
    })
  }

  const groups: Array<{ rows: LvlSubRow[]; role: DrlgPiece['role'] }> = []
  if (level.waypoint < 255 && level.subWaypoint >= 0) {
    groups.push({
      rows: drlg.subs.filter((row) => row.type === level.subWaypoint && inAct(row, level)),
      role: 'waypoint',
    })
  }
  if (level.subShrine >= 0) {
    groups.push({
      rows: drlg.subs.filter((row) => row.type === level.subShrine && inAct(row, level)),
      role: 'scenery',
    })
  }
  for (const group of groups) {
    const rows = group.rows.filter((row) => row.file)
    if (rows.length === 0) continue
    // One instance per group, chosen by the seed: see the module header, rule 7.
    const row = rows[Math.floor(random() * rows.length)]
    const position = sceneryPosition(row, width, height, random, exits, placed)
    if (!position) continue
    placed.push({ row, x: position.x, y: position.y })
    pieces.push({
      role: group.role,
      label: row.name,
      file: row.file,
      x: position.x,
      y: position.y,
      clamp: true,
      presetId: null,
      slot: null,
    })
  }

  return {
    ok: true,
    kind: 'outdoor',
    level,
    width,
    height,
    tilesets: [ground],
    pieces,
    exits,
    family: '',
    doorSource: doorSource ? { levelName: doorSource.level.name, file: doorSource.file } : null,
    grid: { cols: 0, rows: 0, rooms: 0, links: 0, leaves: 0 },
    params: {
      sizeX: width,
      sizeY: height,
      subType: level.subType,
      subTheme: level.subTheme,
      subWaypoint: level.subWaypoint,
      subShrine: level.subShrine,
      sceneryRows: scenery.length,
      borderRows: borders.length,
      levelType: levelType.name,
    },
    populated: level.monsterDensity > 0 && level.monsterClasses.length > 0,
  }
}

/**
 * A free spot for a scenery piece: inside the map, clear of the exits, and clear
 * of the pieces already placed. Rejection is counted, not fudged.
 */
function sceneryPosition(
  row: LvlSubRow,
  width: number,
  height: number,
  random: () => number,
  exits: readonly DrlgExit[],
  placed: ReadonlyArray<{ x: number; y: number }>,
): { x: number; y: number } | null {
  const pieceW = Math.max(NOMINAL_PIECE_BOX, row.gridSize)
  const pieceH = Math.max(NOMINAL_PIECE_BOX, row.gridSize)
  for (let attempt = 0; attempt < 12; attempt++) {
    const x = 2 + Math.floor(random() * Math.max(1, width - pieceW - 4))
    const y = 2 + Math.floor(random() * Math.max(1, height - pieceH - 4))
    const clearOfExits = exits.every((exit) => Math.abs(exit.x - x) > 3 || Math.abs(exit.y - y) > 3)
    const clearOfPieces = placed.every(
      (other) => Math.abs(other.x - x) > Math.max(pieceW, 6) || Math.abs(other.y - y) > Math.max(pieceH, 6),
    )
    if (clearOfExits && clearOfPieces) return { x, y }
  }
  return null
}

/**
 * A placement's rejected attempts, per piece, are part of the plan's arithmetic:
 * {@link sceneryPosition} only needs to keep two pieces from landing on top of
 * each other, which is spacing rather than size, so it uses a nominal box and
 * lets the composition clip what hangs over.
 */
const NOMINAL_PIECE_BOX = 8

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/** The key of a door tile as `warpTilesOf` reads it: orientation 10. */
export interface DoorKey {
  mainIndex: number
  subIndex: number
  /** The wall layer's orientation byte, as stored. */
  orientation: number
  /** The `.ds1` dword's `prop1` byte, kept because it marks the cell hidden. */
  prop: number
}

/** What {@link composeArea} produced. */
export interface DrlgComposition {
  ok: true
  plan: DrlgPlan
  /** The composed grid, ready for `levels.ts`'s `assembleLevelFromDs1`. */
  ds1: Ds1File
  /**
   * Every tileset the grid references, in load order.
   *
   * The union of the pieces' own `tileFiles` — each `.ds1` lists the tilesets it
   * was built from, and `LvlTypes` leaves some of them out: no row of it names
   * `Act1/Outdoors/Border.dt1`, which is where all four border pieces draw from.
   */
  tilesets: string[]
  stats: {
    /** Pieces the plan named, how many were placed, and which are not here. */
    pieces: number
    placed: number
    missing: string[]
    /** Cells the pieces wrote, and the cells that are still empty. */
    occupied: number
    empty: number
    /** Ground cells, boundary cells and door tiles written. */
    ground: number
    boundary: number
    doors: number
    /** Door tiles dropped because a piece carried more than its slot needed. */
    droppedDoors: number
    /** Objects the pieces placed, which become the area's props and monsters. */
    objects: number
    /** The ground block the fill used, and the one the ring used, as `main:sub`. */
    groundBlock: string
    boundaryBlock: string
    /**
     * Written doors that had no free floor block to stand on.
     *
     * A non-zero count means the cell the door landed on may block a walker: the
     * composition could not read a block free on all 25 of its sub-tiles out of
     * the tilesets this area names, and wrote the door on whatever floor was
     * there. `verify-drlg.ts` fails on a door the entry cannot reach, which is
     * what this would cause.
     */
    markersWithoutFloor: number
  }
}

export interface DrlgComposeFailure {
  ok: false
  plan: DrlgPlan
  reason: DrlgRefusal | 'no-ground-block'
  detail: string
}

export type DrlgComposeResult = DrlgComposition | DrlgComposeFailure

/** Reads and parses a `.ds1` through the caller's reader, or `null`. */
export interface DrlgReader {
  /** Read a tile file by its table-relative path, e.g. `Act1/Caves/CaveW.ds1`. */
  (relativePath: string): Uint8Array | null
}

/**
 * A `.ds1`'s own tileset name to the table-relative path `levels.ts` reads.
 *
 * Two translations, both measured rather than assumed. The extension is `.tg1` —
 * the game's installer shipped a `.tg1` beside every `.dt1` the loader reads, and
 * the extracted tree has only the `.dt1` — and the path is absolute, quoting the
 * *author's* machine (`\\D2\\Data\\GLOBAL\\TILES\\ACT1\\OUTDOORS\\border.tg1`,
 * `C:\\D2\\DATA\\GLOBAL\\TILES\\ACT1\\TOWN\\trees.tg1`). Everything from the
 * `TILES/` segment on is the table-relative path. A name without that segment
 * resolves to `''`, which the composition counts instead of guessing.
 */
export function dt1PathOf(tilesetName: string): string {
  const normalised = tilesetName.replace(/\\/g, '/')
  const at = normalised.toLowerCase().lastIndexOf('/tiles/')
  if (at < 0) return ''
  const relative = normalised.slice(at + '/tiles/'.length)
  return relative.replace(/\.(tg1|dt1)$/i, '.dt1')
}

function blit(
  target: MutableGrid,
  source: Ds1File,
  ox: number,
  oy: number,
  dropDoorsAfterFirst: boolean,
): { doors: DoorKey[]; dropped: number; objects: Ds1Object[] } {
  const doors: DoorKey[] = []
  let dropped = 0
  let seenDoor = false
  for (let y = 0; y < source.height; y++) {
    const ty = oy + y
    if (ty < 0 || ty >= target.height) continue
    for (let x = 0; x < source.width; x++) {
      const tx = ox + x
      if (tx < 0 || tx >= target.width) continue
      const from = y * source.width + x
      const to = ty * target.width + tx
      for (let layer = 0; layer < source.floors.length && layer < target.floors.length; layer++) {
        const cell = source.floors[layer].cells[from]
        if ((cell & 0xff) !== 0) target.floors[layer][to] = cell
      }
      const shadow = source.shadow?.cells[from] ?? 0
      if (shadow !== 0 && target.shadow) {
        target.shadow[to] = shadow
      }
      for (let layer = 0; layer < source.walls.length && layer < target.walls.length; layer++) {
        const raw = source.walls[layer].cells[from]
        if ((raw & 0xffff) === 0) continue
        const decoded = decodeDs1Cell(raw, source.walls[layer].orientations[from])
        const isDoor = (decoded.orientation & 0xf) === 10
        if (isDoor && dropDoorsAfterFirst && seenDoor) {
          dropped += 1
          continue
        }
        if (isDoor) {
          seenDoor = true
          doors.push({
            mainIndex: decoded.mainIndex,
            subIndex: decoded.subIndex,
            orientation: source.walls[layer].orientations[from],
            prop: decoded.prop,
          })
        }
        target.walls[layer][to] = raw
        target.wallOrientations[layer][to] = source.walls[layer].orientations[from]
      }
    }
  }
  return { doors, dropped, objects: source.objects }
}

interface MutableGrid {
  width: number
  height: number
  floors: Uint32Array[]
  walls: Uint32Array[]
  wallOrientations: Uint8Array[]
  shadow: Uint32Array | null
  objects: Array<{ type: number; id: number; x: number; y: number; flags: number }>
}

/** A block's key triple, from a `.dt1` or from a `.ds1` cell. */
interface GridBlock {
  mainIndex: number
  subIndex: number
  flags: Uint8Array
}

function toDs1(grid: MutableGrid, act: number): Ds1File {
  return {
    version: 17,
    width: grid.width,
    height: grid.height,
    act,
    tagType: 0,
    tileFiles: [],
    walls: grid.walls.map((cells, index) => ({
      index,
      cells,
      orientations: grid.wallOrientations[index],
    })),
    floors: grid.floors.map((cells, index) => ({ kind: 'floor' as const, index, cells })),
    shadow: grid.shadow ? { kind: 'shadow' as const, index: 0, cells: grid.shadow } : null,
    tag: null,
    objects: grid.objects.map((object) => ({ ...object })),
    groups: [],
    paths: [],
    bytesRead: 0,
    trailingBytes: 0,
    truncated: false,
  } as Ds1File
}

/**
 * Composes a plan into one `.ds1`.
 *
 * The output is an ordinary `.ds1` — floors, one wall layer with its orientation
 * stream, a shadow layer, and the objects the pieces carried — so everything
 * downstream is the existing path: `assembleLevelFromDs1` resolves its keys,
 * builds the 25-sub-tile collision grid and lists its objects, `createAreaArt`
 * draws its tiles, and `travel.ts`'s `warpTilesOf` finds its doors.
 */
export function composeArea(plan: DrlgPlan, read: DrlgReader): DrlgComposeResult {
  const grid: MutableGrid = {
    width: plan.width,
    height: plan.height,
    floors: [new Uint32Array(plan.width * plan.height)],
    walls: [new Uint32Array(plan.width * plan.height)],
    wallOrientations: [new Uint8Array(plan.width * plan.height)],
    shadow: null,
    objects: [],
  }
  /**
   * The tilesets the grid resolves against, **in priority order**.
   *
   * `levels.ts`'s catalogue keeps the first block that answers a key, and one key
   * can be answered by more than one file: `Act1/Town/Floor.dt1` and
   * `Act1/Caves/Cave.dt1` both define orientation 0, main 5, sub 0 and they are
   * different blocks. So the order is not cosmetic — a piece's own tilesets come
   * first, because its `.ds1` is the grid's source of truth, and the files the
   * *door* or the *ground* come from are appended after them. Measured on
   * `Act 1 - Cave 1`: with the town's floor file answering the cave's keys the
   * assembled room is 142 walkable cells, with the cave's own file it is 234.
   */
  const tilesets: string[] = []
  const note = (path: string): void => {
    if (!path) return
    floorBytes.set(path.toLowerCase(), read(path))
    if (!tilesets.some((known) => known.toLowerCase() === path.toLowerCase())) tilesets.push(path)
  }
  const noteTilesets = (file: Ds1File): void => {
    for (const named of file.tileFiles) note(dt1PathOf(named))
  }
  /** Files noted for the ground or the door, appended once the pieces are in. */
  const secondary: string[] = []
  const stats: DrlgComposition['stats'] = {
    pieces: plan.pieces.length,
    placed: 0,
    missing: [],
    occupied: 0,
    empty: 0,
    ground: 0,
    boundary: 0,
    doors: 0,
    droppedDoors: 0,
    objects: 0,
    groundBlock: '',
    boundaryBlock: '',
    markersWithoutFloor: 0,
  }

  /**
   * The door tile a written marker copies.
   *
   * Reading it is what turns a plan's `marker` exit into a door at all, so a
   * missing tile is a refusal rather than a silent hole in the level's links.
   */
  let doorTemplate: DoorKey | null = null
  const needsMarker = plan.exits.some((exit) => exit.via === 'marker')
  if (plan.doorSource && needsMarker) {
    const bytes = read(plan.doorSource.file)
    const doors = bytes ? doorKeysOf(bytes) : []
    if (doors.length === 0) {
      return {
        ok: false,
        plan,
        reason: 'no-door-source',
        detail: `"${plan.doorSource.file}" (${plan.doorSource.levelName}) carries no orientation-10 door tile to copy into this area`,
      }
    }
    doorTemplate = doors[0]
    const template = parseDs1(bytes as Uint8Array)
    for (const named of template.tileFiles) secondary.push(dt1PathOf(named))
  }

  // An outdoor area starts as ground, every cell of it.
  if (plan.kind === 'outdoor') {
    const groundFile = plan.tilesets[0]
    const bytes = read(groundFile)
    const ground = bytes ? groundBlocks(bytes) : null
    if (!ground) {
      return {
        ok: false,
        plan,
        reason: 'no-ground-block',
        detail: `the ground tileset "${groundFile}" is not in this export, or is not a readable .dt1`,
      }
    }
    if (ground.walkable.length === 0) {
      return {
        ok: false,
        plan,
        reason: 'no-ground-block',
        detail: `"${groundFile}" has no orientation-0 block that is free on all 25 sub-tiles, so there is no ground to fill with`,
      }
    }
    secondary.push(groundFile)
    for (let y = 0; y < plan.height; y++) {
      for (let x = 0; x < plan.width; x++) {
        // A hash of the cell, so the choice is the same on every run and still
        // varies from cell to cell rather than laying the file's blocks in rows.
        const index = (Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 1, 0x85ebca6b)) >>> 0
        const block = ground.walkable[index % ground.walkable.length]
        grid.floors[0][y * plan.width + x] = cellOf(block, 0x41)
        stats.ground += 1
      }
    }
    stats.groundBlock = `${ground.walkable[0].mainIndex}:${ground.walkable[0].subIndex}`
  }

  // The pieces, in plan order.
  for (const piece of plan.pieces) {
    const bytes = read(piece.file)
    const parsed = bytes ? parseTileDs1(bytes) : null
    if (!parsed) {
      stats.missing.push(piece.file)
      continue
    }
    noteTilesets(parsed)
    if (parsed.shadow && !grid.shadow) grid.shadow = new Uint32Array(plan.width * plan.height)
    let x = piece.x
    let y = piece.y
    if (piece.anchor) {
      // The piece's own far corner meets the map's: the pieces are larger than
      // the map, so each one is pinned rather than offset.
      x = piece.anchor === 'nw' || piece.anchor === 'sw' ? 0 : plan.width - parsed.width
      y = piece.anchor === 'nw' || piece.anchor === 'ne' ? 0 : plan.height - parsed.height
    } else if (piece.clamp) {
      x = Math.max(0, Math.min(x, plan.width - parsed.width))
      y = Math.max(0, Math.min(y, plan.height - parsed.height))
    }
    const result = blit(grid, parsed, x, y, true)
    stats.placed += 1
    stats.droppedDoors += result.dropped
    for (const object of result.objects) {
      grid.objects.push({
        type: object.type,
        id: object.id,
        x: object.x + x * DS1_SUBTILES_PER_TILE,
        y: object.y + y * DS1_SUBTILES_PER_TILE,
        flags: object.flags,
      })
      stats.objects += 1
    }
  }
  for (const path of secondary) note(path)
  if (stats.missing.length > 0) {
    return {
      ok: false,
      plan,
      reason: 'missing-pieces',
      detail:
        `${stats.missing.length} of the ${plan.pieces.length} pieces this area needs are not in ` +
        `this export: ${stats.missing.slice(0, 3).join(', ')}`,
    }
  }

  // The ring, after the pieces: it is the map's boundary, so nothing may cover it.
  if (plan.kind === 'outdoor') {
    const bytes = read(plan.tilesets[0])
    const ground = bytes ? groundBlocks(bytes) : null
    if (ground && ground.solid.length > 0) {
      const block = ground.solid[0]
      const ring = (x: number, y: number): void => {
        if (x < 0 || y < 0 || x >= plan.width || y >= plan.height) return
        grid.floors[0][y * plan.width + x] = cellOf(block, 0x41)
        stats.boundary += 1
      }
      for (let x = 0; x < plan.width; x++) {
        ring(x, 0)
        ring(x, plan.height - 1)
      }
      for (let y = 0; y < plan.height; y++) {
        ring(0, y)
        ring(plan.width - 1, y)
      }
      stats.boundaryBlock = `${block.mainIndex}:${block.subIndex}`
    }
  }

  // The doors. A piece that carries one keeps it; a slot the plan gave a marker
  // gets one written, in the open cell nearest where the plan put it.
  const markerFloor = needsMarker ? freeFloorBlock(plan, tilesets) : null
  let unstandable = 0
  for (const exit of plan.exits) {
    const piece = exit.via === 'piece' ? plan.pieces[exit.pieceIndex] : null
    const bytes = piece ? read(piece.file) : null
    const carried = bytes ? doorKeysOf(bytes).length : 0
    if (carried > 0) {
      stats.doors += 1
      continue
    }
    if (!doorTemplate) continue
    const at = doorCellNear(grid, exit.x, exit.y, markerFloor)
    if (!at) continue
    if (!at.floored) unstandable += 1
    const index = at.y * grid.width + at.x
    grid.walls[0][index] = cellOf(doorTemplate, doorTemplate.prop)
    grid.wallOrientations[0][index] = doorTemplate.orientation
    stats.doors += 1
  }
  stats.markersWithoutFloor = unstandable

  let occupied = 0
  for (let i = 0; i < plan.width * plan.height; i++) {
    if (grid.floors[0][i] !== 0 || grid.walls[0][i] !== 0) occupied += 1
  }
  stats.occupied = occupied
  stats.empty = plan.width * plan.height - occupied

  return { ok: true, plan, ds1: toDs1(grid, plan.level.act), tilesets, stats }
}

/** The `.ds1` dword for a block key at a given `prop1`, hidden bit included. */
function cellOf(block: { mainIndex: number; subIndex: number }, prop: number): number {
  return (((block.mainIndex & 0x3f) << 20) | ((block.subIndex & 0xff) << 8) | (prop & 0xff)) >>> 0
}

/**
 * Where a written door goes.
 *
 * Two conditions, both of which matter to a player. The cell must carry **no wall
 * layer** — a door tile is itself a wall-layer cell, so writing one over another
 * would replace art instead of adding a door — and it must be **standable**, which
 * the composition cannot read off the cell: whether a floor block blocks is in the
 * `.dt1` that answers for it, and a `.ds1` cell only names it. So the cell's floor
 * is replaced with a block the caller has already measured as free on all 25 of its
 * sub-tiles, and the open cell nearest the plan's position is taken, preferring the
 * one with the most open neighbours so the door lands in the room rather than in an
 * alcove.
 *
 * @param floor A block free on all 25 sub-tiles, from the tilesets this area draws
 *   from, or `null` when none could be read — the door is still written, and the
 *   composition says so in its statistics.
 */
function doorCellNear(
  grid: MutableGrid,
  x: number,
  y: number,
  floor: GridBlock | null,
): { x: number; y: number; floored: boolean } | null {
  const inside = (cx: number, cy: number): boolean =>
    cx >= 0 && cy >= 0 && cx < grid.width && cy < grid.height
  const open = (cx: number, cy: number): boolean => {
    if (!inside(cx, cy)) return false
    const index = cy * grid.width + cx
    return grid.floors[0][index] !== 0 && grid.walls[0][index] === 0
  }
  let best: { x: number; y: number; score: number } | null = null
  const limit = 10
  for (let radius = 0; radius <= limit; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue
        const cx = x + dx
        const cy = y + dy
        if (!open(cx, cy)) continue
        let score = 0
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (open(cx + ox, cy + oy)) score += 1
        }
        if (best === null || score > best.score) best = { x: cx, y: cy, score }
      }
    }
    // A cell with four open neighbours is in the open, and is taken at once.
    const found: { x: number; y: number; score: number } | null = best
    if (found !== null && found.score === 4 && radius >= 2) break
  }
  const chosen: { x: number; y: number; score: number } | null = best
  if (chosen === null) return null
  const index = chosen.y * grid.width + chosen.x
  if (floor) grid.floors[0][index] = cellOf(floor, 0x41)
  return { x: chosen.x, y: chosen.y, floored: floor !== null }
}

/**
 * A block free on all 25 of its sub-tiles, from the tilesets an area draws from.
 *
 * This is what makes a written door standable: `doorCellNear` replaces the cell's
 * floor with it. The search is over the area's own tilesets in load order, so the
 * block is one the level would have drawn anyway.
 */
function freeFloorBlock(plan: DrlgPlan, tilesets: readonly string[]): GridBlock | null {
  const candidates = plan.kind === 'outdoor' ? [...plan.tilesets, ...tilesets] : tilesets
  for (const path of candidates) {
    const bytes = floorBytes.get(path.toLowerCase())
    const ground = bytes ? groundBlocks(bytes) : null
    if (ground && ground.walkable.length > 0) return ground.walkable[0]
  }
  return null
}

/**
 * The bytes {@link freeFloorBlock} reads, filled by `composeArea`.
 *
 * A module-level map rather than an argument because it is the same bytes the
 * composition already has in hand and threading them through would mean passing
 * the reader into a pure helper.
 */
const floorBytes = new Map<string, Uint8Array | null>()

/** A parsed `.ds1`, or `null` when the bytes are not a readable grid. */
function parseTileDs1(bytes: Uint8Array): Ds1File | null {
  try {
    return parseDs1(bytes)
  } catch {
    return null
  }
}

/** The orientation-0 blocks of a `.dt1`, split into the free ones and the solid ones. */
export function groundBlocks(bytes: Uint8Array): { walkable: GridBlock[]; solid: GridBlock[] } | null {
  const file = parseDt1OrNull(bytes)
  if (!file) return null
  const walkable: GridBlock[] = []
  const solid: GridBlock[] = []
  for (const block of file.blocks) {
    if (block.orientation !== 0) continue
    let blocked = 0
    for (let i = 0; i < 25; i++) if (block.flags[i] & 1) blocked += 1
    const entry: GridBlock = { mainIndex: block.mainIndex, subIndex: block.subIndex, flags: block.flags }
    if (blocked === 0) walkable.push(entry)
    else if (blocked === 25) solid.push(entry)
  }
  walkable.sort((a, b) => a.mainIndex - b.mainIndex || a.subIndex - b.subIndex)
  solid.sort((a, b) => a.mainIndex - b.mainIndex || a.subIndex - b.subIndex)
  return { walkable, solid }
}

/** The orientation-10 door tiles of a `.ds1`, in row-major order. */
export function doorKeysOf(bytes: Uint8Array): DoorKey[] {
  const ds1 = parseDs1(bytes)
  const out: DoorKey[] = []
  for (let y = 0; y < ds1.height; y++) {
    for (let x = 0; x < ds1.width; x++) {
      const i = y * ds1.width + x
      for (const wall of ds1.walls) {
        const raw = wall.cells[i]
        if ((raw & 0xffff) === 0) continue
        const decoded = decodeDs1Cell(raw, wall.orientations[i])
        if ((decoded.orientation & 0xf) !== 10) continue
        out.push({
          mainIndex: decoded.mainIndex,
          subIndex: decoded.subIndex,
          orientation: wall.orientations[i],
          prop: decoded.prop,
        })
      }
    }
  }
  return out
}

/** A `.dt1`, or `null` when its bytes are the legacy layout or unreadable. */
function parseDt1OrNull(bytes: Uint8Array): Dt1File | null {
  try {
    const file = parseDt1(bytes)
    return file.layout === 'v7' ? file : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Population
// ---------------------------------------------------------------------------

/** One ambient monster the generator places: a `monstats` id on a tile. */
export interface GeneratedMonster {
  name: string
  x: number
  y: number
}

/**
 * The monsters `Levels.txt` says an area has.
 *
 * `MonDen` is monsters per 1000 of the generator's own 64-tile block, which is
 * the unit that makes the table's numbers land where the game's own counts do:
 * the Blood Moor's 520 over its 80x80 map gives 52. See the module header, rule
 * 9 — nothing in the tables states the unit, and this is the reading.
 *
 * Cells are picked from the assembled level's walkable ones, away from where the
 * player arrives, so nothing spawns inside a wall or on the doorstep. The result
 * is a roster of class names rather than `.ds1` records: a generated area's
 * monsters come from `Levels.txt`'s own `mon1..mon25` columns, which name
 * `monstats` classes directly, while a `.ds1` record names a `monpreset` row.
 */
export function populateMonsters(options: {
  level: LevelRow
  /** The assembled area, for the cells that can hold a monster. */
  assembled: Level
  seed: number
  /** Where the player arrives, kept clear. */
  avoid?: { x: number; y: number } | null
  minDistance?: number
}): GeneratedMonster[] {
  const { level, assembled } = options
  if (level.monsterDensity <= 0 || level.monsterClasses.length === 0) return []
  const count = Math.min(
    Math.floor((level.monsterDensity * assembled.width * assembled.height) / 64000),
    Math.floor((assembled.width * assembled.height) / 8),
  )
  if (count <= 0) return []
  const classes = level.monsterClasses.slice(0, Math.max(1, level.numMon || level.monsterClasses.length))
  const cells: Array<{ x: number; y: number }> = []
  for (let y = 0; y < assembled.height; y++) {
    for (let x = 0; x < assembled.width; x++) {
      // The map's rule, not the flag rule: `areaGrid` gives a cell whose tile
      // resolved nowhere no kind at all, and `worldFromRealLevel` makes such a
      // cell unwalkable, so a monster placed there could never be reached.
      const tile = assembled.tileAt(x, y)
      if (tile !== null && tile.resolved && assembled.walkable(x, y)) cells.push({ x, y })
    }
  }
  if (cells.length === 0) return []
  const random = createRandom(options.seed ^ Math.imul(level.id, 0x27d4eb2f))
  const out: GeneratedMonster[] = []
  const minDistance = options.minDistance ?? 6
  const taken = new Set<string>()
  for (let attempt = 0; attempt < count * 8 && out.length < count; attempt++) {
    const cell = cells[Math.floor(random() * cells.length)]
    const key = `${cell.x},${cell.y}`
    if (taken.has(key)) continue
    if (options.avoid && Math.hypot(options.avoid.x - cell.x, options.avoid.y - cell.y) < minDistance) continue
    taken.add(key)
    out.push({ name: classes[out.length % classes.length], x: cell.x, y: cell.y })
  }
  return out
}

/** Turns a {@link GeneratedMonster} into the placement `places.ts` would produce. */
export function monsterPlacement(monster: GeneratedMonster): Placement {
  const source: PlaceableRecord = {
    type: 1,
    id: 0,
    x: monster.x * DS1_SUBTILES_PER_TILE + 2,
    y: monster.y * DS1_SUBTILES_PER_TILE + 2,
    flags: 0,
  }
  return {
    kind: 'monster',
    source,
    tileX: monster.x,
    tileY: monster.y,
    name: monster.name,
    npc: false,
    hostile: true,
    known: true,
    object: null,
    superUnique: null,
    directive: null,
  }
}
