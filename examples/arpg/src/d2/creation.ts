/**
 * Evidence: the base stats and the skill list are `[C]` — the source spec produced
 * its per-class table by creating every class three times in the running game and
 * reading the numbers back, and the test here repeats that comparison against
 * `charstats.txt`.
 *
 * The item rolls are `[C]` for the draws (seeds, durability, defense, sockets) and
 * `[I]` for what is deliberately absent: the staff-mod picks beyond the count roll,
 * the ethereal roll (a starting item skips it before drawing), and the placement
 * rules — an equipped item and an inventory item are both specified, a belt box is
 * specified as a box but NOT as a save coordinate, so nothing here invents one.
 */
/**
 * A new character, in the order the original creates one.
 *
 * `NewCharFromStub` does five things: build the skill list, seed the unit, write
 * the base stats, hand out the starting items, and point the right skill at the
 * class's `StartSkill`. This module holds the two that are pure table lookups —
 * the stats and the skill list. The starting items are the third and they are not
 * a lookup: each copy draws from the game seed and is built by the item generator,
 * so they stay out until that generator is here.
 *
 * The stat values are the point. `PLAYER_InitBaseStats` does **not** apply
 * `LifePerVitality`, `ManaPerMagic` or `StaminaPerVitality`: at level 1 life is
 * `vitality + hpAdd` points, mana is `energy` points and stamina is `stamina`
 * points, stored with eight fraction bits. Those per-point factors only enter on
 * level-up.
 */

import type { CharStatsRow } from './stats'
import type { SaveStat } from './save/d2s'
import { step, type Seed } from './rng'
import {
  rollBaseStats,
  rollSockets,
  rollStaffModCount,
  type BaseStats,
  type ItemBaseRecord,
  type SocketRoll,
} from './item-base'

/** Stat ids the creation writes, by the names `itemstatcost.txt` uses. */
const STAT = {
  strength: 0,
  energy: 1,
  dexterity: 2,
  vitality: 3,
  maxLife: 6,
  life: 7,
  maxMana: 8,
  mana: 9,
  maxStamina: 10,
  stamina: 11,
  level: 12,
  experience: 13,
  gold: 14,
  nextLevelExperience: 30,
  /** The three resistances' starting offset, 100 each. */
  fireResistanceCap: 67,
  coldResistanceCap: 68,
  lightningResistanceCap: 69,
} as const

/** The eight fraction bits life, mana and stamina are stored with. */
const FIXED_POINT = 8

/** What `PLAYER_InitBaseStats` leaves in the player's stat list. */
export function initialBaseStats(row: CharStatsRow, nextLevelExperience: number): SaveStat[] {
  const life = row.hpAdd + row.vitality
  const stat = (id: number, value: number): SaveStat => ({ id, value: value | 0 })
  return [
    stat(STAT.strength, row.strength),
    stat(STAT.energy, row.energy),
    stat(STAT.dexterity, row.dexterity),
    stat(STAT.vitality, row.vitality),
    stat(STAT.maxLife, life * 2 ** FIXED_POINT),
    stat(STAT.life, life * 2 ** FIXED_POINT),
    stat(STAT.maxMana, row.energy * 2 ** FIXED_POINT),
    stat(STAT.mana, row.energy * 2 ** FIXED_POINT),
    stat(STAT.maxStamina, row.stamina * 2 ** FIXED_POINT),
    stat(STAT.stamina, row.stamina * 2 ** FIXED_POINT),
    stat(STAT.level, 1),
    stat(STAT.experience, 0),
    stat(STAT.gold, 0),
    // The level-1 threshold from `experience.txt`; 500 in the shipped data. It has
    // no width in a save, so it is rebuilt rather than read, but the character
    // carries it and every later level-up compares against it.
    stat(STAT.nextLevelExperience, nextLevelExperience),
    stat(STAT.fireResistanceCap, 100),
    stat(STAT.coldResistanceCap, 100),
    stat(STAT.lightningResistanceCap, 100),
  ]
}

