/**
 * Decoding Diablo II `.ds1` preset maps.
 *
 * A `.ds1` is one rectangular piece of a level — Blizzard's own loader calls it
 * a *preset* — and it holds no pictures at all: a grid of references into the
 * `.dt1` tilesets, plus a list of monsters, objects and (for town presets)
 * NPC walking routes. Decoding one is the prerequisite for drawing a real
 * original map instead of an invented one.
 *
 * The format was documented for the modding community by Paul Siramy, whose
 * `ds1edit`/`win_ds1edit` shipped its source with every build. That prose is
 * the starting point here, but it is **not** the authority: the layout below
 * was re-derived from a retail D2R install's own 2 277 `.ds1` files by requiring
 * every file to parse to *exactly* its last byte. Where the two disagree, the
 * data wins, and the disagreements are called out inline.
 *
 * The observed layout, in order (conditional fields gated on `version`, all
 * little-endian dwords unless stated):
 *
 * | Field            | Gate          | Notes                                        |
 * |------------------|---------------|----------------------------------------------|
 * | `version`        | —             | 3/8/12/13/15/16/17/18 all ship in retail      |
 * | `width - 1`      | —             | **stored one short** (proved by the loader)   |
 * | `height - 1`     | —             | likewise                                      |
 * | `act`            | `v >= 8`      | 0-based; 51 retail files store 5 and rely on  |
 * |                  |               | the loader's clamp to 4                       |
 * | `tagType`        | `v >= 10`     | 0 = no tag layer and no group block; 1 or 2 = both |
 * | `fileCount`      | `v >= 3`      | then `fileCount` NUL-terminated tileset paths |
 * | 2 skipped dwords | `9 <= v <= 13`| never read by the game                        |
 * | `wallCount`      | `v >= 4`      | 0..4 in retail; each wall also has an orientation stream |
 * | `floorCount`     | `v >= 16`     | otherwise exactly 1                           |
 *
 * then the cell layers, then objects, groups (only when `tagType` is 1 or 2)
 * and NPC paths (from version 14).
 *
 * Two traps are worth stating before the code, because both silently corrupt a
 * decode instead of failing it:
 *
 * 1. **The dimensions are stored as `width - 1` / `height - 1`.** Reading them
 *    at face value shifts every layer by one tile and produces a picture that
 *    looks plausible and is wrong.
 * 2. **A wall layer is stored as *two* blocks** — the tiles, then a parallel
 *    stream of orientations, one byte each. The count in the file is the number
 *    of *pairs*, so a 2-wall file has six blocks of cells, not four.
 *
 * Nothing here is compressed, checksummed or aligned, and files in the wild do
 * stop mid-block (retail's `ACT1\OUTDOORS\trees.ds1` ends inside its group
 * block). A short read is therefore reported through `truncated` instead of
 * thrown, so a caller can still draw the part of the map that is intact.
 */

/** Diablo II measures object coordinates in sub-tiles: five per tile, per axis. */
export const DS1_SUBTILES_PER_TILE = 5

/**
 * Retail's widest preset is 101 x 103 tiles, and its largest wall/floor counts
 * are 4 and 2. These caps are not format rules — the game enforces no maximum —
 * they only stop a corrupt or mis-read count from allocating gigabytes before
 * anything can be validated. They sit far above real data.
 */
const MAX_DIMENSION = 1024
const MAX_LAYERS = 8

