/**
 * `shrines.txt` — the act's shrines and what touching one does.
 *
 * A shrine is placed on a map as an object, and `objects.txt`'s `ShrineFunction`
 * column is the link: the object says *which* shrine, this table says what it
 * does. 23 rows, grouped by an `effectclass` that is the game's own taxonomy:
 *
 * | `effectclass` | rows | `*Shrine Type` | what it is |
 * | --- | --- | --- | --- |
 * | 0 | 1 | `None` | the null row |
 * | 1 | 7 | `Magic` | the one-shot magic effects (town portal, gem upgrade, …) |
 * | 2 | 2 | `Recharge` | life |
 * | 3 | 2 | `Recharge` | mana |
 * | 4 | 11 | `Recharge` / `Booster` | both pools, and the timed stat boosts |
 *
 * ## What this module can and cannot do
 *
 * The table states each row's effect **in prose** (`Gain full Life and Mana`,
 * `Increases Defense`) plus `Arg0`/`Arg1`/`Duration in frames` — and the prose is
 * the game's own `*Effect` column, not something derived. So the recharge class can
 * be applied exactly, and the booster class needs the magnitude, which the prose
 * does not always state: "Increases Defense" says what, not by how much.
 *
 * That difference is why {@link ShrineApplication} distinguishes `applied` from
 * `unmodelled`. A shrine whose magnitude the data does not carry is reported as
 * `unmodelled` with its own prose for the message rather than being given an
 * invented number. That is the honest outcome, and it is what the verification tool
 * counts.
 *
 * The messages are the game's own: `StringName`/`StringPhrase` are keys into
 * `strings_shrines.json`, resolved by the loader rather than baked in here.
 */

import { tableNumber, tableString, type TableRow } from './monsters'

/** The game's own effect taxonomy, from the `effectclass` column. */
export type ShrineEffectClass = 'none' | 'magic' | 'life' | 'mana' | 'pool-and-boost'

/** `*Shrine Type`. */
export type ShrineType = 'None' | 'Recharge' | 'Booster' | 'Magic'

export interface ShrineDef {
  /** `Code` — the id `objects.txt`'s `ShrineFunction` refers to. */
  readonly code: number
  readonly name: string
  readonly type: ShrineType
  /** `*Effect` — the game's own description of what it does. */
  readonly effect: string
  readonly effectClass: number
  /** `Arg0`/`Arg1`, whatever the row's effect means by them. */
  readonly arg0: number | null
  readonly arg1: number | null
  /** `Duration in frames` — present only for the timed effects. */
  readonly durationFrames: number | null
  /** `reset time in minutes` — how long before it can be used again. */
  readonly resetMinutes: number | null
  /** `rarity` — the selection weight when a map generator picks one. */
  readonly rarity: number
  /** `LevelMin` — the lowest area level the shrine may appear in. */
  readonly levelMin: number
  /** `StringName`/`StringPhrase` — keys into `strings_shrines.json`. */
  readonly nameKey: string | null
  readonly phraseKey: string | null
}

export interface ShrineTable {
  readonly shrines: readonly ShrineDef[]
  byCode: ReadonlyMap<number, ShrineDef>
  /** The rows whose effect the module can apply, by code. */
  readonly applicable: ReadonlySet<number>
}

const EFFECT_CLASSES: Record<number, ShrineEffectClass> = {
  0: 'none',
  1: 'magic',
  2: 'life',
  3: 'mana',
  4: 'pool-and-boost',
}

export function effectClassOf(effectClass: number): ShrineEffectClass {
  return EFFECT_CLASSES[effectClass] ?? 'none'
}

function typeOf(value: string | null): ShrineType {
  return value === 'Recharge' || value === 'Booster' || value === 'Magic' ? value : 'None'
}

