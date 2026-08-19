/**
 * Level builder.
 *
 * Produces:
 * - `grid`      : tile indices for the static background layer (terrain, pipes,
 *                 decorations, flag pole, castle). NOT dynamic blocks/coins.
 * - `solid`     : boolean grid for collision (ground, pipes, stairs, castle).
 * - `blocks`    : dynamic interactive blocks (brick / ?-block) in tile coords.
 * - `coins`     : static floating coins in tile coords.
 * - `goombas`   : enemy spawn points in tile coords.
 * - `flagX`     : world x of the goal flag pole.
 */

import { LEVEL_COLS, LEVEL_ROWS, TILE } from './constants'
import { TILE_IDX } from './sprites'

export interface LevelData {
  grid: number[][]
  solid: boolean[][]
  blocks: Array<{ tx: number; ty: number; type: 'brick' | 'chance' }>
  coins: Array<{ tx: number; ty: number }>
  goombas: Array<{ tx: number; ty: number }>
  flagX: number
}

const GROUND_TOP = 12

// Empty cell sentinel (tile index 0 is a valid tile — the ground grass tile)
const EMPTY = -1

export function buildLevel(): LevelData {
  const grid = Array.from({ length: LEVEL_ROWS }, () =>
    new Array<number>(LEVEL_COLS).fill(EMPTY),
  )
  const solid = Array.from({ length: LEVEL_ROWS }, () =>
    new Array<boolean>(LEVEL_COLS).fill(false),
  )

  const blocks: LevelData['blocks'] = []
  const coins: LevelData['coins'] = []
  const goombas: LevelData['goombas'] = []

  const setTile = (tx: number, ty: number, idx: number) => {
    if (tx < 0 || tx >= LEVEL_COLS || ty < 0 || ty >= LEVEL_ROWS) return
    grid[ty][tx] = idx
  }
  const setSolid = (tx: number, ty: number, idx: number) => {
    setTile(tx, ty, idx)
    if (tx >= 0 && tx < LEVEL_COLS && ty >= 0 && ty < LEVEL_ROWS) {
      solid[ty][tx] = true
    }
  }

  // ── Terrain ────────────────────────────────────────────────────────────
  const ground = (from: number, to: number) => {
    for (let tx = from; tx <= to; tx++) {
      setTile(tx, 14, TILE_IDX.dirt)
      setTile(tx, 13, TILE_IDX.dirt)
      setSolid(tx, 12, TILE_IDX.ground)
    }
  }

  // Ground segments (gaps between them are pits)
  ground(0, 27)
  ground(32, 52)
  ground(56, 79)
  ground(84, 105)
  ground(109, 135)
  ground(140, 170)
  ground(174, 219)

  // ── Decorations (background, not solid) ────────────────────────────────
  // Hill layouts mirror the overworld-pattern.json:
  //   hill-small = top cap + left/stains-right/right base
  //   hill-large = a small hill on top of a wide left/stains/green/stains/right base
  const hillSmall = (tx: number, baseRow: number) => {
    setTile(tx + 1, baseRow, TILE_IDX.hillTop)
    setTile(tx, baseRow + 1, TILE_IDX.hillLeft)
    setTile(tx + 1, baseRow + 1, TILE_IDX.hillStainsRight)
    setTile(tx + 2, baseRow + 1, TILE_IDX.hillRight)
  }
  const hillLarge = (tx: number, baseRow: number) => {
    hillSmall(tx + 1, baseRow)
    setTile(tx, baseRow + 2, TILE_IDX.hillLeft)
    setTile(tx + 1, baseRow + 2, TILE_IDX.hillStainsRight)
    setTile(tx + 2, baseRow + 2, TILE_IDX.tileGreen)
    setTile(tx + 3, baseRow + 2, TILE_IDX.hillStainsLeft)
    setTile(tx + 4, baseRow + 2, TILE_IDX.hillRight)
  }
  const bush = (tx: number, row = 12) => {
    setTile(tx, row, TILE_IDX.bush1)
    setTile(tx + 1, row, TILE_IDX.bush2)
    setTile(tx + 2, row, TILE_IDX.bush3)
  }
  const cloud = (tx: number, row = 3) => {
    setTile(tx, row, TILE_IDX.cloud1)
    setTile(tx + 1, row, TILE_IDX.cloud2)
    setTile(tx + 2, row, TILE_IDX.cloud3)
  }

  // Hills (baseRow 10 = large 3 rows tall, 11 = small 2 rows tall; ground top is row 12)
  hillLarge(4, 10)
  hillSmall(20, 11)
  hillLarge(56, 10)
  hillSmall(78, 11)
  hillLarge(88, 10)
  hillSmall(100, 11)
  hillLarge(140, 10)
  hillSmall(156, 11)
  hillLarge(178, 10)
  hillSmall(196, 11)

  // Bushes & clouds
  bush(44, 12)
  bush(70, 12)
  bush(120, 12)
  bush(160, 12)
  bush(210, 12)
  cloud(18, 3)
  cloud(50, 5)
  cloud(80, 2)
  cloud(118, 4)
  cloud(150, 2)
  cloud(184, 4)

  // ── Pipes (solid) ──────────────────────────────────────────────────────
  const pipe = (tx: number, height: number) => {
    // height = number of body rows; lip sits on top of the body
    const topRow = GROUND_TOP - height
    setSolid(tx, topRow, TILE_IDX.pipeInsertLeft)
    setSolid(tx + 1, topRow, TILE_IDX.pipeInsertRight)
    for (let r = topRow + 1; r <= GROUND_TOP; r++) {
      setSolid(tx, r, TILE_IDX.pipeLeft)
      setSolid(tx + 1, r, TILE_IDX.pipeRight)
    }
  }
  pipe(42, 2)
  pipe(62, 3)
  pipe(92, 3)
  pipe(128, 2)
  pipe(148, 3)
  pipe(176, 2)

  // ── Stairs (solid brick stacks) ────────────────────────────────────────
  const stairsUp = (startX: number, steps: number) => {
    // ascending: each column one tile higher than the last
    for (let s = 0; s < steps; s++) {
      const tx = startX + s
      const height = s + 1
      for (let r = GROUND_TOP - height + 1; r <= GROUND_TOP; r++) {
        setSolid(tx, r, TILE_IDX.bricks)
      }
    }
  }
  const stairsDown = (startX: number, steps: number) => {
    for (let s = 0; s < steps; s++) {
      const tx = startX + s
      const height = steps - s
      for (let r = GROUND_TOP - height + 1; r <= GROUND_TOP; r++) {
        setSolid(tx, r, TILE_IDX.bricks)
      }
    }
  }
  stairsUp(71, 4)
  stairsDown(119, 4)
  stairsUp(162, 4)
  stairsDown(186, 4)

  // ── Flag pole (decoration, win trigger) ────────────────────────────────
  const FLAG_TX = 204
  setTile(FLAG_TX, 3, TILE_IDX.poleBall)
  for (let r = 4; r <= 11; r++) {
    setTile(FLAG_TX, r, r % 2 === 0 ? TILE_IDX.poleGreen : TILE_IDX.poleWhite)
  }

  // ── Castle (decoration, solid) ─────────────────────────────────────────
  const castle = (tx: number) => {
    setSolid(tx, 7, TILE_IDX.castleTopClosed)
    setSolid(tx + 1, 7, TILE_IDX.castleTopOpen)
    setSolid(tx + 2, 7, TILE_IDX.castleTopClosed)
    setSolid(tx, 8, TILE_IDX.castleWindowLeft)
    setSolid(tx + 1, 8, TILE_IDX.castleArch)
    setSolid(tx + 2, 8, TILE_IDX.castleWindowRight)
    for (let r = 9; r <= 11; r++) {
      setSolid(tx, r, TILE_IDX.chocolate)
      setSolid(tx + 1, r, TILE_IDX.chocolate)
      setSolid(tx + 2, r, TILE_IDX.chocolate)
    }
  }
  castle(212)

  // ── Dynamic blocks ─────────────────────────────────────────────────────
  const brick = (tx: number, ty: number) => blocks.push({ tx, ty, type: 'brick' })
  const chance = (tx: number, ty: number) => blocks.push({ tx, ty, type: 'chance' })
  const ROW = 9

  chance(20, ROW)
  brick(22, ROW)
  chance(23, ROW)
  brick(24, ROW)
  chance(37, ROW)
  chance(56, ROW)
  chance(58, ROW)
  brick(66, ROW)
  brick(67, ROW)
  chance(84, ROW)
  chance(85, ROW)
  brick(98, ROW)
  brick(99, ROW)
  chance(100, ROW)
  brick(101, ROW)
  brick(112, ROW)
  brick(113, ROW)
  brick(114, ROW)
  chance(134, ROW)
  brick(140, ROW)
  chance(141, ROW)
  brick(142, ROW)
  brick(154, ROW)
  brick(155, ROW)
  brick(156, ROW)
  brick(180, ROW)
  chance(181, ROW)
  brick(182, ROW)

  // mark dynamic blocks as solid (they never stop being solid in this demo)
  for (const b of blocks) {
    solid[b.ty][b.tx] = true
  }

  // ── Coins ──────────────────────────────────────────────────────────────
  const coin = (tx: number, ty: number) => coins.push({ tx, ty })
  coin(36, 5)
  coin(38, 5)
  coin(49, 7)
  coin(61, 7)
  coin(68, 7)
  coin(78, 7)
  coin(97, 5)
  coin(112, 5)
  coin(113, 5)
  coin(114, 5)
  coin(126, 7)
  coin(137, 7)
  coin(154, 5)
  coin(155, 5)
  coin(156, 5)
  coin(170, 7)
  coin(180, 5)
  coin(182, 5)
  coin(191, 7)

  // ── Enemies ────────────────────────────────────────────────────────────
  const goomba = (tx: number) => goombas.push({ tx, ty: 11 })
  goomba(26)
  goomba(34)
  goomba(48)
  goomba(60)
  goomba(66)
  goomba(87)
  goomba(90)
  goomba(103)
  goomba(118)
  goomba(133)
  goomba(136)
  goomba(146)
  goomba(153)
  goomba(160)
  goomba(163)
  goomba(174)
  goomba(183)
  goomba(193)
  goomba(196)
  goomba(201)

  return {
    grid,
    solid,
    blocks,
    coins,
    goombas,
    flagX: FLAG_TX * TILE,
  }
}