/** One decoded cell of one layer. */
export interface Ds1Cell {
  /** The dword exactly as stored. */
  raw: number
  /**
   * `prop1`, the low byte. The authoring tool's layer-type tag: bit 0 marks a
   * wall cell, bits 1 and 6 mark a floor cell. Zero means *no tile here* — in
   * retail data a zero low byte implies the whole dword is zero. The game's own
   * decoders never read it.
   */
  prop: number
  /**
   * `main_index = (raw >>> 20) & 0x3F`, the tile's index inside its `.dt1`
   * group. Six bits, not seven: bit 26 sits immediately above it and is *not*
   * part of the index.
   */
  mainIndex: number
  /** `prop2`, the sub-tile index within the `.dt1` group (0..63 in retail). */
  subIndex: number
  /**
   * Wall orientation, from the wall layer's parallel stream. Floors have no
   * stream — the loader supplies 0 — and shadows are implicitly 13. 10 and 11
   * are the odd ones out: they mark a cell that is *not* scenery (a warp or a
   * special tile) rather than a direction to draw in.
   */
  orientation: number
  /** Bit 31. Set on warp markers so their placeholder graphic never renders. */
  hidden: boolean
  /** Bit 17. */
  unwalkable: boolean
  /** Bit 27. Set on every shadow cell in retail data and on nothing else. */
  isShadow: boolean
}

/** A wall layer: its cells plus the orientation stream stored beside them. */
export interface Ds1WallLayer {
  /** 0-based wall index, in storage order. */
  index: number
  /** `width * height` dwords, row-major, x fastest. */
  cells: Uint32Array
  /** `width * height` orientations, one byte per cell, parallel to `cells`. */
  orientations: Uint8Array
}

/** A floor, shadow or tag layer. */
export interface Ds1Layer {
  kind: 'floor' | 'shadow' | 'tag'
  /** 0-based index within this kind (only floors can exceed 0). */
  index: number
  /** `width * height` dwords, row-major, x fastest. */
  cells: Uint32Array
}

/** A monster, NPC, object or item placed on the map. */
export interface Ds1Object {
  /** 1 = monster/NPC, 2 = object, 4 = item. Only 1 and 2 occur in retail. */
  type: number
  /**
   * Meaning depends on `type` and on the file's `act`: from version 5 a type-1
   * id indexes `monpreset.txt` for the act, and from version 6 a type-2 id
   * indexes a table of `Objects.txt` ids compiled into the game.
   */
  id: number
  /** Sub-tile x (`tile x * 5 + sub-cell x`). */
  x: number
  /** Sub-tile y. */
  y: number
  /** Flags dword (version 6+). 0 in all but 23 of retail's 17 779 objects. */
  flags: number
}

/** A named rectangle over the tag layer (version 12+, when `tagType` is 1 or 2). */
export interface Ds1Group {
  x: number
  y: number
  width: number
  height: number
  /** Fifth dword, version 13+. Non-zero in 101 of retail's 893 records. */
  unknown: number
}

/** One waypoint of an NPC's walking route. */
export interface Ds1PathPoint {
  x: number
  y: number
  /** Version 15+, defaulted to 1 below that. 1..5 in retail. */
  action: number
}

/**
 * One NPC route (version 14+). Retail keys these by the owning object's
 * sub-tile coordinate rather than by object index, so `x`/`y` are the anchor to
 * match against `Ds1Object`s.
 */
export interface Ds1Path {
  x: number
  y: number
  points: Ds1PathPoint[]
}

export interface Ds1File {
  /** File format version. Retail ships 3, 8, 12, 13, 15, 16, 17 and 18. */
  version: number
  /** Width in tiles (already `+ 1`-corrected from the stored `width - 1`). */
  width: number
  /** Height in tiles. */
  height: number
  /** 0-based act, or 0 for files older than version 8 which do not store one. */
  act: number
  /** 0 = neither tag layer nor group block; 1 or 2 = both. */
  tagType: number
  /**
   * The tileset paths the file names, in order. Kept because they are the best
   * hint about a preset's intended tilesets, but note the game reads them only
   * to skip past them: the engine loads tilesets from `LvlTypes.txt`, and the
   * extensions in this list (`.tg1`) name a format that does not ship.
   */
  tileFiles: string[]
  /** Wall layers, in storage order, each with its orientation stream. */
  walls: Ds1WallLayer[]
  /** Floor layers (0..2). */
  floors: Ds1Layer[]
  /** The shadow layer. Always present from version 4 (and in the v3 five-block order). */
  shadow: Ds1Layer | null
  /** The tag layer, present when `tagType` is 1 or 2 (and always below version 4). */
  tag: Ds1Layer | null
  objects: Ds1Object[]
  groups: Ds1Group[]
  paths: Ds1Path[]
  /** Byte offset just past the last field the parser read. */
  bytesRead: number
  /**
   * Bytes left over after the last block. Non-zero here is not automatically an
   * error — retail ships a trailing padding dword in some version 12 and 13
   * files — but a *large* value means the layout above did not match the file.
   */
  trailingBytes: number
  /** True when a block ran past the end of the buffer; the block is short. */
  truncated: boolean
}

