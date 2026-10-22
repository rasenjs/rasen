/**
 * `difficultylevels.txt` — the three difficulties and every knob they turn.
 *
 * Three rows, 33 columns, and they are the game's own answer to "what does
 * Nightmare change". The ones that matter to a playable slice:
 *
 * | column | Normal | Nightmare | Hell | what it does |
 * | --- | --- | --- | --- | --- |
 * | `ResistPenalty` | 0 | -40 | -100 | subtracted from the player's resistances |
 * | `DeathExpPenalty` | 0 | 5 | 10 | percent of a level's experience lost on death |
 * | `MonsterSkillBonus` | 0 | 3 | 7 | added to every monster skill's level |
 * | `MonsterFreezeDivisor` | 1 | 2 | 4 | divides how long a freeze lasts |
 * | `MonsterColdDivisor` | 1 | 2 | 4 | divides chill duration |
 * | `AiCurseDivisor` | 1 | 2 | 4 | divides curse duration |
 * | `LifeStealDivisor` | 1 | 2 | 3 | divides life leeched |
 * | `ManaStealDivisor` | 1 | 2 | 3 | divides mana leeched |
 * | `UniqueDamageBonus` | 90 | 75 | 66 | percent of damage a unique deals |
 * | `ChampionDamageBonus` | 90 | 75 | 66 | likewise for champions |
 * | `MonsterCEDamagePercent` | 50 | 35 | 20 | percent of corpse-explosion damage |
 * | `StaticFieldMin` | 0 | 33 | 50 | the floor Static Field may not take a monster below |
 * | `ResistFloor` | -100 | -100 | -100 | the lowest a resistance may be pushed to |
 *
 * ## Divisors, not multipliers
 *
 * The column names say it and the numbers confirm it: a divisor of 2 halves the
 * effect in Nightmare and 4 quarters it in Hell. So the honest API is
 * {@link DifficultyLevel.divided}, which is how a caller asks for "freeze duration
 * in this difficulty" rather than multiplying by an invented factor.
 *
 * ## Why the whole file rather than the fields above
 *
 * The columns are read generically and kept in {@link DifficultyLevel.fields}, so a
 * column this module does not name is still reachable and still reported. The
 * verification tool prints the named set and the unnamed remainder, so the gap
 * between "what the game has" and "what this code uses" is a count rather than an
 * impression. 33 columns exist; the doc above names 13.
 */

import { tableNumber, tableString, type TableRow } from './monsters'

/** The three difficulties, in the table's own order. */
export type DifficultyName = 'Normal' | 'Nightmare' | 'Hell'

export interface DifficultyLevel {
  readonly name: DifficultyName
  /** Every numeric column, by the table's own spelling. */
  readonly fields: Readonly<Record<string, number>>
  /** The resistance penalty, as the table stores it (0, -40, -100). */
  readonly resistPenalty: number
  /** Percent of a level's experience lost on death (0, 5, 10). */
  readonly deathExpPenalty: number
  /** Levels added to every monster skill (0, 3, 7). */
  readonly monsterSkillBonus: number
  /** The lowest a resistance may be pushed to. */
  readonly resistFloor: number
  /**
   * An effect's value after this difficulty's divisor.
   *
   * `divided('MonsterFreezeDivisor', 100)` is 100 in Normal and 25 in Hell —
   * the column names say "divisor" and the numbers agree.
   */
  divided(column: string, value: number): number
}

export interface DifficultyTable {
  readonly levels: readonly DifficultyLevel[]
  byName: ReadonlyMap<string, DifficultyLevel>
  /** The columns this module exposes, for a caller reporting coverage. */
  readonly named: readonly string[]
  /** The numeric columns it does not name. */
  readonly unnamed: readonly string[]
}

/** The columns with a dedicated accessor above. */
const NAMED_COLUMNS: readonly string[] = [
  'ResistPenalty',
  'DeathExpPenalty',
  'MonsterSkillBonus',
  'MonsterFreezeDivisor',
  'MonsterColdDivisor',
  'AiCurseDivisor',
  'LifeStealDivisor',
  'ManaStealDivisor',
  'UniqueDamageBonus',
  'ChampionDamageBonus',
  'MonsterCEDamagePercent',
  'StaticFieldMin',
  'ResistFloor',
]

function nameOf(value: string | null): DifficultyName | null {
  return value === 'Normal' || value === 'Nightmare' || value === 'Hell' ? value : null
}

export function parseDifficulties(rows: readonly TableRow[]): DifficultyTable {
  const levels: DifficultyLevel[] = []
  const byName = new Map<string, DifficultyLevel>()
  const seen = new Set<string>()

  for (const row of rows) {
    const name = nameOf(tableString(row.Name))
    if (name === null) continue
    const fields: Record<string, number> = {}
    for (const [key, value] of Object.entries(row)) {
      if (key === 'Name') continue
      const amount = tableNumber(value)
      if (amount === null) continue
      fields[key] = amount
      seen.add(key)
    }
    const read = (column: string): number => fields[column] ?? 0
    const level: DifficultyLevel = {
      name,
      fields,
      resistPenalty: read('ResistPenalty'),
      deathExpPenalty: read('DeathExpPenalty'),
      monsterSkillBonus: read('MonsterSkillBonus'),
      resistFloor: read('ResistFloor'),
      divided: (column: string, value: number): number => {
        const divisor = read(column)
        // A divisor of 0 is not in the table, but dividing by it would be an
        // infinity rather than a number, so the value passes through instead.
        return divisor === 0 ? value : value / divisor
      },
    }
    levels.push(level)
    byName.set(name, level)
  }

  const all = [...seen]
  return {
    levels,
    byName,
    named: NAMED_COLUMNS.filter((column) => seen.has(column)),
    unnamed: all.filter((column) => !NAMED_COLUMNS.includes(column)),
  }
}

/**
 * The column the monster stat tables use for a difficulty.
 *
 * `monstats` and `monlvl` spell their difficulty variants with an empty suffix for
 * Normal and `(N)`/`(H)` for the others — `MinHP`, `MinHP(N)`, `MinHP(H)`.
 *
 * **This rule lives in two places and this is the second one.** `monsters.ts`
 * applies it in a private `perDifficulty` helper with the suffixes written inline,
 * which is where the stat tables are actually read; this function exists so a
 * caller holding a difficulty *name* can build a column key without reaching into
 * that file. Two spellings of one rule is a smell, and the honest thing to do is to
 * say so rather than pretend otherwise: `tools/verify-difficulty.ts` asserts this
 * function returns `['', '(N)', '(H)']` so that if the two ever diverge, the tool
 * fails instead of one of them silently going its own way.
 *
 * Note also the two vocabularies: this module uses the table's own spellings
 * (`Normal`), while `monsters.ts` uses lower-case keys (`normal`) because they index
 * a record. They are deliberately not unified here — changing `monsters.ts`'s public
 * type would ripple through everything that reads monster stats for no gain.
 */
export function difficultySuffix(name: DifficultyName): string {
  return name === 'Normal' ? '' : name === 'Nightmare' ? '(N)' : '(H)'
}
