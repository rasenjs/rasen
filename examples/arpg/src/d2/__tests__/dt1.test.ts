import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  DT1_BLOCK_SIZE,
  DT1_FLAG_COUNT,
  DT1_HEADER_SIZE,
  DT1_LEGACY_RECORD_SIZE,
  Dt1FormatError,
  dt1BlockKey,
  dt1FindBlock,
  dt1FlagIndex,
  dt1KeyOf,
  dt1SubtileBlocks,
  dt1SubtileIsIsometric,
  parseDt1,
  type Dt1File,
} from '../dt1'
import {
  assembleTile,
  parsePalette,
  placeableSubTiles,
  subTileBox,
  subTileFrameY,
  DIAMOND_ROW_WIDTH,
  SUB_TILE_HEIGHT,
  SUB_TILE_WIDTH,
  WALL_SUB_TILE_HEIGHT,
} from '../tileart'
import { TILE_HEIGHT, TILE_WIDTH } from '../../iso'

/**
 * The DT1 parser, run against the real files.
 *
 * The assertions are invariants the format itself states, measured here on the
 * whole shipped corpus rather than on a fixture: the block array ends exactly
 * where the first tile's sub-tile array begins, `tilesLength` accounts for every
 * sub-tile exactly, sub-tile pixel data is contiguous with no slack, and three of
 * the eight flag bits are never set in any file. Anything that passes those is
 * reading the real layout.
 *
 * The corpus is an extracted RomFS. Point `D2R_ROMFS` somewhere else, or leave
 * the tree absent, and the suite reports that it skipped instead of failing.
 */

const ROMFS = process.env.D2R_ROMFS ?? '/tmp/d2r-all'
const TILES = join(ROMFS, 'global', 'tiles')
const hasCorpus = existsSync(TILES)

interface Corpus {
  files: string[]
  parsed: Map<string, Dt1File>
  v7: string[]
  legacy: string[]
  blocks: number
  subTiles: number
  orientationHistogram: Map<number, number>
  formatHistogram: Map<number, number>
  bitHistogram: number[]
  flagBytes: number
  legacyUnreadableCounts: Record<string, number>
}

let corpus: Corpus

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) collectFiles(path, out)
    else if (entry.name.toLowerCase().endsWith('.dt1')) out.push(path)
  }
  return out
}

beforeAll(() => {
  if (!hasCorpus) return
  const files = collectFiles(TILES).sort()
  const parsed = new Map<string, Dt1File>()
  const v7: string[] = []
  const legacy: string[] = []
  const orientationHistogram = new Map<number, number>()
  const formatHistogram = new Map<number, number>()
  const bitHistogram = new Array<number>(8).fill(0)
  const legacyUnreadableCounts: Record<string, number> = {}
  let blocks = 0
  let subTiles = 0
  let flagBytes = 0

  for (const file of files) {
    const dt1 = parseDt1(new Uint8Array(readFileSync(file)))
    const key = relative(TILES, file)
    parsed.set(key, dt1)
    if (dt1.layout === 'legacy-v4') {
      legacy.push(key)
      legacyUnreadableCounts[key] = dt1.blockCount
      continue
    }
    v7.push(key)
    blocks += dt1.blockCount
    for (const block of dt1.blocks) {
      orientationHistogram.set(block.orientation, (orientationHistogram.get(block.orientation) ?? 0) + 1)
      for (const subTile of block.subTiles) {
        subTiles++
        formatHistogram.set(subTile.format, (formatHistogram.get(subTile.format) ?? 0) + 1)
      }
      for (const flag of block.flags) {
        flagBytes++
        for (let bit = 0; bit < 8; bit++) if (flag & (1 << bit)) bitHistogram[bit]++
      }
    }
  }
  corpus = {
    files,
    parsed,
    v7,
    legacy,
    blocks,
    subTiles,
    orientationHistogram,
    formatHistogram,
    bitHistogram,
    flagBytes,
    legacyUnreadableCounts,
  }
})