/** Sequential little-endian reader that degrades to zero-padding at EOF. */
class Cursor {
  offset = 0
  truncated = false

  constructor(private readonly bytes: Uint8Array) {}

  private ensure(size: number): boolean {
    if (this.offset + size > this.bytes.length) {
      this.truncated = true
      this.offset = this.bytes.length
      return false
    }
    return true
  }

  u32(): number {
    if (!this.ensure(4)) return 0
    const at = this.offset
    this.offset += 4
    const b = this.bytes
    return (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0
  }

  i32(): number {
    if (!this.ensure(4)) return 0
    const at = this.offset
    this.offset += 4
    const b = this.bytes
    return b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)
  }

  skip(count: number): void {
    if (!this.ensure(count)) return
    this.offset += count
  }

  /** NUL-terminated string; an unterminated tail is taken whole and flagged. */
  cstring(): string {
    const start = this.offset
    let end = start
    while (end < this.bytes.length && this.bytes[end] !== 0) end++
    const text = latin1(this.bytes, start, end)
    if (end >= this.bytes.length) {
      this.truncated = true
      this.offset = this.bytes.length
    } else {
      this.offset = end + 1
    }
    return text
  }

  /**
   * `count` dwords as a typed array. A short read keeps the array at its full
   * declared length, zero-filling the missing tail, so that `y * width + x`
   * indexing stays valid for the tiles that did survive.
   */
  u32Array(count: number): Uint32Array {
    const out = new Uint32Array(count)
    for (let i = 0; i < count; i++) out[i] = this.u32()
    return out
  }

  /** `count` bytes as a typed array, with the same short-read behaviour. */
  u8Array(count: number): Uint8Array {
    const out = new Uint8Array(count)
    const available = Math.max(0, Math.min(count, this.bytes.length - this.offset))
    out.set(this.bytes.subarray(this.offset, this.offset + available))
    if (available < count) {
      this.truncated = true
      this.offset = this.bytes.length
    } else {
      this.offset += count
    }
    return out
  }
}

/** The decoder never depends on a text codec; tileset paths are plain ASCII. */
function latin1(bytes: Uint8Array, start: number, end: number): string {
  let out = ''
  for (let i = start; i < end; i++) out += String.fromCharCode(bytes[i])
  return out
}

/** Splits a stored cell into the pieces the game and a `.dt1` lookup need. */
export function decodeDs1Cell(raw: number, orientation = 0): Ds1Cell {
  return {
    raw,
    prop: raw & 0xff,
    mainIndex: (raw >>> 20) & 0x3f,
    subIndex: (raw >>> 8) & 0xff,
    orientation,
    hidden: (raw & 0x80000000) !== 0,
    unwalkable: (raw & 0x20000) !== 0,
    isShadow: (raw & 0x8000000) !== 0,
  }
}

/** A cell is empty exactly when its low byte is zero. */
export function ds1IsOccupied(cell: Ds1Cell): boolean {
  return cell.prop !== 0
}

/**
 * Decodes a whole wall layer into cells, pairing each with its orientation.
 * The raw arrays stay available on the layer for callers that would rather not
 * allocate an object per tile — a large preset is tens of thousands of cells.
 */
