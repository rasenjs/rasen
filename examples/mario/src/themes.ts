/**
 * Theme tile tables.
 *
 * Maps Meth Meth Method tile names to 16px-grid indices inside tiles.png,
 * per theme (overworld / underworld / castle). Coordinates from the
 * Meth Meth Method sprites/overworld|underworld|castle.json tables.
 */

export type Theme = 'overworld' | 'underworld' | 'castle'

/** [col, row] on the 16px grid of tiles.png */
export type TileIndex = readonly [number, number]

const OVERWORLD: Record<string, TileIndex> = {
  ground: [0, 0],
  bricks: [1, 0],
  'bricks-top': [14, 0],
  metal: [2, 0],
  chocolate: [3, 0],
  dirt: [13, 0],
  'chance-1': [4, 0],
  'chance-2': [5, 0],
  'chance-3': [6, 0],
  'coin-1': [15, 0],
  'coin-2': [15, 1],
  'coin-3': [15, 2],
  'pipe-insert-vert-left': [0, 5],
  'pipe-insert-vert-right': [1, 5],
  'pipe-vert-left': [0, 6],
  'pipe-vert-right': [1, 6],
  'pipe-chrome-insert-vert-left': [2, 3],
  'pipe-chrome-insert-vert-right': [3, 3],
  'pipe-chrome-vert-left': [2, 4],
  'pipe-chrome-vert-right': [3, 4],
  'pipe-insert-hor-top': [6, 3],
  'pipe-insert-hor-bottom': [6, 4],
  'pipe-hor-top': [7, 3],
  'pipe-hor-bottom': [7, 4],
  'pipe-conn-hor-top': [8, 3],
  'pipe-conn-hor-bottom': [8, 4],
  'cloud-tile': [14, 8],
  'cloud-1-1': [11, 10],
  'cloud-1-2': [12, 10],
  'cloud-1-3': [13, 10],
  'cloud-2-1': [11, 11],
  'cloud-2-2': [12, 11],
  'cloud-2-3': [13, 11],
  'cannon-1': [14, 3],
  'cannon-2': [14, 4],
  'cannon-3': [14, 5],
  'bush-1': [11, 12],
  'bush-2': [12, 12],
  'bush-3': [13, 12],
  'grass-left': [9, 2],
  grass: [10, 2],
  'grass-right': [11, 2],
  'castle-top-closed': [8, 0],
  'castle-top-open': [9, 0],
  'castle-window-right': [10, 0],
  'castle-arch': [11, 0],
  'castle-window-left': [12, 0],
  'pole-green': [12, 13],
  'pole-white': [11, 13],
  'pole-finial-dark-grey': [7, 8],
  'pole-finial-green': [8, 8],
  'hill-left': [4, 7],
  'hill-right': [6, 7],
  'hill-top': [7, 7],
  'hill-stains-right': [5, 7],
  'hill-stains-left': [3, 7],
  'tile-green': [12, 7],
  'tree-large-top': [10, 5],
  'tree-large-bottom': [10, 6],
  'tree-small': [12, 5],
  'tree-white-large-top': [11, 5],
  'tree-white-large-bottom': [11, 6],
  'tree-white-small': [13, 5],
  'tree-trunk': [12, 6],
  fence: [14, 6],
  bridge: [13, 6],
  'bridge-rail-green': [14, 11],
  'bridge-rail-white': [14, 10],
  waves: [0, 7],
  sky: [14, 7],
}

const UNDERWORLD: Record<string, TileIndex> = {
  ground: [0, 2],
  bricks: [1, 2],
  'bricks-top': [14, 2],
  metal: [2, 2],
  chocolate: [3, 2],
  'chance-1': [4, 2],
  'chance-2': [5, 2],
  'chance-3': [6, 2],
  'coin-1': [15, 3],
  'coin-2': [15, 4],
  'coin-3': [15, 5],
  'pipe-insert-vert-left': [2, 5],
  'pipe-insert-vert-right': [3, 5],
  'pipe-vert-left': [2, 6],
  'pipe-vert-right': [3, 6],
  'pipe-insert-hor-top': [6, 5],
  'pipe-insert-hor-bottom': [6, 6],
  'pipe-hor-top': [7, 5],
  'pipe-hor-bottom': [7, 6],
  'pipe-conn-hor-top': [8, 5],
  'pipe-conn-hor-bottom': [8, 6],
  sky: [13, 7],
}

const CASTLE: Record<string, TileIndex> = {
  ground: [14, 1],
  bricks: [1, 1],
  metal: [2, 1],
  'metal-alt': [7, 1],
  chocolate: [3, 1],
  'chance-1': [4, 1],
  'chance-2': [5, 1],
  'chance-3': [6, 1],
  'coin-1': [15, 9],
  'coin-2': [15, 10],
  'coin-3': [15, 11],
  'pipe-insert-vert-left': [0, 3],
  'pipe-insert-vert-right': [1, 3],
  'pipe-vert-left': [0, 4],
  'pipe-vert-right': [1, 4],
  'beam-track': [11, 13],
  bridge: [13, 4],
  'bridge-chain': [13, 3],
  'toad-1': [15, 12],
  'toad-2': [15, 13],
  'tile-red': [8, 7],
  waves: [2, 7],
  sky: [13, 7],
}

export const THEME_TILES: Record<Theme, Record<string, TileIndex>> = {
  overworld: OVERWORLD,
  underworld: UNDERWORLD,
  castle: CASTLE,
}

/** Sky clear-color per theme (must match the baked sky tile [14,7]/[13,7]). */
export const THEME_SKY: Record<Theme, string> = {
  overworld: '#9c9bff',
  underworld: '#000000',
  castle: '#000000',
}

/** Coin frame grid indices (base of the 3-frame spin) per theme. */
export const THEME_COIN_BASE: Record<Theme, number> = {
  overworld: 15, // [15,0]
  underworld: 63, // [15,3]
  castle: 159, // [15,9]
}

/** Dynamic block frame indices (brick / chance / used) per theme. */
export interface BlockFrames {
  brick: number
  brickTop: number
  chance1: number
  chance2: number
  chance3: number
  used: number
}

export const THEME_BLOCK_FRAMES: Record<Theme, BlockFrames> = {
  overworld: {
    brick: 1,
    brickTop: 14,
    chance1: 4,
    chance2: 5,
    chance3: 6,
    used: 2,
  },
  underworld: {
    brick: 33, // [1,2]
    brickTop: 33,
    chance1: 36,
    chance2: 37,
    chance3: 38,
    used: 34, // [2,2]
  },
  castle: {
    brick: 17, // [1,1]
    brickTop: 17,
    chance1: 20,
    chance2: 21,
    chance3: 22,
    used: 18, // [2,1]
  },
}
