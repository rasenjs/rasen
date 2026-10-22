import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  AuraField,
  SkillRuntime,
  activateAura,
  bandDamage,
  hitShiftScale,
  loadSkillTables,
  missileVelocity,
  parseSkillTables,
  resolveMissile,
  staticCaster,
  type MissileDef,
  type SkillCast,
  type SkillTables,
  type TableRow,
} from '../skills'

/**
 * The evidence for the damage and mana rules documented at the top of
 * `skills.ts`: the numbers these tests assert are the numbers the retail game
 * shows, so the rules are checked against the game rather than against
 * themselves. Everything is read from the exported tables on disk.
 */

function tableDirectory(): string {
  let directory = resolve(process.cwd())
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(directory, 'public', 'original')
    if (existsSync(join(candidate, 'table_skills.json'))) return candidate
    const nested = join(directory, 'examples', 'arpg', 'public', 'original')
    if (existsSync(join(nested, 'table_skills.json'))) return nested
    directory = dirname(directory)
  }
  throw new Error('the exported tables are missing: run the assets:extract script first')
}

const TABLE_DIRECTORY = tableDirectory()

function table(name: string): TableRow[] {
  return JSON.parse(readFileSync(join(TABLE_DIRECTORY, `${name}.json`), 'utf8')) as TableRow[]
}

const tables: SkillTables = parseSkillTables({
  skills: table('table_skills'),
  skilldesc: table('table_skilldesc'),
  missiles: table('table_missiles'),
  skillcalc: table('table_skillcalc'),
  misscalc: table('table_misscalc'),
})

const runtime = new SkillRuntime(tables)

function skill(name: string): NonNullable<ReturnType<SkillRuntime['skill']>> {
  const found = runtime.skill(name)
  if (!found) throw new Error(`skill ${name} missing from skills.txt`)
  return found
}

function missile(name: string): MissileDef {
  const found = runtime.missile(name)
  if (!found) throw new Error(`missile ${name} missing from missiles.txt`)
  return found
}

function cast(name: string, level: number, caster = staticCaster(level)): SkillCast {
  const result = runtime.cast(name, level, caster)
  if (!result) throw new Error(`skill ${name} missing from skills.txt`)
  return result
}

describe('the skill tables', () => {
  it('parses skills, their descriptions and the missiles', () => {
    expect(tables.skills.length).toBe(429)
    // 240 of the 429 rows are player-castable; the rest are monster skills.
    expect(tables.skills.filter((entry) => entry.charClass !== null).length).toBeGreaterThan(200)
    expect(tables.missiles.length).toBe(742)
    expect(tables.descriptions.size).toBeGreaterThan(200)
    expect(runtime.skill('Fire Bolt')?.displayName).toBeTruthy()
    // 34 aliases are documented across skillcalc (20) and misscalc (14), and
    // every one of them is re-derived here from the tables' own description
    // text — including the missile families (`cl12` over `cpa1`) that a
    // hand-written alias table tends to miss.
    expect(Object.keys(tables.formulas).length).toBe(34)
    expect(tables.formulas.ln12?.kind).toBe('linear')
    expect(tables.formulas.dm12?.kind).toBe('diminishing')
    expect(tables.formulas.dm12?.a).toBe('par1')
    expect(tables.formulas.cl12?.a).toBe('cpa1')
    expect(tables.formulas.shl1?.a).toBe('hpa1')
    expect(tables.formulas.dl12?.b).toBe('dpa2')
  })

  it('resolves every missile a skill or a monster names', () => {
    const unresolvedSkills: string[] = []
    for (const entry of tables.skills) {
      for (const name of Object.values(entry.missiles)) {
        if (name && !runtime.missile(name)) unresolvedSkills.push(`${entry.name}:${name}`)
      }
    }
    expect(unresolvedSkills).toEqual([])

    const unresolvedMonsters: string[] = []
    for (const row of table('table_monstats')) {
      for (const key of ['MissA1', 'MissA2', 'MissS1', 'MissS2', 'MissS3', 'MissS4', 'MissC']) {
        const name = row[key]
        if (name && !runtime.missile(name)) unresolvedMonsters.push(`${row.Id}:${name}`)
      }
    }
    // `catapultchargedball on` is a real entry: the `' on'` missiles are the
    // catapult's projectiles after they land.
    expect(unresolvedMonsters).toEqual([])
    expect(runtime.missile('catapultchargedball on')).toBeDefined()
  })
})

