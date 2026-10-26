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