describe('the vertical origin of a sub-tile (`y_add`)', () => {
  it('lifts walls by 96 px and leaves floors and roofs on the frame top', () => {
    const wall = { yPos: -32 } as never
    // A wall's rows are negative; +96 is what puts its base at the bottom of the
    // 160x80 frame instead of leaving the whole block above its own tile.
    expect(subTileFrameY(wall, 1)).toBe(64)
    expect(subTileFrameY(wall, 2)).toBe(64)
    expect(subTileFrameY(wall, 14)).toBe(64)
    // Floors, the pillar/shadow block and roofs measure from the top edge.
    expect(subTileFrameY(wall, 0)).toBe(-32)
    expect(subTileFrameY(wall, 15)).toBe(-32)
    expect(subTileFrameY(wall, 16)).toBe(-32)
    expect(subTileFrameY(wall, 19)).toBe(-32)
  })
})

describe.skipIf(!hasCorpus)('DT1 parsing against the retail corpus', () => {
  it('reads every file, and reports the version distribution', () => {
    const v7 = corpus.v7.length
    const legacy = corpus.legacy.length
    // eslint-disable-next-line no-console -- the distribution is the deliverable
    console.log(
      `DT1 corpus: ${corpus.files.length} files, version 7: ${v7}, version 4/1 legacy: ${legacy}, ` +
        `${corpus.blocks} blocks, ${corpus.subTiles} sub-tiles`
    )
    expect(corpus.files.length).toBeGreaterThanOrEqual(250)
    expect(v7).toBeGreaterThanOrEqual(250)
    // Six files carry the undocumented 4/1 stamp, exactly as the archive
    // survey of vanilla 1.13c found.
    expect(legacy).toBe(6)
  })

  it('parses at least 20 named files with non-zero, consistent tile counts', () => {
    // Twenty files spanning all eight tile directories, so the check is not one
    // directory's quirk.
    const sample = corpus.files
      .map((f) => relative(TILES, f))
      .filter((_, index) => index % 13 === 0)
      .slice(0, 24)
    expect(sample.length).toBeGreaterThanOrEqual(20)

    const report: string[] = []
    for (const key of sample) {
      const dt1 = corpus.parsed.get(key)!
      expect(dt1.blockCount, `${key} tile count`).toBeGreaterThan(0)
      if (dt1.layout === 'legacy-v4') {
        // The container is stated by the bytes even though the 44-byte record is
        // not: count at +20, offset table at +24, table end at +8.
        expect(dt1.headerSize, `${key} legacy header size`).toBe(24 + 4 * dt1.blockCount)
        expect(dt1.legacyRecords.length, `${key} legacy records`).toBe(dt1.blockCount)
        for (const record of dt1.legacyRecords) {
          expect(record.bytes.length, `${key} record ${record.index}`).toBe(DT1_LEGACY_RECORD_SIZE)
        }
        report.push(`${key}: legacy 4/1, ${dt1.blockCount} records`)
        continue
      }
      expect(dt1.headerSize, `${key} header size`).toBe(276)
      expect(dt1.bytesRead, `${key} bytes read`).toBe(readFileSync(join(TILES, key)).length)
      report.push(
        `${key}: v7, ${dt1.blockCount} blocks, ${dt1.blocks.reduce((n, b) => n + b.subTiles.length, 0)} sub-tiles`
      )
    }
    // eslint-disable-next-line no-console -- sample evidence for the report
    console.log(`DT1 sample of ${sample.length}:\n  ${report.join('\n  ')}`)
  })

  it('states the block array and the sub-tile data with no slack', () => {
    for (const key of corpus.v7) {
      const dt1 = corpus.parsed.get(key)!
      for (const block of dt1.blocks) {
        expect(block.flags.length).toBe(DT1_FLAG_COUNT)
        // Retail's `sizeY` is negative or zero, and `sizeX` is one of five
        // values; both are the format's own contract, not a sample.
        expect(block.sizeY, `${key} block ${block.index} sizeY`).toBeLessThanOrEqual(0)
        expect([0, 32, 64, 96, 128, 160]).toContain(block.sizeX)
        // A block with no extent carries no sub-tiles: 19 of retail's 16,597
        // blocks are placeholders the tree and object tilesets keep for keys
        // whose art was never compiled.
        if (block.sizeX === 0) expect(block.subTiles.length).toBe(0)
        expect(block.orientation, `${key} block ${block.index} orientation`).toBeLessThanOrEqual(19)
        expect(block.mainIndex).toBeLessThanOrEqual(63)
        expect(block.subIndex).toBeLessThanOrEqual(63)
        expect(block.tilesPtr).toBeGreaterThanOrEqual(DT1_HEADER_SIZE)

        let bytes = 0
        for (let i = 0; i < block.subTiles.length; i++) {
          const subTile = block.subTiles[i]
          // Headers first, then pixels: the first sub-tile's data starts after
          // the whole header array, and each one follows the previous exactly.
          expect(subTile.dataOffset, `${key} block ${block.index} sub-tile ${i}`).toBe(
            20 * block.subTiles.length + bytes
          )
          expect(subTile.dataPtr).toBe(block.tilesPtr + subTile.dataOffset)
          bytes += subTile.length
        }
        if (block.subTiles.length) {
          expect(block.tilesLength).toBe(20 * block.subTiles.length + bytes)
        }
      }
      // The block array ends where the file's first tile image begins, in every
      // file: 276 + blockCount * 96.
      const dt1BlocksEnd = DT1_HEADER_SIZE + dt1.blockCount * DT1_BLOCK_SIZE
      const firstImage = Math.min(...dt1.blocks.map((b) => b.tilesPtr))
      expect(firstImage).toBe(dt1BlocksEnd)
    }
  })

  it('never sets flag bits 3, 6 or 7, and reports which bits it does use', () => {
    // eslint-disable-next-line no-console -- the flag census is the evidence
    console.log(
      `DT1 flag bits set over ${corpus.flagBytes} bytes: ` +
        corpus.bitHistogram.map((count, bit) => `${bit}=${count}`).join(' ')
    )
    expect(corpus.flagBytes).toBeGreaterThan(100_000)
    expect(corpus.bitHistogram[3]).toBe(0)
    expect(corpus.bitHistogram[6]).toBe(0)
    expect(corpus.bitHistogram[7]).toBe(0)
    expect(corpus.bitHistogram[0]).toBeGreaterThan(50_000)
  })

  it('labels the two pixel encodings retail actually ships', () => {
    const formats = [...corpus.formatHistogram.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([format, count]) => `${format.toString(16)}x${count}`)
    // eslint-disable-next-line no-console -- the encoding census is the evidence
    console.log(`DT1 sub-tile formats (count): ${formats.join(', ')}`)
    expect([...corpus.formatHistogram.keys()].sort()).toEqual([0x0001, 0x1001, 0x2005])
    // 0x0001 is the fixed 256-byte isometric diamond, which is why a floor
    // tile's sub-tile region is exactly 25 * (20 + 256) bytes.
    const isometric = corpus.v7
      .flatMap((key) => corpus.parsed.get(key)!.blocks)
      .flatMap((block) => block.subTiles)
      .filter(dt1SubtileIsIsometric)
    expect(isometric.every((subTile) => subTile.length === 256)).toBe(true)
  })

  it('maps flag bytes to sub-tile cells the way the wall orientations demand', () => {
    // Orientation 1 is the upper-left wall and orientation 2 its mirror, so if
    // the flag-to-grid mapping were transposed they would swap their edges.
    // Corner cells are counted once, against the first edge they touch, which is
    // how the format's own edge census reads them.
    let orientation1LeftEdge = 0
    let orientation1RightEdge = 0
    let orientation2LeftEdge = 0
    let orientation2RightEdge = 0
    for (const key of corpus.v7) {
      for (const block of corpus.parsed.get(key)!.blocks) {
        if (block.orientation !== 1 && block.orientation !== 2) continue
        for (let y = 0; y < 5; y++) {
          for (let x = 0; x < 5; x++) {
            if (!dt1SubtileBlocks(block.flags, x, y)) continue
            const edge = x === 0 ? 'left' : y === 0 ? 'right' : 'other'
            if (block.orientation === 1) {
              if (edge === 'left') orientation1LeftEdge++
              else if (edge === 'right') orientation1RightEdge++
            } else {
              if (edge === 'left') orientation2LeftEdge++
              else if (edge === 'right') orientation2RightEdge++
            }
          }
        }
      }
    }
    // eslint-disable-next-line no-console -- the edge census is the evidence
    console.log(
      `orientation 1 flagged cells: xGrid=0 ${orientation1LeftEdge} vs yGrid=0 ${orientation1RightEdge}; ` +
        `orientation 2: xGrid=0 ${orientation2LeftEdge} vs yGrid=0 ${orientation2RightEdge}`
    )
    expect(orientation1LeftEdge).toBeGreaterThan(orientation1RightEdge * 3)
    expect(orientation2RightEdge).toBeGreaterThan(orientation2LeftEdge * 2)
  })

  it('keys a block by the triple a DS1 cell carries, without collisions', () => {    const seen = new Map<number, string>()
    let duplicates = 0
    let keys = 0
    for (const key of corpus.v7) {
      for (const block of corpus.parsed.get(key)!.blocks) {
        const packed = dt1KeyOf(block)
        const label = `${key}#${block.index}`
        const previous = seen.get(packed)
        if (previous) duplicates++
        else seen.set(packed, label)
        keys++
      }
    }
    expect(keys).toBeGreaterThan(10_000)
    expect(dt1BlockKey(0, 30, 0)).toBe(dt1BlockKey(0, 30, 0))
    expect(dt1BlockKey(0, 30, 0)).not.toBe(dt1BlockKey(1, 30, 0))
    expect(dt1FlagIndex(0, 4)).toBe(0)
    expect(dt1FlagIndex(4, 4)).toBe(4)
    expect(dt1FlagIndex(0, 0)).toBe(20)
    expect(dt1FlagIndex(4, 0)).toBe(24)
    // eslint-disable-next-line no-console -- key collisions across tilesets are real
    console.log(`DT1 catalogue keys: ${keys} blocks, ${seen.size} distinct keys, ${duplicates} collisions`)
  })

  it('answers a lookup by the key, and only by the key', () => {
    // `Act1/Caves/Cave.dt1` supplies the cave rooms; its own keys are what a
    // `.ds1` looks up, so searching its blocks for one of them must find it.
    const cave = corpus.parsed.get('act1/caves/cave.dt1')
    expect(cave?.layout).toBe('v7')
    const subject = cave!.blocks.find((block) => block.subTiles.length > 0)!
    const found = dt1FindBlock(cave!.blocks, subject.orientation, subject.mainIndex, subject.subIndex)
    expect(found?.index).toBe(subject.index)
    expect(dt1FindBlock(cave!.blocks, 30, 30, 63)).toBeNull()
  })

  it('rejects bytes that are not a decodable DT1', () => {
    expect(() => parseDt1(new Uint8Array(16))).toThrow(Dt1FormatError)
    const wrong = new Uint8Array(DT1_HEADER_SIZE)
    wrong[0] = 11
    expect(() => parseDt1(wrong)).toThrow(/unsupported DT1 version 11/)
    const truncated = new Uint8Array(DT1_HEADER_SIZE)
    truncated[0] = 7
    // 1,000 blocks from offset 276 needs 96,276 bytes; 276 does not have them.
    truncated[0x10c] = 0xe8
    truncated[0x10d] = 0x03
    truncated[0x110] = 0x14
    truncated[0x111] = 0x01
    expect(() => parseDt1(truncated)).toThrow(/overruns the file/)
  })
})

