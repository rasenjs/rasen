import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { SkillRuntime, parseSkillTables, resolveMissile } from '../skills'
import {
  aiParamKind,
  createMonsterBrain,
  describeMonsterStats,
  findAiParam,
  framesToSeconds,
  monLvlRow,
  monsterAttackOptions,
  monsterLevelInArea,
  monsterStatsInArea,
  parseMonsterTables,
  resolveMonsterAi,
  rollMonsterHp,
  type AreaInfo,
  type BrainAction,
  type MonsterBrain,
  type MonsterDef,
  type MonsterTables,
  type TableRow,
} from '../monsters'

/**
 * These tests are the evidence for the scaling rule documented at the top of
 * `monsters.ts`. They read the real exported tables off disk — no fixtures —
 * because the whole point of the module is that its numbers come from the
 * retail data.
 */

/**
 * The tests run under jsdom, where `import.meta.url` is an http URL, so the
 * table directory is found by walking up from the working directory instead.
 * That also makes the suite work whether vitest is started at the repo root or
 * inside `examples/arpg`.
 */
function tableDirectory(): string {
  let directory = resolve(process.cwd())
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(directory, 'public', 'original')
    if (existsSync(join(candidate, 'table_monstats.json'))) return candidate
    const nested = join(directory, 'examples', 'arpg', 'public', 'original')
    if (existsSync(join(nested, 'table_monstats.json'))) return nested
    directory = dirname(directory)
  }
  throw new Error('the exported tables are missing: run the assets:extract script first')
}

const TABLE_DIRECTORY = tableDirectory()

function table(name: string): TableRow[] {
  return JSON.parse(readFileSync(join(TABLE_DIRECTORY, `${name}.json`), 'utf8')) as TableRow[]
}

const tables: MonsterTables = parseMonsterTables({
  monstats: table('table_monstats'),
  monstats2: table('table_monstats2'),
  monlvl: table('table_monlvl'),
  monai: table('table_monai'),
  monseq: table('table_monseq'),
  levels: table('table_levels'),
})

function monster(id: string): MonsterDef {
  const def = tables.byId.get(id)
  if (!def) throw new Error(`monster ${id} missing from monstats`)
  return def
}

function area(name: string): AreaInfo {
  const found = tables.areas.find((candidate) => candidate.name === name)
  if (!found) throw new Error(`area ${name} missing from levels`)
  return found
}

describe('monster tables', () => {
  it('parses every monstats row and its monstats2 half', () => {
    // 752 rows in the table, one of which is the "Expansion" spacer row that
    // carries no Id and no AI: 751 monsters, 128 of them without a monstats2 row
    // (monstats2's 624 rows include the spacer's own).
    expect(tables.monsters.length).toBe(751)
    expect(tables.monLvl.size).toBe(111)
    expect(tables.sequences.size).toBeGreaterThan(50)
    // 139 rows, minus the same "Expansion" spacer row: 138 areas.
    expect(tables.areas.length).toBe(138)
    const fallen = monster('fallen1')
    expect(fallen.name).toBe('Fallen')
    expect(fallen.ai).toBe('Fallen')
    // 624 of the 751 monsters have a monstats2 row; the rest keep neutral
    // geometry rather than being dropped.
    expect(fallen.size.sizeX).toBe(2)
    expect(fallen.modes.attack1).toBe(true)
    expect(fallen.modes.run).toBe(false)
  })

  it('resolves every monster skill to a real skills.json row', () => {
    const skills = new Set(table('table_skills').map((row) => row.skill as string))
    let refs = 0
    const unresolved: string[] = []
    for (const def of tables.monsters) {
      for (const slot of def.skills) {
        refs += 1
        if (!skills.has(slot.skill)) unresolved.push(`${def.id}:${slot.skill}`)
      }
    }
    expect(refs).toBe(807)
    expect(unresolved).toEqual([])
    // The tests in skills.test.ts cover the four skills of a specific monster;
    // here the point is that all 807 references across all 752 monsters resolve.
    expect(tables.monsters.filter((def) => def.skills.length > 0).length).toBe(401)
  })

  it('labels AI parameters from monai rather than guessing them', () => {
    const skeleton = resolveMonsterAi(monster('skeleton1'), 'normal')
    expect(skeleton.params.map((param) => param.label)).toEqual([
      'Approach Enemy (% Chance)',
      'AI Delay (Frames)',
      'Attack Enemy (% Chance)',
      'Attack1 (% Chance), else Attack2',
    ])
    expect(skeleton.params.map((param) => param.kind)).toEqual([
      'chance',
      'frames',
      'chance',
      'chance',
    ])
    expect(findAiParam(skeleton, ['AI Delay'])?.value).toBe(15)
    // Fallen documents no awareness range at all — the AI procedure is compiled.
    const fallen = resolveMonsterAi(monster('fallen1'), 'normal')
    expect(findAiParam(fallen, ['Enemy Awareness'])).toBeUndefined()
    expect(fallen.params[0]?.label).toBe('Command Attack (% Chance)')
    expect(aiParamKind('Run Away Range')).toBe('range')
    expect(aiParamKind('Life Regen Bonus (hpregen)')).toBe('life-threshold')
  })

  it('keeps monseq cast frames, which is the only animation timing in the tables', () => {
    const skeletonRaise = tables.sequences.get('seq_skeletonraise')
    expect(skeletonRaise?.frames).toBe(11)
    expect(skeletonRaise?.mode).toBe('DT')
    expect(skeletonRaise?.seconds).toBeCloseTo(0.44, 5)
    const skeleton = monster('skeleton1')
    const raise = skeleton.skills.find((slot) => slot.skill === 'SkeletonRaise')
    expect(raise?.mode).toBe('DT')
    expect(raise?.castFrames).toBe(11)
    expect(raise?.level).toBe(1)
    expect(framesToSeconds(15)).toBe(0.6)
  })
})

