/**
 * The tile registry — a declarative table, deliberately *not* reactive.
 *
 * The index into `TILE_DEFS` is the id stored in `TileStore.tiles`, so lookups
 * are a single array index on the hot path. This mirrors the shape of the
 * registry in Open-Terraria (`src/data/tiles.ts`), which the bake kernel reads
 * millions of times per session.
 */

export const Tile = {
  Air: 0,
  Dirt: 1,
  Grass: 2,
  Stone: 3,
  Copper: 4,
  Iron: 5,
  Silver: 6,
  Gold: 7,
  Wood: 8,
  Leaves: 9,
  Sand: 10,
  Mud: 11,
  Plank: 12,
  Brick: 13,
  Glass: 14,
  Torch: 15,
  Water: 16,
  Lava: 17,
  Ash: 18,
  Gem: 19,
} as const

export type TileId = (typeof Tile)[keyof typeof Tile]

export interface TileDef {
  readonly id: number
  readonly key: string
  readonly name: string
  /** Blocks movement. Liquids and torches do not. */
  readonly solid: boolean
  /** 0 = light passes freely, 1 = light stops dead. Drives the light falloff. */
  readonly opacity: number
  /** Self-emission added to the lightmap on every pass. */
  readonly light?: readonly [number, number, number]
  /** Base colour, used to paint the procedural sprite and the minimap. */
  readonly color: readonly [number, number, number]
  /** Speckle colours mixed into the sprite for texture. */
  readonly accents?: readonly (readonly [number, number, number])[]
  /** Pickaxe power needed to remove it. */
  readonly hardness: number
  readonly liquid?: 'water' | 'lava'
  /** What this tile replaces when placed from the hotbar. */
  readonly gives?: number
}

const defs: TileDef[] = []

function def(d: Omit<TileDef, 'id'>): number {
  const id = defs.length
  defs.push({ ...d, id })
  return id
}

def({
  key: 'air',
  name: 'Air',
  solid: false,
  opacity: 0,
  color: [0, 0, 0],
  hardness: -1,
})

def({
  key: 'dirt',
  name: 'Dirt Block',
  solid: true,
  opacity: 1,
  color: [104, 74, 49],
  accents: [
    [120, 88, 58],
    [88, 62, 41],
    [131, 98, 66],
  ],
  hardness: 1,
})

def({
  key: 'grass',
  name: 'Grass',
  solid: true,
  opacity: 1,
  color: [104, 74, 49],
  accents: [
    [120, 88, 58],
    [88, 62, 41],
    [131, 98, 66],
  ],
  hardness: 1,
  gives: Tile.Dirt,
})

def({
  key: 'stone',
  name: 'Stone Block',
  solid: true,
  opacity: 1,
  color: [128, 128, 132],
  accents: [
    [146, 146, 150],
    [108, 108, 113],
    [166, 166, 170],
  ],
  hardness: 2,
})

def({
  key: 'copper',
  name: 'Copper Ore',
  solid: true,
  opacity: 1,
  color: [128, 128, 132],
  accents: [
    [196, 122, 88],
    [146, 146, 150],
    [214, 140, 102],
  ],
  hardness: 2,
  gives: Tile.Stone,
})

def({
  key: 'iron',
  name: 'Iron Ore',
  solid: true,
  opacity: 1,
  color: [128, 128, 132],
  accents: [
    [188, 168, 152],
    [146, 146, 150],
    [216, 198, 184],
  ],
  hardness: 3,
  gives: Tile.Stone,
})

def({
  key: 'silver',
  name: 'Silver Ore',
  solid: true,
  opacity: 1,
  color: [128, 128, 132],
  accents: [
    [214, 220, 232],
    [146, 146, 150],
    [238, 242, 250],
  ],
  hardness: 4,
  gives: Tile.Stone,
})

def({
  key: 'gold',
  name: 'Gold Ore',
  solid: true,
  opacity: 1,
  color: [128, 128, 132],
  accents: [
    [232, 196, 84],
    [146, 146, 150],
    [250, 222, 128],
  ],
  hardness: 4,
  gives: Tile.Stone,
})

