#!/usr/bin/env node
/**
 * Dumps a real Diablo II level, assembled from the retail tables and files.
 *
 * Prints the preset's summary — dimensions, tileset count, tile-index range,
 * walkable ratio, objects, unresolved references — and an ASCII minimap of the
 * walkable grid, so the assembly can be eyeballed without a renderer.
 *
 * Usage (from `examples/arpg`):
 *
 *   ../../node_modules/.bin/tsx tools/dump-level.mjs
 *   ../../node_modules/.bin/tsx tools/dump-level.mjs "Act 1 - Cave W" --level-type 3
 *   ../../node_modules/.bin/tsx tools/dump-level.mjs 1 --seed 7 --subtiles
 *   ../../node_modules/.bin/tsx tools/dump-level.mjs --list catacomb
 *
 * The tileset root defaults to `/tmp/d2r-all` (an extracted RomFS) and the
 * tables to `public/original/table_*.json`; both are overridable with
 * `--romfs` and `--tables`.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  configureLevels,
  findPreset,
  levelTablesFromJson,
  loadLevel,
} from '../src/d2/levels.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = resolve(HERE, '..')

function parseArgs(argv) {
  const out = { positional: [], flags: {} }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      out.positional.push(arg)
      continue
    }
    const name = arg.slice(2)
    const next = argv[i + 1]
    const takesValue = next !== undefined && !next.startsWith('--')
    if (takesValue) {
      out.flags[name] = next
      i++
    } else {
      out.flags[name] = true
    }
  }
  return out
}

const args = parseArgs(process.argv.slice(2))
const romfs = resolve(String(args.flags.romfs ?? '/tmp/d2r-all'))
const tablesDir = resolve(String(args.flags.tables ?? join(PACKAGE_ROOT, 'public/original')))
const seed = Number(args.flags.seed ?? 0)
const subtiles = args.flags.subtiles === true

function readTable(name) {
  const file = join(tablesDir, `table_${name}.json`)
  if (!existsSync(file)) {
    throw new Error(
      `missing ${file}: pass --tables <dir> pointing at a directory with table_lvlprest.json`
    )
  }
  return JSON.parse(readFileSync(file, 'utf8'))
}

const tables = levelTablesFromJson({
  lvlprest: readTable('lvlprest'),
  lvltypes: readTable('lvltypes'),
  levels: readTable('levels'),
})

if (args.flags.list) {
  const filter = typeof args.flags.list === 'string' ? args.flags.list.toLowerCase() : ''
  const rows = tables.presets.filter(
    (p) => !filter || p.name.toLowerCase().includes(filter)
  )
  console.log(`${rows.length} presets${filter ? ` matching "${filter}"` : ''}`)
  for (const p of rows.slice(0, 80)) {
    const type = tables.levels.find((l) => l.id === p.levelId)?.levelType ?? -1
    console.log(
      `  Def ${String(p.id).padStart(5)}  ${p.name.padEnd(34)} level=${String(p.levelId).padStart(4)} type=${String(type).padStart(3)} ` +
        `${p.sizeX}x${p.sizeY} mask=${p.dt1Mask} files=${p.files.length}`
    )
  }
  if (rows.length > 80) console.log(`  ... ${rows.length - 80} more`)
  process.exit(0)
}

const TILES_ROOT = join(romfs, 'global/tiles')

function tileFileFor(relativePath) {
  // The extracted tree lowercases logical paths; the tables keep the
  // authoring-time case, so try both before giving up.
  for (const candidate of [join(TILES_ROOT, relativePath), join(TILES_ROOT, relativePath.toLowerCase())]) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error(`no such tile file: ${relativePath} (looked under ${TILES_ROOT})`)
}

/** Every `.dt1` in the tree, in the tables' own path style (case-insensitive match). */
function listTiles() {
  const out = []
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name), `${prefix}${entry.name}/`)
      else if (entry.name.toLowerCase().endsWith('.dt1')) out.push(`${prefix}${entry.name}`)
    }
  }
  walk(TILES_ROOT, '')
  return out
}

const source = {
  tables: () => tables,
  readTiles(relativePath) {
    return readFileSync(tileFileFor(relativePath))
  },
  listTiles,
}
configureLevels(source)

const wanted = args.positional[0] ?? 'Act 1 - Town 1'
const asNumber = Number(wanted)
const preset = Number.isFinite(asNumber) && wanted.trim() !== ''
  ? tables.presets.find((p) => p.id === asNumber)
  : findPreset(tables, wanted)