describe('monlvl scaling rule', () => {
  it('reads the multipliers as percentages of the monstats base columns', () => {
    const row1 = monLvlRow(tables, 1)
    expect(row1.level).toBe(1)
    expect(row1.plain.hp.normal).toBe(7)
    expect(row1.plain.damage.normal).toBe(2)
    expect(row1.plain.xp.normal).toBe(30)
    expect(row1.plain.armor.normal).toBe(6)
    expect(row1.plain.toHit.normal).toBe(8)
    // Row 110 is the clamped top of the table: 100x the base values.
    expect(monLvlRow(tables, 110).plain.hp.hell).toBe(10000)
    expect(monLvlRow(tables, 999).level).toBe(110)
  })

  it('reproduces the measured relationship between the plain and L- columns', () => {
    const plain = (level: number) => monLvlRow(tables, level).plain
    const scaled = (level: number) => monLvlRow(tables, level).areaScaled
    // Rows 0 and 110 are the curve's saturated ends: the sets agree there.
    for (const level of [0, 110]) {
      expect(scaled(level).armor.nightmare).toBe(plain(level).armor.nightmare)
      expect(scaled(level).hp.hell).toBe(plain(level).hp.hell)
    }
    for (const level of [1, 5, 20, 40, 67, 85, 99]) {
      // Normal: identical at every level.
      expect(scaled(level).hp.normal).toBe(plain(level).hp.normal)
      expect(scaled(level).armor.normal).toBe(plain(level).armor.normal)
      expect(scaled(level).xp.normal).toBe(plain(level).xp.normal)
      // Damage, attack rating and experience never differ in any difficulty.
      expect(scaled(level).damage.hell).toBe(plain(level).damage.hell)
      expect(scaled(level).toHit.hell).toBe(plain(level).toHit.hell)
      expect(scaled(level).xp.hell).toBe(plain(level).xp.hell)
      // Nightmare armor is 1.1729..1.1803 of the plain curve.
      const armorRatio = scaled(level).armor.nightmare / plain(level).armor.nightmare
      expect(armorRatio).toBeGreaterThan(1.17)
      expect(armorRatio).toBeLessThan(1.181)
      // Nightmare life does not differ at all.
      expect(scaled(level).hp.nightmare).toBe(plain(level).hp.nightmare)
      // Hell armor 1.1728..1.1780, Hell life 1.3330..1.3337 (4/3 to rounding).
      const hellArmor = scaled(level).armor.hell / plain(level).armor.hell
      expect(hellArmor).toBeGreaterThan(1.17)
      expect(hellArmor).toBeLessThan(1.181)
      expect(scaled(level).hp.hell).toBeGreaterThan((plain(level).hp.hell * 4) / 3 - 1)
      expect(scaled(level).hp.hell).toBeLessThan((plain(level).hp.hell * 4) / 3 + 1)
    }
  })

  it('applies the L- set only when asked, and 33% more Hell life either way', () => {
    const fallen = monster('fallen1')
    const plain = monsterStatsInArea(tables, fallen, area('Act 1 - Wilderness 1'), {
      difficulty: 'hell',
    })
    const scaled = monsterStatsInArea(tables, fallen, area('Act 1 - Wilderness 1'), {
      difficulty: 'hell',
      columnSet: 'areaScaled',
    })
    expect(scaled.hp.max / plain.hp.max).toBeCloseTo(4 / 3, 2)
    expect(plain.columnSet).toBe('monsterLevel')
    expect(scaled.columnSet).toBe('areaScaled')
    // Armor moves by the same ~18% the tables prescribe, and nothing else moves.
    expect(scaled.armor / plain.armor).toBeGreaterThan(1.17)
    expect(scaled.xp).toBe(plain.xp)
    expect(scaled.damage.attack1).toEqual(plain.damage.attack1)
  })

  it('puts a Fallen in the Blood Moor at the numbers the retail game shows', () => {
    const bloodMoor = area('Act 1 - Wilderness 1')
    expect(bloodMoor.monsterLevel).toEqual({ normal: 1, nightmare: 36, hell: 67 })
    const stats = monsterStatsInArea(tables, monster('fallen1'), bloodMoor, {
      difficulty: 'normal',
    })
    expect(stats.level).toBe(1)
    expect(stats.levelSource).toBe('monster')
    expect(stats.hp.max).toBeCloseTo(4.27, 2)
    expect(stats.hp.min).toBeCloseTo(1.47, 2)
    expect(stats.damage.attack1?.min).toBeCloseTo(1.02, 2)
    expect(stats.damage.attack1?.max).toBeCloseTo(2.02, 2)
    expect(stats.armor).toBeCloseTo(5.04, 2)
    expect(stats.toHit).toBeCloseTo(8.08, 2)
    expect(stats.xp).toBeCloseTo(18.3, 1)
    // eslint-disable-next-line no-console -- the raw numbers are the deliverable's evidence
    console.log('fallen1 in Blood Moor:', describeMonsterStats(stats))
  })

  it('scales hp, damage, armor and xp monotonically with the level', () => {
    const fallen = monster('fallen1')
    let previous = monsterStatsInArea(tables, fallen, area('Act 1 - Wilderness 1'))
    for (const level of [2, 5, 10, 20, 40, 60, 85, 99]) {
      const stats = monsterStatsInArea(tables, fallen, area('Act 1 - Wilderness 1'), { level })
      expect(stats.hp.min).toBeGreaterThan(previous.hp.min)
      expect(stats.hp.max).toBeGreaterThan(previous.hp.max)
      expect(stats.armor).toBeGreaterThanOrEqual(previous.armor)
      expect(stats.xp).toBeGreaterThan(previous.xp)
      expect(stats.damage.attack1?.max ?? 0).toBeGreaterThanOrEqual(
        previous.damage.attack1?.max ?? 0,
      )
      previous = stats
    }
    expect(previous.hp.max).toBeGreaterThan(500)
  })

  it('raises a monster to the area level, but never a noRatio pet', () => {
    const cathedral = area('Act 1 - Cathedral')
    const fallen = monster('fallen1')
    const zombie = monster('zombie1')
    // The Cathedral is a level-11 Normal area; a level-1 Fallen is raised to it.
    const raised = monsterStatsInArea(tables, fallen, cathedral)
    expect(raised.level).toBe(11)
    expect(raised.levelSource).toBe('area')
    expect(raised.hp.max).toBeGreaterThan(4.27)

    // Hell: Fallen's own level (67) is exactly Blood Moor's MonLvlEx(H).
    const hell = monsterStatsInArea(tables, fallen, area('Act 1 - Wilderness 1'), {
      difficulty: 'hell',
    })
    expect(hell.level).toBe(67)
    expect(hell.hp.max).toBeGreaterThan(1000)
    expect(hell.resistances.fire).toBe(100)
    // eslint-disable-next-line no-console -- raw evidence for the report
    console.log('fallen1 in Hell Blood Moor:', describeMonsterStats(hell))

    // Diablo is level 94 in Hell, above the Chaos Sanctuary's 85: bosses keep
    // their own level. The zone list uses internal names, so compare numerically.
    const diablo = monster('diablo')
    expect(diablo.level.hell).toBe(94)

    const golem = monster('claygolem')
    expect(golem.flags.noRatio).toBe(true)
    const decision = monsterLevelInArea(golem, area('Act 5 - World Stone'), 'hell')
    expect(decision.source).toBe('monster')
    expect(decision.level).toBe(golem.level.hell)

    // `zombie1` is slower than a Fallen and has a documented awareness range.
    expect(zombie.velocity).toBeLessThan(fallen.velocity)
  })

  it('keeps a boss on its own level and its own hp', () => {
    const andariel = monster('andariel')
    const stats = monsterStatsInArea(tables, andariel, area('Act 1 - Catacombs 4'), {
      difficulty: 'normal',
    })
    // Andariel's own level (12) is above the Catacombs' Normal level, so she is
    // not scaled up; 2562 * HP(12)/100 is her retail life.
    expect(stats.level).toBe(12)
    expect(stats.hp.min).toBe(stats.hp.max)
    expect(stats.hp.max).toBeGreaterThan(700)
    expect(stats.hp.max).toBeLessThan(1500)
    expect(stats.resistances.pois).toBe(80)
    expect(stats.resistances.fire).toBe(-50)
    // eslint-disable-next-line no-console -- raw evidence for the report
    console.log('andariel in the Catacombs:', describeMonsterStats(stats))
  })

  it('rolls life inside the min/max range', () => {
    const stats = monsterStatsInArea(tables, monster('fallen1'), area('Act 1 - Wilderness 1'))
    expect(rollMonsterHp(stats, () => 0)).toBe(1)
    expect(rollMonsterHp(stats, () => 1)).toBe(4)
    let seen = 0
    for (let i = 0; i < 200; i += 1) seen += rollMonsterHp(stats, Math.random)
    const average = seen / 200
    expect(average).toBeGreaterThan(stats.hp.min)
    expect(average).toBeLessThan(stats.hp.max + 1)
  })
})

