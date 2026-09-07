/**
 * Level loader.
 *
 * Loads the Meth Meth Method level data (public/levels/1-1.json … 1-4.json)
 * plus its pattern sheets (public/patterns/*.json) and expands them into:
 * - `grid`      : tile indices for the static background layer
 * - `solid`     : boolean collision grid
 * - `blocks`    : dynamic interactive blocks (brick / ?-block, with contents)
 * - `coins`     : floating coin positions (tile coords)
 * - `enemies`   : enemy spawn descriptors (goomba/koopa, brown/blue palette)
 * - `flag`      : flag pole tile position (null when the level ends otherwise)
 * - `castleX`   : tile x of the small/large castle (walk-into goal)
 * - `goalX`     : fallback goal x (exit pipe for 1-2, toad for 1-4)
 * - `lava`      : lava tiles (touching = death)
 * - `checkpoints`: respawn points (px)
 *
 * Range semantics are the ones used by the Meth Meth Method loader:
 * [x, y] | [x, xLen, y] | [x, xLen, y, yLen]; patterns nest recursively with
 * their own relative ranges.
 */

import { LEVEL_ROWS, TILE } from './constants'
import type { Theme } from './themes'
import { THEME_TILES } from './themes'

export interface BlockDef {
  tx: number
  ty: number
  type: 'brick' | 'chance'
  /** what a `?` block contains */
  contents?: 'mushroom' | 'flower' | 'coin'
}

export interface EnemyDef {
  kind: 'goomba' | 'koopa'
  palette: 'brown' | 'blue' | 'green'
  /** pixel position (from the level data) */
  x: number
  y: number
}

export interface LevelData {
  name: string
  theme: Theme
  cols: number
  grid: number[][]
  solid: boolean[][]
  lava: boolean[][]
  blocks: BlockDef[]
  coins: Array<{ tx: number; ty: number }>
  enemies: EnemyDef[]
  flag: { tx: number; tyTop: number; baseY: number } | null
  castleX: number | null
  goalX: number | null
  checkpoints: Array<{ x: number; y: number }>
}

interface TileSpec {
  style?: string
  pattern?: string
  behavior?: string
  ranges: Array<number[] | [number, number] | [number, number, number] | [number, number, number, number]>
}

interface LayerSpec {
  tiles: TileSpec[]
}

interface LevelSpec {
  spriteSheet: Theme
  layers: LayerSpec[]
  entities: Array<{ name: string; pos: [number, number] }>
  checkpoints?: number[][]
}

export type PatternSheet = Record<string, { tiles: TileSpec[] }>

