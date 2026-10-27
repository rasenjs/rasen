import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  configureLevels,
  findPreset,
  levelTablesFromJson,
  loadLevel,
  presetsForLevel,
  tilesetsForPreset,
  variantIndexFor,
  type Level,
  type LevelSource,
  type LevelTables,
} from '../levels'
import { parseDt1 } from '../dt1'
import { parseDs1 } from '@rasenjs/assets'

/**
 * Level assembly, run against the real tables and files.
 *
 * Every number asserted here was read from the retail data during this suite:
 * the room dimensions the tables imply, the walkable fraction the `.dt1` flags
 * produce, the object counts the `.ds1` lists. The suite also pins the two table
 * facts the assembly rule rests on — multi-file presets are variants of one room
 * of one size, and six legacy tilesets are named by no level type — because if
 * either stops holding, the rule has to change.
 *
 * Point `D2R_ROMFS` at another extracted RomFS to move the files; without one the
 * suite reports that it skipped.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = join(HERE, '..', '..', '..')
const TABLES_DIR = join(PACKAGE_ROOT, 'public', 'original')
const ROMFS = process.env.D2R_ROMFS ?? '/tmp/d2r-all'
/**
 * The tile tree to read.
 *
 * The extracted RomFS when it is there, otherwise the export this package ships
 * (`public/original/tiles`) — the same tree under the same names, so the suite
 * runs on the shipped corpus instead of skipping. That matters: eight of these
 * nine tests were skipping on a machine without a RomFS, which is most of them.
 */
const TILES_ROOT = [
  join(ROMFS, 'global', 'tiles'),
  join(PACKAGE_ROOT, 'public', 'original', 'tiles'),
].find((candidate) => existsSync(candidate)) ?? join(ROMFS, 'global', 'tiles')
/**
 * Whether the tree holds every act.
 *
 * The shipped export carries act 1 only, which is enough for the assembly tests
 * — they load act-1 areas — but two of them census every preset and every level
 * type in the tables, and those need the whole tree. Gating on this keeps those
 * two honest instead of failing on a file the export never promised.
 */
const HAS_ALL_ACTS = existsSync(join(TILES_ROOT, 'act2'))
const tablesFile = (name: string) => join(TABLES_DIR, `table_${name}.json`)
const hasCorpus =
  existsSync(TILES_ROOT) &&
  existsSync(tablesFile('lvlprest')) &&
  existsSync(tablesFile('lvltypes')) &&
  existsSync(tablesFile('levels'))

let tables: LevelTables
let source: LevelSource

function tileFileFor(relativePath: string): string {
  for (const candidate of [
    join(TILES_ROOT, relativePath),
    join(TILES_ROOT, relativePath.toLowerCase()),
  ]) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error(`no such tile file: ${relativePath}`)
}

