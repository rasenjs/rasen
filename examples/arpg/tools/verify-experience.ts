/**
 * Checks the levelling table against the shape the game's own data has.
 *
 * `experience.txt` stores **cumulative totals** and a `MaxLvl` header row that is
 * not a level. Both are easy to get wrong in a way that still produces a plausible
 * number, so the checks below are structural rather than a spot value:
 *
 * - every level from 0 to the cap is present exactly once;
 * - the totals are non-decreasing (a levelling table that goes backwards would make
 *   `xpToNext` negative);
 * - `xpToNext` is the difference of consecutive totals, and the sum of every
 *   `xpToNext` telescopes back to the final total;
 * - `ExpRatio` is non-increasing, which is what makes a low-level monster worthless
 *   to a high-level character;
 * - which class columns actually differ from each other, reported as a count rather
 *   than assumed.
 *
 * Usage: tsx examples/arpg/tools/verify-experience.ts
 */

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseExperience } from '../src/d2/experience'
import type { TableRow } from '../src/d2/monsters'

const root = resolve(import.meta.dirname, '../public/original')

function main(): void {
  const rows = JSON.parse(readFileSync(join(root, 'table_experience.json'), 'utf8')) as TableRow[]
  const table = parseExperience(rows)

  console.log(
    `experience: ${rows.length} rows, ${table.classes.length} classes (${table.classes.join(', ')}), cap ${table.maxLevel}`,
  )

  const problems: string[] = []

  // Every level present, and the totals non-decreasing.
  let missing = 0
  let backwards = 0
  for (const name of table.classes) {
    let previous = -1
    for (let level = 0; level <= table.maxLevel; level += 1) {
      const total = table.totalFor(name, level)
      if (total === 0 && level > 0) missing += 1
      if (total < previous) backwards += 1
      previous = total
    }
  }
  if (missing > 0) problems.push(`${missing} class/level cells are zero above level 0`)
  if (backwards > 0) problems.push(`${backwards} class/level totals go backwards`)

  // The telescoping check: the per-level costs must sum to the final total.
  let telescopes = 0
  let mismatched = 0
  for (const name of table.classes) {
    let sum = 0
    for (let level = 0; level < table.maxLevel; level += 1) sum += table.xpToNext(name, level)
    if (sum === table.totalFor(name, table.maxLevel)) telescopes += 1
    else mismatched += 1
  }
  if (mismatched > 0) problems.push(`${mismatched} classes whose xpToNext does not sum to the cap total`)

  // ExpRatio must not rise with level.
  let ratioRises = 0
  for (let level = 1; level <= table.maxLevel; level += 1) {
    if (table.expRatio(level) > table.expRatio(level - 1)) ratioRises += 1
  }
  if (ratioRises > 0) problems.push(`ExpRatio rises at ${ratioRises} levels`)

  // At the cap there is nothing more to gain.
  const capGain = table.xpToNext(table.classes[0] ?? '', table.maxLevel)
  if (capGain !== 0) problems.push(`xpToNext at the cap is ${capGain}, expected 0`)

  // Which columns actually differ: a fact about this build, not an assumption.
  const first = table.classes[0] ?? ''
  let differing = 0
  for (const name of table.classes.slice(1)) {
    for (let level = 0; level <= table.maxLevel; level += 1) {
      if (table.totalFor(name, level) !== table.totalFor(first, level)) {
        differing += 1
        break
      }
    }
  }
  console.log(
    `experience: ${table.classes.length - 1 - differing} of ${table.classes.length - 1} other class columns agree with ${first}; ${differing} differ`,
  )
  console.log(`experience: ${telescopes} classes telescope to their cap total, ${mismatched} do not`)
  console.log(
    `experience: total at the cap ${table.totalFor(first, table.maxLevel).toLocaleString('en-US')}, ` +
      `cost of the last level ${table.xpToNext(first, table.maxLevel - 1).toLocaleString('en-US')}`,
  )
  console.log(
    `experience: ExpRatio ${table.expRatio(0)} at level 0, ${table.expRatio(Math.floor(table.maxLevel / 2))} at the middle, ${table.expRatio(table.maxLevel)} at the cap`,
  )
  for (const level of [1, 2, 10, 50, 99]) {
    console.log(`  level ${String(level).padStart(2)}: ${table.xpToNext(first, level).toLocaleString('en-US')} to next`)
  }

  for (const problem of problems) console.error(`  ${problem}`)
  if (problems.length > 0) {
    console.error('verify-experience: FAILED')
    process.exitCode = 1
    return
  }
  console.log('verify-experience: OK')
}

main()
