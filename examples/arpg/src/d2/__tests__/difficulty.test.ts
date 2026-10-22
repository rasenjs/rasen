import { describe, expect, it } from 'vitest'
import { difficultySuffix, parseDifficulties } from '../difficulty'
import type { TableRow } from '../monsters'

/**
 * The difficulty table.
 *
 * The values are the retail ones — 0/-40/-100 resistance, 0/5/10 death experience,
 * 0/3/7 monster skill levels, and the divisor columns that halve and quarter the
 * timed effects. Against the real export `tools/verify-difficulty.ts` checks the
 * direction of every knob across the three levels: each one makes the game harder,
 * so a column that moves the wrong way is a misreading rather than a choice.
 */

const ROWS: TableRow[] = [
  { Name: 'Normal', ResistPenalty: '0', DeathExpPenalty: '0', MonsterSkillBonus: '0', MonsterFreezeDivisor: '1', LifeStealDivisor: '1', UniqueDamageBonus: '90', ResistFloor: '-100', GambleUnique: '50' },
  { Name: 'Nightmare', ResistPenalty: '-40', DeathExpPenalty: '5', MonsterSkillBonus: '3', MonsterFreezeDivisor: '2', LifeStealDivisor: '2', UniqueDamageBonus: '75', ResistFloor: '-100', GambleUnique: '50' },
  { Name: 'Hell', ResistPenalty: '-100', DeathExpPenalty: '10', MonsterSkillBonus: '7', MonsterFreezeDivisor: '4', LifeStealDivisor: '3', UniqueDamageBonus: '66', ResistFloor: '-100', GambleUnique: '50' },
]

describe('parseDifficulties', () => {
  it('reads the three levels in the table order', () => {
    const table = parseDifficulties(ROWS)
    expect(table.levels.map((level) => level.name)).toEqual(['Normal', 'Nightmare', 'Hell'])
    expect(table.byName.get('Hell')?.resistPenalty).toBe(-100)
  })

  it('exposes the named fields with the signs the table stores', () => {
    const table = parseDifficulties(ROWS)
    const nightmare = table.byName.get('Nightmare')
    expect(nightmare?.resistPenalty).toBe(-40)
    expect(nightmare?.deathExpPenalty).toBe(5)
    expect(nightmare?.monsterSkillBonus).toBe(3)
    expect(nightmare?.resistFloor).toBe(-100)
  })

  it('keeps every numeric column, named or not', () => {
    const table = parseDifficulties(ROWS)
    // `GambleUnique` is not named by the module but must still be reachable.
    expect(table.byName.get('Normal')?.fields.GambleUnique).toBe(50)
    expect(table.unnamed).toContain('GambleUnique')
    expect(table.named).toContain('ResistPenalty')
  })

  it('divides by the divisor column, because that is what the columns are', () => {
    const table = parseDifficulties(ROWS)
    // A 100-tick freeze lasts 100 in Normal, 50 in Nightmare and 25 in Hell.
    expect(table.byName.get('Normal')?.divided('MonsterFreezeDivisor', 100)).toBe(100)
    expect(table.byName.get('Nightmare')?.divided('MonsterFreezeDivisor', 100)).toBe(50)
    expect(table.byName.get('Hell')?.divided('MonsterFreezeDivisor', 100)).toBe(25)
  })

  it('passes a value through when the divisor column is missing or zero', () => {
    // Dividing by zero would be an infinity rather than a number.
    const table = parseDifficulties(ROWS)
    expect(table.byName.get('Normal')?.divided('NoSuchColumn', 40)).toBe(40)
    const zero: TableRow[] = [{ Name: 'Normal', MonsterFreezeDivisor: '0' }]
    expect(parseDifficulties(zero).byName.get('Normal')?.divided('MonsterFreezeDivisor', 40)).toBe(40)
  })

  it('ignores a row that is not one of the three difficulties', () => {
    const rows: TableRow[] = [...ROWS, { Name: 'Expansion', ResistPenalty: '0' }]
    expect(parseDifficulties(rows).levels).toHaveLength(3)
  })

  it('is empty rather than wrong when the table is missing', () => {
    const table = parseDifficulties([])
    expect(table.levels).toEqual([])
    expect(table.byName.size).toBe(0)
  })
})

describe('difficultySuffix', () => {
  it('matches the convention the stat tables use', () => {
    // `monstats` spells its variants `MinHP`, `MinHP(N)`, `MinHP(H)`.
    expect(difficultySuffix('Normal')).toBe('')
    expect(difficultySuffix('Nightmare')).toBe('(N)')
    expect(difficultySuffix('Hell')).toBe('(H)')
  })
})
