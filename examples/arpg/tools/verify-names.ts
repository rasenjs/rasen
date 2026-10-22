/**
 * Checks the monster display names against the real string tables.
 *
 * `monstats.NameStr` is a key, not a name, and it is the literal `Dummy` for a
 * large set of rows — the act 1 town guards among them. The claim worth checking
 * is therefore not "every row has a name" but "every row that the tables do name
 * is reported as the tables name it, and the rest are labelled from the id".
 *
 * Usage:
 *   tsx examples/arpg/tools/verify-names.ts [<extracted romfs dir>]
 */

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createMonsterNames, nameForms } from '../src/d2/monster-names'
import type { TableRow } from '../src/d2/monsters'

const data = resolve(import.meta.dirname, '../public/original')

function read<T>(name: string): T {
  return JSON.parse(readFileSync(join(data, name), 'utf8')) as T
}

function main(): void {
  const monsters = read<TableRow[]>('table_monstats.json')
  const monsterStrings = read<TableRow[]>('strings_monsters.json')
  const npcStrings = read<TableRow[]>('strings_npcs.json')
  const names = createMonsterNames(monsters, [npcStrings, monsterStrings])

  const strings = new Map<string, string>()
  for (const table of [npcStrings, monsterStrings]) {
    for (const row of table) {
      const key = row.Key
      const value = row.enUS
      if (typeof key === 'string' && key !== '' && typeof value === 'string' && !strings.has(key.toLowerCase())) {
        strings.set(key.toLowerCase(), value)
      }
    }
  }

  const npcs = monsters.filter((row) => row.npc !== null && row.npc !== '0')
  let named = 0
  let mismatched = 0
  const failures: string[] = []
  for (const row of monsters) {
    const id = row.Id
    if (typeof id !== 'string' || id === '') continue
    if (names.named(id)) named += 1
    // What the tables say this row should be called, if anything.
    const expected = nameForms(row)
      .map((form) => strings.get(form.toLowerCase()))
      .find((value) => value !== undefined)
    if (expected !== undefined && names.of(id) !== expected) {
      mismatched += 1
      if (failures.length < 10) failures.push(`${id}: got "${names.of(id)}", tables say "${expected}"`)
    }
  }

  const npcNamed = npcs.filter((row) => typeof row.Id === 'string' && names.named(row.Id)).length
  console.log(`names: ${monsters.length} monstats rows, ${named} named from the string tables, ${monsters.length - named} from the id`)
  console.log(`names: ${npcNamed}/${npcs.length} NPC rows named by the tables`)
  console.log(`names: ${mismatched} rows disagree with the tables`)

  // A sample, so the report shows what the chain actually produces.
  for (const id of ['rogue1', 'gheed', 'akara', 'cain1', 'warriv1', 'malah', 'qual-kehk', 'act2guard1', 'chicken', 'ancientstatue1']) {
    console.log(`  ${id.padEnd(16)} ${names.of(id).padEnd(20)} ${names.named(id) ? 'tables' : 'formatted'}`)
  }

  if (mismatched > 0) {
    console.error('verify-names: FAILED')
    for (const failure of failures) console.error(`  ${failure}`)
    process.exitCode = 1
    return
  }
  console.log('verify-names: OK')
}

main()
