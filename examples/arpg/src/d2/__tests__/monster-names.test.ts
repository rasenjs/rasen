import { describe, expect, it } from 'vitest'
import { createMonsterNames, nameForms } from '../monster-names'
import type { TableRow } from '../monsters'

/**
 * The display-name chain.
 *
 * The cases mirror what the real tables do: `monstats.NameStr` is a string key,
 * it is the literal `Dummy` for the act 1 town guards, and the name it keys
 * lives in one of two string tables depending on whether the row is a monster or
 * a town character. Against the retail exports the chain names 713 of 752 rows
 * with no row disagreeing with the tables, which `tools/verify-names.ts` checks.
 */

const npcStrings: TableRow[] = [
  { Key: 'Gheed', enUS: 'Gheed' },
  { Key: 'Warriv', enUS: 'Warriv' },
  { Key: 'DeckardCain', enUS: 'Deckard Cain' },
  { Key: 'Qual-Kehk', enUS: 'Qual-Kehk' },
]

const monsterStrings: TableRow[] = [
  { Key: 'RogueScout', enUS: 'Rogue Scout' },
  { Key: 'Rogue', enUS: 'Rogue' },
  { Key: 'Skeleton', enUS: 'Skeleton' },
]

const monsters: TableRow[] = [
  // NameStr is a key that resolves, and the id carries an act suffix.
  { Id: 'warriv1', NameStr: 'Warriv', MonStatsEx: 'warriv1' },
  { Id: 'cain1', NameStr: 'DeckardCain', MonStatsEx: 'cain1' },
  // NameStr is the placeholder, but the id minus its digits keys a name.
  { Id: 'rogue1', NameStr: 'Dummy', MonStatsEx: 'rogue1' },
  // NameStr is the placeholder and nothing keys a name.
  { Id: 'act2guard1', NameStr: 'Dummy', MonStatsEx: 'act2guard1' },
  { Id: 'chicken', NameStr: 'dummy', MonStatsEx: 'chicken' },
  // NameStr is readable even though no string keys it.
  { Id: 'ancientstatue1', NameStr: 'Ancient Statue 1', MonStatsEx: 'ancientstatue1' },
  // A hyphenated id whose string key keeps the hyphen.
  { Id: 'qual-kehk', NameStr: 'Qual-Kehk', MonStatsEx: 'qual-kehk' },
  // A plain monster named by the monster table.
  { Id: 'skeleton1', NameStr: 'Skeleton', MonStatsEx: 'skeleton1' },
]

function names() {
  return createMonsterNames(monsters, [npcStrings, monsterStrings])
}

describe('nameForms', () => {
  it('offers the row spellings most specific first, each with its digits stripped', () => {
    expect(nameForms({ Id: 'warriv1', NameStr: 'Warriv', MonStatsEx: 'warriv1' })).toEqual([
      'Warriv',
      'warriv1',
      'warriv',
      'warriv1',
      'warriv',
    ])
  })

  it('skips blank fields', () => {
    expect(nameForms({ Id: 'x' })).toEqual(['x'])
  })
})

describe('createMonsterNames', () => {
  it('resolves a string key through the tables', () => {
    expect(names().of('warriv1')).toBe('Warriv')
    expect(names().of('cain1')).toBe('Deckard Cain')
    expect(names().of('skeleton1')).toBe('Skeleton')
  })

  it('bridges the act suffix the id carries and the key does not', () => {
    // `rogue1`'s NameStr is the placeholder; the id minus its digit keys "Rogue".
    expect(names().of('rogue1')).toBe('Rogue')
  })

  it('uses NameStr when it is readable even though no string keys it', () => {
    expect(names().of('ancientstatue1')).toBe('Ancient Statue 1')
    expect(names().named('ancientstatue1')).toBe(true)
  })

  it('formats the id when the tables name nothing', () => {
    // The act prefix and the per-variant digits are structure, not the name.
    expect(names().of('act2guard1')).toBe('Guard')
    expect(names().of('chicken')).toBe('Chicken')
  })

  it('reports whether the tables named a row, separately from the label', () => {
    const table = names()
    expect(table.named('gheed')).toBe(false) // no such row at all
    expect(table.named('rogue1')).toBe(true)
    expect(table.named('act2guard1')).toBe(false)
    expect(table.named('chicken')).toBe(false)
  })

  it('resolves a shared key from the first table passed', () => {
    const npcFirst = createMonsterNames([{ Id: 'x', NameStr: 'Rogue' }], [
      [{ Key: 'Rogue', enUS: 'Rogue the NPC' }],
      monsterStrings,
    ])
    expect(npcFirst.of('x')).toBe('Rogue the NPC')
    const monsterFirst = createMonsterNames([{ Id: 'x', NameStr: 'Rogue' }], [
      monsterStrings,
      [{ Key: 'Rogue', enUS: 'Rogue the NPC' }],
    ])
    expect(monsterFirst.of('x')).toBe('Rogue')
  })

  it('counts the rows the tables named', () => {
    // warriv1, cain1, rogue1, ancientstatue1, qual-kehk and skeleton1 have names.
    expect(names().known).toBe(6)
  })

  it('falls back to the raw id when there is no row to format', () => {
    expect(names().of('unknown-thing')).toBe('Unknown Thing')
  })
})
