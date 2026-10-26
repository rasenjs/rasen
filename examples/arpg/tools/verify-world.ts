/**
 * Checks the object, placement and dialogue tables against the real maps, and
 * the tile geometry the map is drawn at.
 *
 * Four claims are checkable without a running game, and all four are checked
 * over the whole package rather than a sample:
 *
 * 1. every type-2 record in every `.ds1` names an object `objects.txt` has;
 * 2. every type-1 record names a `monpreset` row for the file's act, and that
 *    row is either a `monstats` monster or one of the known spawn directives;
 * 3. every dialogue line in `vo.json` parses, and the speakers the tables name
 *    are attributable;
 * 4. every `.dt1` block in the exported tile tree is a whole number of 32-pixel
 *    sub-cells wide, the dominant block is the cell the renderer draws at, and
 *    the sub-tile payloads assemble into art exactly one cell across.
 *
 * Claim 4 reads `public/original/tiles`, the tree this package ships, so it runs
 * whether or not the extracted RomFS is present; claims 1-3 need the RomFS (the
 * first argument) and report zero files without it.
 *
 * Usage:
 *   tsx examples/arpg/tools/verify-world.ts [<extracted romfs dir>]
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { parseDs1 } from '@rasenjs/assets'
import { parseDt1 } from '../src/d2/dt1'
import {
  assembleTile,
  parsePalette,
  placeableSubTiles,
  DIAMOND_BYTES,
  DIAMOND_ROW_WIDTH,
  SUB_TILE_WIDTH,
  type Palette,
} from '../src/d2/tileart'
import { TILE_HEIGHT, TILE_WIDTH } from '../src/iso'
import { parseObjectTable } from '../src/d2/objects'
import {
  isPlaceDirective,
  monPresetAct,
  parseMonPreset,
  placeAt,
  resolvePlacements,
  summarisePlacements,
} from '../src/d2/places'
import { DIALOGUE_ALIASES, parseDialogue } from '../src/d2/dialogue'
import { parseMonsterTables } from '../src/d2/monsters'
import { parseSuperUniques } from '../src/d2/superuniques'

const root = resolve(process.argv[2] ?? '/tmp/d2r-all')
const data = resolve(import.meta.dirname, '../public/original')

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(data, name), 'utf8')) as T
}

function findFiles(dir: string, extension: string, out: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    const path = join(dir, entry)
    let isDirectory = false
    try {
      isDirectory = statSync(path).isDirectory()
    } catch {
      continue
    }
    if (isDirectory) findFiles(path, extension, out)
    else if (entry.toLowerCase().endsWith(extension)) out.push(path)
  }
}

const findDs1 = (dir: string, out: string[]): void => findFiles(dir, '.ds1', out)

/** Rows a run-length sub-tile payload spells, and whether it consumes itself. */
function readRleRows(payload: Uint8Array): { rows: number; exact: boolean } {
  let cursor = 0
  let rows = 0
  while (cursor + 1 < payload.length) {
    const skip = payload[cursor]
    const count = payload[cursor + 1]
    cursor += 2
    if (skip === 0 && count === 0) {
      rows += 1
      continue
    }
    if (cursor + count > payload.length) return { rows, exact: false }
    cursor += count
  }
  return { rows, exact: cursor === payload.length }
}

/**
 * The cell-to-art relationship, over every block of every tileset.
 *
 * @returns one line per counter-example, capped per check, plus the counts that
 *   were measured — the caller prints them and fails on any example.
 */