export function ds1WallGrid(layer: Ds1WallLayer): Ds1Cell[] {
  const out: Ds1Cell[] = new Array(layer.cells.length)
  for (let i = 0; i < layer.cells.length; i++) {
    out[i] = decodeDs1Cell(layer.cells[i], layer.orientations[i])
  }
  return out
}

/**
 * Decodes a floor/shadow/tag layer. Orientation is implicit and comes from the
 * loader's constants, not the file: 0 for floors and tags, 13 for shadows.
 */
export function ds1LayerGrid(layer: Ds1Layer): Ds1Cell[] {
  const orientation = layer.kind === 'shadow' ? 13 : 0
  const out: Ds1Cell[] = new Array(layer.cells.length)
  for (let i = 0; i < layer.cells.length; i++) {
    out[i] = decodeDs1Cell(layer.cells[i], orientation)
  }
  return out
}

/** Sub-tile coordinate of an object → its tile coordinate. */
export function ds1SubtileToTile(subtile: number): number {
  return Math.floor(subtile / DS1_SUBTILES_PER_TILE)
}

function readLayer(cursor: Cursor, kind: Ds1Layer['kind'], index: number, cells: number): Ds1Layer {
  return { kind, index, cells: cursor.u32Array(cells) }
}

function readWall(cursor: Cursor, index: number, cells: number): Ds1WallLayer {
  const raw = cursor.u32Array(cells)
  const stream = cursor.u32Array(cells)
  const orientations = new Uint8Array(cells)
  for (let i = 0; i < cells; i++) {
    // Only the low byte of an orientation record carries a direction; retail's
    // 1.4 million records never set the upper three.
    orientations[i] = (stream[i] & 0xff) as number
  }
  return { index, cells: raw, orientations }
}

function readObjectList(cursor: Cursor, version: number): Ds1Object[] {
  const count = cursor.i32()
  if (count <= 0) return []
  // Records are four dwords, or five from version 6 which adds the flags word.
  const recordSize = version >= 6 ? 20 : 16
  const out: Ds1Object[] = []
  for (let i = 0; i < count; i++) {
    const type = cursor.i32()
    const id = cursor.i32()
    const x = cursor.i32()
    const y = cursor.i32()
    const flags = recordSize === 20 ? cursor.i32() : 0
    out.push({ type, id, x, y, flags })
  }
  return out
}

function readGroups(cursor: Cursor, version: number): Ds1Group[] {
  // Version 18 adds one dword of padding before the count.
  if (version >= 18) cursor.i32()
  const count = cursor.i32()
  if (count <= 0) return []
  const recordSize = version >= 13 ? 20 : 16
  const out: Ds1Group[] = []
  for (let i = 0; i < count; i++) {
    const x = cursor.i32()
    const y = cursor.i32()
    const width = cursor.i32()
    const height = cursor.i32()
    const unknown = recordSize === 20 ? cursor.i32() : 0
    out.push({ x, y, width, height, unknown })
  }
  return out
}

function readPaths(cursor: Cursor, version: number): Ds1Path[] {
  const count = cursor.i32()
  if (count <= 0) return []
  const out: Ds1Path[] = []
  for (let i = 0; i < count; i++) {
    const points = cursor.i32()
    const x = cursor.i32()
    const y = cursor.i32()
    const list: Ds1PathPoint[] = []
    for (let p = 0; p < Math.max(0, points); p++) {
      const px = cursor.i32()
      const py = cursor.i32()
      const action = version >= 15 ? cursor.i32() : 1
      list.push({ x: px, y: py, action })
    }
    out.push({ x, y, points: list })
  }
  return out
}