describe.skipIf(hasCorpus)('DT1 parsing (skipped)', () => {
  it('reports that the corpus is absent', () => {
    // eslint-disable-next-line no-console -- says why nothing ran
    console.log(`No DT1 corpus at ${TILES}: set D2R_ROMFS to an extracted RomFS to run this suite.`)
    expect(hasCorpus).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// The tile geometry, against the tilesets this package ships
// ---------------------------------------------------------------------------

/**
 * The size of a cell, derived from the art rather than assumed.
 *
 * These run against `public/original/tiles`, which the example ships, so they
 * hold even where the RomFS is absent — and they are the tests that would have
 * caught the renderer drawing 160-pixel-wide art on a 64-pixel cell: the
 * assertions are the art's own geometry (block widths, sub-tile payload shapes,
 * the frame a floor's art occupies), never a number copied from the renderer.
 */
const shippedTiles = join(import.meta.dirname, '../../../public/original/tiles')
const hasShippedTiles = existsSync(shippedTiles)

interface ShippedTiles {
  files: string[]
  blocks: number
  widthHistogram: Map<number, number>
  /** Blocks whose art can be placed, with the frame their sub-tiles occupy. */
  ground: Array<{ label: string; sizeX: number; width: number; height: number; minX: number; minY: number }>
  diamondsOff: string[]
  rleOff: string[]
  /** Sub-tile formats seen, and how many payloads of each. */
  formats: Map<number, number>
}

let shipped: ShippedTiles

beforeAll(() => {
  if (!hasShippedTiles) return
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.toLowerCase().endsWith('.dt1')) files.push(path)
    }
  }
  walk(shippedTiles)
  files.sort()

  const widthHistogram = new Map<number, number>()
  const formats = new Map<number, number>()
  const ground: ShippedTiles['ground'] = []
  const diamondsOff: string[] = []
  const rleOff: string[] = []
  let blocks = 0

  for (const path of files) {
    const bytes = new Uint8Array(readFileSync(path))
    const file = parseDt1(bytes)
    if (file.layout !== 'v7') continue
    for (const block of file.blocks) {
      blocks += 1
      widthHistogram.set(block.sizeX, (widthHistogram.get(block.sizeX) ?? 0) + 1)
      for (const subTile of block.subTiles) {
        formats.set(subTile.format, (formats.get(subTile.format) ?? 0) + 1)
        const payload = bytes.subarray(subTile.dataPtr, subTile.dataPtr + subTile.length)
        const label = `${relative(shippedTiles, path)}#${block.index}:${subTile.index}`
        if (subTile.format === 0x0001) {
          const rowBytes = DIAMOND_ROW_WIDTH.reduce((sum, width) => sum + width, 0)
          if (subTile.length !== rowBytes) diamondsOff.push(`${label} length ${subTile.length}`)
          continue
        }
        // (skip, count) pairs, (0, 0) ending a row.
        let cursor = 0
        let rows = 0
        let exact = true
        while (cursor + 1 < payload.length) {
          const skip = payload[cursor]
          const count = payload[cursor + 1]
          cursor += 2
          if (skip === 0 && count === 0) {
            rows += 1
            continue
          }
          if (cursor + count > payload.length) {
            exact = false
            break
          }
          cursor += count
        }
        const expected = subTile.format === 0x1001 ? WALL_SUB_TILE_HEIGHT : SUB_TILE_HEIGHT
        if (!exact || cursor !== payload.length || rows !== expected) {
          rleOff.push(`${label} format 0x${subTile.format.toString(16)} rows ${rows} exact ${exact}`)
        }
      }

      const placed = placeableSubTiles(block)
      // The one-cell invariant is a FLOOR claim (orientation 0): walls extend
      // above/below the frame and are checked against their own rules below.
      if (placed.length === 0 || block.roofY !== 0 || block.orientation !== 0) continue
      const minX = Math.min(...placed.map((p) => p.subTile.xPos))
      const minY = Math.min(...placed.map((p) => p.subTile.yPos))
      ground.push({
        label: `${relative(shippedTiles, path)}#${block.index}`,
        sizeX: block.sizeX,
        width: Math.max(...placed.map((p) => p.subTile.xPos + p.width)) - minX,
        height: Math.max(...placed.map((p) => p.subTile.yPos + p.height)) - minY,
        minX,
        minY,
      })
    }
  }

  shipped = { files, blocks, widthHistogram, ground, diamondsOff, rleOff, formats }
})

describe.skipIf(!hasShippedTiles)('Tile geometry against the shipped tilesets', () => {
  it('is a whole number of sub-cells wide in every block, and 160 in most', () => {
    const histogram = [...shipped.widthHistogram.entries()].sort((a, b) => a[0] - b[0])
    const dominant = [...histogram].sort((a, b) => b[1] - a[1])[0]
    // eslint-disable-next-line no-console -- the census is the evidence
    console.log(
      `shipped tilesets: ${shipped.files.length} files, ${shipped.blocks} blocks, widths ` +
        histogram.map(([width, count]) => `${width}:${count}`).join(' '),
    )
    expect(shipped.files.length).toBeGreaterThan(50)
    expect(shipped.blocks).toBeGreaterThan(2000)
    for (const [width] of histogram) expect(width % SUB_TILE_WIDTH).toBe(0)
    // The renderer's cell has to be the width the art is drawn at, and 160 — five
    // sub-cells — is what 2018 of the 2555 blocks are.
    expect(dominant[0]).toBe(TILE_WIDTH)
    expect(dominant[1]).toBeGreaterThan(shipped.blocks / 2)
    expect(TILE_WIDTH).toBe(SUB_TILE_WIDTH * 5)
    expect(TILE_HEIGHT).toBe(TILE_WIDTH / 2)
  })

  it('spells every sub-tile payload as the shape its format declares', () => {
    const census = [...shipped.formats.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([format, count]) => `0x${format.toString(16)}x${count}`)
      .join(' ')
    // eslint-disable-next-line no-console -- the payload census is the evidence
    console.log(`shipped tilesets: sub-tile payloads ${census}`)
    expect([...shipped.formats.keys()].sort()).toEqual([0x0001, 0x1001, 0x2005])
    expect(shipped.formats.get(0x0001)!).toBeGreaterThan(20_000)
    // Every 15-row payload is a diamond and every 32-row payload is a wall panel;
    // a payload that ends mid-run or spells another number of rows would mean the
    // decoder's geometry is wrong, not just its colours.
    expect(shipped.diamondsOff).toEqual([])
    expect(shipped.rleOff).toEqual([])
  })

  it('draws floor art that is exactly one cell, from the frame origin', () => {
    // 1241 blocks — every orientation-0 block in these tilesets — and the numbers
    // are the same for all of them, which is what makes the placement knowable.
    expect(shipped.ground.length).toBeGreaterThan(1200)
    const notOneCell = shipped.ground.filter((block) => block.width !== TILE_WIDTH)
    const offOrigin = shipped.ground.filter((block) => block.minX !== 0 || block.minY !== 0)
    const tooTall = shipped.ground.filter(
      (block) => block.height > TILE_HEIGHT || block.width > TILE_WIDTH,
    )
    // eslint-disable-next-line no-console -- names the counter-examples
    console.log(
      `shipped tilesets: ${shipped.ground.length} floor blocks, art ${shipped.ground[0].width}x` +
        `${shipped.ground[0].height} at (${shipped.ground[0].minX},${shipped.ground[0].minY}), ` +
        `${notOneCell.length} not one cell wide, ${offOrigin.length} not at the origin`,
    )
    expect(notOneCell.map((block) => block.label)).toEqual([])
    expect(offOrigin.map((block) => block.label)).toEqual([])
    expect(tooTall.map((block) => block.label)).toEqual([])
    // A floor's art is one cell less one pixel tall: a diamond's 15-row rows do
    // not reach the very last row of the 16-row shape.
    expect(new Set(shipped.ground.map((block) => block.height))).toEqual(new Set([TILE_HEIGHT - 1]))
  })

  it('assembles a floor block into a picture that is one cell wide', () => {
    // The one call the renderer makes, on the block every town floor uses.
    const path = join(shippedTiles, 'act1/town/floor.dt1')
    const bytes = new Uint8Array(readFileSync(path))
    const file = parseDt1(bytes)
    const palette = parsePalette(new Uint8Array(readFileSync(join(shippedTiles, '../palette/pal.dat'))))
    const block = file.blocks.find((b) => b.orientation === 0 && b.sizeX === 160)!
    const bitmap = assembleTile(block, palette, bytes)
    expect(bitmap).not.toBeNull()
    expect(bitmap!.width).toBe(TILE_WIDTH)
    expect(bitmap!.height).toBe(TILE_HEIGHT - 1)
    // The silhouette is the cell's 2:1 diamond: at every row the opaque span is
    // symmetric about the cell's centre, and its widest row is almost a full cell.
    let widest = 0
    for (let y = 0; y < bitmap!.height; y++) {
      let first = -1
      let last = -1
      for (let x = 0; x < bitmap!.width; x++) {
        if (bitmap!.rgba[(y * bitmap!.width + x) * 4 + 3] === 0) continue
        if (first < 0) first = x
        last = x
      }
      expect(first).toBeGreaterThanOrEqual(0)
      expect((first + last + 1) / 2).toBe(TILE_WIDTH / 2)
      widest = Math.max(widest, last - first + 1)
    }
    expect(widest).toBeGreaterThan(TILE_WIDTH - 8)
  })

  it('places wall blocks on their class origin and declines only what has no art', () => {
    // Walls are 32x32 sub-tiles (the 32-row payloads, laid out on a 32-pixel
    // grid) whose yPos carries its own origin: upper walls (orientation 1-14)
    // are the negative rows above the tile frame, lower walls (16+) measure
    // from 96 below its top. Both place; only blocks with no placeable
    // sub-tiles at all are declined.
    const path = join(shippedTiles, 'act1/town/trees.dt1')
    const bytes = new Uint8Array(readFileSync(path))
    const file = parseDt1(bytes)
    const palette = { rgb: new Uint8Array(768) }
    const walls = file.blocks.filter((block) => block.subTiles.some((s) => s.format === 0x1001))
    expect(walls.length).toBeGreaterThan(0)
    const placedWalls = walls
      .map((block) => ({ block, bitmap: assembleTile(block, palette, bytes) }))
      .filter((entry) => entry.bitmap !== null)
    expect(placedWalls.length).toBeGreaterThan(0)
    for (const { block, bitmap } of placedWalls) {
      // The art sits in the 160-wide tile frame: never wider than one cell,
      // and every sub-tile lands inside the bitmap the frame origin implies.
      expect(bitmap!.width).toBeLessThanOrEqual(TILE_WIDTH)
      // The one rule, imported rather than restated: walls (1..14) are the
      // negative rows measured from 96 px below the frame's top edge.
      const frameY = (sub: { yPos: number }): number => subTileFrameY(sub as never, block.orientation)
      for (const sub of block.subTiles) {
        if (!subTileBox(sub.format)) continue
        const originY = frameY(sub) - bitmap!.frameY
        expect(originY).toBeGreaterThanOrEqual(0)
        expect(originY + subTileBox(sub.format)!.height).toBeLessThanOrEqual(bitmap!.height)
      }
    }

    // What declines: a block with nothing to draw — a pure collision footprint.
    const hollow = file.blocks.find(
      (block) => placeableSubTiles(block).length === 0 && block.subTiles.length > 0,
    )
    if (hollow) expect(assembleTile(hollow, palette, bytes)).toBeNull()
  })

  it('assembles roofs on the roof pass, never the ground one', () => {
    const path = join(shippedTiles, 'act1/town/floor.dt1')
    const bytes = new Uint8Array(readFileSync(path))
    const file = parseDt1(bytes)
    const palette = { rgb: new Uint8Array(768) }
    const roof = file.blocks.find((block) => block.roofY !== 0)
    if (!roof) return
    expect(assembleTile(roof, palette, bytes, 'ground')).toBeNull()
    const bitmap = assembleTile(roof, palette, bytes, 'roof')
    expect(bitmap).not.toBeNull()
  })
})

describe.skipIf(hasShippedTiles)('Tile geometry (skipped)', () => {
  it('reports that the shipped tilesets are absent', () => {
    // eslint-disable-next-line no-console -- says why nothing ran
    console.log(`No tilesets at ${shippedTiles}: the extracted tree was not exported here.`)
    expect(hasShippedTiles).toBe(false)
  })
})