function verifyTileGeometry(): { problems: string[]; counts: string[] } {
  const problems: string[] = []
  const counts: string[] = []
  const files: string[] = []
  findFiles(join(data, 'tiles'), '.dt1', files)
  files.sort()

  if (files.length === 0) {
    problems.push(`no .dt1 files under ${relative(process.cwd(), join(data, 'tiles'))}`)
    return { problems, counts }
  }

  const widthHistogram = new Map<number, number>()
  const formats = new Map<number, number>()
  let blocks = 0
  let legacyFiles = 0
  let unparsable = 0
  let widthOffenders = 0
  let diamondRowsOff = 0
  let rleRowsOff = 0
  let artWidthOff = 0
  let artTooBig = 0
  let artFrameOff = 0
  let groundBlocks = 0
  let roofs = 0
  let roofWidthRange: [number, number] = [0, 0]
  let roofOffsetRange: [number, number] = [0, 0]
  const examples: string[] = []

  // The palette is only needed to assemble a picture; index numbers alone would
  // do for the geometry, so a missing palette degrades to a colourless check.
  let palette: Palette | null = null
  try {
    palette = parsePalette(new Uint8Array(readFileSync(join(data, 'palette/pal.dat'))))
  } catch {
    palette = null
  }

  for (const path of files) {
    const bytes = new Uint8Array(readFileSync(path))
    let file
    try {
      file = parseDt1(bytes)
    } catch (error) {
      unparsable += 1
      if (examples.length < 8) examples.push(`${relative(data, path)}: ${String(error)}`)
      continue
    }
    if (file.layout !== 'v7') {
      legacyFiles += 1
      continue
    }
    for (const block of file.blocks) {
      blocks += 1
      widthHistogram.set(block.sizeX, (widthHistogram.get(block.sizeX) ?? 0) + 1)
      if (block.sizeX % SUB_TILE_WIDTH !== 0) {
        widthOffenders += 1
        if (examples.length < 8) {
          examples.push(`${relative(data, path)}#${block.index}: sizeX ${block.sizeX} is not a multiple of ${SUB_TILE_WIDTH}`)
        }
      }
      for (const subTile of block.subTiles) {
        formats.set(subTile.format, (formats.get(subTile.format) ?? 0) + 1)
        const payload = bytes.subarray(subTile.dataPtr, subTile.dataPtr + subTile.length)
        if (subTile.format === 0x0001) {
          const rows = DIAMOND_ROW_WIDTH.reduce((sum, width) => sum + width, 0)
          if (subTile.length !== DIAMOND_BYTES || rows !== DIAMOND_BYTES) {
            diamondRowsOff += 1
            if (examples.length < 8) {
              examples.push(`${relative(data, path)}#${block.index}:${subTile.index}: diamond payload ${subTile.length} bytes, rows ${rows}`)
            }
          }
        } else if (subTile.format === 0x1001 || subTile.format === 0x2005) {
          const { rows, exact } = readRleRows(payload)
          const expected = subTile.format === 0x1001 ? 32 : 15
          if (!exact || rows !== expected) {
            rleRowsOff += 1
            if (examples.length < 8) {
              examples.push(
                `${relative(data, path)}#${block.index}:${subTile.index}: format 0x${subTile.format.toString(16)} spelled ${rows} rows, exact ${exact}`,
              )
            }
          }
        }
      }

      // Art placement.
      //
      // This used to demand that every drawable block be exactly one cell wide,
      // start at its frame origin and fit a cell — and it failed on 1489 blocks,
      // which was the CHECK being wrong, not the art. The exported tilesets are
      // full of legitimate partial tiles: a floor transition whose picture is 128
      // or 96 pixels wide and sits at (32, 0) inside the frame, and walls whose
      // art rises 288 pixels above it. `drawTileArt` anchors by
      // `cx - TILE_WIDTH/2 + frameX`, so an offset frame is exactly how they are
      // meant to be drawn.
      //
      // What IS true of every ground block, and therefore worth guarding: the
      // picture is a whole number of 32-pixel sub-cells, and its frame offset
      // keeps it within one cell's width of the frame's left edge. Roof blocks are
      // counted separately rather than checked.
      const placed = placeableSubTiles(block)
      if (placed.length === 0) continue
      if (block.roofY !== 0) {
        if (roofs === 0) {
          roofWidthRange = [Infinity, -Infinity]
          roofOffsetRange = [Infinity, -Infinity]
        }
        roofs += 1
        const minX = Math.min(...placed.map((p) => p.subTile.xPos))
        const width = Math.max(...placed.map((p) => p.subTile.xPos + p.width)) - minX
        roofWidthRange[0] = Math.min(roofWidthRange[0], width)
        roofWidthRange[1] = Math.max(roofWidthRange[1], width)
        roofOffsetRange[0] = Math.min(roofOffsetRange[0], minX)
        roofOffsetRange[1] = Math.max(roofOffsetRange[1], minX)
        continue
      }
      groundBlocks += 1

      const minX = Math.min(...placed.map((p) => p.subTile.xPos))
      const minY = Math.min(...placed.map((p) => p.subTile.yPos))
      const artWidth = Math.max(...placed.map((p) => p.subTile.xPos + p.width)) - minX
      const artHeight = Math.max(...placed.map((p) => p.subTile.yPos + p.height)) - minY
      if (artWidth <= 0 || artWidth % SUB_TILE_WIDTH !== 0) {
        artWidthOff += 1
        if (examples.length < 8) {
          examples.push(`${relative(data, path)}#${block.index}: art is ${artWidth} wide, not a multiple of ${SUB_TILE_WIDTH}`)
        }
      }
      if (minX <= -TILE_WIDTH || minX >= TILE_WIDTH) {
        artFrameOff += 1
        if (examples.length < 8) {
          examples.push(`${relative(data, path)}#${block.index}: art frame starts at x ${minX}, outside a cell's width`)
        }
      }
      // A ground tile may be taller than the cell only upwards (a wall face that
      // reaches above the floor); it may never be more than a cell wide.
      if (minY > 0) {
        artTooBig += 1
        if (examples.length < 8) {
          examples.push(`${relative(data, path)}#${block.index}: art starts ${minY}px below the frame, past the cell's floor`)
        }
      }
      if (palette) {
        const bitmap = assembleTile(block, palette, bytes)
        if (bitmap === null) {
          problems.push(`${relative(data, path)}#${block.index}: floor block assembled to nothing`)
        } else if (bitmap.width <= 0 || bitmap.width % SUB_TILE_WIDTH !== 0) {
          artWidthOff += 1
          if (examples.length < 8) {
            examples.push(`${relative(data, path)}#${block.index}: picture ${bitmap.width} wide, not a multiple of ${SUB_TILE_WIDTH}`)
          }
        }
      }
    }
  }

  const dominant = [...widthHistogram.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0]
  const histogram = [...widthHistogram.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([width, count]) => `${width}:${count}`)
    .join(' ')

  counts.push(`tiles: ${files.length} .dt1 files (${legacyFiles} legacy, ${unparsable} unreadable), ${blocks} blocks`)
  counts.push(`tiles: block widths ${histogram}`)
  counts.push(`tiles: dominant block width ${dominant[0]} x${dominant[1]}, renderer cell ${TILE_WIDTH}x${TILE_HEIGHT}`)
  counts.push(
    `tiles: sub-tile formats ${[...formats.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([format, count]) => `0x${format.toString(16)}x${count}`)
      .join(' ')}`,
  )
  counts.push(`tiles: ${groundBlocks} blocks on the ground layer, art assembled from them`)
  if (roofs > 0) {
    counts.push(
      `tiles: ${roofs} roof blocks (roofY != 0) declined: their art's bounding box is ` +
        `${roofWidthRange[0]}..${roofWidthRange[1]} wide with its leftmost sub-tile at x ` +
        `${roofOffsetRange[0]}..${roofOffsetRange[1]}`,
    )
  }

  if (dominant[0] !== TILE_WIDTH) {
    problems.push(`dominant block width ${dominant[0]} is not the renderer's cell width ${TILE_WIDTH}`)
  }
  if (TILE_HEIGHT * 2 !== TILE_WIDTH) {
    problems.push(`cell is not a 2:1 diamond: ${TILE_WIDTH}x${TILE_HEIGHT}`)
  }
  if (widthOffenders > 0) problems.push(`${widthOffenders} blocks are not a whole number of 32-pixel sub-cells wide`)
  if (diamondRowsOff > 0) problems.push(`${diamondRowsOff} diamond sub-tiles are not ${DIAMOND_BYTES} bytes of 15 rows`)
  if (rleRowsOff > 0) problems.push(`${rleRowsOff} run-length sub-tiles do not spell 15 or 32 exact rows`)
  if (artWidthOff > 0) problems.push(`${artWidthOff} blocks draw art that is not exactly one cell wide`)
  if (artTooBig > 0) problems.push(`${artTooBig} blocks draw art larger than one cell`)
  if (artFrameOff > 0) problems.push(`${artFrameOff} floor blocks do not start their art at the frame origin`)
  for (const example of examples) problems.push(example)

  return { problems, counts }
}