describe('damage', () => {
  it('matches the retail values, which is what pins the HitShift rule', () => {
    // Level 1 damage of skills whose in-game numbers are common knowledge. The
    // table stores Fire Bolt's `EMin` as 6 and `HitShift` as 7 — the game shows
    // 3, so `value * 2^HitShift / 256` is the reading; the same rule turns
    // Meteor's raw 80-100 (HitShift 8) into the 80-100 players see.
    const cases: readonly [string, number, number][] = [
      ['Fire Bolt', 3, 6],
      ['Fire Ball', 6, 14],
      ['Cold Arrow', 3, 4],
      ['Ice Arrow', 6, 10],
      ['Charged Bolt', 2, 4],
      ['Frozen Orb', 40, 45],
      ['Lightning', 1, 40],
      ['Nova', 1, 20],
      ['Meteor', 80, 100],
      ['Blessed Hammer', 12, 16],
      ['Bone Spirit', 20, 30],
      ['Holy Bolt', 8, 16],
    ]
    for (const [name, min, max] of cases) {
      const damage = cast(name, 1).damage.elemental
      expect(damage, name).not.toBeNull()
      expect(damage?.min, name).toBeCloseTo(min, 6)
      expect(damage?.max, name).toBeCloseTo(max, 6)
    }
  })

  it('grows a skill with level and stays finite', () => {
    // Fire Bolt: 6-12 with HitShift 7, then bands of +3/+4/+8 (min) and
    // +3/+6/+10 (max) per level over 2-8, 9-16, 17-23.
    const one = cast('Fire Bolt', 1).damage.elemental
    const twenty = cast('Fire Bolt', 20).damage.elemental
    expect(one?.min).toBeCloseTo(3, 6)
    expect(one?.max).toBeCloseTo(6, 6)
    expect(twenty?.min).toBeCloseTo(45.5, 6)
    expect(twenty?.max).toBeCloseTo(60.5, 6)
    expect(twenty?.type).toBe('fire')

    let previous = 0
    for (let level = 1; level <= 20; level += 1) {
      const damage = cast('Fire Bolt', level).damage.elemental
      expect(Number.isFinite(damage?.min ?? NaN)).toBe(true)
      expect(Number.isFinite(damage?.max ?? NaN)).toBe(true)
      expect(damage?.min ?? 0).toBeGreaterThanOrEqual(previous)
      previous = damage?.min ?? 0
    }
    // eslint-disable-next-line no-console -- the raw numbers are the deliverable's evidence
    console.log(
      'Fire Bolt:',
      runtime.describeCast(cast('Fire Bolt', 1)),
      '/',
      runtime.describeCast(cast('Fire Bolt', 20)),
    )
  })

  it('applies the synergy a skill names in EDmgSymPerCalc', () => {
    // Fire Bolt's `EDmgSymPerCalc` is
    // `(skill('Fire Ball'.blvl)+skill('Meteor'.blvl))*par8`, par8 = 16.
    const synergy = staticCaster(20, new Map([['Fire Ball', 20], ['Meteor', 20]]))
    const boosted = cast('Fire Bolt', 20, synergy)
    expect(boosted.damage.synergy.elemental).toBeCloseTo(640, 6)
    expect(boosted.damage.elemental?.min).toBeCloseTo(45.5 * 7.4, 6)
    expect(boosted.damage.elemental?.max).toBeCloseTo(60.5 * 7.4, 6)
    // A caster without those skills gets no bonus at all.
    expect(cast('Fire Bolt', 20).damage.synergy.elemental).toBe(0)
    // eslint-disable-next-line no-console -- raw evidence
    console.log('Fire Bolt with Fire Ball/Meteor 20:', runtime.describeCast(boosted))
  })

  it('separates physical from elemental damage and carries the element', () => {
    // Fire Arrow is a physical arrow plus fire damage, in one skill row.
    const arrow = cast('Fire Arrow', 1)
    expect(arrow.damage.physical?.percentOfSource).toBeCloseTo(1, 6)
    expect(arrow.damage.elemental?.type).toBe('fire')
    // Zeal is physical only, and carries the whole of the weapon's damage.
    const zeal = cast('Zeal', 1)
    expect(zeal.damage.elemental).toBeNull()
    expect(zeal.damage.physical?.percentOfSource).toBeCloseTo(1, 6)
    // Multiple Shot's `SrcDam` 96 is the 75% weapon damage every player knows.
    expect(cast('Multiple Shot', 1).damage.physical?.percentOfSource).toBeCloseTo(0.75, 6)
  })

  it('evaluates the calc columns through the calculator', () => {
    // Fire Ball calc1 = par1 = 4 (it is the missile's explosion radius).
    expect(runtime.calcs('Fire Ball', 1).columns.calc1).toBe(4)
    // Smite calc1 = ln34 = par3 + (lvl-1) * par4 = 15 + 15 * (lvl - 1).
    expect(runtime.calcs('Smite', 1).columns.calc1).toBe(15)
    expect(runtime.calcs('Smite', 5).columns.calc1).toBe(75)
    // Smite calc2 = min(ln12, 250) = min(15 + 5*(lvl-1), 250) — the clamp bites.
    expect(runtime.calcs('Smite', 1).columns.calc2).toBe(15)
    expect(runtime.calcs('Smite', 60).columns.calc2).toBe(250)
    // Zeal calc1 = min(par5 + lvl - 1, par6) = min(1 + lvl, 5) for the swing count.
    expect(runtime.calcs('Zeal', 1).columns.calc1).toBe(2)
    expect(runtime.calcs('Zeal', 10).columns.calc1).toBe(5)

    // Every non-empty calc column of every skill must evaluate to a finite
    // number: a parse failure would silently make a skill do nothing.
    let columns = 0
    const broken: string[] = []
    for (const entry of tables.skills) {
      const evaluated = runtime.calcs(entry, 10).columns
      for (const [name, value] of Object.entries(evaluated)) {
        columns += 1
        if (!Number.isFinite(value)) broken.push(`${entry.name}.${name}`)
      }
    }
    // 437 non-empty calc columns across the 429 rows, which is the histogram
    // of `calc1`..`calc10` usage in the table (190 + 106 + 52 + 64 + 10 + 7 + 5 + 1 + 1 + 1).
    expect(columns).toBe(437)
    expect(broken).toEqual([])
  })
})

