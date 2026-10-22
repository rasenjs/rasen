/**
 * Checks the shrine table against the game's own taxonomy.
 *
 * The claim worth checking is not "the table parses" but **how much of it this
 * module can actually carry out**: the recharge rows state their effect exactly
 * (`Gain full Life`), while the booster rows name a direction without a magnitude
 * (`Increases Defense`). The tool reports both sets by name so the gap is a count
 * rather than an impression.
 *
 * It also checks the link that makes shrines reachable at all: `objects.txt`'s
 * `ShrineFunction` must be a code this table has, because that is how a placed
 * object finds its effect.
 *
 * Usage: tsx examples/arpg/tools/verify-shrines.ts
 */

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { applyShrine, effectClassOf, parseShrines } from '../src/d2/shrines'
import { parseObjectTable } from '../src/d2/objects'
import type { TableRow } from '../src/d2/monsters'

const root = resolve(import.meta.dirname, '../public/original')

function main(): void {
  const shrineRows = JSON.parse(readFileSync(join(root, 'table_shrines.json'), 'utf8')) as TableRow[]
  const objectRows = JSON.parse(readFileSync(join(root, 'table_objects.json'), 'utf8')) as TableRow[]
  const stringRows = JSON.parse(readFileSync(join(root, 'strings_shrines.json'), 'utf8')) as TableRow[]

  const table = parseShrines(shrineRows)
  const objects = parseObjectTable(objectRows)

  const byClass = new Map<string, number>()
  for (const def of table.shrines) {
    const key = effectClassOf(def.effectClass)
    byClass.set(key, (byClass.get(key) ?? 0) + 1)
  }
  console.log(
    `shrines: ${table.shrines.length} rows; classes ${[...byClass].map(([k, v]) => `${k}:${v}`).join(' ')}`,
  )

  // The messages: every StringName/StringPhrase must resolve.
  const keys = new Set(
    stringRows.map((row) => (typeof row.Key === 'string' ? row.Key : '')).filter((key) => key !== ''),
  )
  let withKeys = 0
  let missingKeys = 0
  for (const def of table.shrines) {
    const wanted = [def.nameKey, def.phraseKey].filter((key): key is string => key !== null)
    if (wanted.length === 0) continue
    if (wanted.every((key) => keys.has(key))) withKeys += 1
    else missingKeys += 1
  }
  console.log(`shrines: ${withKeys} rows have resolvable message keys, ${missingKeys} do not`)

  // What the module can carry out, and what it cannot, by name.
  const pools = { hp: 1, maxHp: 500, mana: 1, maxMana: 200 }
  const applied: string[] = []
  const unmodelled: string[] = []
  for (const def of table.shrines) {
    const { result } = applyShrine(def, pools)
    if (result.applied) applied.push(def.name)
    else if (result.unmodelled) unmodelled.push(`${def.name} (${def.effect})`)
  }
  console.log(`shrines: ${applied.length} applicable exactly (${applied.join(', ')})`)
  console.log(`shrines: ${unmodelled.length} unmodelled, listed with their own prose:`)
  for (const name of unmodelled) console.log(`  ${name}`)

  // The link that makes a placed object reach a shrine.
  const shrineFunctions = new Set(
    objects.objects.map((def) => def.shrineFunction).filter((value) => value > 0),
  )
  const dangling = [...shrineFunctions].filter((code) => !table.byCode.has(code))
  console.log(
    `shrines: ${shrineFunctions.size} distinct ShrineFunction values in objects.txt, ${dangling.length} not in this table` +
      (dangling.length > 0 ? ` (${dangling.join(', ')})` : ''),
  )

  const problems: string[] = []
  if (table.applicable.size !== applied.length) {
    problems.push(`${table.applicable.size} rows look applicable but ${applied.length} applied`)
  }
  if (missingKeys > 0) problems.push(`${missingKeys} rows have unresolvable message keys`)
  if (dangling.length > 0) problems.push(`${dangling.length} objects.txt ShrineFunction values dangle`)
  for (const problem of problems) console.error(`  ${problem}`)
  if (problems.length > 0) {
    console.error('verify-shrines: FAILED')
    process.exitCode = 1
    return
  }
  console.log('verify-shrines: OK')
}

main()
