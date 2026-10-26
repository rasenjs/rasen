/**
 * Evidence, step by step, as the source spec tags them:
 *
 *   `[C]` run-verified — the durability roll, the defense roll, the quantity rule,
 *         the socket-roll draw and its 33 threshold, the staff-mod count roll.
 *   `[I]` read from the code only — the `spawnstack` top of a misc quantity, the
 *         `start mod cap + 1` count (confirmed separately as a count, not a draw).
 *
 * The starting-kit test pins every one of these against two logged creations, so a
 * regression shows up as a wrong seed rather than a wrong-looking item.
 */
/**
 * What an item's own numbers are, before any affix touches it.
 *
 * Every item the game makes rolls its *base* stats first — durability, defense,
 * a stackable's quantity — and it rolls them on the item's **unit seed**, a seed
 * separate from the item seed the affixes later draw from. That separation is why
 * a weapon's durability and its prefixes are independent, and it is the reason
 * reproducing an item means tracking two seeds rather than one.
 *
 * The durability roll is not a uniform pick from `1..durability`: the game takes
 * half the base and rolls up to that, so a 28-durability axe lands in `[14, 27]`
 * and is never 28. Reading the table and guessing "random between 1 and max"
 * produces plausible items that are all slightly too good.
 */

import { range, step, type Seed } from './rng'

/** The columns of `weapons.txt` / `armor.txt` / `misc.txt` this needs, plus the type chain. */
export interface ItemBaseRecord {
  code: string
  /** The type chain from the base up through `itemtypes.txt`, lower case (`['staf','rod','blun','mele','weap']`). */
  types: readonly string[]
  /** `durability`: the maximum. Zero for a base that has none. */
  durability: number
  /** Armour: the defense range, inclusive. */
  minac: number
  maxac: number
  /** The quantity range, for a base that stacks. */
  stackable: boolean
  minstack: number
  maxstack: number
  /** `spawnstack`, which raises the top of a misc base's quantity range. */
  spawnstack: number
  /** `hasinv`: the base has an inventory picture, which a socketed item needs. */
  hasinv: boolean
  /** `gemsockets` on the item row. */
  gemsockets: number
  /** The type chain's `MaxSockets1/2/3`, by item level (≤ 25, ≤ 40, above). */
  maxSockets: readonly [number, number, number]
  /** The type chain's `StaffMods`: which class's skills this base can roll, or 7 for none. */
  staffMods: number
}

/** The base stats an item carries outside its property list. */
export interface BaseStats {
  armorClass?: number
  maxDurability?: number
  durability?: number
  quantity?: number
}

/** `RangeOffset(seed, base, n)`: a draw in `[base, base + n − 1]`, and no draw when `n < 1`. */
function rangeOffset(seed: Seed, base: number, n: number): number {
  return base + range(seed, n)
}

/**
 * The durability roll: half the base, then up to that again.
 *
 * `d < 2` draws nothing, so a 1-durability base is 1 and the seed does not move —
 * which matters, because the next item's seeds come from the same stream.
 */
function rollDurability(seed: Seed, durability: number): BaseStats {
  if (durability < 2) return { maxDurability: durability, durability }
  const half = durability >> 1
  const current = Math.min(half + range(seed, half), 255)
  return { maxDurability: durability, durability: current }
}

/** The quantity roll of a stackable base, with `spawnstack` raising the top. */
function rollQuantity(seed: Seed, base: ItemBaseRecord): number {
  const low = base.minstack
  const high = Math.min(base.maxstack, 511)
  const top = base.spawnstack >= low && base.spawnstack !== 0 ? base.spawnstack : high
  const quantity = low + range(seed, top - low)
  return quantity < 1 ? 1 : quantity
}

/**
 * The base stats, in the order the original draws them.
 *
 * Armour draws durability and then defense; a weapon draws quantity (only if it
 * stacks) and then durability; anything else draws quantity. The draws all come
 * from the unit seed, in that order, so a base whose category changes changes
 * every later item's seeds too.
 */
export function rollBaseStats(base: ItemBaseRecord, seed: Seed): BaseStats {
  const stats: BaseStats = {}
  if (base.types.includes('armo')) {
    Object.assign(stats, rollDurability(seed, base.durability))
    if (base.maxac >= base.minac) {
      stats.armorClass = rangeOffset(seed, base.minac, base.maxac - base.minac + 1)
    }
    return stats
  }
  if (base.types.includes('weap')) {
    if (base.stackable) stats.quantity = rollQuantity(seed, base)
    Object.assign(stats, rollDurability(seed, base.durability))
    return stats
  }
  if (base.stackable) stats.quantity = rollQuantity(seed, base)
  return stats
}

/** How many sockets the base could hold at this item level, before the difficulty cap. */
export function socketCapOf(base: ItemBaseRecord, ilvl: number): number {
  const fromTypes = ilvl <= 25 ? base.maxSockets[0] : ilvl <= 40 ? base.maxSockets[1] : base.maxSockets[2]
  return Math.min(base.gemsockets, fromTypes)
}

/** The result of the socket roll, whether or not it drew. */
export interface SocketRoll {
  /** False when the base could not hold sockets, in which case the seed did not move. */
  drew: boolean
  /** The `0..99` roll. */
  roll: number
  /** How many sockets were granted; 0 when the roll was 33 or above. */
  sockets: number
}

/**
 * The socket roll: one `Range(seed, 100)`, and the count is NOT drawn.
 *
 * A roll below 33 grants sockets, and the number of them is `start mod cap + 1` —
 * the low word the item seed was created from, so the count is fixed by the seed
 * rather than rolled. The base must have an inventory picture, must not stack, and
 * must have a non-zero cap, or nothing is drawn at all.
 */
export function rollSockets(
  seed: Seed,
  base: ItemBaseRecord,
  ilvl: number,
  start: number,
  difficultyCap: number,
  /** The creation record's "no sockets" bit, which the original tests AFTER the draw. */
  refuse = false,
): SocketRoll {
  const cap = Math.min(socketCapOf(base, ilvl), difficultyCap)
  if (!base.hasinv || base.stackable || cap <= 0) return { drew: false, roll: 0, sockets: 0 }
  const roll = range(seed, 100)
  if (refuse || roll >= 33) return { drew: true, roll, sockets: 0 }
  return { drew: true, roll, sockets: (start >>> 0) % cap + 1 }
}

/**
 * The staff-mod count roll: one draw, and how many class skills the base will roll.
 *
 * A staff, a wand or a scepter can carry a class's low-level skills; this roll
 * decides how many. The thresholds are the original's: 3 mods at 91 and above, 2 at
 * 71, 1 at 31, and none below — which is the common case for a starting staff.
 *
 * The rest of the staff-mod phase (the tier, the six-try skill pick, the level) is
 * NOT here. It draws from the same seed, so an item that rolls a mod cannot be
 * reproduced yet, and the caller is expected to say so rather than carry on.
 */
export function rollStaffModCount(seed: Seed, bonus = 0): number {
  step(seed)
  const roll = (seed.low % 100) + bonus
  if (roll >= 91) return 3
  if (roll >= 71) return 2
  if (roll >= 31) return 1
  return bonus !== 0 ? 1 : 0
}