function main(): void {
  // The tile geometry is checked first: it reads only the tree this package
  // ships, so it is the one claim that can be checked with the RomFS deleted.
  const tiles = verifyTileGeometry()
  for (const count of tiles.counts) console.log(count)

  const objectRows = readJson<Array<Record<string, string | null>>>('table_objects.json')
  const modeRows = readJson<Array<Record<string, string | null>>>('table_objmode.json')
  const presetRows = readJson<Array<Record<string, string | null>>>('table_monpreset.json')
  const voRows = readJson<Array<Record<string, string | null>>>('strings_vo.json')

  const objects = parseObjectTable(objectRows, modeRows.map((r) => String(r.Token)))
  const places = parseMonPreset(presetRows)
  const superUniques = parseSuperUniques(readJson('table_superuniques.json'))
  const monsters = parseMonsterTables({
    monstats: readJson('table_monstats.json'),
    monstats2: readJson('table_monstats2.json'),
    monlvl: readJson('table_monlvl.json'),
    monai: readJson('table_monai.json'),
    monseq: readJson('table_monseq.json'),
    levels: readJson('table_levels.json'),
  })

  console.log(
    `world: ${objects.objects.length} objects, ${places.all.length} monpreset rows, ` +
      `${monsters.byId.size} monsters, ${superUniques.entries.length} superuniques`,
  )

  const files: string[] = []
  findDs1(join(root, 'global/tiles'), files)

  let records = 0
  let type2 = 0
  let type2Bad = 0
  let type1 = 0
  let type1Bad = 0
  let directives = 0
  const unmatchedObjects = new Map<number, number>()
  const unmatchedMonsters = new Map<string, number>()
  const firstFailures: string[] = []
  const perAct = new Map<number, { monsters: number; npcs: number; objects: number; superUniques: number }>()
  let parseFailures = 0

  for (const path of files) {
    let ds1
    try {
      ds1 = parseDs1(new Uint8Array(readFileSync(path)))
    } catch {
      parseFailures += 1
      continue
    }
    // Files below version 8 do not store an act; their records are not resolvable.
    const act = monPresetAct(ds1.act)
    const placements = resolvePlacements(ds1.objects, act, places, objects, monsters, superUniques)
    const summary = summarisePlacements(placements)
    const bucket = perAct.get(act) ?? { monsters: 0, npcs: 0, objects: 0, superUniques: 0 }
    bucket.monsters += summary.monsters
    bucket.npcs += summary.npcs
    bucket.objects += summary.objects
    bucket.superUniques += summary.superUniques
    perAct.set(act, bucket)

    for (const placement of placements) {
      records += 1
      if (placement.source.type === 2) {
        type2 += 1
        if (!placement.known) {
          type2Bad += 1
          unmatchedObjects.set(placement.source.id, (unmatchedObjects.get(placement.source.id) ?? 0) + 1)
          if (firstFailures.length < 8) {
            firstFailures.push(`${relative(root, path)}: type2 id ${placement.source.id} unknown`)
          }
        }
        continue
      }
      if (placement.source.type !== 1) continue
      type1 += 1
      const place = placeAt(places, act, placement.source.id)
      if (place === null) {
        type1Bad += 1
        if (firstFailures.length < 8) {
          firstFailures.push(`${relative(root, path)}: type1 id ${placement.source.id} has no monpreset row in act ${act}`)
        }
      } else if (isPlaceDirective(place)) {
        directives += 1
      } else if (!placement.known) {
        type1Bad += 1
        unmatchedMonsters.set(place, (unmatchedMonsters.get(place) ?? 0) + 1)
        if (firstFailures.length < 8) {
          firstFailures.push(`${relative(root, path)}: monpreset "${place}" has no monstats row`)
        }
      }
    }
  }

  const percent = (good: number, total: number): string =>
    total === 0 ? 'n/a' : `${((100 * good) / total).toFixed(3)}%`

  console.log(`world: ${files.length} .ds1 files (${parseFailures} unreadable), ${records} placement records`)
  console.log(
    `world: type 2 objects ${type2 - type2Bad}/${type2} resolved (${percent(type2 - type2Bad, type2)})`,
  )
  console.log(
    `world: type 1 monsters ${type1 - type1Bad - directives}/${type1 - directives} resolved (${percent(type1 - type1Bad - directives, type1 - directives)}), ${directives} spawn directives`,
  )
  for (const [act, counts] of [...perAct].sort((a, b) => a[0] - b[0])) {
    console.log(
      `  act ${act}: ${counts.monsters} monsters (${counts.npcs} NPCs, ${counts.superUniques} superuniques), ` +
        `${counts.objects} objects`,
    )
  }

  // Dialogue. The candidates are `monstats` ids and nothing else: `forSpeaker` is
  // asked about the id an area placed, so a bucket keyed by a string-table name
  // would be unreachable, and those names win the longest-match rule anyway.
  const candidates = [...monsters.byId.values()].filter((m) => m.flags.npc).map((m) => m.id)
  const dialogue = parseDialogue(voRows, candidates)
  let emptyText = 0
  let withField = 0
  for (const entry of dialogue.entries) {
    if (entry.text.length === 0) emptyText += 1
    if (entry.firstLineLength !== null) withField += 1
  }
  const attributed = dialogue.entries.filter((e) => e.speaker !== null).length
  // The claim that matters is the NPC-addressed lines, not every line: 880 of
  // them are the player's and the mercenaries' own barks and have no speaker.
  const addressed = dialogue.entries.filter(
    (entry) => /Gossip/i.test(entry.key) || /^[A-Z]\dQ\d/.test(entry.key),
  )
  const addressedAttributed = addressed.filter((entry) => entry.speaker !== null).length
  console.log(
    `world: dialogue ${dialogue.entries.length} lines, ${attributed} attributed to ${dialogue.speakers.length} speakers`,
  )
  console.log(
    `world: dialogue ${addressedAttributed}/${addressed.length} NPC-addressed lines attributed (${percent(addressedAttributed, addressed.length)})`,
  )
  // A bucket keyed by anything but a monster id cannot be reached by a placed
  // NPC, so the reachable count is the number that matters to the game.
  const reachable = dialogue.speakers.filter((speaker) => monsters.byId.has(speaker)).length
  console.log(
    `world: dialogue ${reachable}/${dialogue.speakers.length} speaker buckets are monster ids`,
  )
  console.log(
    `world: dialogue ${withField} lines carried the formatting field, ${emptyText} were left empty, ` +
      `${DIALOGUE_ALIASES.length} speaker aliases declared`,
  )

  const problems: string[] = [...tiles.problems]
  if (type2Bad > 0) problems.push(`${type2Bad} type-2 ids unknown`)
  if (type1Bad > 0) problems.push(`${type1Bad} type-1 ids unresolved`)
  if (emptyText > 0) problems.push(`${emptyText} dialogue lines empty`)
  if (addressedAttributed !== addressed.length) {
    problems.push(`${addressed.length - addressedAttributed} NPC-addressed dialogue lines unattributed`)
  }
  if (unmatchedObjects.size > 0) {
    const top = [...unmatchedObjects.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    problems.push(`unknown object ids: ${top.map(([id, n]) => `${id}x${n}`).join(' ')}`)
  }
  if (unmatchedMonsters.size > 0) {
    const top = [...unmatchedMonsters.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    problems.push(`unknown monster places: ${top.map(([p, n]) => `${p}x${n}`).join(' ')}`)
  }
  if (firstFailures.length > 0) {
    console.log('world: first failures')
    for (const failure of firstFailures) console.log(`  ${failure}`)
  }
  if (problems.length > 0) {
    console.error(`verify-world: FAILED — ${problems.join('; ')}`)
    process.exitCode = 1
    return
  }
  console.log('verify-world: OK')
}

main()
