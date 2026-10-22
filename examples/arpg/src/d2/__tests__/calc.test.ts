import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  SKILL_FORMULAS,
  compileCalc,
  createSkillCalcEnv,
  deriveFormulaDefs,
  evaluateCalc,
  isBlankCalc,
  parseCalc,
  type CalcContext,
  type CalcDiagnostic,
  type CalcReference
} from '../calc'

/**
 * The calc mini-language.
 *
 * The evaluator is only worth anything if it covers the *real* expressions, so
 * the bulk of this file is the sweep at the bottom: every non-empty calc cell of
 * every one of the 429 skill rows is evaluated at several skill levels. The unit
 * tests above it pin the individual pieces — precedence, the `ln`/`dm` macros, the
 * cross-skill calls — against hand-computed values.
 */

type TableRows = Array<Record<string, string | null>>

/**
 * Locates the extracted table export.
 *
 * `import.meta.url` is not a `file:` URL under the test runner, so the directory
 * is found from the working directory instead — the suite has to work both from
 * the repository root (`vitest --run examples/arpg`) and from the package.
 */
function findTableDirectory(): string {
  let directory = process.cwd()
  for (;;) {
    for (const relative of [
      'public/original',
      'examples/arpg/public/original',
      '../public/original'
    ]) {
      const candidate = resolve(directory, relative)
      if (existsSync(join(candidate, 'table_skills.json'))) return candidate
    }
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  throw new Error('the extracted table export (public/original) was not found')
}

const TABLE_DIRECTORY = findTableDirectory()

function readTable(name: string): TableRows {
  return JSON.parse(
    readFileSync(join(TABLE_DIRECTORY, name), 'utf8')
  ) as TableRows
}

const SKILLS = readTable('table_skills.json')
const SKILL_CALC = readTable('table_skillcalc.json')
const MISSILE_CALC = readTable('table_misscalc.json')

/** `par1..par9` then `pa10..pa20`, defaulting to `parN = N`. */
function params(...values: number[]): readonly number[] {
  const list = new Array<number>(20).fill(0)
  values.forEach((value, index) => {
    list[index] = value
  })
  return list
}

/** Every calc column of `skills.txt`: `calc1..calc10`, `aurastatcalc1..6`, … */
const EXPRESSION_COLUMNS: readonly string[] = Object.keys(SKILLS[0]).filter(
  (column) =>
    /calc/i.test(column) && !column.startsWith('*') && !/desc/i.test(column)
)

function numeric(row: Record<string, string | null>, column: string): number {
  return Number.parseFloat(row[column] ?? '0') || 0
}

describe('calc arithmetic', () => {
  it('reads integers, floats and unary minus', () => {
    expect(evaluateCalc('1')).toBe(1)
    expect(evaluateCalc('42')).toBe(42)
    expect(evaluateCalc('1.5')).toBe(1.5)
    expect(evaluateCalc('0.125')).toBe(0.125)
    expect(evaluateCalc('-5')).toBe(-5)
    expect(evaluateCalc('- -5')).toBe(5)
    expect(evaluateCalc('-2*-3')).toBe(6)
    expect(evaluateCalc('+7')).toBe(7)
    expect(evaluateCalc('!0')).toBe(1)
    expect(evaluateCalc('!3')).toBe(0)
  })

  it('applies the C precedence the tables assume', () => {
    expect(evaluateCalc('2+3*4')).toBe(14)
    expect(evaluateCalc('(2+3)*4')).toBe(20)
    expect(evaluateCalc('2+3-4')).toBe(1)
    expect(evaluateCalc('100/4/5')).toBe(5)
    expect(evaluateCalc('7%3+1')).toBe(2)
    expect(evaluateCalc('2*3+4*5')).toBe(26)
    expect(evaluateCalc('-3+10')).toBe(7)
    expect(evaluateCalc('10-2*3')).toBe(4)
  })

  it('divides in floating point by default and in the original integers on request', () => {
    expect(evaluateCalc('7/2')).toBe(3.5)
    expect(evaluateCalc('(100/3)/2')).toBeCloseTo(16.6666666, 5)
    expect(evaluateCalc('7/2', { integerMath: true })).toBe(3)
    expect(evaluateCalc('(100/3)/2', { integerMath: true })).toBe(16)
    // Division by zero is defined as 0 rather than Infinity: `Echoing Strike`
    // divides by `clc5`, which is 0 until the skill is levelled.
    expect(evaluateCalc('5/0')).toBe(0)
    expect(evaluateCalc('5%0')).toBe(0)
  })

  it('compares and branches', () => {
    expect(evaluateCalc('2 > 1')).toBe(1)
    expect(evaluateCalc('2 > 2')).toBe(0)
    expect(evaluateCalc('2 >= 2')).toBe(1)
    expect(evaluateCalc('1 < 0')).toBe(0)
    expect(evaluateCalc('1 <= 1')).toBe(1)
    expect(evaluateCalc('1 == 1')).toBe(1)
    expect(evaluateCalc('1 == 2')).toBe(0)
    expect(evaluateCalc('1 != 2')).toBe(1)

    const raiseSkeleton: CalcContext = { lvl: 1, params: params(0, 9, 7) }
    expect(
      evaluateCalc('(lvl < 4) ? 0 : (par2 * (lvl - 3))', {
        ...raiseSkeleton,
        lvl: 3
      })
    ).toBe(0)
    expect(
      evaluateCalc('(lvl < 4) ? 0 : (par2 * (lvl - 3))', {
        ...raiseSkeleton,
        lvl: 5
      })
    ).toBe(18)
    // Nested conditionals, as in `Mirrored Blades calc7`.
    const branches = '(lvl>15)?20:((lvl>10)?16:((lvl>5)?12:8))'
    expect(evaluateCalc(branches, { lvl: 4 })).toBe(8)
    expect(evaluateCalc(branches, { lvl: 8 })).toBe(12)
    expect(evaluateCalc(branches, { lvl: 12 })).toBe(16)
    expect(evaluateCalc(branches, { lvl: 30 })).toBe(20)
    // Booleans are arithmetic: `monpet` sums two comparisons.
    expect(evaluateCalc('(elte==1)+(elte == 4)', { vars: { elte: 4 } })).toBe(1)
    expect(evaluateCalc('(elte==1)+(elte == 4)', { vars: { elte: 1 } })).toBe(1)
    expect(evaluateCalc('(elte==1)+(elte == 4)', { vars: { elte: 2 } })).toBe(0)
  })

  it('supports min and max with any number of arguments', () => {
    expect(evaluateCalc('min(3,5)')).toBe(3)
    expect(evaluateCalc('max(3,5)')).toBe(5)
    expect(evaluateCalc('min(1,2,3)')).toBe(1)
    expect(evaluateCalc('max(1,2,3)')).toBe(3)
    expect(evaluateCalc('min((3+4)*2,20)')).toBe(14)
    expect(evaluateCalc('max((3+4)*2,20)')).toBe(20)
  })

  it('treats a blank cell as zero rather than NaN', () => {
    expect(evaluateCalc('')).toBe(0)
    expect(evaluateCalc('   ')).toBe(0)
    expect(evaluateCalc(null)).toBe(0)
    expect(evaluateCalc(undefined)).toBe(0)
    expect(isBlankCalc('')).toBe(true)
    expect(isBlankCalc(null)).toBe(true)
    expect(isBlankCalc('0')).toBe(false)
  })

  it('compiles once and evaluates against many contexts', () => {
    // The skill sweep reuses one context per row and level, but the same
    // expression is evaluated for every level: parsing is the expensive half.
    const compiled = compileCalc('ln12+par3')
    expect(compiled.source).toBe('ln12+par3')
    expect(compiled.evaluate({ lvl: 1, params: params(10, 5, 2) })).toBe(12)
    expect(compiled.evaluate({ lvl: 3, params: params(10, 5, 2) })).toBe(22)
    // A context-less evaluation still has a level: level 1, all parameters 0.
    expect(compiled.evaluate()).toBe(0)
    expect(compileCalc('').node).toEqual({ kind: 'number', value: 0 })
  })

  it('clamps the way the tables clamp', () => {
    // `Critical Strike calc1` and `Valkyrie aurastatcalc3` are both clamps.
    expect(
      evaluateCalc('min(ln12,24)', { lvl: 20, params: params(6, 3) })
    ).toBe(24)
    expect(evaluateCalc('min(ln12,24)', { lvl: 2, params: params(6, 3) })).toBe(
      9
    )
    expect(
      evaluateCalc("min((lvl+skill('Dopplezon'.blvl))*par7,85)", {
        lvl: 20,
        params: params(0, 0, 0, 0, 0, 0, 20),
        skillRef: () => 10
      })
    ).toBe(85)
    // `desccalca2` on several skills negates a clamp: `-min(ln56,95)`.
    expect(
      evaluateCalc('-min(ln56,95)', {
        lvl: 1,
        params: params(0, 0, 0, 0, 200, 0)
      })
    ).toBe(-95)
  })
})

describe('ln and dm macros', () => {
  it('interpolates linearly for every alias in the table', () => {
    expect(evaluateCalc('ln12', { lvl: 4, params: params(10, 5) })).toBe(25)
    expect(evaluateCalc('ln34', { lvl: 6, params: params(0, 0, 1, 2) })).toBe(
      11
    )
    expect(
      evaluateCalc('ln56', { lvl: 10, params: params(0, 0, 0, 0, 0, 3) })
    ).toBe(27)
    expect(
      evaluateCalc('ln78', {
        lvl: 3,
        params: params(0, 0, 0, 0, 0, 0, 100, -5)
      })
    ).toBe(90)
    // `ln91` reads params 9 and 10, not 9 and 1: see `table_skillcalc.json`.
    expect(
      evaluateCalc('ln91', {
        lvl: 5,
        params: params(0, 0, 0, 0, 0, 0, 0, 0, 2, 4)
      })
    ).toBe(18)
    expect(
      evaluateCalc('ln21', {
        lvl: 4,
        params: params(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7, -2)
      })
    ).toBe(1)
    expect(
      evaluateCalc('ln43', {
        lvl: 20,
        params: params(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1)
      })
    ).toBe(20)
    expect(
      evaluateCalc('ln65', {
        lvl: 2,
        params: params(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0)
      })
    ).toBe(5)
    expect(
      evaluateCalc('ln87', {
        lvl: 3,
        params: params(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 6)
      })
    ).toBe(15)
    expect(
      evaluateCalc('ln92', {
        lvl: 9,
        params: params(
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          1,
          1
        )
      })
    ).toBe(9)
  })

  it('is the base value at level 1 and grows by the increment', () => {
    // `ln12 = par1 + (lvl - 1) * par2`, so level 1 is exactly par1.
    expect(evaluateCalc('ln12', { lvl: 1, params: params(17, 9) })).toBe(17)
    expect(evaluateCalc('ln12', { lvl: 2, params: params(17, 9) })).toBe(26)
    // ... and the shape is the same in the two other families the game uses, so
    // a formula alias can be read out of any of the calc primitive tables.
    expect(evaluateCalc('ln12*2', { lvl: 3, params: params(4, 1) })).toBe(12)
    expect(evaluateCalc('2*ln12', { lvl: 3, params: params(4, 1) })).toBe(12)
    expect(evaluateCalc('ln12/4*2', { lvl: 5, params: params(0, 8) })).toBe(16)
  })

  it('applies the diminishing returns curve', () => {
    // dm12 = ((110 * lvl) * (par2 - par1)) / (100 * (lvl + 6)) + par1
    //      = 5500/700 + 10 at level 1
    expect(
      evaluateCalc('dm12', { lvl: 1, params: params(10, 60) })
    ).toBeCloseTo(17.857142857, 8)
    //      = 110000/2600 + 10 at level 20
    expect(
      evaluateCalc('dm12', { lvl: 20, params: params(10, 60) })
    ).toBeCloseTo(52.307692307, 8)
    // The curve is deliberately not asymptotic: 110×60 == 100×(60+6), so level 60
    // lands exactly on par2 and anything above it keeps growing.
    expect(
      evaluateCalc('dm12', { lvl: 60, params: params(10, 60) })
    ).toBeCloseTo(60, 9)
    expect(
      evaluateCalc('dm12', { lvl: 61, params: params(10, 60) })
    ).toBeGreaterThan(60)
    expect(
      evaluateCalc('dm12', { lvl: 10, params: params(10, 60) })
    ).toBeLessThan(60)
    // `Critical Strike passivecalc1` is a bare `dm12`.
    expect(evaluateCalc('dm12', { lvl: 1, params: params(5, 80) })).toBeCloseTo(
      5 + 8250 / 700,
      8
    )
    expect(
      evaluateCalc('dm34', { lvl: 10, params: params(0, 0, 20, 30) })
    ).toBeCloseTo(20 + (1100 * 10) / 1600, 8)
    expect(
      evaluateCalc('dm91', {
        lvl: 5,
        params: params(0, 0, 0, 0, 0, 0, 0, 0, 4, 12)
      })
    ).toBeCloseTo(4 + (550 * 8) / 1100, 8)
  })

  it('reads every alias straight out of the game tables', () => {
    // The built-in table is the one the game ships; re-deriving it from the rows
    // proves the transcription and the recogniser agree.
    expect(deriveFormulaDefs(SKILL_CALC)).toEqual(SKILL_FORMULAS)
    expect(Object.keys(SKILL_FORMULAS)).toHaveLength(20)
    // `table_skillcalc.json` is not the only family: missiles use `cpa`/`hpa`/`dpa`.
    const missile = deriveFormulaDefs(MISSILE_CALC)
    expect(missile['sl12']).toEqual({
      code: 'sl12',
      kind: 'linear',
      a: 'par1',
      b: 'par2'
    })
    expect(missile['sd12']).toEqual({
      code: 'sd12',
      kind: 'diminishing',
      a: 'par1',
      b: 'par2'
    })
    expect(missile['cl34']).toEqual({
      code: 'cl34',
      kind: 'linear',
      a: 'cpa3',
      b: 'cpa4'
    })
    expect(missile['dl12']).toEqual({
      code: 'dl12',
      kind: 'linear',
      a: 'dpa1',
      b: 'dpa2'
    })
    expect(missile['shd1']).toEqual({
      code: 'shd1',
      kind: 'diminishing',
      a: 'hpa1',
      b: 'hpa2'
    })
  })

  it('reproduces the definitions the tables give, level by level', () => {
    // The strongest available cross-check: for every alias, evaluate the game's
    // own definition text and this implementation over 99 levels.
    const definitions = new Map<string, string>()
    for (const row of SKILL_CALC) {
      const keys = Object.keys(row)
      const code = row[keys[0]]
      const text = row[keys[1]]
      if (code && text) definitions.set(code, text)
    }
    // The table has 127 primitives; the 20 macros are the ones with definitions.
    expect(definitions.size).toBe(127)
    expect(
      [...definitions.keys()].filter((code) => /^(ln|dm)\d/.test(code))
    ).toHaveLength(Object.keys(SKILL_FORMULAS).length)

    const seeded = params(
      3,
      11,
      5,
      -2,
      40,
      0,
      7,
      16,
      9,
      12,
      1,
      25,
      6,
      8,
      2,
      4,
      30,
      13,
      21,
      17
    )
    for (const code of Object.keys(SKILL_FORMULAS)) {
      const definition = definitions.get(code)
      expect(
        definition,
        `${code} is missing from table_skillcalc.json`
      ).toBeTruthy()
      for (let level = 1; level <= 99; level += 1) {
        const context: CalcContext = { lvl: level, params: seeded }
        expect(
          evaluateCalc(code, context),
          `${code} at level ${level}`
        ).toBeCloseTo(evaluateCalc(definition as string, context), 9)
      }
    }
  })
})

describe('references', () => {
  it('reaches into another skill', () => {
    const seen: CalcReference[] = []
    const context: CalcContext = {
      lvl: 20,
      params: params(0, 0, 0, 0, 0, 0, 0, 16),
      skillRef: (reference) => {
        seen.push(reference)
        return reference.name === 'Fire Ball' ? 5 : 7
      }
    }
    // `Fire Bolt EDmgSymPerCalc`: (skill('Fire Ball'.blvl)+skill('Meteor'.blvl))*par8
    expect(
      evaluateCalc(
        "(skill('Fire Ball'.blvl)+skill('Meteor'.blvl))*par8",
        context
      )
    ).toBe(192)
    expect(seen).toEqual([
      { name: 'Fire Ball', field: 'blvl' },
      { name: 'Meteor', field: 'blvl' }
    ])
  })

  it('reads accumulated stat values', () => {
    const context: CalcContext = {
      statRef: (reference) => (reference.name === 'ua_escalation' ? 2 : 0)
    }
    expect(
      evaluateCalc("(stat('ua_escalation'.accr) == 2) ? 100 : 0", context)
    ).toBe(100)
    expect(
      evaluateCalc("(stat('ua_defeated'.accr) == 1) ? 75 : 100", context)
    ).toBe(100)
    expect(
      evaluateCalc("stat('item_pierce_cold_immunity'.accr)", {
        statRef: (reference) => (reference.field === 'accr' ? 45 : 0)
      })
    ).toBe(45)
  })

  it('reads missiles and the source skill of a monster', () => {
    expect(
      evaluateCalc("miss('abysscenter'.par1)", {
        missileRef: (reference) => (reference.field === 'par1' ? 25 : 0)
      })
    ).toBe(25)
    const sksrc: CalcContext = {
      sksrcRef: (reference) => (reference.name === 'Bind Demon' ? 12 : 0)
    }
    expect(evaluateCalc("((sksrc('Bind Demon'.sctk)%12)==0)", sksrc)).toBe(1)
    expect(
      evaluateCalc("((sksrc('Bind Demon'.sctk)%12)==0)", { sksrcRef: () => 11 })
    ).toBe(0)
  })

  it('rolls rand through the supplied source', () => {
    const context = (draw: number): CalcContext => ({
      params: params(0, 0, 5, 15),
      random: () => draw
    })
    // `Imp Inferno calc1` is `rand(par3,par4)`.
    expect(evaluateCalc('rand(par3,par4)', context(0))).toBe(5)
    expect(evaluateCalc('rand(par3,par4)', context(0.5))).toBe(10)
    expect(evaluateCalc('rand(par3,par4)', context(1))).toBe(15)
    expect(
      evaluateCalc('rand(par3,par4)', { params: params(0, 0, 5, 15) })
    ).toBeGreaterThanOrEqual(5)
  })

  it('asks the host about named conditions', () => {
    const context: CalcContext = {
      lvl: 1,
      condition: (name, value) =>
        name === 'Difficulty' && value === 3 ? 1 : 0,
      resolveVariable: (name) => (name === 'hell' ? 3 : 0)
    }
    expect(evaluateCalc("cond('Difficulty', hell)", context)).toBe(1)
    expect(
      evaluateCalc("cond('Difficulty', hell)*(cond('Desecrated')==0)", context)
    ).toBe(1)
    expect(evaluateCalc("cond('Desecrated')", context)).toBe(0)
  })

  it('reports what it cannot resolve instead of guessing', () => {
    const diagnostics: CalcDiagnostic[] = []
    expect(
      evaluateCalc('edmn * 2', {
        onDiagnostic: (diagnostic) => diagnostics.push(diagnostic)
      })
    ).toBe(0)
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].kind).toBe('unknown-variable')
    expect(diagnostics[0].message).toContain('edmn')
  })
})

