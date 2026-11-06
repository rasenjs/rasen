#!/usr/bin/env node
/**
 * Print a summary of one or more `.ds1` preset maps.
 *
 * Usage
 * -----
 *   ds1-summary.ts <file.ds1|dir> [...] [--top n]
 *
 * A directory argument is walked for `*.ds1`. Files are read straight from the
 * filesystem, so this is meant for an *extracted* RomFS (`/tmp/d2r-all/hd/...`)
 * rather than the packaged archives — the RomFS reader in `src/original/romfs`
 * is what the browser path uses.
 *
 * The point of this tool is to make a decode *falsifiable* at a glance: it
 * prints where each block ended, how many bytes the layout did not account for,
 * and whether the file's own counts came up short. A decoder that is subtly
 * misaligned still produces a map that looks plausible, so those numbers — not
 * the tile counts — are the ones to read first.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import {
  ds1IsOccupied,
  ds1LayerGrid,
  ds1WallGrid,
  parseDs1,
  type Ds1File,
} from '@rasenjs/assets'

/**
 * Act names as the game's own files label them; the field itself is 0-based.
 * Retail stores 5 in a handful of files, which the loader clamps to 4.
 */
const ACT_NAMES = ['Act 1', 'Act 2', 'Act 3', 'Act 4', 'Act 5']

interface Options {
  paths: string[]
  top: number
}

function parseArgs(argv: string[]): Options {
  const paths: string[] = []
  let top = 6
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--top') {
      top = Number(argv[++i])
      continue
    }
    paths.push(arg)
  }
  return { paths, top }
}

function collectDs1(target: string): string[] {
  const stat = statSync(target)
  if (!stat.isDirectory()) return [target]
  const out: string[] = []
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    const full = join(target, entry.name)
    if (entry.isDirectory()) out.push(...collectDs1(full))
    else if (entry.name.toLowerCase().endsWith('.ds1')) out.push(full)
  }
  return out
}

function histogram(values: (string | number)[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const value of values) out.set(String(value), (out.get(String(value)) ?? 0) + 1)
  return out
}

function formatHistogram(counts: Map<string, number>, top: number): string {
  const sorted = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const shown = sorted.slice(0, top).map(([key, count]) => `${key}x${count}`)
  const hidden = sorted.length - shown.length
  return shown.join(' ') + (hidden > 0 ? ` (+${hidden} more distinct)` : '')
}

function summarize(file: string, options: Options): void {
  const bytes = new Uint8Array(readFileSync(file))
  let map: Ds1File
  try {
    map = parseDs1(bytes)
  } catch (error) {
    console.log(`${file}\n  FAILED: ${(error as Error).message}`)
    return
  }

  const cells = map.width * map.height
  const act = map.act < ACT_NAMES.length ? `${map.act} (${ACT_NAMES[map.act]})` : `${map.act} (out of range)`

  console.log(file)
  console.log(
    `  version ${map.version}   size ${bytes.length}B   act ${act}   tagType ${map.tagType}`,
  )
  console.log(`  dimensions ${map.width} x ${map.height} tiles (${cells} cells)`)
  console.log(
    `  layers: ${map.walls.length} wall, ${map.floors.length} floor, shadow=${map.shadow ? 'y' : 'n'}, tag=${map.tag ? 'y' : 'n'}`,
  )
  console.log(`  tilesets named: ${map.tileFiles.length}`)
  for (const [i, name] of map.tileFiles.entries()) console.log(`    [${i}] ${name}`)

  // Tile counts, per layer, of *occupied* cells. `prop === 0` is how both the
  // game and this decoder decide a cell holds nothing.
  let occupied = 0
  const perLayer: string[] = []
  for (const wall of map.walls) {
    const grid = ds1WallGrid(wall)
    const live = grid.filter(ds1IsOccupied)
    occupied += live.length
    perLayer.push(
      `wall${wall.index}=${live.length} ids[${formatHistogram(
        histogram(live.map((c) => `${c.orientation}/${c.mainIndex}/${c.subIndex}`)),
        options.top,
      )}]`,
    )
  }
  for (const layer of map.floors) {
    const live = ds1LayerGrid(layer).filter(ds1IsOccupied)
    occupied += live.length
    perLayer.push(
      `floor${layer.index}=${live.length} ids[${formatHistogram(
        histogram(live.map((c) => `${c.mainIndex}/${c.subIndex}`)),
        options.top,
      )}]`,
    )
  }
  if (map.shadow) {
    const live = ds1LayerGrid(map.shadow).filter(ds1IsOccupied)
    occupied += live.length
    perLayer.push(`shadow=${live.length}`)
  }
  if (map.tag) {
    const live = ds1LayerGrid(map.tag).filter(ds1IsOccupied)
    occupied += live.length
    perLayer.push(
      `tag=${live.length} ids[${formatHistogram(
        histogram(live.map((c) => c.raw)),
        options.top,
      )}]`,
    )
  }
  const slots =
    map.walls.length * 2 + map.floors.length + (map.shadow ? 1 : 0) + (map.tag ? 1 : 0)
  console.log(
    `  tiles: ${occupied} occupied cell(s), ${slots} layer(s) x ${cells} cells`,
  )
  for (const line of perLayer) console.log(`    ${line}`)

  const objectTypes = histogram(map.objects.map((o) => o.type))
  const objectFlags = histogram(map.objects.map((o) => o.flags))
  console.log(
    `  objects: ${map.objects.length} types[${map.objects.length ? formatHistogram(objectTypes, 8) : ''}] flags[${map.objects.length ? formatHistogram(objectFlags, 8) : ''}]`,
  )
  if (map.objects.length) {
    const sample = map.objects
      .slice(0, 3)
      .map((o) => `type ${o.type} id ${o.id} @ (${o.x},${o.y}) tile (${Math.floor(o.x / 5)},${Math.floor(o.y / 5)})`)
    console.log(`    e.g. ${sample.join(' | ')}`)
  }

  const points = map.paths.reduce((sum, p) => sum + p.points.length, 0)
  console.log(`  groups: ${map.groups.length}   npc paths: ${map.paths.length} (${points} points)`)

  // The accounting line. A decode that leaves nothing over is the only cheap
  // proof that every offset above was read from the right byte.
  const verdict = map.truncated
    ? 'TRUNCATED'
    : map.trailingBytes === 0
      ? 'exact'
      : `${map.trailingBytes}B unaccounted`
  console.log(
    `  bytes: consumed ${map.bytesRead}/${bytes.length} -> ${verdict}` +
      (map.trailingBytes > 0 && map.trailingBytes <= 4 && (map.version === 12 || map.version === 13)
        ? ' (versions 12-13 write an unread path-count dword)'
        : ''),
  )
  console.log('')
}

const options = parseArgs(process.argv.slice(2))
if (options.paths.length === 0) {
  console.error('usage: ds1-summary.ts <file.ds1|dir> [...] [--top n]')
  process.exit(1)
}

const files = options.paths.flatMap(collectDs1).sort()
for (const file of files) summarize(file, options)
console.log(`${files.length} file(s), ${new Set(files.map((f) => basename(f))).size} distinct name(s)`)