describe('mana', () => {
  it('is the table value at level 1 and follows the level column after that', () => {
    // "matches the base value in the table at level 1", literally.
    expect(cast('Fire Bolt', 1).mana.whole).toBe(5)
    expect(skill('Fire Bolt').mana).toBe(5)
    expect(cast('Fire Ball', 1).mana.whole).toBe(10)
    expect(cast('Frozen Orb', 1).mana.whole).toBe(50)
    // Frozen Orb's `lvlmana` is 1, so level 20 costs 50 + 19.
    expect(cast('Frozen Orb', 20).mana.whole).toBe(69)
    expect(cast('Fire Bolt', 20).mana.whole).toBe(5)
    // The engine's 256ths form, which is what `skillcalc`'s `usmc` means.
    expect(cast('Fire Bolt', 1).mana.in256ths).toBe(5 * 256)
    expect(cast('Fire Bolt', 1).mana.shift).toBe(7)
  })

  it('reproduces the retail costs and the minMana floor', () => {
    const retail: readonly [string, number][] = [
      ['Teleport', 24],
      ['Static Field', 9],
      ['Telekinesis', 7],
      ['Nova', 13],
      ['Frost Nova', 9],
      ['Chain Lightning', 9],
      ['Blessed Hammer', 20],
      ['Meteor', 34],
      ['Multiple Shot', 4],
    ]
    for (const [name, mana] of retail) expect(cast(name, 1).mana.whole, name).toBe(mana)
    // Teleport's `lvlmana` is -1: it gets cheaper as it levels, down to minMana.
    expect(cast('Teleport', 20).mana.whole).toBe(5)
    expect(cast('Teleport', 30).mana.whole).toBe(1)
    expect(cast('Teleport', 99).mana.whole).toBe(1)
  })
})