describe('malformed table cells', () => {
  const broken = SKILLS.flatMap((row) =>
    EXPRESSION_COLUMNS.filter((column) => {
      const source = row[column]
      if (!source) return false
      let balance = 0
      for (const character of source) {
        if (character === '(') balance += 1
        else if (character === ')') balance -= 1
      }
      return balance !== 0
    }).map((column) => ({
      skill: row.skill as string,
      column,
      source: row[column] as string
    }))
  )

  it('finds the six truncated cells in the real table', () => {
    expect(broken).toHaveLength(6)
    expect(broken.map((entry) => `${entry.skill}.${entry.column}`)).toContain(
      'Blade Sentinel.passivecalc6'
    )
  })

  it('recovers from them and says so', () => {
    const diagnostics: CalcDiagnostic[] = []
    let positive = 0
    for (const entry of broken) {
      const value = evaluateCalc(entry.source, {
        lvl: 20,
        params: params(
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20
        ),
        skillRef: () => 20,
        statRef: () => 0,
        onDiagnostic: (diagnostic) => diagnostics.push(diagnostic)
      })
      expect(Number.isFinite(value), `${entry.skill}.${entry.column}`).toBe(
        true
      )
      if (value > 0) positive += 1
    }
    // Five of the six are otherwise valid expressions; the sixth is a lone
    // `stat('…'.accr`, which resolves to 0 without a stat source.
    expect(positive).toBe(5)
    expect(
      diagnostics.filter((diagnostic) => diagnostic.kind === 'parse').length
    ).toBe(broken.length)
  })

  it('keeps the meaningful part of a truncated expression', () => {
    // Health Link calc2, verbatim, with the closing parenthesis missing.
    const source =
      "((110 *skill('Summon Defiler'.lvl) * (par4 - par3)) / (100 * (skill('Summon Defiler'.lvl) + 6)) + par3"
    const value = evaluateCalc(source, {
      lvl: 1,
      params: params(0, 0, 1, 11),
      skillRef: () => 20
    })
    expect(value).toBeCloseTo((110 * 20 * 10) / (100 * 26) + 1, 9)
  })
})