/**
 * The skills a new character knows, in the order they are added.
 *
 * Attack first, then the class's own ten `Skill 1..10` columns — which is where
 * the shared kit (Throw, Kick, the Identify and Town Portal scrolls, Unsummon)
 * and the Barbarian's extra swings come from. `skillIdOf` resolves a name to an
 * id; a name the skill table does not know is skipped, as the original skips an
 * id outside the skill list.
 */
export function initialSkills(
  row: CharStatsRow,
  skillIdOf: (name: string) => number | null,
): number[] {
  const ids = [0]
  for (const name of row.skills) {
    const id = skillIdOf(name)
    if (id === null || id < 0) continue
    ids.push(id)
  }
  return ids
}

/**
 * The skill the right mouse button starts on.
 *
 * Only some classes name one (`StartSkill`): the Sorceress Fire Bolt, the
 * Necromancer Raise Skeleton. It is set only in act 0, and only if the class's
 * own skill list actually holds it — the original looks the skill up before
 * assigning, so a `StartSkill` the class cannot use leaves the button on Attack.
 */
export function initialRightSkill(
  row: CharStatsRow,
  act: number,
  known: readonly number[],
  skillIdOf: (name: string) => number | null,
): number {
  if (act !== 0 || row.startSkill === null) return 0
  const id = skillIdOf(row.startSkill)
  if (id === null || !known.includes(id)) return 0
  return id
}

/**
 * The `if` section of a new character's save.
 *
 * A save stores the class's own skills' base levels, and a new character has none
 * of them: everything it knows comes from items and from being added with a
 * level, which is why these bytes are all zero and the skill list itself is not in
 * the file at all.
 */
export function initialSkillBytes(skillCount = 30): Uint8Array {
  return new Uint8Array(skillCount)
}

/** One slot of a class's starting kit: what the item is and how many copies of it. */
export interface KitSlot {
  code: string
  count: number
}

/** An item the creation made, before any affix has looked at it. */
export interface CreatedItem {
  code: string
  /**
   * `Unit+0x28`: the low word the unit seed was created from.
   *
   * This is the "item seed" a save stores and a reload restores, so it has to
   * survive the draws that follow it — which is why it is kept beside the seed
   * rather than read back out of it.
   */
  unitId: number
  /**
   * The item's unit seed, after its base stats were drawn. The base stats are what
   * this seed decided; nothing later moves it.
   */
  unitSeed: Seed
  /** The item seed, after the socket roll — the seed the affixes build on. */
  itemSeed: Seed
  /** The low word the item seed was created from, which the socket count uses. */
  start: number
  base: BaseStats
  /** The socket roll: it happens for a socketable base even when the result is thrown away. */
  sockets: SocketRoll
}

/**
 * The starting kit, rolled the way the game rolls it.
 *
 * Each copy takes exactly two draws from the game seed — one for its unit seed, one
 * for its item seed — and everything else it decides comes from those two. That is
 * why the kit's size alone fixes the game seed's position when creation finishes:
 * seven copies for the Sorceress and Necromancer, eight for the rest.
 *
 * The ethereal roll is not here because a starting item skips it before drawing.
 * The socket roll IS here because it draws first and refuses afterwards, so
 * leaving it out would put every later item one draw ahead.
 */
