/**
 * Decoding Diablo II `.dt1` tile definitions.
 *
 * A `.dt1` is the *catalogue* a `.ds1` refers into. The `.ds1` says "orientation
 * 1, main index 3, sub 0"; the `.dt1` answers with a picture and with the tile's
 * contribution to the world's collision grid. Nothing in a `.ds1` describes what
 * a tile looks like, and nothing in a `.dt1` knows where it will be placed.
 *
 * ## The layout, as observed in the retail RomFS
 *
 * Read from `global/tiles/act1/court/court.dt1` (the one legacy file) and from
 * the 260 conforming files beside it, and cross-checked against the int32s on
 * disk. Every offset below is a real offset:
 *
 * ```
 * 0x000  u32   version                    7 in 260 files, 4 in the other 6
 * 0x004  u32   flags                      reads 6; not a version minor
 * 0x008  260   filename buffer            zero on disk; the loader writes the path in
 * 0x10C  u32   blockCount                 = tile count
 * 0x110  u32   blockHeaderOffset          always 276
 * 0x114  ...   blockHeaderOffset + blockCount * 96
 * ```
 *
 * | block offset | size | field |
 * |---|---|---|
 * | `+0` | 4 | `direction` — coarse class, derivable from `orientation` |
 * | `+4` | 2 | `roofY` — unsigned screen-Y correction for roof tiles |
 * | `+6` | 1 | `sound` — footstep material |
 * | `+7` | 1 | `animated` |
 * | `+8` | 4 | `sizeY` — always negative or zero |
 * | `+12` | 4 | `sizeX` — 32/64/96/128/160 |
 * | `+16` | 4 | reserved, never written |
 * | `+20` | 4 | `orientation` — the tile's geometric role, 0..19 |
 * | `+24` | 4 | `mainIndex` |
 * | `+28` | 4 | `subIndex` |
 * | `+32` | 4 | `rarity` — selection weight between equal-key blocks |
 * | `+36` | 4 | per-file constant, `0x00FF00FF` in most files |
 * | `+40` | 25 | sub-tile flags, 5x5 — the collision/light grid |
 * | `+65` | 7 | reserved, zero on disk |
 * | `+72` | 4 | `tilesPtr` — absolute file offset of this tile's sub-tile array |
 * | `+76` | 4 | `tilesLength` — 20 * sub-tile count + pixel bytes |
 * | `+80` | 4 | `tilesNumber` — number of sub-tiles |
 * | `+84` | 12 | three runtime pointer slots, zero on disk |
 *
 * The sub-tile headers that `tilesPtr` points at are 20 bytes each and are the
 * file's own reference into the tile image — `dataOffset` is relative to
 * `tilesPtr`, not to the file:
 *
 * | sub-tile offset | size | field |
 * |---|---|---|
 * | `+0` | 2 | `xPos` — pixel column of the sub-tile's 32-pixel box |
 * | `+2` | 2 | `yPos` — pixel row of that box; signed, so art may sit above the frame |
 * | `+6` | 1 | `xGrid` = i % 5 |
 * | `+7` | 1 | `yGrid` = i / 5 |
 * | `+8` | 2 | `format` — bitfield; `1` = isometric |
 * | `+10` | 2 | `length` — pixel bytes (16-bit, not 32) |
 * | `+16` | 4 | `dataOffset`, relative to `tilesPtr` |
 *
 * ## What this file does *not* give the renderer
 *
 * The pictures in these files are the **legacy** palette sub-tiles, one 32-pixel
 * wide slice of the tile each (`format == 1` is exactly 256 bytes of
 * diamond-shaped indices; the others are two RLE encodings of the same two
 * shapes, 15 rows for a diamond and 32 for a wall). A conforming floor tile is 25
 * such sub-tiles, which is why `tilesLength` is a constant 6900 for the 5x5 floor
 * tiles of `act1/court/floor.dt1`: 25 * 20 header bytes + 25 * 256 pixel bytes.
 * The high-resolution art Diablo II: Resurrected actually draws is a separate
 * texture resource, and **no field in a `.dt1` refers to it** — so a caller that
 * wants original-looking ground uses the extracted terrain textures, while a
 * caller that wants *placement and collision* uses this file's sub-tile
 * geometry. The `(orientation, mainIndex, subIndex)` triple is the only link
 * between the two halves of the map.
 *
 * The sub-tile positions are what fixes the size of a cell: the 25 sub-tiles of a
 * floor block sit on a lattice of 16 pixels in x and 8 in y, one per cell of the
 * block's 5x5 flag grid, so the block covers five sub-cells of 32x16 — 160x80 in
 * all. `tools/verify-world.ts` checks that against every block of every tileset.
 *
 * ## The six files that are not this format
 *
 * Six files under `global/tiles/act1/` (`court.dt1`, `barracks.dt1`,
 * `gargtrap.dt1`, `catacombs.dt1`, `cathedrl.dt1`, `outdoor1.dt1`) start with
 * `04 00 00 00 01 00 00 00`. Their container is legible — a count at `+20`, a
 * table of that many 32-bit offsets at `+24`, and the table's end at `+8` — and
 * their records are a fixed 44 bytes each, the last of which ends exactly at
 * end-of-file. The 44-byte record's *fields* are not documented anywhere,
 * including in the community's reconstruction of Siramy's DT1 page, which lists
 * these same six files as unreadable. They are detected and reported here rather
 * than guessed at, and the guess would be inert anyway: no `LvlTypes` row names
 * any of the six, so no level in the game ever loads one.
 */