describe('skill rows', () => {
  it('resolves a whole skills.txt', () => {
    const env = createSkillCalcEnv(SKILLS)
    expect(env.skillNames).toHaveLength(429)

    // `Fire Bolt EDmgSymPerCalc` = (skill('Fire Ball'.blvl)+skill('Meteor'.blvl))*par8,
    // and the referenced skills are evaluated at the same level.
    const fireBolt = SKILLS.find((row) => row.skill === 'Fire Bolt')
    expect(fireBolt).toBeTruthy()
    const par8 = numeric(fireBolt as TableRows[number], 'Param8')
    expect(par8).toBe(16)
    expect(env.column('Fire Bolt', 'EDmgSymPerCalc', 10)).toBe((10 + 10) * par8)
    expect(env.column('Fire Bolt', 'EDmgSymPerCalc', 1)).toBe(2 * par8)
    // Level 1 of a synergy-based skill is the base, not a scaled value.
    expect(env.column('Fire Bolt', 'EDmgSymPerCalc', 10, 1)).toBe(2 * par8)
  })

  it('evaluates a column that reads another column of the same row', () => {
    const env = createSkillCalcEnv(SKILLS)
    const echo = SKILLS.find((row) => row.skill === 'Echoing Strike')
    expect(echo).toBeTruthy()
    const row = echo as TableRows[number]
    // calc1 = (ln12+clc0); clc0 is calc10 =
    // (skill('Mirrored Blades'.blvl)+skill('Blade Warp'.blvl))*par8.
    expect(row.calc1).toBe('(ln12+clc0)')
    for (const level of [1, 5, 20]) {
      const expected =
        numeric(row, 'Param1') +
        (level - 1) * numeric(row, 'Param2') +
        2 * level * numeric(row, 'Param8')
      expect(
        env.column('Echoing Strike', 'calc1', level),
        `level ${level}`
      ).toBe(expected)
    }
  })

  it('evaluates a formula that belongs to another skill', () => {
    const env = createSkillCalcEnv(SKILLS)
    const golem = SKILLS.find((row) => row.skill === 'Summon Goatman')
    const mastery = SKILLS.find((row) => row.skill === 'Demonic Mastery')
    expect(golem && mastery).toBeTruthy()
    // passivecalc3 = (ln56 + (skill('Demonic Mastery'.ln21));
    // Summon Goatman ln56 = par5 + (lvl-1)*par6, Demonic Mastery ln21 = pa11 + (lvl-1)*pa12.
    for (const level of [1, 3, 12]) {
      const ln56 =
        numeric(golem as TableRows[number], 'Param5') +
        (level - 1) * numeric(golem as TableRows[number], 'Param6')
      const ln21 =
        numeric(mastery as TableRows[number], 'Param11') +
        (level - 1) * numeric(mastery as TableRows[number], 'Param12')
      expect(
        env.column('Summon Goatman', 'passivecalc3', level),
        `level ${level}`
      ).toBe(ln56 + ln21)
    }
  })

  it('returns zero for a missing column instead of throwing', () => {
    const diagnostics: CalcDiagnostic[] = []
    const env = createSkillCalcEnv(SKILLS, {
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic)
    })
    expect(env.column('Fire Bolt', 'no-such-column', 1)).toBe(0)
    expect(env.column('No Such Skill', 'calc1', 1)).toBe(0)
    expect(diagnostics.length).toBeGreaterThanOrEqual(2)
  })
})