function listTiles(): string[] {
  // Walk the tree rather than use a fixed list, so the fallback catalogue sees
  // every tileset the extraction actually has.
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

beforeAll(() => {
  if (!hasCorpus) return
  tables = levelTablesFromJson({
    lvlprest: JSON.parse(readFileSync(tablesFile('lvlprest'), 'utf8')),
    lvltypes: JSON.parse(readFileSync(tablesFile('lvltypes'), 'utf8')),
    levels: JSON.parse(readFileSync(tablesFile('levels'), 'utf8')),
  })
  source = {
    tables: () => tables,
    readTiles: (relativePath) => new Uint8Array(readFileSync(tileFileFor(relativePath))),
    listTiles,
  }
  configureLevels(source)
})

function ascii(level: Level): string {
  const lines: string[] = []
  for (let y = 0; y < level.height; y++) {
    let row = ''
    for (let x = 0; x < level.width; x++) {
      const tile = level.tileAt(x, y)
      if (!tile) row += ' '
      else if (!tile.resolved) row += '?'
      else row += level.walkable(x, y) ? '.' : '#'
    }
    lines.push(row)
  }
  return lines.join('\n')
}

/** Presets chosen so that five different level types are exercised. */
const PRESETS: Array<{ name: string; levelTypeId?: number; expectObjects: boolean }> = [
  { name: 'Act 1 - Town 1', expectObjects: true },
  { name: 'Act 1 - Cave W', levelTypeId: 3, expectObjects: true },
  { name: 'Act 1 - Jail W', levelTypeId: 8, expectObjects: false },
  { name: 'Act 1 - Catacombs Theme NSEW', levelTypeId: 10, expectObjects: true },
  { name: 'Act 1 - Crypt Theme W', levelTypeId: 4, expectObjects: true },
  { name: 'Act 1 - Graveyard', levelTypeId: 2, expectObjects: false },
]

describe.skipIf(!hasCorpus)('level assembly from the retail tables', () => {
  it('loads six real presets and reports what each one is', () => {
    const report: string[] = []
    for (const wanted of PRESETS) {
      const preset = findPreset(tables, wanted.name)
      expect(preset, `${wanted.name} exists in LvlPrest`).not.toBeNull()
      const level = loadLevel(preset!.id, 0, source, { levelTypeId: wanted.levelTypeId })

      expect(level.width).toBeGreaterThan(0)
      expect(level.height).toBeGreaterThan(0)
      expect(level.stats.occupied).toBeGreaterThan(0)
      expect(level.stats.tileRefs).toBe(level.stats.resolved + level.stats.unresolved)
      // Every tile in these presets resolves: what the level type's tileset list
      // misses, the whole-tree fallback finds.
      expect(level.stats.unresolved, `${wanted.name} unresolved refs`).toBe(0)
      expect(level.stats.tilesetsLoaded).toBeGreaterThan(0)
      expect(level.stats.mainIndexRange[0]).toBeGreaterThanOrEqual(0)
      expect(level.stats.mainIndexRange[1]).toBeLessThanOrEqual(63)
      expect(level.ds1.width).toBe(level.width)

      const occupied = level.stats.occupied
      const ratio = level.stats.walkableTiles / occupied
      expect(ratio).toBeGreaterThan(0)
      expect(ratio).toBeLessThanOrEqual(1)
      // Every preset has something that blocks, even the open ones: walls and
      // their sub-tile lines exist at sub-tile resolution regardless.
      expect(level.stats.blockedSubtiles).toBeGreaterThan(0)
      if (wanted.expectObjects) expect(level.objects.length).toBeGreaterThan(0)
      for (const object of level.objects) {
        expect(object.tileX).toBeGreaterThanOrEqual(0)
        expect(object.tileX).toBeLessThan(level.width)
        expect(object.tileY).toBeGreaterThanOrEqual(0)
        expect(object.tileY).toBeLessThan(level.height)
      }

      report.push(
        `${wanted.name} (Def ${preset!.id}, type ${level.levelTypeId}): ${level.width}x${level.height} tiles, ` +
          `${level.variantFile} (variant ${level.variantIndex + 1}/${preset!.files.length}), ` +
          `${level.tilesets.length} tilesets, ${occupied} occupied cells, ` +
          `main index ${level.stats.mainIndexRange[0]}..${level.stats.mainIndexRange[1]}, ` +
          `walkable ${(100 * ratio).toFixed(1)}% of occupied, ${level.objects.length} objects`
      )
    }
    // eslint-disable-next-line no-console -- the summaries are the deliverable
    console.log(`Preset summaries:\n  ${report.join('\n  ')}`)
  })

  it('prints the Rogue Encampment, whose walkable ground is one region', () => {
    const town = loadLevel(findPreset(tables, 'Act 1 - Town 1')!.id, 0, source)
    const map = ascii(town)
    // eslint-disable-next-line no-console -- the minimap is the visual evidence
    console.log(`Act 1 - Town 1, walkable at tile resolution:\n${map}`)
    expect(town.width).toBe(57)
    expect(town.height).toBe(41)
    expect(town.objects.length).toBeGreaterThan(30)

    // A pad of solid blank tiles surrounds the town on three sides — that pad is
    // what makes the flags legible, because if bit 0 did not mean "blocked" these
    // cells would be the ones reported as walkable.
    for (let y = 0; y < town.height; y++) {
      for (let x = 0; x < town.width; x++) {
        const inPad = x < 14 || x >= town.width - 11 || y >= 23
        if (inPad) expect(town.walkable(x, y), `pad cell ${x},${y}`).toBe(false)
      }
    }
    // The town is one place, not a scatter of islands: flood fill the walkable
    // tiles and expect a single component holding every one of them.
    const seen = new Set<number>()
    const components: number[] = []
    for (let y = 0; y < town.height; y++) {
      for (let x = 0; x < town.width; x++) {
        const start = y * town.width + x
        if (seen.has(start) || !town.walkable(x, y)) continue
        let size = 0
        const stack = [start]
        seen.add(start)
        while (stack.length) {
          const at = stack.pop()!
          size++
          const cx = at % town.width
          const cy = Math.floor(at / town.width)
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const nx = cx + dx
            const ny = cy + dy
            if (nx < 0 || ny < 0 || nx >= town.width || ny >= town.height) continue
            const next = ny * town.width + nx
            if (seen.has(next) || !town.walkable(nx, ny)) continue
            seen.add(next)
            stack.push(next)
          }
        }
        components.push(size)
      }
    }
    // eslint-disable-next-line no-console -- component count is the evidence
    console.log(`Town walkable tiles: ${town.stats.walkableTiles}, connected components: ${components.length}`)
    expect(components).toEqual([town.stats.walkableTiles])

    expect(town.walkable(0, 0)).toBe(false)
    expect(town.walkable(-1, 0)).toBe(false)
    expect(town.walkable(town.width, 0)).toBe(false)
    expect(town.walkableSubtile(-1, 0)).toBe(false)
    expect(town.walkableSubtile(town.width * 5, 0)).toBe(false)
  })

  it('accounts for every sub-tile, at the resolution the game collides at', () => {
    for (const wanted of PRESETS) {
      const preset = findPreset(tables, wanted.name)!
      const level = loadLevel(preset.id, 1, source, { levelTypeId: wanted.levelTypeId })
      const subTiles = level.width * level.height * 25
      expect(level.stats.walkableSubtiles + level.stats.blockedSubtiles).toBe(subTiles)
      // The sub-tile grid and the tile grid have to agree where it matters: a
      // tile is walkable exactly when its centre sub-tile is.
      let walkableTiles = 0
      let walkableCentres = 0
      for (let y = 0; y < level.height; y++) {
        for (let x = 0; x < level.width; x++) {
          if (!level.tileAt(x, y)) continue
          if (level.walkable(x, y)) walkableTiles++
          if (level.walkableSubtile(x * 5 + 2, y * 5 + 2)) walkableCentres++
        }
      }
      expect(walkableCentres).toBe(walkableTiles)
      expect(walkableTiles).toBe(level.stats.walkableTiles)
      // Flag bytes are reachable both ways round: the grid the caller reads and
      // the OR the cell stores.
      const flags = level.flagsAt(0, 0)
      if (flags) expect(flags.length).toBe(25)
      expect(level.flagsAt(-1, -1)).toBeNull()
      expect(level.tileAt(-1, -1)).toBeNull()
    }
  })

  it('picks a variant from the seed, reproducibly', () => {
    const town = findPreset(tables, 'Act 1 - Town 1')!
    expect(town.files.length).toBe(4)
    const first = loadLevel(town.id, 1234, source)
    const again = loadLevel(town.id, 1234, source)
    expect(again.variantFile).toBe(first.variantFile)
    expect(again.variantIndex).toBe(first.variantIndex)

    const variants = new Set<string>()
    for (let seed = 0; seed < 64; seed++) variants.add(loadLevel(town.id, seed, source).variantFile)
    // The four town variants are all reachable, and they are the same size:
    // which is what makes them variants rather than quadrants.
    expect(variants.size).toBe(4)
    const forced = loadLevel(town.id, 1234, source, { variantIndex: 2 })
    expect(forced.variantFile).toBe(town.files[2])
    expect(variantIndexFor(1, 7, 1)).toBe(0)
    expect(() => loadLevel(town.id, 0, source, { variantIndex: 9 })).toThrow(/out of range/)
  })

  it.skipIf(!HAS_ALL_ACTS)('rests on two facts about the tables, both re-measured here', () => {
    // Fact one: a preset's files are variants of one room, all the same size.
    const multi = tables.presets.filter((preset) => preset.files.length > 1)
    expect(multi.length).toBeGreaterThan(400)
    const differing = multi.filter((preset) => {
      const dims = new Set(
        preset.files.map((file) => {
          const ds1 = parseDs1(source.readTiles(file))
          return `${ds1.width}x${ds1.height}`
        })
      )
      return dims.size > 1
    })
    // eslint-disable-next-line no-console -- the census is the evidence
    console.log(
      `Multi-file presets: ${multi.length}, of which differently sized: ${differing.length}`
    )
    expect(differing).toEqual([])

    // Fact two: `SizeX`/`SizeY` are the stored dimensions minus one.
    const sized = tables.presets.filter((preset) => preset.sizeX > 0 && preset.sizeY > 0)
    expect(sized.length).toBeGreaterThan(300)
    const mismatched = sized.filter((preset) => {
      const ds1 = parseDs1(source.readTiles(preset.files[0]))
      return ds1.width !== preset.sizeX + 1 || ds1.height !== preset.sizeY + 1
    })
    // eslint-disable-next-line no-console -- the census is the evidence
    console.log(
      `Presets with a stated size: ${sized.length}, mismatching SizeX+1/SizeY+1: ${mismatched.length}` +
        (mismatched.length ? ` (e.g. ${mismatched[0].name})` : '')
    )
    expect(mismatched).toEqual([])
  })

  it('takes tilesets from the level type, through the preset mask', () => {
    const town = findPreset(tables, 'Act 1 - Town 1')!
    // The town's level type leaves `File 7` empty, and the preset mask clears
    // bit 6: the mask addresses columns, and the hole has to survive.
    const tilesets = tilesetsForPreset(tables, town)
    expect(tilesets).toEqual([
      'Act1/Town/Floor.dt1',
      'Act1/Town/Objects.dt1',
      'Act1/Town/Fence.dt1',
      'Act1/Outdoors/River.dt1',
      'Act1/Outdoors/stonewall.dt1',
      'Act1/Town/trees.dt1',
      'Act1/Outdoors/Objects.dt1',
      'Act1/Outdoors/TreeGroups.dt1',
      'Act1/Outdoors/Bridge.dt1',
    ])
    const level = loadLevel(town.id, 0, source)
    expect(level.tilesets).toEqual(tilesets)
    expect(level.stats.tilesetsUnreadable).toEqual([])

    // A generator room carries no level id, so its level type must be supplied.
    const room = findPreset(tables, 'Act 1 - Cave W')!
    expect(room.levelId).toBe(0)
    expect(tilesetsForPreset(tables, room)).toEqual([])
    const cave = loadLevel(room.id, 0, source, { levelTypeId: 3 })
    expect(cave.tilesets).toEqual(['Act1/Caves/Cave.dt1'])
    // The cave type names one tileset, which cannot supply the blank solid tile
    // the room is padded with; the fallback finds it.
    expect(cave.stats.fallbackResolved).toBeGreaterThan(0)
    expect(cave.stats.fallbackTilesets).toEqual(['act1/outdoors/blank.dt1'])
    // A cave room is mostly the blank padding a generated maze cuts through:
    // without the fallback's blank tile all of it would be an obstacle-free void.
    expect(cave.stats.blockedSubtiles).toBeGreaterThan(cave.stats.walkableSubtiles)
  })

  it.skipIf(!HAS_ALL_ACTS)('never needs a legacy 4/1 tileset: no level type names one', () => {
    const referenced = new Set(
      tables.levelTypes.flatMap((type) => type.files.filter(Boolean).map((f) => f.toLowerCase()))
    )
    const legacy = [
      'act1/court/court.dt1',
      'act1/barracks/barracks.dt1',
      'act1/barracks/gargtrap.dt1',
      'act1/catacomb/catacombs.dt1',
      'act1/cathedrl/cathedrl.dt1',
      'act1/outdoors/outdoor1.dt1',
    ]
    for (const path of legacy) {
      expect(existsSync(tileFileFor(path)), `${path} is in the extraction`).toBe(true)
      expect(parseDt1(source.readTiles(path)).layout).toBe('legacy-v4')
      expect(referenced.has(path), `${path} is named by a level type`).toBe(false)
    }
    // And every tileset a level type does name is readable, bar the legacy six,
    // which none of them names: 230 distinct files, all present in the tree.
    const missing = [...referenced].filter((path) => {
      try {
        const dt1 = parseDt1(source.readTiles(path))
        return dt1.layout !== 'v7'
      } catch {
        return true
      }
    })
    // eslint-disable-next-line no-console -- the census is the evidence
    console.log(`Level types name ${referenced.size} distinct tilesets; unreadable among them: ${missing.length}`)
    expect(missing).toEqual([])
  })

  it('denies a whole cell when the cell itself says it blocks walking', () => {
    // A `.ds1` cell carries its own walk bit (bit 17). The original stamps it over
    // the WHOLE 5x5 sub-cell block, whatever the tiles' own sub-tile flags say —
    // it marks the cells whose entry is special (stairs, doorways, arches), where
    // every sub-cell is denied even though the art leaves the middle clear.
    //
    // This code used to consult the bit only when no tile resolved, so such a cell
    // kept its art's flags and a walker could stand in a doorway the art draws as
    // solid. Checked here on a real level rather than a fixture: if the stamp ever
    // stops being applied, this fails on the first doorway it meets.
    const town = findPreset(tables, 'Act 1 - Town 1')!
    const level = loadLevel(town.id, 20261013, source)
    const layers = [...level.ds1.floors, ...level.ds1.walls]
    let seen = 0
    const offenders: string[] = []
    for (let y = 0; y < level.ds1.height; y += 1) {
      for (let x = 0; x < level.ds1.width; x += 1) {
        const i = y * level.ds1.width + x
        const marked = layers.some((layer) => {
          const raw = layer.cells[i] ?? 0
          // An empty cell (low byte zero) is not a cell at all.
          if ((raw & 0xff) === 0) return false
          return (raw & 0x20000) !== 0
        })
        if (!marked) continue
        seen += 1
        const flags = level.flagsAt(x, y)
        if (flags === null) continue
        const free = [...flags].filter((byte) => (byte & 0x01) === 0).length
        if (free > 0 && offenders.length < 5) offenders.push(`(${x},${y}) has ${free}/25 free`)
      }
    }
    // eslint-disable-next-line no-console -- the census is the evidence
    console.log(`Cells with the walk bit: ${seen}`)
    expect(seen).toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })

  it('finds levels through their presets, and fails loudly on nonsense', () => {
    // The two-argument form works because `configureLevels` registered a default
    // source; the same preset must come back either way.
    const town = findPreset(tables, 'Act 1 - Town 1')!
    const viaDefault = loadLevel(town.id, 5)
    const viaArgument = loadLevel(town.id, 5, source)
    expect(viaDefault.variantFile).toBe(viaArgument.variantFile)
    expect(viaDefault.width).toBe(viaArgument.width)

    // Only presets that name a level are reachable this way; the generator rooms
    // all carry `LevelId = 0` because the level they end up in is not decided
    // until the generator runs.
    expect(presetsForLevel(tables, 1).map((p) => p.name)).toContain('Act 1 - Town 1')
    expect(presetsForLevel(tables, 33).length).toBeGreaterThan(0)
    expect(tables.presets.filter((p) => p.levelId === 0).length).toBeGreaterThan(500)
    expect(() => loadLevel(-1, 0, source)).toThrow(/no preset with Def -1/)
    expect(() => loadLevel(1, 0, source, { variantIndex: -1 })).toThrow(/out of range/)
    expect(findPreset(tables, 'Not A Real Preset')).toBeNull()
  })
})

describe.skipIf(hasCorpus)('level assembly (skipped)', () => {
  it('reports that the corpus is absent', () => {
    // eslint-disable-next-line no-console -- says why nothing ran
    console.log(
      `No level corpus: need ${TILES_ROOT} and table_*.json in ${TABLES_DIR}. ` +
        'Set D2R_ROMFS to an extracted RomFS to run this suite.'
    )
    expect(hasCorpus).toBe(false)
  })
})