if (!preset) {
  console.error(`no preset matches "${wanted}". Try --list <substring>.`)
  process.exit(1)
}

const options = {}
if (args.flags['level-type'] !== undefined) options.levelTypeId = Number(args.flags['level-type'])
if (args.flags.variant !== undefined) options.variantIndex = Number(args.flags.variant)

const level = loadLevel(preset.id, seed, source, options)
const s = level.stats
const walkable = s.walkableTiles
const ratio = ((100 * walkable) / Math.max(1, s.occupied)).toFixed(1)

console.log(`preset      ${level.presetName} (Def ${level.presetId})`)
console.log(`level       id ${level.levelId} -> level type ${level.levelTypeId}`)
console.log(`variant     ${level.variantIndex + 1}/${preset.files.length}  ${level.variantFile}`)
console.log(`grid        ${level.width} x ${level.height} tiles = ${level.width * 5} x ${level.height * 5} sub-tiles`)
console.log(`tables say  SizeX/SizeY ${preset.sizeX}x${preset.sizeY} (stored dims minus one), Dt1Mask ${preset.dt1Mask}`)
console.log(`tilesets    ${level.tilesets.length} named, ${s.tilesetsLoaded} loaded`)
for (const path of level.tilesets) {
  const mark = s.tilesetsUnreadable.includes(path) ? ' [unreadable]' : ''
  console.log(`              ${path}${mark}`)
}
console.log(`cells       ${s.occupied} occupied of ${s.cells}`)
console.log(`tile refs   ${s.tileRefs} (${s.resolved} resolved, ${s.unresolved} unresolved)`)
if (s.fallbackResolved) {
  console.log(
    `fallback    ${s.fallbackResolved} refs resolved outside the level type's list, from ${s.fallbackTilesets.join(', ')}`
  )
}
console.log(`main index  ${s.mainIndexRange[0]}..${s.mainIndexRange[1]}`)
console.log(`walkable    ${walkable} tiles, ${ratio}% of occupied; ${s.walkableSubtiles}/${s.walkableSubtiles + s.blockedSubtiles} sub-tiles free`)
console.log(`objects     ${level.objects.length}`)
const byType = new Map()
for (const o of level.objects) byType.set(o.type, (byType.get(o.type) ?? 0) + 1)
if (level.objects.length) {
  console.log(
    `              ${[...byType.entries()].sort().map(([t, n]) => `type ${t}: ${n}`).join(', ')}`
  )
  for (const o of level.objects.slice(0, 5)) {
    console.log(`              type ${o.type} id ${o.id} at tile (${o.tileX},${o.tileY}) sub-cell (${o.x},${o.y})`)
  }
  if (level.objects.length > 5) console.log(`              ... ${level.objects.length - 5} more`)
}

function minimap(legend) {
  const rows = []
  for (let y = 0; y < level.height; y++) {
    let row = ''
    for (let x = 0; x < level.width; x++) {
      const tile = level.tileAt(x, y)
      if (!tile) row += ' '
      else if (!tile.resolved) row += '?'
      else row += level.walkable(x, y) ? '.' : '#'
    }
    rows.push(row)
  }
  console.log(legend)
  console.log(`+${'-'.repeat(level.width)}+`)
  const label = (n) => String(n).padStart(2)
  for (let y = 0; y < rows.length; y++) console.log(`|${rows[y]}| ${label(y)}`)
  console.log(`+${'-'.repeat(level.width)}+`)
  const tens = Array.from({ length: level.width }, (_, x) => (x % 10 === 0 ? String(Math.floor(x / 10) % 10) : ' ')).join('')
  const ones = Array.from({ length: level.width }, (_, x) => String(x % 10)).join('')
  console.log(` ${tens}`)
  console.log(` ${ones}`)
}

console.log()
minimap('walkable grid at tile resolution, centre sub-cell of each tile:  . free   # blocked   ? unresolvable   (space) no tile')

if (subtiles) {
  console.log()
  console.log('walkable grid at sub-tile resolution (5 per tile), which is the resolution the game uses:')
  const rows = []
  for (let y = 0; y < level.height * 5; y++) {
    let row = ''
    for (let x = 0; x < level.width * 5; x++) row += level.walkableSubtile(x, y) ? '.' : '#'
    rows.push(row)
  }
  console.log(`+${'-'.repeat(level.width * 5)}+`)
  for (const row of rows) console.log(`|${row}|`)
  console.log(`+${'-'.repeat(level.width * 5)}+`)
}