def({
  key: 'wood',
  name: 'Tree Trunk',
  solid: false,
  opacity: 0.75,
  color: [88, 62, 40],
  accents: [
    [70, 48, 31],
    [104, 74, 48],
  ],
  hardness: 1,
  gives: Tile.Plank,
})

def({
  key: 'leaves',
  name: 'Leaves',
  solid: false,
  opacity: 0.45,
  color: [58, 106, 52],
  accents: [
    [74, 128, 62],
    [44, 86, 42],
    [92, 146, 72],
  ],
  hardness: 1,
  gives: Tile.Air,
})

def({
  key: 'sand',
  name: 'Sand Block',
  solid: true,
  opacity: 1,
  color: [214, 197, 143],
  accents: [
    [230, 214, 164],
    [196, 178, 126],
    [240, 228, 186],
  ],
  hardness: 1,
})

def({
  key: 'mud',
  name: 'Mud Block',
  solid: true,
  opacity: 1,
  color: [76, 62, 48],
  accents: [
    [92, 76, 58],
    [60, 48, 38],
    [108, 90, 68],
  ],
  hardness: 1,
})

def({
  key: 'plank',
  name: 'Wood Platform',
  solid: true,
  opacity: 1,
  color: [152, 112, 72],
  accents: [
    [168, 126, 84],
    [128, 92, 58],
    [182, 142, 96],
  ],
  hardness: 1,
})

def({
  key: 'brick',
  name: 'Stone Brick',
  solid: true,
  opacity: 1,
  color: [110, 108, 104],
  accents: [
    [126, 124, 120],
    [92, 90, 88],
    [142, 140, 136],
  ],
  hardness: 2,
})

def({
  key: 'glass',
  name: 'Glass',
  solid: true,
  opacity: 0.25,
  color: [176, 214, 224],
  accents: [
    [210, 236, 244],
    [150, 190, 204],
  ],
  hardness: 1,
})

def({
  key: 'torch',
  name: 'Torch',
  solid: false,
  opacity: 0,
  light: [1.0, 0.72, 0.36],
  color: [232, 172, 72],
  accents: [
    [255, 226, 150],
    [128, 88, 44],
  ],
  hardness: 1,
  gives: Tile.Air,
})

def({
  key: 'water',
  name: 'Water',
  solid: false,
  opacity: 0.22,
  color: [48, 96, 190],
  accents: [
    [72, 126, 216],
    [36, 76, 158],
  ],
  hardness: -1,
  liquid: 'water',
})

def({
  key: 'lava',
  name: 'Lava',
  solid: false,
  opacity: 0.6,
  light: [1.0, 0.42, 0.12],
  color: [214, 92, 28],
  accents: [
    [244, 152, 48],
    [176, 60, 20],
    [255, 200, 90],
  ],
  hardness: -1,
  liquid: 'lava',
})

def({
  key: 'ash',
  name: 'Ash Block',
  solid: true,
  opacity: 1,
  color: [82, 74, 74],
  accents: [
    [98, 88, 88],
    [64, 58, 58],
    [112, 100, 100],
  ],
  hardness: 2,
})

def({
  key: 'gem',
  name: 'Gemstone',
  solid: true,
  opacity: 0.85,
  light: [0.34, 0.24, 0.62],
  color: [128, 108, 200],
  accents: [
    [168, 148, 236],
    [96, 80, 158],
    [206, 190, 255],
  ],
  hardness: 5,
  gives: Tile.Stone,
})

export const TILE_DEFS: readonly TileDef[] = defs

export function tileDef(id: number): TileDef {
  return defs[id] ?? defs[0]
}

export function isSolid(id: number): boolean {
  return defs[id]?.solid ?? false
}

export function tileOpacity(id: number): number {
  return defs[id]?.opacity ?? 0
}

export function tileLight(id: number): readonly [number, number, number] | undefined {
  return defs[id]?.light
}

export const TILE_KEYS: readonly string[] = defs.map((d) => d.key)

export function tileIdByKey(key: string): number {
  const i = TILE_KEYS.indexOf(key)
  if (i < 0) throw new Error(`unknown tile key: ${key}`)
  return i
}