/** Fixed v7 header size, and the value the header stores for it. */
export const DT1_HEADER_SIZE = 276
/** Stride of the v7 block-header array. */
export const DT1_BLOCK_SIZE = 96
/** Stride of a block's sub-tile header array. */
export const DT1_SUBTILE_HEADER_SIZE = 20
/** Side of the block's sub-tile flag grid: 5x5, one byte of flags each. */
export const DT1_FLAG_GRID = 5
/** Flag bytes per block. */
export const DT1_FLAG_COUNT = DT1_FLAG_GRID * DT1_FLAG_GRID
/** The only block version every retail level tileset uses. */
export const DT1_VERSION = 7
/** The version stamp of the six legacy files. */
export const DT1_LEGACY_VERSION = 4
/** Size of the legacy files' opaque record. */
export const DT1_LEGACY_RECORD_SIZE = 44

/**
 * One sub-tile: a fragment of one tile's picture, plus where it sits.
 *
 * Retail only ever emits three formats, and each is a 32-pixel wide slice of the
 * tile: `0x0001` (isometric diamond, always exactly 256 bytes), `0x1001` (RLE, 32
 * rows — wall sub-tiles) and `0x2005` (RLE, 15 rows — the same diamond as
 * `0x0001`, compressed). `tileart.ts` carries the pixel geometry each one paints.
 */
export interface Dt1SubTile {
  /** Index within the block's sub-tile array. */
  index: number
  /** Pixel column inside the tile's bounding box. */
  xPos: number
  /** Pixel row inside the tile's bounding box. */
  yPos: number
  /** Column in the 5x5 flag grid. */
  xGrid: number
  /** Row in the 5x5 flag grid, counted from the tile's top corner. */
  yGrid: number
  /** The encoding bitfield. `1` means the fixed 256-byte isometric diamond. */
  format: number
  /** Bytes of pixel data. */
  length: number
  /** Offset of the pixel data, relative to the block's `tilesPtr`. */
  dataOffset: number
  /** Absolute offset of the pixel data within the `.dt1`. */
  dataPtr: number
}

/** One tile in the catalogue: a picture, a key, and a collision footprint. */
export interface Dt1Block {
  /** Position in the file's block array; stable, and what a dump prints. */
  index: number
  /** Coarse class. Every orientation maps to exactly one direction in retail. */
  direction: number
  /**
   * Unsigned vertical screen correction for roof tiles.
   *
   * Measured over the shipped tilesets: non-zero on the 83 blocks of orientation
   * 15 (roofs) and zero everywhere else, including every floor block. All 83 read
   * exactly 80, one cell's height. It is the field that separates a roof block
   * from a floor block, which is how `tileart.ts` decides what may go on the
   * ground layer.
   */
  roofY: number
  /** Footstep-sound material index. */
  sound: number
  /** Non-zero for an animated floor tile. */
  animated: boolean
  /** Height of the tile's bounding box. Always negative or zero. */
  sizeY: number
  /** Width of the tile's bounding box: 32, 64, 96, 128 or 160. */
  sizeX: number
  /** The tile's geometric role, 0..19 — the first half of the DS1 lookup key. */
  orientation: number
  /** The tile's index inside its tileset group — the second half of the key. */
  mainIndex: number
  /** The sub-tile index within the group — the third half of the key. */
  subIndex: number
  /**
   * Selection weight among blocks sharing one key. Not a frame number: the game
   * accumulates it and subtracts a random draw from the total.
   */
  rarity: number
  /**
   * 25 collision bytes, one per sub-tile. Indexed `xGrid + (4 - yGrid) * 5`:
   * the rows are stored bottom-to-top, which is how the game's own
   * `COLL_CopyTemplateToGrid` walks them, starting at byte 20 and stepping
   * backwards five at a time.
   */
  flags: Uint8Array
  /** The picture: sub-tile headers in storage order, then the pixels they point at. */
  subTiles: Dt1SubTile[]
  /** Absolute offset of the sub-tile array. */
  tilesPtr: number
  /** `20 * subTiles.length` plus every sub-tile's pixel bytes. */
  tilesLength: number
  /** Number of sub-tiles, as stored. */
  tilesNumber: number
}