export function rollStartingItems(
  kit: readonly KitSlot[],
  bases: (code: string) => ItemBaseRecord | null,
  gameSeed: Seed,
  options: { ilvl?: number; difficultyCap?: number } = {},
): CreatedItem[] {
  const ilvl = options.ilvl ?? 1
  const difficultyCap = options.difficultyCap ?? 3
  const items: CreatedItem[] = []
  for (const slot of kit) {
    const base = bases(slot.code)
    if (base === null) continue
    for (let copy = 0; copy < slot.count; copy += 1) {
      step(gameSeed)
      const unitId = gameSeed.low
      const unitSeed: Seed = { low: unitId, high: 666 }
      step(gameSeed)
      const start = gameSeed.low
      const itemSeed: Seed = { low: start, high: 666 }
      const baseStats = rollBaseStats(base, unitSeed)
      // The normal builder runs between the base stats and the sockets, and a base
      // that can carry class skills takes its count roll here even when it ends up
      // with none. The rest of that phase is not implemented, so an item that does
      // roll a mod stops instead of producing seeds that are quietly wrong.
      if (base.staffMods < 7) {
        const mods = rollStaffModCount(itemSeed)
        if (mods > 0) {
          throw new Error(
            `${slot.code}: the staff-mod phase rolled ${mods} mod(s); its skill picks are not implemented yet`,
          )
        }
      }
      // A starting item never gets sockets — but the roll is taken first, so the
      // seed still moves and every later item's seeds depend on it.
      const sockets = rollSockets(itemSeed, base, ilvl, start, difficultyCap, true)
      items.push({ code: slot.code, unitId, unitSeed, itemSeed, start, base: baseStats, sockets })
    }
  }
  return items
}

/** Where a starting item ends up, as the game's own inventory address. */
export type ItemPlacement =
  | { kind: 'equipped'; bodyLoc: number }
  | { kind: 'belt'; box: number }
  | { kind: 'inventory'; x: number; y: number }

/** The default belt: four boxes, which sit in the bottom row of the grid. */
const BELT_BOXES = 4

/** The inventory page a starting item lands on, in cells. */
const INVENTORY = { width: 10, height: 4 } as const

/**
 * Where each starting item goes.
 *
 * The order the game tries is: the belt if the base can go in one, then the slot
 * `itemNloc` names, then the inventory. An item that is neither equipped nor
 * belted gets a 1×1 spot searched **from the bottom-right corner** — columns from
 * the right, rows from the bottom — which is why a new character's scrolls land on
 * (9, 3) and then (9, 2) rather than the top-left.
 *
 * Two limits, stated rather than worked around: multi-cell items use a different,
 * scored search that is not implemented here, and a belt box is placed as a box
 * index — the save's own coordinate for one is not in the source spec.
 */
export function placeStartingItems(
  kit: ReadonlyArray<KitSlot & { bodyLoc?: number; beltable?: boolean }>,
): ItemPlacement[] {
  const grid: boolean[][] = Array.from({ length: INVENTORY.height }, () =>
    Array.from({ length: INVENTORY.width }, () => false),
  )
  // The belt itself occupies the bottom row's first four cells.
  for (let box = 0; box < BELT_BOXES; box += 1) grid[INVENTORY.height - 1][box] = true

  const taken: boolean[] = Array.from({ length: BELT_BOXES }, () => false)
  const placements: ItemPlacement[] = []
  for (const slot of kit) {
    for (let copy = 0; copy < slot.count; copy += 1) {
      if (slot.beltable === true) {
        const box = taken.indexOf(false)
        if (box >= 0) {
          taken[box] = true
          placements.push({ kind: 'belt', box })
          continue
        }
      }
      if ((slot.bodyLoc ?? 0) !== 0) {
        placements.push({ kind: 'equipped', bodyLoc: slot.bodyLoc! })
        continue
      }
      let free: { x: number; y: number } | null = null
      for (let x = INVENTORY.width - 1; x >= 0 && free === null; x -= 1) {
        for (let y = INVENTORY.height - 1; y >= 0; y -= 1) {
          if (!grid[y][x]) {
            free = { x, y }
            break
          }
        }
      }
      if (free === null) throw new Error(`${slot.code}: no room left in the starting inventory`)
      grid[free.y][free.x] = true
      placements.push({ kind: 'inventory', x: free.x, y: free.y })
    }
  }
  return placements
}