/**
 * Parses a `.ds1` file.
 *
 * @param bytes The file's bytes. `ArrayBuffer` is *not* accepted: a view may be
 *   a window into a larger buffer, and re-deriving one here would silently
 *   shift every offset.
 * @returns The decoded preset, plus `bytesRead` / `trailingBytes` so a caller
 *   can tell whether the whole file was accounted for.
 * @throws If the version is below 2 (no such file ships) or a size/count field
 *   is outside the sanity caps, since those mean the bytes are not a `.ds1` at
 *   all rather than a preset this decoder does not understand.
 * @example
 * ```ts
 * const map = parseDs1(new Uint8Array(await file.arrayBuffer()))
 * for (const cell of ds1WallGrid(map.walls[0])) {
 *   if (ds1IsOccupied(cell)) drawTile(cell.orientation, cell.mainIndex, cell.subIndex)
 * }
 * ```
 */
export function parseDs1(bytes: Uint8Array): Ds1File {
  const cursor = new Cursor(bytes)

  const version = cursor.i32()
  if (version < 2) {
    throw new Error(`ds1: version ${version} has no object block and never shipped`)
  }

  const width = cursor.i32() + 1
  const height = cursor.i32() + 1
  if (width < 1 || width > MAX_DIMENSION || height < 1 || height > MAX_DIMENSION) {
    throw new Error(`ds1: implausible dimensions ${width}x${height}`)
  }
  const cells = width * height

  const act = version >= 8 ? cursor.i32() : 0
  const tagType = version >= 10 ? cursor.i32() : 0

  const tileFiles: string[] = []
  if (version >= 3) {
    const fileCount = cursor.i32()
    for (let i = 0; i < Math.max(0, fileCount); i++) tileFiles.push(cursor.cstring())
  }

  // Two dwords survive only in versions 9..13. Nothing reads them; measured
  // against a retail corpus they hold file offsets from a build tool, which is
  // why they are skipped rather than exposed.
  if (version >= 9 && version <= 13) cursor.skip(8)

  // Below version 4 the counts do not exist: the game takes exactly five blocks
  // in a *different* order (wall, floor, orientation, tag, shadow) and forces
  // the wall count to 1.
  const wallCount = version >= 4 ? cursor.i32() : 1
  const floorCount = version >= 16 ? cursor.i32() : 1
  if (
    wallCount < 0 ||
    wallCount > MAX_LAYERS ||
    floorCount < 0 ||
    floorCount > MAX_LAYERS
  ) {
    throw new Error(`ds1: implausible layer counts ${wallCount} walls / ${floorCount} floors`)
  }

  const walls: Ds1WallLayer[] = []
  const floors: Ds1Layer[] = []
  let shadow: Ds1Layer | null = null
  let tag: Ds1Layer | null = null

  if (version <= 3) {
    // The five-block order: wall 1, floor 1, orientation 1, tag, shadow.
    const wall = cursor.u32Array(cells)
    const orientations = new Uint8Array(cells)
    const floor = readLayer(cursor, 'floor', 0, cells)
    const stream = cursor.u32Array(cells)
    for (let i = 0; i < cells; i++) orientations[i] = (stream[i] & 0xff) as number
    walls.push({ index: 0, cells: wall, orientations })
    floors.push(floor)
    tag = readLayer(cursor, 'tag', 0, cells)
    shadow = readLayer(cursor, 'shadow', 0, cells)
  } else {
    for (let i = 0; i < wallCount; i++) walls.push(readWall(cursor, i, cells))
    for (let i = 0; i < floorCount; i++) floors.push(readLayer(cursor, 'floor', i, cells))
    // The shadow layer exists from version 4 on and is never counted in the file.
    shadow = readLayer(cursor, 'shadow', 0, cells)
    if (tagType === 1 || tagType === 2) tag = readLayer(cursor, 'tag', 0, cells)
  }

  const objects = readObjectList(cursor, version)
  const groups = tagType === 1 || tagType === 2 ? readGroups(cursor, version) : []
  const paths = version >= 14 ? readPaths(cursor, version) : []

  return {
    version,
    width,
    height,
    act,
    tagType,
    tileFiles,
    walls,
    floors,
    shadow,
    tag,
    objects,
    groups,
    paths,
    bytesRead: cursor.offset,
    trailingBytes: bytes.length - cursor.offset,
    truncated: cursor.truncated,
  }
}