describe('auras and passives', () => {
  it('applies an aura stat at the level the aura is cast at', () => {
    // Might: aurastat1 `damagepercent` × `ln34` = par3 + (lvl-1) * par4.
    const might = runtime.aura('Might', 1)
    expect(might?.state).toBe('might')
    expect(might?.radius).toBe(16)
    expect(might?.durationSeconds).toBeNull()

    const level1 = runtime.auraStats('Might', 1)
    const level20 = runtime.auraStats('Might', 20)
    expect(level1.get('damagepercent')).toBe(40)
    expect(level20.get('damagepercent')).toBe(230)
    expect(cast('Might', 1).aura?.stats).toEqual([{ stat: 'damagepercent', value: 40 }])
    // eslint-disable-next-line no-console -- raw evidence
    console.log('Might level 20 grants', runtime.describeStats(level20))
  })

  it('gives a passive its diminishing-returns curve', () => {
    // Critical Strike: passivecalc1 = dm12 = ((110*lvl)*(par2-par1))/(100*(lvl+6)) + par1.
    const level1 = runtime.passiveStats('Critical Strike', 1)
    const level20 = runtime.passiveStats('Critical Strike', 20)
    expect(level1.get('passive_critical_strike')).toBeCloseTo(16.79, 2)
    expect(level20.get('passive_critical_strike')).toBeCloseTo(68.46, 2)
    expect(runtime.passive('Critical Strike')?.state).toBe('criticalstrike')
    // A passive is always on: no casting, no radius, no duration.
    expect(runtime.aura('Critical Strike', 1)).toBeNull()
  })

  it('carries a timed curse with its radius and duration', () => {
    // Amplify Damage: auralencalc ln34 = 200 + 75 * (lvl-1) frames,
    // aurarangecalc ln12 = 3 + (lvl-1) subtiles, damageresist -100.
    const aura = runtime.aura('Amplify Damage', 1)
    expect(aura?.radius).toBe(3)
    expect(aura?.durationSeconds).toBeCloseTo(8, 6)
    expect(runtime.auraStats('Amplify Damage', 1).get('damageresist')).toBe(-100)
    expect(runtime.aura('Amplify Damage', 5)?.durationSeconds).toBeCloseTo((200 + 300) / 25, 6)
  })

  it('applies auras positionally and lets the strongest of a state win', () => {
    const field = new AuraField()
    activateAura(runtime, field, { sourceId: 'paladin-a', skill: 'Might', level: 20, x: 0, y: 0 })
    activateAura(runtime, field, { sourceId: 'paladin-b', skill: 'Might', level: 1, x: 1, y: 0 })
    // Both auras cover the point; the same state does not stack, the higher wins.
    expect(field.aurasAt(1, 1).length).toBe(1)
    expect(field.statsAt(1, 1).get('damagepercent')).toBe(230)
    expect(field.statesAt(1, 1)).toEqual(['might'])

    // Auras are positional: Might's radius at level 20 is 16 + 2 * 19 = 54.
    expect(field.aurasAt(100, 100).length).toBe(0)
    expect(field.statsAt(100, 100).get('damagepercent')).toBe(0)

    // Moving a source moves its aura.
    field.moveSource('paladin-a', 100, 100)
    expect(field.statsAt(100, 100).get('damagepercent')).toBe(230)
    field.remove('paladin-a')
    expect(field.size()).toBe(1)
  })

  it('expires a timed aura when its duration runs out', () => {
    const field = new AuraField()
    activateAura(runtime, field, {
      sourceId: 'necromancer',
      skill: 'Amplify Damage',
      level: 1,
      x: 0,
      y: 0,
    })
    expect(field.statsAt(0, 0).get('damageresist')).toBe(-100)
    field.tick(4)
    expect(field.statsAt(0, 0).get('damageresist')).toBe(-100)
    field.tick(5)
    expect(field.size()).toBe(0)
    expect(field.statsAt(0, 0).get('damageresist')).toBe(0)
  })
})

