/**
 * The game's own rule tables.
 *
 * Everything here comes from the retail package's `global/excel/*.txt` — the
 * same tables the original game loads: 429 skills (240 player-castable),
 * 751 monsters, 439 unique items, 1,510 affixes, 692 base items and 139 levels.
 * They were exported to JSON by `tools/export-tables.py` so the browser does not
 * have to parse tab-separated files.
 *
 * ## Why this matters
 *
 * Using the real tables is the difference between a game that *looks* like
 * Diablo and one that *is* Diablo's content: the monsters are the actual
 * monsters with their actual levels and health, the skills are the actual skills
 * with their actual mana costs, the area names are the actual area names. The
 * numbers are not invented.
 *
 * ## What the tables do not contain
 *
 * Behaviour. A skill row says it fires `magicarrow` for 12 mana at level 20; it
 * does not say what a magic arrow does, because that is compiled into the game's
 * program. So the tables drive the *data* faithfully while the *rules* remain a
 * reimplementation. That distinction is the honest limit of this approach, and
 * it is why the reference project runs the original binary instead.
 */

export interface SkillRow {
  id: number
  /** The table's own key, e.g. `MagicArrow`. */
  name: string
  /** The localized display name, e.g. `Magic Arrow`, from the string tables. */
  nameDisplay: string
  nameZh: string
  charClass: string
  /** Two-letter class code, matching the icon atlas file names. */
  classCode: string
  /**
   * Which frame of the class's icon atlas this skill is.
   *
   * The atlases are one sheet of 30 equal frames per class, ordered exactly as
   * `skills.txt` lists that class's rows, so the index among the class's skills
   * *is* the frame.
   */
  iconFrame: number
  description: string
  maxLevel: number
  mana: number
  requiredLevel: number
  missile: string
  leftSkill: boolean
  rightSkill: boolean
}

export interface MonsterRow {
  id: string
  name: string
  nameZh: string
  level: number
  minHp: number
  maxHp: number
  speed: number
  armor: number
  damage: number
  xp: number
  acts: number[]
}

export interface UniqueRow {
  name: string
  base: string
  level: number
}

export interface BaseItemRow {
  name: string
  code: string
  kind: 'weapon' | 'armor' | 'misc'
  levelReq: number
}

export interface LevelRow {
  id: number
  /** String-table key, e.g. `Rogue Encampment`. */
  key: string
  /** Localized area name, e.g. `Rogue Encampment`. */
  name: string
  nameZh: string
  /** The table's dev label, e.g. `Act 1 - Town`. */
  devName: string
  /** 1-based act, as the game displays it. */
  act: number
  monsterLevel: number
  monsters: number[]
}

import { parseExperience, type ExperienceTable } from './d2/experience'

/** One quest, as the string tables name it. */
export interface QuestRow {
  index: number
  name: string
  nameZh: string
}

export interface ActQuests {
  act: number
  quests: QuestRow[]
}

export interface GameData {
  skills: SkillRow[]
  monsters: MonsterRow[]
  uniqueItems: UniqueRow[]
  magicPrefixes: string[]
  magicSuffixes: string[]
  weapons: BaseItemRow[]
  armor: BaseItemRow[]
  misc: BaseItemRow[]
  levels: LevelRow[]
  quests: ActQuests[]
  /**
   * The real levelling table, or null when it was not exported.
   *
   * Null means the simulation falls back to its own curve, so a partial export
   * still levels a character rather than dividing by zero.
   */
  experience: ExperienceTable | null
}

/** Directory holding the exported tables (the git-ignored extraction output). */
async function loadTable<T>(base: string, name: string, prefix = 'gamedata_'): Promise<T[]> {
  try {
    const response = await fetch(`${base}original/${prefix}${name}.json`, { cache: 'no-store' })
    if (!response.ok) return []
    return (await response.json()) as T[]
  } catch {
    // A missing table means the tables were not exported; the game falls back to
    // its own content rather than failing to start.
    return []
  }
}

/**
 * Load every table.
 *
 * Returns empty arrays when the export is absent, so callers can treat "no real
 * data" and "not extracted" the same way: fall back to built-in content.
 */
export async function loadGameData(base: string): Promise<GameData> {
  const [
    skills,
    monsters,
    uniqueItems,
    magicPrefixes,
    magicSuffixes,
    weapons,
    armor,
    misc,
    levels,
    quests,
    experience,
  ] = await Promise.all([
    loadTable<SkillRow>(base, 'skills'),
    loadTable<MonsterRow>(base, 'monsters'),
    loadTable<UniqueRow>(base, 'uniqueItems'),
    loadTable<string>(base, 'magicPrefixes'),
    loadTable<string>(base, 'magicSuffixes'),
    loadTable<BaseItemRow>(base, 'weapons'),
    loadTable<BaseItemRow>(base, 'armor'),
    loadTable<BaseItemRow>(base, 'misc'),
    loadTable<LevelRow>(base, 'levels'),
    loadTable<ActQuests>(base, 'quests'),
    // `experience.txt` was exported under the `table_` prefix rather than
    // `gamedata_`, so it is read by its own name rather than through `loadTable`.
    loadTable<Record<string, string | null>>(base, 'experience', 'table_'),
  ])
  return {
    skills,
    monsters,
    uniqueItems,
    magicPrefixes,
    magicSuffixes,
    weapons,
    armor,
    misc,
    levels,
    quests,
    experience: experience.length > 0 ? parseExperience(experience) : null,
  }
}

/** How much of the real data actually loaded, for a startup readout. */
export function gameDataSummary(data: GameData): string {
  return [
    `${data.skills.length} skills`,
    `${data.monsters.length} monsters`,
    `${data.uniqueItems.length} uniques`,
    `${data.levels.length} areas`,
  ].join(' · ')
}

/** True when the tables were found — used to decide whether to use real content. */
export function hasGameData(data: GameData): boolean {
  return data.monsters.length > 0 || data.skills.length > 0
}
