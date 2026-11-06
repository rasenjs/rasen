/**
 * The item registry and the crafting recipes.
 *
 * Items are the single currency of the game: a hotbar slot, a satchel slot, a
 * ground drop and a crafting ingredient are all an item stack. Blocks are items that
 * happen to know which tile they place; pickaxes and swords are items that happen to
 * know what they do when used.
 *
 * ## Why this is separate from `tile-defs.ts`
 *
 * The two registries are deliberately not merged, and the reason is *cardinality*.
 * There are 20 tiles and 24 items, and the mapping is many-to-many: mining stone
 * yields a stone item, but stone is also a crafting ingredient and can be placed; a
 * pickaxe is an item with no tile at all. Collapsing them would mean a tile array
 * carrying `damage` and `reach` fields that no tile ever reads, and item ids that
 * shift every time a tile is added — which would invalidate saves.
 *
 * Item ids are therefore their own stable namespace, and a save referencing item 7
 * keeps meaning item 7 when a tile is inserted into the middle of the tile registry.
 */

import { Tile } from './tile-defs'

export type ItemKind = 'block' | 'pickaxe' | 'weapon' | 'material'

export interface ItemDef {
  readonly id: number
  readonly key: string
  readonly name: string
  readonly kind: ItemKind
  readonly maxStack: number
  /** Blocks only: the tile this places. */
  readonly tile?: number
  /** Pickaxes only: the strongest tile `hardness` this can break. */
  readonly power?: number
  /** Weapons only. */
  readonly damage?: number
  /** Weapons only: how far the swing reaches, in world px. */
  readonly reach?: number
  /** Weapons only: seconds for one swing. */
  readonly swingTime?: number
  /** Weapons only: px/s imparted on a hit. */
  readonly knockback?: number
  /** Name colour. Also the tier tell on a tool. */
  readonly color: readonly [number, number, number]
  /** One line for the tooltip. */
  readonly note: string
}

const defs: ItemDef[] = []

function def(d: Omit<ItemDef, 'id'>): number {
  const id = defs.length
  defs.push({ ...d, id })
  return id
}

// -- blocks ----------------------------------------------------------------
export const Item = {
  Dirt: def({
    key: 'dirt',
    name: 'Dirt Block',
    kind: 'block',
    maxStack: 999,
    tile: Tile.Dirt,
    color: [104, 74, 49],
    note: 'Places dirt.',
  }),
  Stone: def({
    key: 'stone',
    name: 'Stone Block',
    kind: 'block',
    maxStack: 999,
    tile: Tile.Stone,
    color: [128, 128, 132],
    note: 'Places stone.',
  }),
  Plank: def({
    key: 'plank',
    name: 'Wood Platform',
    kind: 'block',
    maxStack: 999,
    tile: Tile.Plank,
    color: [152, 112, 72],
    note: 'Places a platform.',
  }),
  Brick: def({
    key: 'brick',
    name: 'Stone Brick',
    kind: 'block',
    maxStack: 999,
    tile: Tile.Brick,
    color: [110, 108, 104],
    note: 'Places brick.',
  }),
  Glass: def({
    key: 'glass',
    name: 'Glass',
    kind: 'block',
    maxStack: 999,
    tile: Tile.Glass,
    color: [176, 214, 224],
    note: 'Places glass. Light passes through.',
  }),
  Torch: def({
    key: 'torch',
    name: 'Torch',
    kind: 'block',
    maxStack: 999,
    tile: Tile.Torch,
    color: [232, 172, 72],
    note: 'Places a torch. Emits light.',
  }),

  // -- ores, as materials --------------------------------------------------
  Copper: def({
    key: 'copper',
    name: 'Copper Ore',
    kind: 'material',
    maxStack: 999,
    color: [196, 122, 88],
    note: 'Smelts into copper tools.',
  }),
  Iron: def({
    key: 'iron',
    name: 'Iron Ore',
    kind: 'material',
    maxStack: 999,
    color: [188, 168, 152],
    note: 'Smelts into iron tools.',
  }),
  Silver: def({
    key: 'silver',
    name: 'Silver Ore',
    kind: 'material',
    maxStack: 999,
    color: [214, 220, 232],
    note: 'A finer metal than iron.',
  }),
  Gold: def({
    key: 'gold',
    name: 'Gold Ore',
    kind: 'material',
    maxStack: 999,
    color: [232, 196, 84],
    note: 'Smelts into gold tools.',
  }),
  Gem: def({
    key: 'gem',
    name: 'Gemstone',
    kind: 'material',
    maxStack: 999,
    color: [168, 148, 236],
    note: 'A gem. Glows faintly.',
  }),
  Wood: def({
    key: 'wood',
    name: 'Wood',
    kind: 'material',
    maxStack: 999,
    color: [152, 112, 72],
    note: 'Cut from a tree.',
  }),
  Gel: def({
    key: 'gel',
    name: 'Gel',
    kind: 'material',
    maxStack: 999,
    color: [96, 190, 148],
    note: 'Dropped by slimes.',
  }),

  // -- pickaxes ------------------------------------------------------------
  CopperPickaxe: def({
    key: 'copper-pickaxe',
    name: 'Copper Pickaxe',
    kind: 'pickaxe',
    maxStack: 1,
    power: 2,
    color: [196, 122, 88],
    note: 'Breaks soil, wood and copper ore.',
  }),
  IronPickaxe: def({
    key: 'iron-pickaxe',
    name: 'Iron Pickaxe',
    kind: 'pickaxe',
    maxStack: 1,
    power: 3,
    color: [188, 168, 152],
    note: 'Breaks iron and silver ore.',
  }),
  GoldPickaxe: def({
    key: 'gold-pickaxe',
    name: 'Gold Pickaxe',
    kind: 'pickaxe',
    maxStack: 1,
    power: 5,
    color: [232, 196, 84],
    note: 'Breaks everything, and quickly.',
  }),

  // -- weapons -------------------------------------------------------------
  WoodenSword: def({
    key: 'wooden-sword',
    name: 'Wooden Sword',
    kind: 'weapon',
    maxStack: 1,
    damage: 7,
    reach: 26,
    swingTime: 0.4,
    knockback: 130,
    color: [152, 112, 72],
    note: 'A swing of wood.',
  }),
  IronSword: def({
    key: 'iron-sword',
    name: 'Iron Sword',
    kind: 'weapon',
    maxStack: 1,
    damage: 13,
    reach: 30,
    swingTime: 0.34,
    knockback: 175,
    color: [188, 168, 152],
    note: 'A proper blade.',
  }),
  GoldSword: def({
    key: 'gold-sword',
    name: 'Gold Sword',
    kind: 'weapon',
    maxStack: 1,
    damage: 20,
    reach: 34,
    swingTime: 0.3,
    knockback: 210,
    color: [232, 196, 84],
    note: 'Heavy, fast, and bright.',
  }),
} as const