describe('missiles', () => {
  it('carries the flight numbers the tables give it', () => {
    const firebolt = missile('firebolt')
    expect(firebolt.velocity).toBe(20)
    expect(firebolt.range).toBe(50)
    // 20 subtiles/s is 10 tiles/s, which is the speed the example's own
    // hand-written fireball already used before this module existed.
    expect(firebolt.tilesPerSecond).toBe(10)
    expect(resolveMissile(firebolt).lifetimeSeconds).toBeCloseTo(2.5, 6)
    expect(firebolt.explosionMissile).toBe('fireexplode')
    // An arrow pierces, knocks back and carries the whole of the bow damage.
    const arrow = missile('arrow')
    expect(arrow.pierce).toBe(true)
    expect(arrow.percentOfSource).toBe(128)
    expect(resolveMissile(arrow, 1, { min: 20, max: 40 }).damage.physical).toEqual({
      min: 20,
      max: 40,
      percentOfSource: 1,
    })
    // Frozen Orb leaves bolts and a nova behind.
    expect(missile('frozenorb').subMissiles).toContain('frozenorbbolt')
    expect(missile('frozenorb').hitSubMissiles).toContain('frozenorbnova')
  })

  it('scales missile damage with the missile level and its own HitShift', () => {
    // Quill Rat spike: HitDamage 8, so 1-2 is 1-2, and +3 per level after that.
    const spike = resolveMissile(missile('spike1'), 1)
    expect(spike.damage.physical?.min).toBe(1)
    expect(spike.damage.physical?.max).toBe(2)
    expect(resolveMissile(missile('spike1'), 2).damage.physical?.min).toBe(4)

    // AndyPoisonBolt leaves `HitShift` blank, and its values are already in
    // 256ths: 1280 physical is 5, 1792 is 7 — what an act boss's bolt does.
    const bolt = resolveMissile(missile('andypoisonbolt'), 1)
    expect(bolt.damage.physical?.min).toBe(5)
    expect(bolt.damage.physical?.max).toBe(7)
    expect(bolt.damage.elemental?.type).toBe('pois')
    expect(bolt.damage.elemental?.min).toBeCloseTo(32 / 256, 6)
    // A catapult's shot is an exploding one, and says so.
    expect(resolveMissile(missile('catapultchargedball'), 1).explodes).toBe(true)
    // eslint-disable-next-line no-console -- raw evidence
    console.log(
      'missiles:',
      `firebolt ${missile('firebolt').tilesPerSecond} tiles/s for ${
        resolveMissile(missile('firebolt')).lifetimeSeconds
      }s`,
      `spike1 ${spike.damage.physical?.min}-${spike.damage.physical?.max}`,
      `andypoisonbolt ${bolt.damage.physical?.min}-${bolt.damage.physical?.max}`,
    )
    // `VelLev` raises the speed per missile level but never past `MaxVel`:
    // spike1 grows by 8 a level from `Vel` 10 with `MaxVel` 10, so it stays 10.
    expect(missile('spike1').velocityPerLevel).toBe(8)
    expect(missileVelocity(missile('spike1'), 4)).toBe(10)
    expect(missileVelocity(missile('spike1'), 1)).toBeLessThanOrEqual(missile('spike1').maxVelocity)
  })

  it('picks the right missile for each of a caster\'s skills', () => {
    expect(runtime.missilesFor('Fire Bolt').server?.name).toBe('firebolt')
    expect(runtime.missilesFor('Fire Ball').server?.name).toBe('fireball')
    expect(runtime.missilesFor('Frozen Orb').server?.name).toBe('frozenorb')
    expect(runtime.missilesFor('AndyPoisonBolt').server?.name).toBe('andypoisonbolt')
    // A melee skill has none, and says so rather than inventing one.
    expect(runtime.missilesFor('Zeal').server).toBeNull()
  })
})

