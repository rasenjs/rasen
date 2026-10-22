/**
 * Checks the difficulty table and reports the gap between what the game has and
 * what this code exposes.
 *
 * The interesting claim is monotonicity: every knob in `difficultylevels.txt` makes
 * the game **harder** from Normal to Nightmare to Hell, so a column that moves the
 * wrong way is a misreading rather than a design choice. The tool checks the
 * direction of the ones that matter and prints which columns the module names and
 * which it does not, so the uncovered remainder is a count.
 *
 * Usage: tsx examples/arpg/tools/verify-difficulty.ts
 */

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { difficultySuffix, parseDifficulties, type DifficultyName } from '../src/d2/difficulty'
import type { TableRow } from '../src/d2/monsters'

const root = resolve(import.meta.dirname, '../public/original')

function main(): void {
  const rows = JSON.parse(readFileSync(join(root, 'table_difficultylevels.json'), 'utf8')) as TableRow[]
  const table = parseDifficulties(rows)

  console.log(
    `difficulty: ${table.levels.length} levels (${table.levels.map((l) => l.name).join(', ')}), ` +
      `${table.named.length + table.unnamed.length} numeric columns`,
  )
  console.log(
    `difficulty: ${table.named.length} named by the module, ${table.unnamed.length} not: ${table.unnamed.join(', ')}`,
  )
  for (const level of table.levels) {
    console.log(
      `  ${level.name.padEnd(9)} resist ${String(level.resistPenalty).padStart(4)}, ` +
        `death exp -${level.deathExpPenalty}%, monster skills +${level.monsterSkillBonus}, ` +
        `freeze ÷${level.fields.MonsterFreezeDivisor}, lifesteal ÷${level.fields.LifeStealDivisor}`,
    )
  }

  const problems: string[] = []
  const order: DifficultyName[] = ['Normal', 'Nightmare', 'Hell']

  // The resistance penalty must fall.
  const penalties = order.map((name) => table.byName.get(name)?.resistPenalty ?? 0)
  for (let i = 1; i < penalties.length; i += 1) {
    if (penalties[i] >= penalties[i - 1]) problems.push(`ResistPenalty does not fall at ${order[i]}`)
  }

  // The divisors must rise, and the damage bonuses must fall.
  for (const column of ['MonsterFreezeDivisor', 'MonsterColdDivisor', 'AiCurseDivisor', 'LifeStealDivisor', 'ManaStealDivisor']) {
    const values = order.map((name) => table.byName.get(name)?.fields[column] ?? 0)
    for (let i = 1; i < values.length; i += 1) {
      if (values[i] <= values[i - 1]) problems.push(`${column} does not rise at ${order[i]}`)
    }
  }
  for (const column of ['UniqueDamageBonus', 'ChampionDamageBonus', 'MonsterCEDamagePercent']) {
    const values = order.map((name) => table.byName.get(name)?.fields[column] ?? 0)
    for (let i = 1; i < values.length; i += 1) {
      if (values[i] >= values[i - 1]) problems.push(`${column} does not fall at ${order[i]}`)
    }
  }

  // `divided` must be the table's own arithmetic.
  for (const level of table.levels) {
    const divisor = level.fields.MonsterFreezeDivisor ?? 1
    if (Math.abs(level.divided('MonsterFreezeDivisor', 100) - 100 / divisor) > 1e-9) {
      problems.push(`${level.name}: divided() disagrees with the divisor column`)
    }
  }

  // The suffixes must match the convention the stat tables use.
  const suffixes = order.map(difficultySuffix)
  if (suffixes.join(',') !== ',(N),(H)') problems.push(`difficultySuffix gives ${suffixes.join(',')}`)
  console.log(`difficulty: the stat-table suffixes are ${JSON.stringify(suffixes)}`)

  for (const problem of problems) console.error(`  ${problem}`)
  if (problems.length > 0) {
    console.error('verify-difficulty: FAILED')
    process.exitCode = 1
    return
  }
  console.log('verify-difficulty: OK')
}

main()