/**
 * Drive a brain for `seconds` of game time and collect every action it returned.
 * The AI only decides once per `thinkDelay` (15 frames = 0.6 s for most
 * monsters, straight from `aidel`), so the tests advance time rather than
 * expecting a state change on every call.
 */
function collect(
  brain: MonsterBrain,
  distance: number | null,
  seconds: number,
  hpFraction = 1,
  dt = 0.04,
): BrainAction[] {
  const actions: BrainAction[] = []
  for (let elapsed = 0; elapsed < seconds; elapsed += dt) {
    actions.push(brain.tick({ dt, targetDistance: distance, hpFraction }))
  }
  return actions
}

/** The skills engine, so the brain's decisions can be run for real. */
const skillRuntime = new SkillRuntime(
  parseSkillTables({
    skills: table('table_skills'),
    skilldesc: table('table_skilldesc'),
    missiles: table('table_missiles'),
    skillcalc: table('table_skillcalc'),
    misscalc: table('table_misscalc'),
  }),
)

describe('monster behaviour', () => {
  it('derives awareness and standoff from the AI parameters', () => {
    const zombie = createMonsterBrain(tables, 'zombie1')
    // Zombie aip2 is documented as "Enemy Awareness (Range)" and is 10.
    expect(zombie?.awareness).toBe(10)
    expect(zombie?.thinkDelay).toBeCloseTo(0.6, 5)
    const skeleton = createMonsterBrain(tables, 'skeleton1')
    // Skeleton aip2 is "AI Delay (Frames)" = 15.
    expect(skeleton?.thinkDelay).toBeCloseTo(0.6, 5)
    // Fallen documents no awareness, so the named fallback applies.
    const fallen = createMonsterBrain(tables, 'fallen1')
    expect(fallen?.awareness).toBe(18)
    expect(fallen?.canMove).toBe(true)
    expect(fallen?.canRun).toBe(false)
    expect(fallen?.standoff).toBe(2)
  })

  it('walks the idle → approach → attack → fire → recover cycle', () => {
    const brain = createMonsterBrain(tables, 'skeleton1', { seed: 7 })
    if (!brain) throw new Error('skeleton1 missing')

    // No target: the brain idles or wanders, never attacks.
    const idle = collect(brain, null, 2)
    expect(idle.every((action) => action.attack === null)).toBe(true)
    expect(idle.some((action) => action.state === 'idle' || action.state === 'wander')).toBe(true)

    // Far away: approach by walking, because skeleton1 has no run animation.
    const approach = collect(brain, 12, 1.5)
    const walking = approach.find((action) => action.state === 'approach')
    expect(walking?.movement).toBe('walk')
    expect(walking?.speed).toBe(3)
    expect(walking?.mode).toBe('WL')

    // In reach (standoff 2 subtiles: no `MeleeRng` for a skeleton): attack.
    const melee = collect(brain, 1.5, 4)
    const windup = melee.find((action) => action.attack?.phase === 'windup')
    expect(windup).not.toBeNull()
    expect(windup?.state).toBe('attack')
    expect(windup?.mode).toBe('A1')
    expect(windup?.attack?.windup).toBeCloseTo(0.6, 5)

    // The windup elapses: the payload fires once, then the AI delay is recovery.
    const fire = melee.find((action) => action.attack?.phase === 'fire')
    const recover = melee.find((action) => action.attack?.phase === 'recover')
    expect(fire?.state).toBe('attack')
    expect(fire?.attack?.kind).toMatch(/attack1|attack2/)
    expect(fire?.castSkill).toBeNull()
    expect(recover?.attack?.recover).toBeCloseTo(0.6, 5)
    // And it keeps attacking while the player stands in range.
    expect(melee.filter((action) => action.attack?.phase === 'fire').length).toBeGreaterThan(1)
  })

  it('fires the monster\'s own skill through the skills engine', () => {
    // A skill's missile comes from the skills table, injected here so the brain
    // knows Andariel's poison bolt is ranged even though `monstats.MissS2` is blank.
    const missiles = new Map(
      table('table_skills').map((row) => [row.skill as string, row.srvmissile ?? null]),
    )
    const brain = createMonsterBrain(tables, 'andariel', {
      seed: 11,
      skillMissile: (skill) => missiles.get(skill) ?? null,
    })
    if (!brain) throw new Error('andariel missing')
    // Attack1 plus her two skills; the AI's "Skill1/Attack1 in melee" and
    // "For ranged, use Skill1 (% Chance), else Skill2" labels weight them.
    expect(brain.attackOptions.map((option) => option.kind)).toEqual([
      'attack1',
      'skill',
      'skill',
    ])
    const total = brain.attackOptions.reduce((sum, option) => sum + option.weight, 0)
    expect(total).toBeCloseTo(1, 9)
    expect(brain.attackOptions.find((option) => option.skill === 'AndyPoisonBolt')?.ranged).toBe(
      true,
    )

    const actions = collect(brain, 2, 20)
    const casts = actions.filter((action) => action.castSkill !== null)
    expect(casts.length).toBeGreaterThan(0)
    expect(['AndrialSpray', 'AndyPoisonBolt']).toContain(casts[0].castSkill?.skill)
    expect(casts[0].attack?.kind).toBe('skill')
    // AndyPoisonBolt fires `andypoisonbolt`; AndrialSpray is a scripted
    // `seq_andarielspray` cast with no missile of its own.
    const bolt = casts.find((action) => action.castSkill?.skill === 'AndyPoisonBolt')
    expect(bolt?.attack?.missile).toBe('andypoisonbolt')
    expect(bolt?.castSkill?.level).toBe(1)

    // The whole path, end to end: what the brain decided to cast runs through
    // the skills engine and produces the missile's numbers.
    const fired = casts[0]
    const executed = skillRuntime.cast(fired.castSkill!.skill, fired.castSkill!.level)
    expect(executed).not.toBeNull()
    expect(executed?.skill).toBe(fired.castSkill?.skill)
    const launched = fired.attack?.missile
    if (launched) {
      const flight = resolveMissile(skillRuntime.missile(launched)!, 1)
      expect(flight.speedTilesPerSecond).toBeGreaterThan(0)
      expect(flight.lifetimeSeconds).toBeGreaterThan(0)
    }
  })

  it('weights the AI\'s attacks with its own % Chance parameters', () => {
    // Skeleton aip4 = "Attack1 (% Chance), else Attack2" = 75.
    const skeleton = monsterAttackOptions(monster('skeleton1'), 'normal')
    const attack1 = skeleton.find((option) => option.kind === 'attack1')
    const attack2 = skeleton.find((option) => option.kind === 'attack2')
    expect(attack1?.weight).toBeCloseTo(0.75, 6)
    expect(attack2?.weight).toBeCloseTo(0.25, 6)

    // A catapult cannot move and has only attack1. Its missile is
    // `catapultchargedball on`, which is not a stray suffix: the missiles table
    // carries ` on` variants ("catapult spike ball on", "catapult cold ball on",
    // …) for the projectiles once they land, so the name resolves.
    const catapult = monsterAttackOptions(monster('catapult1'), 'normal')
    expect(catapult.length).toBe(1)
    expect(catapult[0].kind).toBe('attack1')
    expect(catapult[0].missile).toBe('catapultchargedball on')
    expect(catapult[0].ranged).toBe(true)

    // QuillRat's ranged attack is its MissA2 spike.
    const quill = monsterAttackOptions(monster('quillrat1'), 'normal')
    const spike = quill.find((option) => option.missile === 'spike1')
    expect(spike?.kind).toBe('attack2')
    expect(spike?.ranged).toBe(true)
  })

  it('stays put when the tables give it no way to move', () => {
    const brain = createMonsterBrain(tables, 'catapult1')
    if (!brain) throw new Error('catapult1 missing')
    expect(brain.canMove).toBe(false)
    const actions = collect(brain, 30, 3)
    expect(actions.every((action) => action.movement === 'none')).toBe(true)
    expect(actions.every((action) => action.state === 'idle')).toBe(true)
  })

  it('reacts to damage and death', () => {
    const brain = createMonsterBrain(tables, 'skeleton1')
    if (!brain) throw new Error('skeleton1 missing')
    brain.tick({ dt: 0.04, targetDistance: 4, hpFraction: 1 })
    brain.notifyHit(0.5)
    const hit = brain.tick({ dt: 0.04, targetDistance: 4, hpFraction: 0.5 })
    expect(hit.state).toBe('hit-recovery')
    expect(hit.mode).toBe('GH')
    expect(hit.movement).toBe('none')

    brain.notifyDeath()
    const dying = brain.tick({ dt: 0.04, targetDistance: 4, hpFraction: 0 })
    expect(dying.state).toBe('death')
    expect(dying.mode).toBe('DT')
    // After one AI delay the corpse state takes over.
    const dead = brain.tick({ dt: 0.6, targetDistance: 4, hpFraction: 0 })
    expect(dead.state).toBe('dead')
    expect(dead.mode).toBe('DD')
  })

  it('runs away when the AI documents it', () => {
    // Arach documents "Hurt State (Life % threshold)" = 25 and a
    // "Run Away Range", but has no run animation, so it walks away.
    const arach = createMonsterBrain(tables, 'arach1', { seed: 3 })
    if (!arach) throw new Error('arach1 missing')
    expect(arach.hurtThreshold).toBe(0.25)
    expect(arach.canFlee).toBe(true)
    const fleeing = collect(arach, 5, 2, 0.2)
    const action = fleeing.find((candidate) => candidate.state === 'flee')
    expect(action?.movement).toBe('walk')
    expect(action?.mode).toBe('WL')

    // The rogue archers kite on "Run Away (% Chance)" instead of on life.
    const archer = createMonsterBrain(tables, 'cr_archer1', { seed: 5 })
    expect(archer?.hurtThreshold).toBeNull()
    expect(archer?.canRun).toBe(true)
    const kite = collect(archer as MonsterBrain, 6, 20)
    expect(kite.some((candidate) => candidate.state === 'flee')).toBe(true)
  })

  it('is deterministic for a given seed', () => {
    const first = createMonsterBrain(tables, 'skeleton1', { seed: 1234 })
    const second = createMonsterBrain(tables, 'skeleton1', { seed: 1234 })
    if (!first || !second) throw new Error('skeleton1 missing')
    const trace = (brain: MonsterBrain): string[] =>
      collect(brain, 1.5, 20).map(
        (action) => `${action.state}/${action.mode}/${action.attack?.phase ?? '-'}`,
      )
    expect(trace(first)).toEqual(trace(second))
    // A different seed does not have to differ, but a different monster does.
    const zombie = createMonsterBrain(tables, 'zombie1', { seed: 1234 })
    expect(trace(zombie as MonsterBrain)).not.toEqual(trace(first))
  })
})
