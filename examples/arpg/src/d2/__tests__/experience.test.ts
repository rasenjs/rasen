import { describe, expect, it } from 'vitest'
import { experienceClassOf, parseExperience } from '../experience'
import type { TableRow } from '../monsters'

/**
 * The levelling table.
 *
 * The cases below are the small version of the shape the retail table has: a
 * `MaxLvl` header row that is **not** a level, cumulative totals (so a level's cost
 * is a difference), and `ExpRatio` falling with level. Against the real export the
 * tool `tools/verify-experience.ts` checks the same properties over all 8 classes
 * and 100 levels, including that every class's per-level costs telescope back to
 * its cap total.
 */

const ROWS: TableRow[] = [
  { Level: 'MaxLvl', Amazon: '99', Barbarian: '99', ExpRatio: '10' },
  { Level: '0', Amazon: '0', Barbarian: '0', ExpRatio: '1024' },
  { Level: '1', Amazon: '500', Barbarian: '500', ExpRatio: '1024' },
  { Level: '2', Amazon: '1500', Barbarian: '1500', ExpRatio: '1024' },
  { Level: '3', Amazon: '3750', Barbarian: '3750', ExpRatio: '512' },
]

describe('parseExperience', () => {
  it('reads the cap from the MaxLvl header row without treating it as a level', () => {
    const table = parseExperience(ROWS)
    // The header states 99 and the fixture's rows stop at 3; `maxLevel` is the
    // usable bound, so 3 — see the clamp test below for why.
    expect(table.classes).toEqual(['Amazon', 'Barbarian'])
    expect(table.totalFor('Amazon', 0)).toBe(0)

    const full: TableRow[] = [{ Level: 'MaxLvl', Amazon: '99' }, { Level: '0', Amazon: '0' }]
    // A header-only table has no levels, so the cap falls to the data extent.
    expect(parseExperience(full).maxLevel).toBe(0)
  })

  it('reads the totals as cumulative, so a level costs the difference', () => {
    const table = parseExperience(ROWS)
    expect(table.totalFor('Amazon', 0)).toBe(0)
    expect(table.totalFor('Amazon', 1)).toBe(500)
    // 1500 to be level 2 less 500 to be level 1.
    expect(table.xpToNext('Amazon', 1)).toBe(1000)
    expect(table.xpToNext('Amazon', 2)).toBe(2250)
  })

  it('returns 0 at the cap rather than a negative or a division by zero', () => {
    const table = parseExperience(ROWS)
    expect(table.xpToNext('Amazon', 3)).toBe(0)
    expect(table.xpToNext('Amazon', 999)).toBe(0)
  })

  it('exposes ExpRatio per level', () => {
    const table = parseExperience(ROWS)
    expect(table.expRatio(0)).toBe(1024)
    expect(table.expRatio(3)).toBe(512)
  })

  it('clamps to the rows it has, not to the stated cap', () => {
    // The fixture states MaxLvl 99 and stops at level 3. Clamping to the stated cap
    // would answer 0 above 3, i.e. claim the next level is free; the data's own
    // extent is the honest bound. In retail the two agree.
    const table = parseExperience(ROWS)
    expect(table.maxLevel).toBe(3)
    expect(table.totalFor('Amazon', -5)).toBe(0)
    expect(table.totalFor('Amazon', 999)).toBe(3750)
  })

  it('finds the level a total experience buys', () => {
    const table = parseExperience(ROWS)
    expect(table.levelFor('Amazon', 0)).toBe(0)
    expect(table.levelFor('Amazon', 499)).toBe(0)
    expect(table.levelFor('Amazon', 500)).toBe(1)
    expect(table.levelFor('Amazon', 1499)).toBe(1)
    expect(table.levelFor('Amazon', 1500)).toBe(2)
  })

  it('falls back to a class that has data when one is blank', () => {
    const rows: TableRow[] = [
      { Level: 'MaxLvl', Amazon: '99', Empty: '99' },
      { Level: '0', Amazon: '0' },
      { Level: '1', Amazon: '500' },
    ]
    const table = parseExperience(rows)
    // `Empty` has no values anywhere, so it borrows the first class with data.
    expect(table.xpToNext('Empty', 0)).toBe(500)
  })
})

describe('experienceClassOf', () => {
  it('maps a full class name', () => {
    const table = parseExperience(ROWS)
    expect(experienceClassOf(table, 'Amazon')).toBe('Amazon')
    expect(experienceClassOf(table, 'barbarian')).toBe('Barbarian')
  })

  it('maps the three-letter codes the skill tables use', () => {
    const real = parseExperience([
      { Level: 'MaxLvl', Amazon: '99', Assassin: '99', Druid: '99', Warlock: '99', Necromancer: '99' },
      { Level: '0', Amazon: '0', Assassin: '0', Druid: '0', Warlock: '0', Necromancer: '0' },
      { Level: '1', Amazon: '500', Assassin: '500', Druid: '500', Warlock: '500', Necromancer: '500' },
    ])
    expect(experienceClassOf(real, 'ama')).toBe('Amazon')
    expect(experienceClassOf(real, 'nec')).toBe('Necromancer')
    // The three whose code is not a prefix of their name.
    expect(experienceClassOf(real, 'ass')).toBe('Assassin')
    expect(experienceClassOf(real, 'dru')).toBe('Druid')
    expect(experienceClassOf(real, 'war')).toBe('Warlock')
  })

  it('falls back to the first class for an unknown name', () => {
    const table = parseExperience(ROWS)
    expect(experienceClassOf(table, 'cow')).toBe('Amazon')
  })
})
