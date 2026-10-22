import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { evaluateCalc, type CalcDiagnostic } from '../calc'
import {
  StatSet,
  accumulationOf,
  createCharacterStats,
  describeStat,
  describeStatSet,
  formatStatTemplate,
  parseCharStats,
  parseStatTable,
  parseStringTable,
  type StatRow,
  type StringRow
} from '../stats'

/**
 * The stat system.
 *
 * `itemstatcost.txt` and `charstats.txt` are the two tables every other number in
 * the game is built from, so the tests here check them against the real export:
 * the operation codes actually present, the attribute links a character's life
 * depends on, and the tooltip text the string tables produce.
 */

type TableRows = Array<Record<string, string | null>>

/** `import.meta.url` is not a `file:` URL under the runner; walk the working directory instead. */
function findTableDirectory(): string {
  let directory = process.cwd()
  for (;;) {
    for (const relative of [
      'public/original',
      'examples/arpg/public/original',
      '../public/original'
    ]) {
      const candidate = resolve(directory, relative)
      if (existsSync(join(candidate, 'table_itemstatcost.json')))
        return candidate
    }
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  throw new Error('the extracted table export (public/original) was not found')
}

const TABLE_DIRECTORY = findTableDirectory()

function readRows(name: string): TableRows {
  return JSON.parse(
    readFileSync(join(TABLE_DIRECTORY, name), 'utf8')
  ) as TableRows
}

const STAT_ROWS: readonly StatRow[] = readRows('table_itemstatcost.json')
const CHAR_STATS_ROWS: readonly StatRow[] = readRows('table_charstats.json')
const ITEM_STRINGS: readonly StringRow[] = readRows(
  'strings_item-modifiers.json'
)

const statTable = parseStatTable(STAT_ROWS)
const charStats = parseCharStats(CHAR_STATS_ROWS)
const strings = parseStringTable(ITEM_STRINGS)

describe('itemstatcost', () => {
  it('parses every row', () => {
    expect(STAT_ROWS).toHaveLength(368)
    expect(statTable.defs).toHaveLength(368)
    expect(statTable.get('strength')?.id).toBe(0)
    expect(statTable.get('maxhp')?.id).toBe(7)
    expect(statTable.get(7)?.name).toBe('maxhp')
  })

  it('carries the storage layout', () => {
    const strength = statTable.get('strength')
    expect(strength?.saveBits).toBe(8)
    expect(strength?.saveAdd).toBe(32)
    expect(strength?.direct).toBe(false)
    const classSkills = statTable.get('item_addclassskills')
    expect(classSkills?.saveParamBits).toBe(3)
    expect(classSkills?.signed).toBe(true)
    expect(statTable.get('mana')?.direct).toBe(true)
    expect(statTable.get('mana')?.maxStat).toBe('maxmana')
  })

  it('exposes the operation each stat performs on the stats it feeds', () => {
    const vitality = statTable.get('vitality')
    expect(vitality?.op).toBe(9)
    expect(vitality?.opStats).toEqual(['maxhp', 'maxstamina'])
    expect(vitality?.accumulation).toBe('attribute')

    const energy = statTable.get('energy')
    expect(energy?.op).toBe(8)
    expect(energy?.opStats).toEqual(['maxmana'])

    const enhancedDefence = statTable.get('item_armor_percent')
    expect(enhancedDefence?.op).toBe(13)
    expect(enhancedDefence?.accumulation).toBe('base-percent')
    expect(enhancedDefence?.opStats).toEqual(['armorclass'])

    const increasedLife = statTable.get('item_maxhp_percent')
    expect(increasedLife?.op).toBe(11)
    expect(increasedLife?.accumulation).toBe('base-percent')

    const lifePerLevel = statTable.get('item_hp_perlevel')
    expect(lifePerLevel?.op).toBe(2)
    expect(lifePerLevel?.opParam).toBe(3)
    expect(lifePerLevel?.opBase).toBe('level')
  })

  it('maps every op code found in the table', () => {
    // The codes present are 1, 2, 4, 5, 6, 7, 8, 9, 11 and 13; 3 is the missing
    // "percent of everything" operation and is mapped anyway.
    expect(accumulationOf(0)).toBe('add')
    expect(accumulationOf(1)).toBe('add')
    expect(accumulationOf(2)).toBe('add')
    expect(accumulationOf(4)).toBe('add')
    expect(accumulationOf(6)).toBe('add')
    expect(accumulationOf(3)).toBe('total-percent')
    expect(accumulationOf(5)).toBe('base-percent')
    expect(accumulationOf(7)).toBe('base-percent')
    expect(accumulationOf(11)).toBe('base-percent')
    expect(accumulationOf(13)).toBe('base-percent')
    expect(accumulationOf(8)).toBe('attribute')
    expect(accumulationOf(9)).toBe('attribute')

    const codes = new Set(
      STAT_ROWS.map((row) => row.op).filter((op) => op !== null)
    )
    expect(
      [...codes].sort((left, right) => Number(left) - Number(right))
    ).toEqual(['1', '2', '4', '5', '6', '7', '8', '9', '11', '13'])

    // Every row carrying one of these operations really is routed to the layer
    // the operation names, not to the stat's own value.
    for (const def of statTable.withOperation(11))
      expect(def.accumulation).toBe('base-percent')
    for (const def of statTable.withOperation(13))
      expect(def.accumulation).toBe('base-percent')
    for (const def of statTable.withOperation(5))
      expect(def.accumulation).toBe('base-percent')
    for (const def of statTable.withOperation(7))
      expect(def.accumulation).toBe('base-percent')
    for (const def of statTable.withOperation(2))
      expect(def.accumulation).toBe('add')
    for (const def of statTable.withOperation(6))
      expect(def.accumulation).toBe('add')
    expect(statTable.withOperation(11)).toHaveLength(2)
    expect(statTable.withOperation(13)).toHaveLength(5)
    expect(statTable.withOperation(8)).toHaveLength(1)
    expect(statTable.withOperation(9)).toHaveLength(1)
    expect(statTable.withOperation(2)).toHaveLength(34)
  })
})

describe('StatSet layers', () => {
  it('keeps base, base-percent, flat and total-percent apart', () => {
    const set = new StatSet({ table: statTable })
    set.setBase('armorclass', 100)
    set.addFlat('armorclass', 20)
    set.addPercentOfBase('armorclass', 50)
    set.addPercentOfTotal('armorclass', 100)

    expect(set.layers('armorclass')).toEqual({
      base: 100,
      add: 20,
      basePercent: 50,
      totalPercent: 100
    })
    // (100 + 50) + 20, then doubled.
    expect(set.get('armorclass')).toBe(340)
  })

  it('routes a modifier wherever the stat table says it goes', () => {
    const set = new StatSet({ table: statTable })
    set.setBase('armorclass', 100)
    // `item_armor_percent` is op 13, so 200 means "+200% of the base defence" on
    // the stat the row names in `op stat1`, and the modifier itself stays
    // readable.
    set.apply('item_armor_percent', 200)
    expect(set.get('armorclass')).toBe(300)
    expect(set.get('item_armor_percent')).toBe(200)
    // ... while a plain stat is a flat addition.
    set.apply('strength', 25)
    expect(set.get('strength')).toBe(25)
    set.apply('maxhp', 40)
    expect(set.layers('maxhp')).toEqual({
      base: 0,
      add: 40,
      basePercent: 0,
      totalPercent: 0
    })
  })

  it('scales the per-level operations by the level stat', () => {
    const set = new StatSet({ table: statTable })
    // `item_hp_perlevel` carries `op param 3` and `op base level`: the roll is
    // three times the per-level amount.
    set.apply('item_hp_perlevel', 12)
    set.setBase('level', 30)
    expect(set.get('maxhp')).toBe((12 / 3) * 30)
    expect(set.get('item_hp_perlevel')).toBe(12)
    // The order does not matter, because the level factor is a derived link.
    set.setBase('level', 60)
    expect(set.get('maxhp')).toBe((12 / 3) * 60)
    // `item_tohit_perlevel` carries `op param 1` because its value is already the
    // per-level amount, which is what makes the divisor reading self-evident.
    set.apply('item_tohit_perlevel', 5)
    expect(set.get('tohit')).toBe(5 * 60)
    // A per-level percentage reaches the base-percent layer.
    set.setBase('armorclass', 100)
    set.apply('item_armorpercent_perlevel', 9)
    expect(set.get('armorclass')).toBe(100 + (100 * (9 / 3) * 60) / 100)
  })

  it('feeds attributes into the stats they are linked to', () => {
    const set = new StatSet({
      table: statTable,
      attributeRates: { maxhp: 4, maxstamina: 4, maxmana: 8 }
    })
    set.setBase('maxhp', 30)
    set.setBase('vitality', 10)
    set.setBase('energy', 35)

    expect(set.get('maxhp')).toBe(30 + 4 * 10)
    expect(set.get('maxmana')).toBe(8 * 35)
    expect(set.get('maxstamina')).toBe(4 * 10)

    // An item's "+5 to Vitality" reaches life through the same link, which is
    // what makes `op 9` worth modelling at all.
    set.apply('vitality', 5)
    set.apply('energy', 5)
    expect(set.get('vitality')).toBe(15)
    expect(set.get('maxhp')).toBe(30 + 4 * 15)
    expect(set.get('maxmana')).toBe(8 * 40)
  })

  it('returns zero for an attribute feed with no rate', () => {
    const set = new StatSet({ table: statTable })
    set.setBase('vitality', 10)
    // Without the class rates there is nothing to multiply by, and guessing a
    // rate would be worse than contributing nothing.
    expect(set.get('maxhp')).toBe(0)
  })

  it('describes what it was told about an unknown stat', () => {
    const unknown: Array<[string, number]> = []
    const set = new StatSet({
      table: statTable,
      onUnknownStat: (name, value) => unknown.push([name, value])
    })
    set.apply('item_not_a_real_stat', 12)
    expect(unknown).toEqual([['item_not_a_real_stat', 12]])
    expect(set.get('item_not_a_real_stat')).toBe(12)
  })

  it('survives a dependency cycle', () => {
    const set = new StatSet({ table: statTable })
    set.setBase('maxhp', 10)
    set.addLink({ from: 'maxhp', to: 'maxmana', rate: 2 })
    set.addLink({ from: 'maxmana', to: 'maxhp', rate: 2 })
    expect(Number.isFinite(set.get('maxhp'))).toBe(true)
    expect(Number.isFinite(set.get('maxmana'))).toBe(true)
  })

  it('does not invent stats that were only read', () => {
    const set = new StatSet({ table: statTable })
    set.setBase('strength', 20)
    expect(set.get('dexterity')).toBe(0)
    expect(set.names()).toEqual(['strength'])
    expect(set.snapshot()).toEqual({ strength: 20 })
    expect(set.has('dexterity')).toBe(false)
    expect(set.has('strength')).toBe(true)
  })

  it('exposes the layers through stat accessors', () => {
    const set = new StatSet({ table: statTable, attributeRates: { maxhp: 4 } })
    set.setBase('maxhp', 30)
    set.setBase('vitality', 10)
    set.apply('maxhp', 40)
    expect(set.getField('maxhp', 'base')).toBe(30)
    expect(set.getField('maxhp', 'add')).toBe(40)
    expect(set.getField('maxhp', 'mod')).toBe(40)
    // `accr` is what the calc language asks for and is the derived value.
    expect(set.getField('maxhp', 'accr')).toBe(30 + 4 * 10 + 40)
    expect(set.statResolver()({ name: 'maxhp', field: 'accr' })).toBe(110)
  })

  it('invalidates derived values when a stat changes', () => {
    const set = new StatSet({ table: statTable, attributeRates: { maxhp: 4 } })
    set.setBase('vitality', 10)
    set.setBase('maxhp', 0)
    expect(set.get('maxhp')).toBe(40)
    set.apply('vitality', 5)
    expect(set.get('maxhp')).toBe(60)
  })
})

describe('charstats', () => {
  it('parses the classes', () => {
    // `charstats.txt` carries an `Expansion` marker row with no attributes, as
    // `playerclass.txt` does; it is kept but is not a class.
    expect(charStats.all).toHaveLength(9)
    expect(charStats.names()).toHaveLength(8)
    expect(charStats.get('Expansion')?.playable).toBe(false)
    expect(charStats.get('Warlock')?.playable).toBe(true)
    const sorceress = charStats.get('sorceress')
    expect(sorceress).not.toBeNull()
    expect(sorceress?.strength).toBe(10)
    expect(sorceress?.dexterity).toBe(25)
    expect(sorceress?.energy).toBe(35)
    expect(sorceress?.vitality).toBe(10)
    expect(sorceress?.stamina).toBe(74)
    expect(sorceress?.hpAdd).toBe(30)
    expect(sorceress?.lifePerLevel).toBe(4)
    expect(sorceress?.lifePerVitality).toBe(8)
    expect(sorceress?.manaPerLevel).toBe(8)
    expect(sorceress?.manaPerMagic).toBe(8)
    expect(sorceress?.staminaPerVitality).toBe(4)
    expect(sorceress?.toHitFactor).toBe(-15)
    expect(sorceress?.statPerLevel).toBe(5)
    expect(sorceress?.skillsPerLevel).toBe(1)
    expect(sorceress?.skills.length).toBeGreaterThan(0)
  })

  it('gives a level 1 Sorceress her starting numbers', () => {
    const sorceress = charStats.get('Sorceress')
    expect(sorceress).not.toBeNull()
    const set = createCharacterStats(
      sorceress as NonNullable<typeof sorceress>,
      1,
      { table: statTable }
    )
    expect(set.get('maxhp')).toBe(30 + 8 * 10)
    expect(set.get('maxmana')).toBe(8 * 35)
    expect(set.get('maxstamina')).toBe(74 + 4 * 10)
    expect(set.get('strength')).toBe(10)
    expect(set.get('statpts')).toBe(0)
  })

  it('gives a level 90 Sorceress thousands of life', () => {
    const sorceress = charStats.get('Sorceress')
    expect(sorceress).not.toBeNull()
    const row = sorceress as NonNullable<typeof sorceress>
    // 5 stat points per level for 89 levels, all of them into vitality.
    const spent = row.statPerLevel * 89
    expect(spent).toBe(445)
    const set = createCharacterStats(row, 90, {
      table: statTable,
      allocation: { vitality: spent }
    })

    const vitality = row.vitality + spent
    expect(vitality).toBe(455)
    expect(set.get('vitality')).toBe(vitality)
    expect(set.get('level')).toBe(90)
    expect(set.get('statpts')).toBe(445)
    expect(set.get('newskills')).toBe(89)

    // Life = flat + per-level growth + vitality at the class's rate.
    const expectedLife =
      row.hpAdd + row.lifePerLevel * 89 + row.lifePerVitality * vitality
    expect(expectedLife).toBe(4026)
    expect(set.get('maxhp')).toBe(expectedLife)
    expect(set.get('maxhp')).toBeGreaterThan(1000)
    expect(set.get('maxhp')).toBeLessThan(10000)

    // Mana = per-level growth + the energy she started with.
    expect(set.get('maxmana')).toBe(
      row.manaPerLevel * 89 + row.manaPerMagic * row.energy
    )
    expect(set.get('maxmana')).toBe(992)
    expect(set.get('maxmana')).toBeGreaterThan(500)

    expect(set.get('maxstamina')).toBe(
      row.stamina + row.staminaPerLevel * 89 + row.staminaPerVitality * vitality
    )
    expect(set.get('maxstamina')).toBe(2250)

    // Attack rating follows dexterity: 5 per point, minus the constant, plus the
    // class factor.
    expect(set.get('tohit')).toBe(5 * row.dexterity + row.toHitFactor - 35)
    expect(set.get('tohit') as number).toBeGreaterThan(0)
  })

  it('carries a few synthetic items on top of the character', () => {
    const sorceress = charStats.get('Sorceress')
    const row = sorceress as NonNullable<typeof sorceress>
    const set = createCharacterStats(row, 90, {
      table: statTable,
      allocation: { vitality: 445 }
    })
    const nakedLife = set.get('maxhp')
    const nakedMana = set.get('maxmana')

    set.applyAll([
      // A helm: +40 life, +30% enhanced defence on its own base.
      ['maxhp', 40],
      // An amulet: +2 to all skills, +20% faster cast rate, +30% fire resist.
      ['item_allskills', 2],
      ['item_fastercastrate', 20],
      ['fireresist', 30],
      // A ring: +3 to vitality, which has to reach life through the op-9 link.
      ['vitality', 3],
      // A shield: +50% increase maximum life (op 11, a percentage of the base).
      ['item_maxhp_percent', 50]
    ])

    // The vitality ring: 3 points at the class's rate.
    expect(set.get('vitality')).toBe(458)
    // The helm's +40 life is a flat addition, so it is not itself scaled by the
    // shield's +50%: the percentage applies to the base (level growth and
    // vitality), and the flat layer is added afterwards.
    const withRing = nakedLife + 3 * row.lifePerVitality
    expect(set.get('maxhp')).toBe(withRing * 1.5 + 40)
    expect(set.get('maxhp')).toBe(6115)
    expect(set.get('maxhp')).toBeGreaterThan(nakedLife)
    expect(set.get('maxhp')).toBeLessThan(10000)

    // The amulet's "increase maximum mana" is the same op-11 shape.
    set.apply('item_maxmana_percent', 25)
    expect(set.get('maxmana')).toBe(nakedMana * 1.25)

    // The classic "percent of everything" layer, which no exported stat uses but
    // which Battle Orders-style effects need.
    set.addPercentOfTotal('maxmana', 100)
    expect(set.get('maxmana')).toBe(nakedMana * 1.25 * 2)

    expect(set.get('item_allskills')).toBe(2)
    expect(set.get('fireresist')).toBe(30)
    expect(set.get('item_fastercastrate')).toBe(20)

    // The tooltip lines come out of the same set.
    const tooltip = describeStatSet(statTable, set, { strings })
    expect(tooltip).toContain('+2 to All Skills')
    expect(tooltip).toContain('Fire Resist +30%')
    expect(tooltip).toContain('+40 to Life')
  })
})

describe('description strings', () => {
  it('loads the real item modifier strings', () => {
    expect(ITEM_STRINGS.length).toBe(371)
    expect(strings.get('ModStr1a')).toBe('%+d to Strength')
  })

  it('formats the game printf templates', () => {
    expect(formatStatTemplate('%+d to Strength', [5])).toBe('+5 to Strength')
    expect(formatStatTemplate('%+d to Strength', [-3])).toBe('-3 to Strength')
    expect(formatStatTemplate('Fire Resist %+d%%', [30])).toBe(
      'Fire Resist +30%'
    )
    expect(
      formatStatTemplate('%d%% Better Chance of Getting Magic Items', [50])
    ).toBe('50% Better Chance of Getting Magic Items')
    expect(formatStatTemplate('%0%% Reanimate as: %1', [5, 'Skeleton'])).toBe(
      '5% Reanimate as: Skeleton'
    )
    expect(
      formatStatTemplate('%d%% Chance to cast level %d %s on striking', [
        12,
        20,
        'Frost Nova'
      ])
    ).toBe('12% Chance to cast level 20 Frost Nova on striking')
    expect(formatStatTemplate('%.2f of something', [1.234])).toBe(
      '1.23 of something'
    )
  })

  it('renders the lines an item tooltip shows', () => {
    const describe = (
      stat: string,
      value: number,
      args?: readonly (string | number)[]
    ): string =>
      describeStat(
        statTable,
        stat,
        value,
        args ? { strings, args } : { strings }
      )

    expect(describe('strength', 5)).toBe('+5 to Strength')
    expect(describe('strength', -3)).toBe('-3 to Strength')
    expect(describe('dexterity', 12)).toBe('+12 to Dexterity')
    expect(describe('maxhp', 40)).toBe('+40 to Life')
    expect(describe('maxmana', 25)).toBe('+25 to Mana')
    expect(describe('item_armor_percent', 200)).toBe('+200% Enhanced Defense')
    expect(describe('maxfireresist', 5)).toBe('+5% to Maximum Fire Resist')
    expect(describe('item_howl', 10)).toBe('Hit Causes Monster to Flee +10%')
    expect(describe('item_replenish_durability', 5)).toBe(
      'Repairs 5 durability per second'
    )
    expect(describe('item_addclassskills', 1)).toBe('+1 to Amazon Skill Levels')
    expect(describe('item_freeze', 1)).toBe('Freezes target')
    expect(describe('item_stupidity', 1)).toBe('Hit Blinds Target')
    expect(describe('item_maxhp_percent', 50)).toBe('Increase Maximum Life 50%')

    // descfunc 29 has a separate negative string, and the number is unsigned in
    // it: "Reduced by 29%" / "Increased by 29%".
    expect(describe('damageresist', 29)).toBe(
      'Physical Damage Received Reduced by 29%'
    )
    expect(describe('damageresist', -29)).toBe(
      'Physical Damage Received Increased by 29%'
    )

    // Templates that need more than the value get it from the caller.
    expect(describe('item_aura', 5, ['Might'])).toBe(
      'Level 5 Might Aura When Equipped'
    )
    expect(describe('item_skillonhit', 12, [20, 'Frost Nova'])).toBe(
      '12% Chance to cast level 20 Frost Nova on striking'
    )
    expect(describe('item_singleskill', 3, ['Sorceress', 'Fire Ball'])).toBe(
      '+3 to Sorceress Fire Ball'
    )
    expect(describe('item_nonclassskill', 2, ['Teleport'])).toBe(
      '+2 to Teleport'
    )
    expect(describe('item_reanimate', 5, ['Skeleton'])).toBe(
      '5% Reanimate as: Skeleton'
    )
    expect(describe('attack_vs_montype', 100)).toBe(
      '100% to Attack Rating versus'
    )
  })

  it('falls back to the stat name when no strings are loaded', () => {
    expect(describeStat(statTable, 'strength', 5)).toBe('strength 5')
    expect(describeStat(statTable, 7, 40)).toBe('maxhp 40')
    expect(describeStat(statTable, 'not_a_stat', 1)).toBe('not_a_stat 1')
  })

  it('orders a tooltip by the table description priority', () => {
    const set = new StatSet({ table: statTable })
    set.apply('item_replenish_durability', 5)
    set.apply('item_addclassskills', 1)
    set.apply('strength', 30)
    const lines = describeStatSet(statTable, set, { strings })
    expect(lines).toEqual([
      '+1 to Amazon Skill Levels',
      '+30 to Strength',
      'Repairs 5 durability per second'
    ])
  })
})

describe('stats and the calc language', () => {
  it('resolves bare stat names and stat accessors', () => {
    const set = new StatSet({ table: statTable, attributeRates: { maxhp: 4 } })
    set.setBase('vitality', 10)
    set.setBase('maxhp', 30)
    set.apply('strength', 20)

    // Bare names, as in `min(edmn,95)`.
    expect(
      evaluateCalc('maxhp + strength', {
        resolveVariable: set.variableResolver()
      })
    ).toBe(90)
    expect(set.variableResolver()('dexterity')).toBeUndefined()
    const diagnostics: CalcDiagnostic[] = []
    expect(
      evaluateCalc('dexterity + maxhp', {
        resolveVariable: set.variableResolver(),
        onDiagnostic: (diagnostic) => diagnostics.push(diagnostic)
      })
    ).toBe(70)
    expect(diagnostics.map((diagnostic) => diagnostic.kind)).toEqual([
      'unknown-variable'
    ])

    // `stat('name'.field)`, as in every summoning passive.
    expect(
      evaluateCalc("stat('maxhp'.accr) + stat('maxhp'.base)", {
        statRef: set.statResolver()
      })
    ).toBe(70 + 30)
  })

  it('applies an evaluated skill value to a set the way a passive would', () => {
    // `Critical Strike passivecalc1` is a bare `dm12` over the row's own
    // parameters (5 and 80), and its result is then applied to a stat.
    const deadlyStrike = evaluateCalc('dm12', { lvl: 20, params: [5, 80] })
    expect(deadlyStrike).toBeCloseTo(68.4615384615, 8)

    const set = new StatSet({ table: statTable })
    set.apply('item_deadlystrike', deadlyStrike)
    expect(set.get('item_deadlystrike')).toBeCloseTo(deadlyStrike, 8)
    // `item_deadlystrike` has no operation, so it lands in the additive layer,
    // which is the layer a tooltip reads.
    expect(set.layers('item_deadlystrike').add).toBeCloseTo(deadlyStrike, 8)
    expect(
      describeStat(statTable, 'item_deadlystrike', deadlyStrike, { strings })
    ).toBe('+68% Deadly Strike')
  })
})