describe('coverage of the real tables', () => {
  it('evaluates every non-empty calc cell of every skill row', () => {
    const diagnostics: CalcDiagnostic[] = []
    const env = createSkillCalcEnv(SKILLS, {
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic)
    })
    expect(EXPRESSION_COLUMNS).toHaveLength(47)

    const levels = [1, 2, 5, 20, 40]
    let evaluated = 0
    let nonTrivial = 0
    const unique = new Set<string>()
    const notFinite: string[] = []
    let minimum = Number.POSITIVE_INFINITY
    let maximum = Number.NEGATIVE_INFINITY

    for (const row of SKILLS) {
      const skill = row.skill as string
      for (const column of EXPRESSION_COLUMNS) {
        const source = row[column]
        if (!source) continue
        evaluated += 1
        unique.add(source)
        let produced = 0
        for (const level of levels) {
          const value = evaluateCalc(source, env.context(skill, level))
          if (!Number.isFinite(value))
            notFinite.push(`${skill}.${column} @${level}`)
          minimum = Math.min(minimum, value)
          maximum = Math.max(maximum, value)
          produced = value
        }
        if (produced !== 0) nonTrivial += 1
      }
    }

    // The expected scale, recorded so a regression in the sweeping itself shows
    // up: 429 rows × 47 columns with 1,301 populated cells holding 415 distinct
    // expressions.
    expect(evaluated).toBe(1301)
    expect(unique.size).toBe(415)
    expect(levels.length * evaluated).toBe(6505)

    // The assertion that matters: nothing produced NaN or Infinity, including
    // the six cells with unbalanced parentheses and the cells that divide by a
    // nested column that is still empty.
    expect(notFinite).toEqual([])

    // Coverage, not just survival: a large majority of the cells move off zero at
    // some level, and the sweep sees both signs and six-digit values.
    expect(nonTrivial).toBeGreaterThan(900)
    expect(minimum).toBeLessThan(0)
    expect(maximum).toBeGreaterThan(1_000_000)

    // Nothing in the skill tables calls a function this evaluator does not know,
    // and every `skill('Name'...)` names a row that exists.
    expect(
      diagnostics.filter((diagnostic) => diagnostic.kind === 'unknown-function')
    ).toEqual([])
    expect(
      diagnostics.filter((diagnostic) => diagnostic.kind === 'unsupported')
    ).toEqual([])
    const known = new Set(env.skillNames.map((name) => name.toLowerCase()))
    const dangling: string[] = []
    for (const row of SKILLS) {
      for (const column of EXPRESSION_COLUMNS) {
        const source = row[column]
        if (!source) continue
        for (const match of source.matchAll(/skill\(\s*'([^']+)'/g)) {
          if (!known.has(match[1].toLowerCase()))
            dangling.push(`${row.skill}.${column} -> ${match[1]}`)
        }
      }
    }
    expect(dangling).toEqual([])

    const unknownVariables = new Set(
      diagnostics
        .filter((diagnostic) => diagnostic.kind === 'unknown-variable')
        .map((diagnostic) => diagnostic.message)
    )
    console.log(
      `[calc] ${evaluated} populated calc cells (${unique.size} distinct expressions) evaluated ` +
        `at ${levels.length} skill levels = ${levels.length * evaluated} evaluations, 0 non-finite; ` +
        `${nonTrivial} non-zero at the last level; range ${minimum} … ${maximum}; ` +
        `${diagnostics.filter((d) => d.kind === 'parse').length} parse recoveries, ` +
        `${unknownVariables.size} distinct unresolved primitives`
    )
    for (const message of unknownVariables) {
      console.log(`[calc] unresolved: ${message}`)
    }
    // The unresolved primitives are the damage-engine outputs by design, not
    // parser failures; see the module header.
    expect(unknownVariables.size).toBeGreaterThan(0)
    for (const message of unknownVariables) {
      expect(message).toMatch(
        /edmn|edmx|edln|edns|edxs|enma|exma|edma|enms|exms|toht|mana|mps|usmc|math|madm|macr|m1|m2|m3|pnma|pxma|pnms|pxms|mael|mapi|manc|mair|skpt|pets|ast|pst|ps1|clc|len|rng|sctk|accr/
      )
    }
  })

  it('parses without diagnostics the expressions that are well formed', () => {
    let clean = 0
    for (const row of SKILLS) {
      for (const column of EXPRESSION_COLUMNS) {
        const source = row[column]
        if (!source) continue
        const diagnostics: CalcDiagnostic[] = []
        parseCalc(source, (diagnostic) => diagnostics.push(diagnostic))
        if (diagnostics.length === 0) clean += 1
      }
    }
    expect(clean).toBe(1301 - 6)
  })
})