async function fetchJSON(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load ${url}`)
  return res.json()
}

function* expandRange(
  range: number[] | [number, number] | [number, number, number] | [number, number, number, number],
): Generator<[number, number]> {
  if (range.length === 4) {
    const [xStart, xLen, yStart, yLen] = range
    for (let x = xStart; x < xStart + xLen; x++)
      for (let y = yStart; y < yStart + yLen; y++) yield [x, y]
  } else if (range.length === 3) {
    const [xStart, xLen, yStart] = range
    for (let x = xStart; x < xStart + xLen; x++) yield [x, yStart]
  } else {
    yield [range[0]!, range[1]!]
  }
}

/** Expanded tile placement with its behavior + originating pattern names. */
interface Placement {
  x: number
  y: number
  style: string
  behavior?: string
  /** innermost pattern that placed this tile */
  pattern?: string
  /** top-level pattern that initiated this expansion */
  rootPattern?: string
}

function expandTiles(
  tiles: TileSpec[],
  patterns: PatternSheet,
): Generator<Placement> {
  function* walkTiles(
    specs: TileSpec[],
    offsetX: number,
    offsetY: number,
    fromPattern?: string,
    rootPattern?: string,
  ): Generator<Placement> {
    for (const tile of specs) {
      for (const range of tile.ranges) {
        for (const [x, y] of expandRange(range)) {
          const dx = x + offsetX
          const dy = y + offsetY
          if (tile.pattern) {
            const pattern = patterns[tile.pattern]
            if (!pattern) throw new Error(`Unknown pattern ${tile.pattern}`)
            yield* walkTiles(
              pattern.tiles,
              dx,
              dy,
              tile.pattern,
              rootPattern ?? tile.pattern,
            )
          } else {
            yield {
              x: dx,
              y: dy,
              style: tile.style!,
              behavior: tile.behavior,
              pattern: fromPattern,
              rootPattern,
            }
          }
        }
      }
    }
  }
  return walkTiles(tiles, 0, 0)
}

const GOAL_PATTERNS = ['flag-pole-green', 'flag-pole-dark-grey']
const CASTLE_PATTERNS = ['castle-small', 'castle-large']
const EXIT_PATTERNS = ['exit-pipe-8h']
const TOAD_PATTERNS = ['toad']

export async function loadLevelData(
  name: string,
  patternsCache: Map<string, PatternSheet>,
): Promise<LevelData> {
  const spec = (await fetchJSON(`/levels/${name}.json`)) as LevelSpec
  const theme = spec.spriteSheet
  const table = THEME_TILES[theme]

  const patternSheetName =
    theme === 'overworld'
      ? 'overworld-pattern'
      : theme === 'underworld'
        ? 'underworld-pattern'
        : 'castle-pattern'
  let patterns = patternsCache.get(patternSheetName)
  if (!patterns) {
    patterns = (await fetchJSON(
      `/patterns/${patternSheetName}.json`,
    )) as PatternSheet
    patternsCache.set(patternSheetName, patterns)
  }

  const grid: number[][] = Array.from({ length: LEVEL_ROWS }, () => [])
  const solid: boolean[][] = Array.from({ length: LEVEL_ROWS }, () => [])
  const lava: boolean[][] = Array.from({ length: LEVEL_ROWS }, () => [])
  let cols = 0

  const blocks: BlockDef[] = []
  const coins: Array<{ tx: number; ty: number }> = []
  const enemies: EnemyDef[] = []
  let flag: LevelData['flag'] = null
  let castleX: number | null = null
  let goalX: number | null = null

  const setTile = (tx: number, ty: number, idx: number, isSolid: boolean) => {
    if (tx < 0 || ty < 0 || ty >= LEVEL_ROWS) return
    grid[ty][tx] = idx
    solid[ty][tx] = isSolid
    if (tx + 1 > cols) cols = tx + 1
  }

  for (const layer of spec.layers) {
    for (const place of expandTiles(layer.tiles, patterns)) {
      const { x, y, style, behavior } = place
      if (y < 0 || y >= LEVEL_ROWS) continue

      // Goal markers (recorded from pattern origins, not drawn as tiles)
      if (place.rootPattern && GOAL_PATTERNS.includes(place.rootPattern)) {
        const tx = x
        if (!flag || tx < flag.tx) flag = { tx, tyTop: y, baseY: y + 10 }
        continue
      }
      if (place.rootPattern && CASTLE_PATTERNS.includes(place.rootPattern)) {
        // The end-of-level castle is the right-most castle pattern
        // (e.g. 1-3 starts with a small castle and ends with a large one)
        if (castleX === null || x > castleX) castleX = x
        continue
      }
      if (place.rootPattern && EXIT_PATTERNS.includes(place.rootPattern)) {
        if (goalX === null || x < goalX) goalX = x
        continue
      }
      if (place.rootPattern && TOAD_PATTERNS.includes(place.rootPattern)) {
        if (goalX === null || x < goalX) goalX = x
        continue
      }

      // Interactive tiles become dynamic entities, not static tiles
      if (style === 'chance') {
        blocks.push({ tx: x, ty: y, type: 'chance' })
        continue
      }
      if (
        (style === 'bricks' || style === 'bricks-top') &&
        behavior === 'brick'
      ) {
        blocks.push({ tx: x, ty: y, type: 'brick' })
        continue
      }
      if (behavior === 'coin') {
        coins.push({ tx: x, ty: y })
        continue
      }

      // Lava (deadly, not solid)
      if (style === 'tile-red') {
        lava[y][x] = true
        const idx = table[style] ? table[style][1] * 16 + table[style][0] : -1
        setTile(x, y, idx, false)
        continue
      }

      const tileIdx = table[style]
      if (!tileIdx) continue // unknown decoration tile — skip
      const idx = tileIdx[1] * 16 + tileIdx[0]
      // "ground" behavior is solid; decorations are not
      const isSolid = behavior === 'ground'
      setTile(x, y, idx, isSolid)
    }
  }

  // Normalize entity spawns
  for (const e of spec.entities) {
    if (e.name === 'goomba-brown' || e.name === 'goomba-blue') {
      enemies.push({
        kind: 'goomba',
        palette: e.name === 'goomba-blue' ? 'blue' : 'brown',
        x: e.pos[0],
        y: e.pos[1],
      })
    } else if (e.name === 'koopa-green' || e.name === 'koopa-blue') {
      enemies.push({
        kind: 'koopa',
        palette: e.name === 'koopa-blue' ? 'blue' : 'green',
        x: e.pos[0],
        y: e.pos[1],
      })
    }
  }

  // Dedupe blocks: the level data sometimes places a `chance` marker on the
  // same cell as a brick (e.g. the brick-?-brick row of 1-1) to turn that
  // brick into a ? block. The chance wins; the brick entry is dropped.
  const byCell = new Map<string, BlockDef>()
  for (const b of blocks) {
    const key = `${b.tx},${b.ty}`
    const existing = byCell.get(key)
    if (!existing || (existing.type === 'brick' && b.type === 'chance')) {
      byCell.set(key, b)
    }
  }
  const dedupedBlocks = [...byCell.values()]

  // ?-block contents: the first ? of every level holds a power-up
  // (mushroom), the rest hold coins — classic SMB rule.
  let chanceSeen = 0
  for (const b of dedupedBlocks) {
    if (b.type === 'chance') {
      b.contents = chanceSeen === 0 ? 'mushroom' : 'coin'
      chanceSeen++
    }
  }

  const checkpoints = (spec.checkpoints ?? [[40, 192]]).map(([x, y]) => ({
    x,
    y,
  }))

  // Pad ragged rows
  for (let ty = 0; ty < LEVEL_ROWS; ty++) {
    while (grid[ty].length < cols) {
      grid[ty].push(-1)
      solid[ty].push(false)
      lava[ty].push(false)
    }
  }

  return {
    name,
    theme,
    cols,
    grid,
    solid,
    lava,
    blocks: dedupedBlocks,
    coins,
    enemies,
    flag,
    castleX,
    goalX,
    checkpoints,
  }
}

export function levelWorldWidth(level: LevelData): number {
  return level.cols * TILE
}