export const ITEM_DEFS: readonly ItemDef[] = defs

export function itemDef(id: number): ItemDef {
  const d = defs[id]
  if (!d) throw new Error(`unknown item id ${id}`)
  return d
}

export function itemIdByKey(key: string): number {
  const i = defs.findIndex((d) => d.key === key)
  if (i < 0) throw new Error(`unknown item key: ${key}`)
  return i
}

/** A stack. `count` is the only mutable field; identity is the item. */
export interface ItemStack {
  readonly item: number
  count: number
}

export function stackOf(item: number, count: number): ItemStack {
  return { item, count }
}

// ---------------------------------------------------------------------------
// Crafting
// ---------------------------------------------------------------------------

export interface Recipe {
  readonly key: string
  readonly output: { readonly item: number; readonly count: number }
  readonly inputs: ReadonlyArray<{ readonly item: number; readonly count: number }>
}

/**
 * The recipe book.
 *
 * Deliberately flat and data-only: no station requirements, no sub-recipes, no
 * "near a workbench" reach test. Those are all real Terraria systems, and adding
 * them would triple the surface here without changing the part that matters — that
 * crafting is a data-driven list the interface can render and the simulation can
 * validate.
 */
export const RECIPES: readonly Recipe[] = [
  {
    key: 'torch',
    output: { item: Item.Torch, count: 3 },
    inputs: [
      { item: Item.Wood, count: 1 },
      { item: Item.Gel, count: 1 },
    ],
  },
  {
    key: 'plank',
    output: { item: Item.Plank, count: 2 },
    inputs: [{ item: Item.Wood, count: 1 }],
  },
  {
    key: 'brick',
    output: { item: Item.Brick, count: 1 },
    inputs: [{ item: Item.Stone, count: 2 }],
  },
  {
    key: 'glass',
    output: { item: Item.Glass, count: 1 },
    inputs: [
      { item: Item.Stone, count: 1 },
      { item: Item.Gem, count: 1 },
    ],
  },
  {
    key: 'iron-pickaxe',
    output: { item: Item.IronPickaxe, count: 1 },
    inputs: [
      { item: Item.Iron, count: 3 },
      { item: Item.Wood, count: 2 },
    ],
  },
  {
    key: 'iron-sword',
    output: { item: Item.IronSword, count: 1 },
    inputs: [
      { item: Item.Iron, count: 3 },
      { item: Item.Wood, count: 1 },
    ],
  },
  {
    key: 'gold-pickaxe',
    output: { item: Item.GoldPickaxe, count: 1 },
    inputs: [
      { item: Item.Gold, count: 4 },
      { item: Item.Wood, count: 2 },
    ],
  },
  {
    key: 'gold-sword',
    output: { item: Item.GoldSword, count: 1 },
    inputs: [
      { item: Item.Gold, count: 4 },
      { item: Item.Wood, count: 1 },
    ],
  },
]

/**
 * Item ids shown in the "crafting guide" panel.
 *
 * A curated subset rather than all 24: the guide is a hint, and listing every item
 * including the ones you are holding makes it useless.
 */
export const GUIDE_ITEMS: readonly number[] = [
  Item.Torch,
  Item.Plank,
  Item.Brick,
  Item.Glass,
  Item.IronPickaxe,
  Item.IronSword,
  Item.GoldPickaxe,
  Item.GoldSword,
]

/** Stable sort so the guide does not reshuffle as you gather materials. */
export function guideRecipes(): readonly Recipe[] {
  return GUIDE_ITEMS.map((item) => RECIPES.find((r) => r.output.item === item)).filter(
    (r): r is Recipe => r !== undefined
  )
}

// ---------------------------------------------------------------------------
// The starter kit
// ---------------------------------------------------------------------------

/**
 * What the player begins with.
 *
 * A pickaxe in hand, a sword and a torch beside it, and enough wood to try the
 * crafting panel. This is a deliberate progression floor: copper ore is one step down
 * and iron is two, so the loop (mine → craft → mine deeper) has somewhere to go from
 * the first minute rather than requiring the player to discover it.
 */
export const STARTER_ITEMS: ReadonlyArray<{ item: number; count: number }> = [
  { item: Item.CopperPickaxe, count: 1 },
  { item: Item.WoodenSword, count: 1 },
  { item: Item.Torch, count: 12 },
  { item: Item.Wood, count: 25 },
  { item: Item.Dirt, count: 40 },
  { item: Item.Stone, count: 30 },
]