/** A legacy 44-byte record, kept verbatim because its fields are undocumented. */
export interface Dt1LegacyRecord {
  index: number
  offset: number
  bytes: Uint8Array
}

/**
 * A parsed `.dt1`.
 *
 * `layout` is the honest answer to "which format is this": `'v7'` for every file
 * a level can load, `'legacy-v4'` for the six that no level loads.
 */
export interface Dt1File {
  version: number
  layout: 'v7' | 'legacy-v4'
  /** Tiles in the catalogue. */
  blockCount: number
  blocks: Dt1Block[]
  /** Populated only for `layout === 'legacy-v4'`. */
  legacyRecords: Dt1LegacyRecord[]
  /** Bytes of the header the layout implies, for callers checking consistency. */
  headerSize: number
  /** Whole bytes read: the file length for a well-formed file. */
  bytesRead: number
}

/** Thrown when the bytes are not a `.dt1` this parser recognises. */
export class Dt1FormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'Dt1FormatError'
  }
}

function u16(bytes: Uint8Array, at: number): number {
  return bytes[at] | (bytes[at + 1] << 8)
}

function u32(bytes: Uint8Array, at: number): number {
  return (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
}

function i32(bytes: Uint8Array, at: number): number {
  return u32(bytes, at) | 0
}

/**
 * Flag byte index for a sub-tile grid cell.
 *
 * The array is stored with its rows bottom-to-top, so the cell at the tile's
 * *top* corner (grid 0,0) lives at byte 20 and the bottom corner (4,4) at byte 4.
 * Verified against the collision loop, which starts at byte 20 and walks
 * backwards, and against the wall orientations: orientation 1's flagged cells
 * land on `xGrid === 0` in 5,619 of its 5,619 flagged blocks.
 */
export function dt1FlagIndex(xGrid: number, yGrid: number): number {
  return xGrid + (DT1_FLAG_GRID - 1 - yGrid) * DT1_FLAG_GRID
}

/**
 * The packed lookup key a `.ds1` cell resolves against.
 *
 * `orientation` is 5 bits in retail (0..19), `mainIndex` 6 and `subIndex` 6, so
 * one 32-bit key holds all three without collisions.
 */
export function dt1BlockKey(orientation: number, mainIndex: number, subIndex: number): number {
  return (((orientation & 0x1f) << 12) | ((mainIndex & 0x3f) << 6) | (subIndex & 0x3f)) >>> 0
}

/** Convenience: the key of a parsed block. */
export function dt1KeyOf(block: Dt1Block): number {
  return dt1BlockKey(block.orientation, block.mainIndex, block.subIndex)
}

/**
 * Should this sub-tile stop a walker?
 *
 * Bit 0 of a sub-tile flag byte is the game's walkability bit: the collision
 * grid stores flags rather than booleans precisely so that consumers can test
 * different bits, and every consumer that matters for movement tests the one
 * the game's own pathing uses. Measured against the retail data, the cells that
 * carry it are the cells a tile actually stands on — see
 * `src/d2/__tests__/dt1.test.ts`, which reports the correlation against the
 * presets' own unwalkable bit rather than asserting a convention.
 *
 * Bits beyond bit 0 are not distinguished here: no traced code path names them.
 */
export function dt1SubtileBlocks(flags: Uint8Array, xGrid: number, yGrid: number): boolean {
  return (flags[dt1FlagIndex(xGrid, yGrid)] & 0x01) !== 0
}

/** True when the sub-tile's pixels use the fixed 256-byte isometric diamond. */
export function dt1SubtileIsIsometric(subTile: Dt1SubTile): boolean {
  return subTile.format === 0x0001
}

function parseSubTiles(bytes: Uint8Array, tilesPtr: number, count: number): Dt1SubTile[] {
  const out: Dt1SubTile[] = []
  for (let i = 0; i < count; i++) {
    const at = tilesPtr + i * DT1_SUBTILE_HEADER_SIZE
    const dataOffset = u32(bytes, at + 16)
    out.push({
      index: i,
      xPos: u16(bytes, at),
      // Signed: a sub-tile may sit above its tile's origin, and 0xFFFF means -1.
      yPos: (u16(bytes, at + 2) << 16) >> 16,
      xGrid: bytes[at + 6],
      yGrid: bytes[at + 7],
      format: u16(bytes, at + 8),
      length: u16(bytes, at + 10),
      dataOffset,
      dataPtr: tilesPtr + dataOffset,
    })
  }
  return out
}

function parseBlock(bytes: Uint8Array, index: number, at: number): Dt1Block {
  const tilesPtr = u32(bytes, at + 72)
  const tilesNumber = u32(bytes, at + 80)
  return {
    index,
    direction: u32(bytes, at),
    roofY: u16(bytes, at + 4),
    sound: bytes[at + 6],
    animated: bytes[at + 7] !== 0,
    sizeY: i32(bytes, at + 8),
    sizeX: u32(bytes, at + 12),
    orientation: u32(bytes, at + 20),
    mainIndex: u32(bytes, at + 24),
    subIndex: u32(bytes, at + 28),
    rarity: u32(bytes, at + 32),
    flags: bytes.slice(at + 40, at + 40 + DT1_FLAG_COUNT),
    subTiles: parseSubTiles(bytes, tilesPtr, tilesNumber),
    tilesPtr,
    tilesLength: u32(bytes, at + 76),
    tilesNumber,
  }
}

/**
 * Parses a legacy `4/1` file's container.
 *
 * Only the parts that are actually stated by the bytes are decoded: the count,
 * the offset table, and the records it points at. The record's eleven dwords are
 * exposed verbatim. Reading fields out of it would be invention: the layout is
 * undocumented, and these files are unreachable from any level.
 */
function parseLegacy(bytes: Uint8Array): Dt1File {
  const blockCount = u32(bytes, 20)
  const headerSize = u32(bytes, 8)
  const records: Dt1LegacyRecord[] = []
  for (let i = 0; i < blockCount; i++) {
    const offset = u32(bytes, 24 + i * 4)
    if (offset + DT1_LEGACY_RECORD_SIZE > bytes.length) {
      throw new Dt1FormatError(
        `legacy DT1 record ${i} at ${offset} runs past the end of a ${bytes.length}-byte file`
      )
    }
    records.push({ index: i, offset, bytes: bytes.slice(offset, offset + DT1_LEGACY_RECORD_SIZE) })
  }
  return {
    version: DT1_LEGACY_VERSION,
    layout: 'legacy-v4',
    blockCount,
    blocks: [],
    legacyRecords: records,
    headerSize,
    bytesRead: bytes.length,
  }
}

/**
 * Parses a `.dt1`.
 *
 * @param bytes The file's bytes, exactly as stored.
 * @returns The catalogue, its layout, and every field the format states.
 * @throws {Dt1FormatError} If the bytes are too short, or the version is neither
 *   the decodable 7 nor the detected legacy 4. Loud failure is deliberate: a
 *   silently mis-read tile catalogue would put wrong tiles on a real map.
 */
export function parseDt1(bytes: Uint8Array): Dt1File {
  if (bytes.length < DT1_HEADER_SIZE) {
    throw new Dt1FormatError(`not a DT1: ${bytes.length} bytes is shorter than the 276-byte header`)
  }
  const version = u32(bytes, 0)
  if (version === DT1_LEGACY_VERSION) return parseLegacy(bytes)
  if (version !== DT1_VERSION) {
    throw new Dt1FormatError(`unsupported DT1 version ${version}: only ${DT1_VERSION} is decodable`)
  }

  const blockCount = u32(bytes, 0x10c)
  const blockHeaderOffset = u32(bytes, 0x110)
  const end = blockHeaderOffset + blockCount * DT1_BLOCK_SIZE
  if (end > bytes.length) {
    throw new Dt1FormatError(
      `DT1 block array overruns the file: ${blockCount} blocks from ${blockHeaderOffset} need ${end} bytes of ${bytes.length}`
    )
  }

  const blocks: Dt1Block[] = []
  for (let i = 0; i < blockCount; i++) {
    blocks.push(parseBlock(bytes, i, blockHeaderOffset + i * DT1_BLOCK_SIZE))
  }
  return {
    version,
    layout: 'v7',
    blockCount,
    blocks,
    legacyRecords: [],
    headerSize: blockHeaderOffset,
    bytesRead: bytes.length,
  }
}

/**
 * The first block matching a DS1 cell's key, or `null`.
 *
 * Retail does not stop at the first match: equal keys from different tilesets
 * are alternatives, and `SelectRandomTileVariant` picks among them by `rarity`.
 * Taking the first is a deliberate choice — pack order matches the `LvlTypes`
 * order the level's tileset list is read in, so a given level always resolves
 * the same way — and `LevelTile` records how many blocks shared the key, so a
 * caller can see the alternatives it did not take.
 */
export function dt1FindBlock(
  blocks: readonly Dt1Block[],
  orientation: number,
  mainIndex: number,
  subIndex: number
): Dt1Block | null {
  const key = dt1BlockKey(orientation, mainIndex, subIndex)
  for (const block of blocks) if (dt1KeyOf(block) === key) return block
  return null
}
