/**
 * The browser side of skills: fetch the tables, build the runtime.
 *
 * `skills.ts` takes parsed rows and owns the calc evaluation; this only knows
 * where the rows come from. With it, a skill's damage and mana are the numbers
 * the game's own formulas produce rather than a curve someone chose.
 */

import { parseSkillTables, SkillRuntime, type SkillTables, type TableRow } from './skills'

const REQUIRED = ['skills', 'skilldesc', 'missiles', 'skillcalc', 'misscalc'] as const

export interface SkillDataSource {
  runtime: SkillRuntime
  tables: SkillTables
  missing: string[]
}

export async function createSkillDataSource(base: string): Promise<SkillDataSource | null> {
  const rows: Partial<Record<(typeof REQUIRED)[number], TableRow[]>> = {}
  const missing: string[] = []

  await Promise.all(
    REQUIRED.map(async (name) => {
      try {
        const response = await fetch(`${base}original/table_${name}.json`, { cache: 'no-store' })
        if (!response.ok) {
          missing.push(name)
          return
        }
        rows[name] = (await response.json()) as TableRow[]
      } catch {
        missing.push(name)
      }
    }),
  )

  if (!rows.skills) return null

  const tables = parseSkillTables({
    skills: rows.skills,
    skilldesc: rows.skilldesc,
    missiles: rows.missiles,
    skillcalc: rows.skillcalc,
    misscalc: rows.misscalc,
  })

  return { runtime: new SkillRuntime(tables), tables, missing }
}