export function parseShrines(rows: readonly TableRow[]): ShrineTable {
  const shrines: ShrineDef[] = []
  const byCode = new Map<number, ShrineDef>()

  for (const row of rows) {
    const code = tableNumber(row.Code)
    if (code === null) continue
    const def: ShrineDef = {
      code,
      name: tableString(row.Name) ?? `Shrine ${code}`,
      type: typeOf(tableString(row['*Shrine Type'])),
      effect: tableString(row['*Effect']) ?? '',
      effectClass: tableNumber(row.effectclass) ?? 0,
      arg0: tableNumber(row.Arg0),
      arg1: tableNumber(row.Arg1),
      durationFrames: tableNumber(row['Duration in frames']),
      resetMinutes: tableNumber(row['reset time in minutes']),
      rarity: tableNumber(row.rarity) ?? 1,
      levelMin: tableNumber(row.LevelMin) ?? 0,
      nameKey: tableString(row.StringName),
      phraseKey: tableString(row.StringPhrase),
    }
    shrines.push(def)
    byCode.set(code, def)
  }

  // A shrine is applicable when its own prose names a pool it refills. The test is
  // on the game's text rather than on a list of codes, so a row this build does not
  // have is handled the same way as one it does.
  const applicable = new Set<number>()
  for (const def of shrines) {
    const text = def.effect.toLowerCase()
    if (text.includes('full life and mana') || text === 'gain full life' || text === 'gain full mana') {
      applicable.add(def.code)
    }
  }

  return { shrines, byCode, applicable }
}

/** The pools a shrine can touch. Numbers rather than an entity type, so this does not
 * depend on the simulation and can be tested on its own. */
export interface ShrinePools {
  readonly hp: number
  readonly maxHp: number
  readonly mana: number
  readonly maxMana: number
}

/** What applying a shrine did. */
export interface ShrineApplication {
  /** True when a number changed. */
  readonly applied: boolean
  /** True when the shrine has an effect this module cannot compute. */
  readonly unmodelled: boolean
  /** The phrase key the shrine announces itself with, if it has one. */
  readonly phraseKey: string | null
  /** The shrine's own prose, for a caller that wants to show it. */
  readonly effect: string
}

/**
 * Applies a shrine to a character's pools.
 *
 * The three cases the table states exactly are the three implemented — full life,
 * full mana, and both — because those need no magnitude. Everything else is
 * `unmodelled`, including the timed boosters whose prose gives the direction but not
 * the amount.
 */
export function applyShrine(def: ShrineDef, pools: ShrinePools): {
  pools: ShrinePools
  result: ShrineApplication
} {
  const effectClass = effectClassOf(def.effectClass)
  const text = def.effect.toLowerCase()

  if (effectClass === 'life' && text === 'gain full life') {
    return {
      pools: { ...pools, hp: pools.maxHp },
      result: { applied: true, unmodelled: false, phraseKey: def.phraseKey, effect: def.effect },
    }
  }
  if (effectClass === 'mana' && text === 'gain full mana') {
    return {
      pools: { ...pools, mana: pools.maxMana },
      result: { applied: true, unmodelled: false, phraseKey: def.phraseKey, effect: def.effect },
    }
  }
  if (text.includes('full life and mana')) {
    return {
      pools: { ...pools, hp: pools.maxHp, mana: pools.maxMana },
      result: { applied: true, unmodelled: false, phraseKey: def.phraseKey, effect: def.effect },
    }
  }

  return {
    pools,
    result: {
      applied: false,
      // The null row is not an unmodelled effect: it has no effect at all.
      unmodelled: effectClass !== 'none',
      phraseKey: def.phraseKey,
      effect: def.effect,
    },
  }
}

/**
 * Picks a shrine a map generator may place, weighted by `rarity` and bounded by the
 * area's level.
 *
 * The null row is excluded because it is not a shrine, and `random` is called as a
 * function so a caller can pass the simulation's own deterministic generator.
 */
export function pickShrine(
  table: ShrineTable,
  areaLevel: number,
  random: () => number,
): ShrineDef | null {
  const eligible = table.shrines.filter((def) => def.code !== 0 && def.levelMin <= areaLevel)
  const total = eligible.reduce((sum, def) => sum + Math.max(0, def.rarity), 0)
  if (total <= 0) return null
  let roll = random() * total
  for (const def of eligible) {
    roll -= Math.max(0, def.rarity)
    if (roll <= 0) return def
  }
  return eligible[eligible.length - 1] ?? null
}