describe('monster skills through the skills engine', () => {
  it('runs every skill any monster casts', () => {
    const stats = table('table_monstats')
    let references = 0
    const failures: string[] = []
    let withDamage = 0
    let withMissile = 0
    let withAura = 0
    for (const row of stats) {
      for (let slot = 1; slot <= 8; slot += 1) {
        const name = row[`Skill${slot}`]
        if (!name) continue
        references += 1
        const level = Number(row[`Sk${slot}lvl`] ?? 1) || 1
        const monsterCaster = staticCaster(level)
        const result = runtime.cast(name, level, monsterCaster)
        if (!result) {
          failures.push(`${row.Id}:${name}`)
          continue
        }
        const numbers = [
          result.mana.whole,
          result.attackRating,
          result.damage.elemental?.min ?? 0,
          result.damage.elemental?.max ?? 0,
          result.damage.physical?.min ?? 0,
          result.aura?.radius ?? 0,
        ]
        if (numbers.some((value) => !Number.isFinite(value))) failures.push(`${row.Id}:${name}`)
        if (result.damage.elemental || result.damage.physical) withDamage += 1
        if (result.missiles.length > 0) withMissile += 1
        if (result.aura) withAura += 1
      }
    }
    expect(references).toBe(807)
    expect(failures).toEqual([])
    expect(withDamage).toBeGreaterThan(200)
    expect(withMissile).toBeGreaterThan(80)
    expect(withAura).toBeGreaterThan(80)
    // eslint-disable-next-line no-console -- raw evidence
    console.log(
      `monster skills: ${references} references, ${withDamage} damaging, ${withMissile} with a missile, ${withAura} aura-shaped`,
    )
  })

  it('runs a monster skill at the level the monster casts it', () => {
    // Andariel casts AndyPoisonBolt at `Sk2lvl` 1, and it fires `andypoisonbolt`.
    const bolt = cast('AndyPoisonBolt', 1)
    expect(bolt.missiles).toEqual(['andypoisonbolt'])
    expect(bolt.damage.elemental).toBeNull()
    const onHit = resolveMissile(missile('andypoisonbolt'), 1)
    expect(onHit.damage.physical?.max).toBe(7)
    expect(onHit.damage.elemental?.type).toBe('pois')
    // SkeletonRaise is a scripted sequence with no missile and no damage: the
    // numbers are all zero and that is the honest answer.
    const raise = cast('SkeletonRaise', 1)
    expect(raise.missiles).toEqual([])
    expect(raise.damage.physical).toBeNull()
    expect(raise.damage.elemental).toBeNull()
  })
})

describe('loader', () => {
  it('exposes the browser loader', () => {
    // The loader is the same shape as the other modules': relative to the page,
    // degrading to empty tables when the export is absent.
    expect(typeof loadSkillTables).toBe('function')
    expect(typeof bandDamage).toBe('function')
    expect(hitShiftScale(6, 7)).toBe(3)
    expect(hitShiftScale(80, 8)).toBe(80)
  })
})
