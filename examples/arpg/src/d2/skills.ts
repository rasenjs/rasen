/**
 * Skill execution: what a `skills.txt` row does when the game runs it.
 *
 * Four tables feed this file:
 *
 * | table | what it contributes |
 * | ----- | ------------------- |
 * | `skills` | everything: the damage columns, the mana columns, the missiles, the aura/passive columns and the calc expressions |
 * | `skilldesc` | the display names and the tooltip calc expressions the game uses to print a skill |
 * | `skillcalc` | the *documentation* of every calc code (`ln12`, `clc1`, `edmn`, `usmc`, …) |
 * | `missiles` | what the thing a skill fires actually does in flight |
 *
 * ## The damage rule, derived from the table contents
 *
 * A damaging skill stores its level-1 damage in `EMin`/`EMax` (elemental) or
 * `MinDam`/`MaxDam` (physical) and then five per-level increments that apply in
 * **bands**:
 *
 * | column | levels it applies to |
 * | ------ | -------------------- |
 * | `EMin`/`EMax` | 1 |
 * | `EMinLev1`/`EMaxLev1` | 2..8 |
 * | `EMinLev2`/`EMaxLev2` | 9..16 |
 * | `EMinLev3`/`EMaxLev3` | 17..23 |
 * | `EMinLev4`/`EMaxLev4` | 24..30 |
 * | `EMinLev5`/`EMaxLev5` | 31+ |
 *
 * and the sums are then scaled by `HitShift`, which is the field's place in the
 * engine's 1/256 fixed point:
 *
 *     damage = (base + bands) * 2^HitShift / 256
 *
 * `HitShift` 8 is "the number as written", 7 is half, 3 is 1/32. The evidence is
 * the retail game itself — the numbers this produces are the numbers players
 * know: Lightning 1-40 at level 1 (`HitShift` 8), Nova 1-20, Meteor 80-100,
 * Blessed Hammer 12-16, Frozen Orb 40-45 (`HitShift` 7 on `EMin` 80-90), Fire
 * Bolt 3-6 (`HitShift` 7 on `EMin` 6-12) and Fire Ball 6-14 (`HitShift` 7 on 12-28).
 * The scaling is confirmed inside the data too: `skilldesc` renders Meteor's
 * damage per second as `m1eo*25*3*(mael+100)/100/256`, and `skillcalc` defines
 * `m1eo` as "Elemental Damage Min for skilldesc descmissile1 (256ths)" — the
 * 256ths form of the very number above.
 *
 * Synergies (`EDmgSymPerCalc`, `DmgSymPerCalc`) are calc expressions that
 * evaluate to a percentage, applied to the finished damage:
 *
 *     damage = base * (1 + synergy / 100)
 *
 * `SrcDam`/`SrcDamage` are the percentage of the *source's* damage an attack
 * carries, in 1/128 units: Multiple Shot's 96 is the 75% every player knows,
 * and the 128 on arrows, bolts and Zeal is 100%.
 *
 * ## Mana
 *
 *     cost = max(minMana, mana + levelMana * (level - 1))
 *
 * which reproduces the retail costs exactly (Teleport 24, Static Field 9,
 * Telekinesis 7, Blessed Hammer 20, Meteor 34) and Teleport's `lvlmana` of -1,
 * which is why Teleport gets cheaper as it is levelled. `manashift` is the
 * engine's fixed-point precision for the same number, exposed here as
 * {@link ManaCost.in256ths}; it is not a second cost.
 *
 * ## Auras and passives
 *
 * An aura row writes `aurastat1..6` + `aurastatcalc1..6` — a stat and a calc
 * expression per slot, e.g. Might is `damagepercent` with `ln34` — plus
 * `auralencalc` (duration) and `aurarangecalc` (radius), both in the same
 * frames/subtiles units as everything else. A passive row does the same with
 * `passivestat1..14` + `passivecalc1..14` and needs no casting.
 *
 * ## What the tables do not contain
 *
 * The procedure: `srvdofunc`/`srvstfunc` are numbers naming compiled routines,
 * so what a skill *does* to the world (spawn N missiles in a line, teleport,
 * convert a corpse) is a reimplementation here, while every number is the
 * table's.
 */

import {
  SKILL_FORMULAS,
  evaluateCalc,
  type CalcContext,
  type FormulaDef,
  type FormulaDefs,
} from './calc'
import { StatSet, describeStatSet, type StatTable } from './stats'

/** Raw table cell: the exported JSON stores every value as a string or null. */
export type TableRow = Readonly<Record<string, string | null>>

function toNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toText(value: string | null | undefined): string | null {
  return value === null || value === undefined || value === '' ? null : value
}

/** The element names the tables use in `EType`/`ETypea1`. */
export type ElementType = 'fire' | 'cold' | 'ltng' | 'pois' | 'mag' | 'stun' | 'frze'

/** Life/mana/attack timing unit: the game's logic rate. */
export const LOGIC_FRAMES_PER_SECOND = 25

/** Convert the tables' frame counts to seconds. */
export function framesToSeconds(frames: number): number {
  return frames / LOGIC_FRAMES_PER_SECOND
}

/** Convert the tables' distance unit — the subtile — to the example's tiles. */
export const SUBTILES_PER_TILE = 2

/**
 * A damage value in the engine's fixed point: `value * 2^hitShift / 256`.
 *
 * `hitShift` 8 is the identity; a blank shift means 0 in `missiles.txt` (the
 * monster projectiles left blank there hold values already expressed in
 * 256ths — Andariel's poison bolt stores 1280 for 5 damage) and 8 in
 * `skills.txt`, where no damaging row leaves the field blank.
 */
export function hitShiftScale(value: number, hitShift: number | null, fallback = 8): number {
  return (value * 2 ** (hitShift ?? fallback)) / 256
}

/** The five per-level bands a damage column pair uses, in table order. */
export type Bands = readonly [number, number, number, number, number]

/**
 * One damage column group: the level-1 value plus the per-level bands.
 */
export interface DamageBands {
  min: number
  max: number
  minPerLevel: Bands
  maxPerLevel: Bands
}

/**
 * Damage at a skill level, summed over the bands.
 *
 * The bands are the table's own layout, not a formula: `perLevel[0]` applies to
 * levels 2..8, `[1]` to 9..16, `[2]` to 17..23, `[3]` to 24..30, `[4]` to 31+.
 * Level 1 is the bare `EMin`/`EMax` value, which is why Fire Bolt reads 6-12 in
 * the table and deals 3-6 in the game (`HitShift` 7).
 */
export function bandDamage(bands: DamageBands, level: number): { min: number; max: number } {
  const at = Math.max(1, level)
  const value = (base: number, perLevel: Bands): number =>
    base +
    perLevel[0] * (Math.min(at, 8) - 1) +
    perLevel[1] * Math.max(0, Math.min(at, 16) - 8) +
    perLevel[2] * Math.max(0, Math.min(at, 23) - 16) +
    perLevel[3] * Math.max(0, Math.min(at, 30) - 23) +
    perLevel[4] * Math.max(0, at - 30)
  return { min: value(bands.min, bands.minPerLevel), max: value(bands.max, bands.maxPerLevel) }
}

/** A resolved pile of damage: physical, elemental, or both, in whole units. */
export interface DamageResult {
  physical: { min: number; max: number; percentOfSource: number } | null
  elemental: { type: ElementType; min: number; max: number; durationSeconds: number } | null
  /**
   * The synergies applied, in percent. The two are separate columns with
   * separate purposes: `DmgSymPerCalc` feeds the physical damage (Leap Attack,
   * Twister, Blade Fury) and `EDmgSymPerCalc` the elemental (Fire Bolt, Nova).
   */
  synergy: { physical: number; elemental: number }
}

/** Mana cost of a skill at a level, in whole points and in the engine's 256ths. */
export interface ManaCost {
  whole: number
  in256ths: number
  /** `manashift`, verbatim — the fixed point the engine stores the cost in. */
  shift: number | null
}

/** One `aurastatN`/`aurastatcalcN` pair, already evaluated. */
export interface StatEntry {
  stat: string
  value: number
}

/** A skill's aura: what it grants, to whom, and for how long. */
export interface AuraDef {
  state: string | null
  targetState: string | null
  /** `aurafilter`: which units the aura may attach to. */
  filter: number | null
  /** `auralencalc` as seconds; null when the aura has no duration (a toggle). */
  durationSeconds: number | null
  /** `aurarangecalc` in subtiles. */
  radius: number
}

/** A skill's passive: always on, no casting, no radius. */
export interface PassiveDef {
  state: string | null
  /** `passiveitype`: the item type the passive needs to be active. */
  itemType: string | null
  requiredWeaponCount: number | null
}

export interface SkillDef {
  name: string
  id: number | null
  charClass: string | null
  skillDesc: string | null
  /** `skilldesc`'s `str name`, when the description table was loaded. */
  displayName: string | null
  /** `skilldesc`'s `str short`. */
  shortName: string | null
  leftSkill: boolean
  rightSkill: boolean
  maxLevel: number
  requiredLevel: number
  /** `srvdofunc`/`srvstfunc`/`cltdofunc` — the compiled routines, kept as their ids. */
  serverDoFunc: number | null
  serverStartFunc: number | null
  clientDoFunc: number | null
  /** `srvmissile` and the `a`/`b`/`c` alternatives; `cltmissile` is the visual. */
  missiles: {
    server: string | null
    serverA: string | null
    serverB: string | null
    serverC: string | null
    client: string | null
  }
  mana: number
  levelMana: number
  minMana: number
  manaShift: number | null
  hitShift: number | null
  /** Overall damage synergy: applied to the sum of every damage type. */
  damageSynergy: string | null
  elemental: {
    type: ElementType | null
    bands: DamageBands
    /** `ELen` + `ELevLen1..3`, in frames. */
    length: number
    lengthPerLevel: Bands
    lengthSynergy: string | null
    synergy: string | null
  }
  physical: {
    bands: DamageBands
    /** `SrcDam` in 1/128 units: 128 is "the whole of the source's damage". */
    percentOfSource: number
    synergy: string | null
  }
  toHit: number
  toHitCalc: string | null
  /** `calc1`..`calc10`, verbatim; everything else the skill computes reads these. */
  calcs: Readonly<Record<string, string | null>>
  /** `Param1`..`Param20` in table order — the `parN`/`paN` the calcs read. */
  params: readonly number[]
  /** `cltcalc1..3`, the client-side calc columns. */
  clientCalcs: Readonly<Record<string, string | null>>
  aura: { state: string | null; targetState: string | null } | null
  passive: { state: string | null } | null
  summon: string | null
  petType: number | null
  petMax: string | null
  /** `aitype` — how a *monster* would pick this skill; the monster side of the data. */
  aiType: number | null
  /** `attackrank`, `range`, `anim`, `seqtrans` — presentation, kept for the renderer. */
  attackRank: number | null
  range: number | null
  animation: string | null
  sequenceTransition: string | null
  /** The row itself, for anything this view does not name. */
  row: TableRow
}

/** A `skilldesc` row, for display names and tooltip calcs. */
export interface SkillDescription {
  key: string
  page: number | null
  /** `SkillRow` — the tooltip's row on the skill page, not a table row. */
  pageRow: number | null
  column: number | null
  listRow: number | null
  name: string | null
  shortName: string | null
  longName: string | null
  /** `descdam` — which of the game's damage templates the tooltip uses. */
  damageTemplate: number | null
  /** `ddam calc1`/`ddam calc2` — the tooltip's own damage expressions. */
  damageCalcs: readonly (string | null)[]
  /** `desclineN`/`desctextaN`/`desccalcaN`/`desccalcbN`, ten lines of them. */
  lines: readonly {
    template: number | null
    textA: string | null
    textB: string | null
    calcA: string | null
    calcB: string | null
  }[]
  /** The row itself. */
  raw: TableRow
}

/** A missile, as `missiles.txt` defines it. */
export interface MissileDef {
  name: string
  /** `pSrvDmgFunc`/`pSrvDoFunc`/`pSrvHitFunc` — the compiled routines. */
  serverDamageFunc: number | null
  serverDoFunc: number | null
  serverHitFunc: number | null
  /** `Vel`/`MaxVel`/`VelLev` — speed in subtiles per second, and its growth. */
  velocity: number
  maxVelocity: number
  velocityPerLevel: number | null
  acceleration: number | null
  /** `Range` in subtiles; with the velocity this gives the flight time. */
  range: number
  radius: number
  size: number
  collideType: number | null
  collideKill: boolean
  collideFriend: boolean
  lastCollide: boolean
  collisionOverlap: boolean
  nextHit: boolean
  nextDelay: number | null
  canDestroy: boolean
  alwaysExplodes: boolean
  explodes: boolean
  pierce: boolean
  knockBack: boolean
  canSlow: boolean
  appliesToHit: boolean
  /** `SrcDamage`/`SrcMissDmg` in 1/128 units. */
  percentOfSource: number
  percentOfSourceMissile: number | null
  hitShift: number | null
  physical: DamageBands
  elemental: { type: ElementType | null; bands: DamageBands; length: number }
  damageSynergy: string | null
  elementalSynergy: string | null
  /** Missiles this one spawns: in flight, on hit and on death. */
  subMissiles: readonly string[]
  hitSubMissiles: readonly string[]
  explosionMissile: string | null
  /** The skill this missile belongs to, when the table names one. */
  skill: string | null
  animationLength: number | null
  /** Seconds of flight: `Range / Vel`, both in the table's own units. */
  lifetimeSeconds: number
  /** Subtiles per second, converted to the example's tiles per second. */
  tilesPerSecond: number
  row: TableRow
}

/** Everything the three skill tables gave us. */
export interface SkillTables {
  skills: readonly SkillDef[]
  byName: ReadonlyMap<string, SkillDef>
  descriptions: ReadonlyMap<string, SkillDescription>
  missiles: readonly MissileDef[]
  missileByName: ReadonlyMap<string, MissileDef>
  /** Raw `skills` rows, so callers can evaluate any column of any row. */
  rows: readonly TableRow[]
  /** Formula aliases (`ln12` …), from `skillcalc` when it was loaded. */
  formulas: FormulaDefs
}

// --- parsing ----------------------------------------------------------------

function bandPair(
  row: TableRow,
  minKey: string,
  maxKey: string,
  minLevKeys: readonly string[],
  maxLevKeys: readonly string[],
): DamageBands {
  const readBands = (keys: readonly string[]): Bands => [
    toNumber(row[keys[0]]) ?? 0,
    toNumber(row[keys[1]]) ?? 0,
    toNumber(row[keys[2]]) ?? 0,
    toNumber(row[keys[3]]) ?? 0,
    toNumber(row[keys[4]]) ?? 0,
  ]
  return {
    min: toNumber(row[minKey]) ?? 0,
    max: toNumber(row[maxKey]) ?? 0,
    minPerLevel: readBands(minLevKeys),
    maxPerLevel: readBands(maxLevKeys),
  }
}

const ELEMENTAL_MIN_LEVEL_KEYS = ['EMinLev1', 'EMinLev2', 'EMinLev3', 'EMinLev4', 'EMinLev5']
const ELEMENTAL_MAX_LEVEL_KEYS = ['EMaxLev1', 'EMaxLev2', 'EMaxLev3', 'EMaxLev4', 'EMaxLev5']
const PHYSICAL_MIN_LEVEL_KEYS = ['MinLevDam1', 'MinLevDam2', 'MinLevDam3', 'MinLevDam4', 'MinLevDam5']
const PHYSICAL_MAX_LEVEL_KEYS = ['MaxLevDam1', 'MaxLevDam2', 'MaxLevDam3', 'MaxLevDam4', 'MaxLevDam5']

function elementOf(value: string | null | undefined): ElementType | null {
  const text = toText(value)
  if (text === null) return null
  const known: readonly ElementType[] = ['fire', 'cold', 'ltng', 'pois', 'mag', 'stun', 'frze']
  return known.includes(text as ElementType) ? (text as ElementType) : null
}

/**
 * Turn one `skills` row into a {@link SkillDef}.
 *
 * The row is kept on the result: `skills.txt` has 200+ columns and naming every
 * one of them here would be a second, worse copy of the table. What is named is
 * what the runtime computes with.
 */
export function parseSkill(
  row: TableRow,
  description: SkillDescription | null,
): SkillDef | null {
  const name = toText(row.skill)
  if (!name) return null
  const calcs: Record<string, string | null> = {}
  for (let index = 1; index <= 10; index += 1) calcs[`calc${index}`] = toText(row[`calc${index}`])
  const clientCalcs: Record<string, string | null> = {}
  for (let index = 1; index <= 3; index += 1) {
    clientCalcs[`cltcalc${index}`] = toText(row[`cltcalc${index}`])
  }
  const params: number[] = []
  for (let index = 1; index <= 20; index += 1) params.push(toNumber(row[`Param${index}`]) ?? 0)

  const auraState = toText(row.aurastate)
  const passiveState = toText(row.passivestate)
  return {
    name,
    id: toNumber(row.Id),
    charClass: toText(row.charclass),
    skillDesc: toText(row.skilldesc),
    displayName: description?.name ?? null,
    shortName: description?.shortName ?? null,
    leftSkill: row.leftskill === '1',
    rightSkill: row.rightskill === '1',
    maxLevel: toNumber(row.maxlvl) ?? 0,
    requiredLevel: toNumber(row.reqlevel) ?? 0,
    serverDoFunc: toNumber(row.srvdofunc),
    serverStartFunc: toNumber(row.srvstfunc),
    clientDoFunc: toNumber(row.cltdofunc),
    missiles: {
      server: toText(row.srvmissile),
      serverA: toText(row.srvmissilea),
      serverB: toText(row.srvmissileb),
      serverC: toText(row.srvmissilec),
      client: toText(row.cltmissile),
    },
    mana: toNumber(row.mana) ?? 0,
    levelMana: toNumber(row.lvlmana) ?? 0,
    minMana: toNumber(row.minmana) ?? 0,
    manaShift: toNumber(row.manashift),
    hitShift: toNumber(row.HitShift),
    damageSynergy: toText(row.DmgSymPerCalc),
    elemental: {
      type: elementOf(row.EType),
      bands: bandPair(
        row,
        'EMin',
        'EMax',
        ELEMENTAL_MIN_LEVEL_KEYS,
        ELEMENTAL_MAX_LEVEL_KEYS,
      ),
      length: toNumber(row.ELen) ?? 0,
      lengthPerLevel: [
        toNumber(row.ELevLen1) ?? 0,
        toNumber(row.ELevLen2) ?? 0,
        toNumber(row.ELevLen3) ?? 0,
        0,
        0,
      ],
      lengthSynergy: toText(row.ELenSymPerCalc),
      synergy: toText(row.EDmgSymPerCalc),
    },
    physical: {
      bands: bandPair(
        row,
        'MinDam',
        'MaxDam',
        PHYSICAL_MIN_LEVEL_KEYS,
        PHYSICAL_MAX_LEVEL_KEYS,
      ),
      percentOfSource: toNumber(row.SrcDam) ?? 0,
      synergy: toText(row.DmgSymPerCalc),
    },
    toHit: toNumber(row.ToHit) ?? 0,
    toHitCalc: toText(row.ToHitCalc),
    calcs,
    params,
    clientCalcs,
    aura:
      auraState === null &&
      toText(row.aurarangecalc) === null &&
      toText(row.auralencalc) === null &&
      toText(row.aurastat1) === null
        ? null
        : { state: auraState, targetState: toText(row.auratargetstate) },
    passive: passiveState === null ? null : { state: passiveState },
    summon: toText(row.summon),
    petType: toNumber(row.pettype),
    petMax: toText(row.petmax),
    aiType: toNumber(row.aitype),
    attackRank: toNumber(row.attackrank),
    range: toNumber(row.range),
    animation: toText(row.anim),
    sequenceTransition: toText(row.seqtrans),
    row,
  }
}

/** Turn one `skilldesc` row into a {@link SkillDescription}. */
export function parseSkillDescription(row: TableRow): SkillDescription | null {
  const key = toText(row.skilldesc)
  if (!key) return null
  const lines: SkillDescription['lines'][number][] = []
  for (let index = 1; index <= 10; index += 1) {
    lines.push({
      template: toNumber(row[`descline${index}`]),
      textA: toText(row[`desctexta${index}`]),
      textB: toText(row[`desctextb${index}`]),
      calcA: toText(row[`desccalca${index}`]),
      calcB: toText(row[`desccalcb${index}`]),
    })
  }
  return {
    key,
    page: toNumber(row.SkillPage),
    pageRow: toNumber(row.SkillRow),
    column: toNumber(row.SkillColumn),
    listRow: toNumber(row.ListRow),
    name: toText(row['str name']),
    shortName: toText(row['str short']),
    longName: toText(row['str long']),
    damageTemplate: toNumber(row.descdam),
    damageCalcs: [toText(row['ddam calc1']), toText(row['ddam calc2'])],
    lines,
    raw: row,
  }
}

/** Turn one `missiles` row into a {@link MissileDef}. */
export function parseMissile(row: TableRow): MissileDef | null {
  const name = toText(row.Missile)
  if (!name) return null
  const velocity = toNumber(row.Vel) ?? 0
  const range = toNumber(row.Range) ?? 0
  const subMissiles: string[] = []
  for (const key of ['SubMissile1', 'SubMissile2', 'SubMissile3']) {
    const value = toText(row[key])
    if (value) subMissiles.push(value)
  }
  const hitSubMissiles: string[] = []
  for (const key of ['HitSubMissile1', 'HitSubMissile2', 'HitSubMissile3', 'HitSubMissile4']) {
    const value = toText(row[key])
    if (value) hitSubMissiles.push(value)
  }
  return {
    name,
    serverDamageFunc: toNumber(row.pSrvDmgFunc),
    serverDoFunc: toNumber(row.pSrvDoFunc),
    serverHitFunc: toNumber(row.pSrvHitFunc),
    velocity,
    maxVelocity: toNumber(row.MaxVel) ?? velocity,
    velocityPerLevel: toNumber(row.VelLev),
    acceleration: toNumber(row.Accel),
    range,
    radius: toNumber(row.Radius) ?? 0,
    size: toNumber(row.Size) ?? 0,
    collideType: toNumber(row.CollideType),
    collideKill: row.CollideKill === '1',
    collideFriend: row.CollideFriend === '1',
    lastCollide: row.LastCollide === '1',
    collisionOverlap: row.CollisionOverlap === '1',
    nextHit: row.NextHit === '1',
    nextDelay: toNumber(row.NextDelay),
    canDestroy: row.CanDestroy === '1',
    alwaysExplodes: row.AlwaysExplode === '1',
    explodes: row.Explosion === '1',
    pierce: row.Pierce === '1',
    knockBack: row.KnockBack === '1',
    canSlow: row.CanSlow === '1',
    appliesToHit: row.ToHit === '1',
    percentOfSource: toNumber(row.SrcDamage) ?? 0,
    percentOfSourceMissile: toNumber(row.SrcMissDmg),
    hitShift: toNumber(row.HitShift),
    physical: bandPair(row, 'MinDamage', 'MaxDamage', PHYSICAL_MIN_LEVEL_KEYS, PHYSICAL_MAX_LEVEL_KEYS),
    elemental: {
      type: elementOf(row.EType),
      bands: bandPair(row, 'EMin', 'EMax', ELEMENTAL_MIN_LEVEL_KEYS, ELEMENTAL_MAX_LEVEL_KEYS),
      length: toNumber(row.ELen) ?? 0,
    },
    damageSynergy: toText(row.DmgSymPerCalc),
    elementalSynergy: toText(row.EDmgSymPerCalc),
    subMissiles,
    hitSubMissiles,
    explosionMissile: toText(row.ExplosionMissile),
    skill: toText(row.Skill),
    animationLength: toNumber(row.AnimLen),
    // Both are in the table's own units: `Range` and `Vel` are subtiles and
    // subtiles per second (see monsters.ts for the same unit on `Velocity`).
    lifetimeSeconds: velocity > 0 && range > 0 ? range / velocity : 0,
    tilesPerSecond: velocity / SUBTILES_PER_TILE,
    row,
  }
}

/**
 * Every `ln`/`dm`/`sl`/`cl`/`shl`/`dl`-style alias, derived from the tables' own
 * description text.
 *
 * The aliases are split across two tables — `skillcalc` documents the skill
 * families (`ln12`, whose parameters are `par1`/`par2`) and `misscalc` the
 * missile ones (`cl12`, whose parameters are the client's `cpa1`/`cpa2`) — and
 * each is documented as the expression it stands for. So the alias is *read*
 * rather than transcribed: 34 aliases in total, and the missile families are
 * exactly the ones a hand-written alias table forgets.
 */
export function deriveFormulaAliases(rows: readonly TableRow[]): FormulaDefs {
  const linear = /^(\w+)\s*\+\s*\(lvl\s*-\s*1\)\s*\*\s*(\w+)$/
  const diminishing = /^\(\(110 \* lvl\) \* \((\w+) - (\w+)\)\) \/ \(100 \* \(lvl \+ 6\)\) \+ (\w+)$/
  const out: Record<string, FormulaDef> = {}
  for (const row of rows) {
    const code = toText(row.code)
    // `skillcalc` spells the column `*Description`, `misscalc` `*description`.
    const text = toText(row['*Description']) ?? toText(row['*description'])
    if (!code || !text) continue
    if (!/^(ln|dm|sl|sd|cl|cd|shl|shd|chl|chd|dl|dd)\d+$/.test(code)) continue
    const straight = linear.exec(text)
    if (straight) {
      out[code] = { code, kind: 'linear', a: straight[1], b: straight[2] }
      continue
    }
    const curved = diminishing.exec(text)
    if (curved) {
      // `((110*lvl)*(b - a))/(100*(lvl+6)) + a`, written in the tables as
      // `(par2 - par1) ... + par1`: the trailing term is the base `a` and the
      // *minuend* of the subtraction is `b`, so the two captures cross over.
      out[code] = { code, kind: 'diminishing', a: curved[3], b: curved[1] }
    }
  }
  return out
}

/** Parse the three skill tables into one indexed {@link SkillTables}. */
export function parseSkillTables(tables: {
  skills: readonly TableRow[]
  skilldesc?: readonly TableRow[]
  missiles?: readonly TableRow[]
  skillcalc?: readonly TableRow[]
  misscalc?: readonly TableRow[]
}): SkillTables {
  const descriptions = new Map<string, SkillDescription>()
  for (const row of tables.skilldesc ?? []) {
    const description = parseSkillDescription(row)
    if (description) descriptions.set(description.key, description)
  }
  const skills: SkillDef[] = []
  for (const row of tables.skills) {
    const key = toText(row.skilldesc)
    const skill = parseSkill(row, key ? descriptions.get(key) ?? null : null)
    if (skill) skills.push(skill)
  }
  const missiles: MissileDef[] = []
  for (const row of tables.missiles ?? []) {
    const missile = parseMissile(row)
    if (missile) missiles.push(missile)
  }
  const formulas: FormulaDefs = {
    ...SKILL_FORMULAS,
    ...deriveFormulaAliases([...(tables.skillcalc ?? []), ...(tables.misscalc ?? [])]),
  }
  return {
    skills,
    byName: new Map(skills.map((skill) => [skill.name, skill])),
    descriptions,
    missiles,
    missileByName: new Map(missiles.map((missile) => [missile.name, missile])),
    rows: tables.skills,
    formulas,
  }
}

/** Fetch the skill tables from the exported JSON (the browser path). */
export async function loadSkillTables(base: string): Promise<SkillTables> {
  const read = async (name: string): Promise<TableRow[]> => {
    try {
      const response = await fetch(`${base}original/${name}.json`, { cache: 'no-store' })
      if (!response.ok) return []
      return (await response.json()) as TableRow[]
    } catch {
      return []
    }
  }
  const [skills, skilldesc, missiles, skillcalc, misscalc] = await Promise.all([
    read('table_skills'),
    read('table_skilldesc'),
    read('table_missiles'),
    read('table_skillcalc'),
    read('table_misscalc'),
  ])
  return parseSkillTables({ skills, skilldesc, missiles, skillcalc, misscalc })
}

// --- the runtime ------------------------------------------------------------

/**
 * What a caster has to tell the skills engine.
 *
 * `skillLevel` is what makes synergies work: `EDmgSymPerCalc` on Fire Bolt is
 * `(skill('Fire Ball'.blvl)+skill('Meteor'.blvl))*par8`, so evaluating it needs
 * the caster's level in *other* skills, not Fire Bolt's own level.
 */
export interface SkillCaster {
  /** The caster's level in a skill, 0 when it does not have it. */
  skillLevel(skill: string): number
  /** The caster's own level (`ulvl`). */
  level: number
  /** The caster's stats, so `stat('...')` inside a calc resolves. */
  stats?: StatSet
  /**
   * Identity of this caster's *skill levels*. Two casters with the same level
   * but different skill levels evaluate synergies differently, so results are
   * only memoised when a caster identifies itself. Without one, every
   * evaluation runs afresh — correct, just slower.
   */
  cacheKey?: string
}

/** A caster that knows nothing but its own level — for previews and tests. */
export function staticCaster(level = 1, levels?: ReadonlyMap<string, number>): SkillCaster {
  return {
    skillLevel: (skill: string): number => levels?.get(skill) ?? 0,
    level,
  }
}

/** The outcome of evaluating every non-empty calc column of one skill row. */
export interface SkillCalcs {
  /** `calc1`..`calc10`, in table order, blanks omitted. */
  readonly columns: Readonly<Record<string, number>>
  /** `cltcalc1..3`. */
  readonly clientColumns: Readonly<Record<string, number>>
  /** `aurastatcalc1..6`, in table order. */
  readonly auraColumns: readonly number[]
  /** `passivecalc1..14`, in table order. */
  readonly passiveColumns: readonly number[]
  /** `auralencalc` / `aurarangecalc`, in frames and subtiles. */
  readonly auraLength: number | null
  readonly auraRange: number | null
  /** `ToHitCalc`. */
  readonly toHit: number | null
  /** `EDmgSymPerCalc` — the elemental damage synergy, in percent. */
  readonly elementalSynergy: number | null
  /** `DmgSymPerCalc` — the physical damage synergy, in percent. */
  readonly physicalSynergy: number | null
  /** `ELenSymPerCalc` — the duration synergy, in percent. */
  readonly lengthSynergy: number | null
}

/** Everything a cast produces, in the game's own units. */
export interface SkillCast {
  skill: string
  level: number
  mana: ManaCost
  /** What the skill fires, in the order the table names them. */
  missiles: readonly string[]
  damage: DamageResult
  /** `ELen` + its per-level bands + synergy, in seconds. */
  durationSeconds: number | null
  aura: (AuraDef & { stats: readonly StatEntry[] }) | null
  passive: (PassiveDef & { stats: readonly StatEntry[] }) | null
  calcs: SkillCalcs
  /** `ToHit` + `ToHitCalc`, in attack-rating points. */
  attackRating: number
}

/** Resolved missiles a skill fires, including a monster's own monster-missile. */
export interface CastMissiles {
  server: MissileDef | null
  serverA: MissileDef | null
  serverB: MissileDef | null
  serverC: MissileDef | null
  client: MissileDef | null
}

const AURA_COLUMN = (index: number): string => `aurastatcalc${index}`
const PASSIVE_COLUMN = (index: number): string => `passivecalc${index}`

/**
 * The calc primitives `skillcalc.json` documents that the game derives from the
 * row itself rather than from a column the calc language can read: the damage
 * totals, the mana cost, the attack rating. `skillcalc` calls the 256ths ones
 * out explicitly (`edns`, `usmc`, `m1eo`), which is what pins the fixed point.
 */
const DAMAGE_PRIMITIVES: readonly string[] = [
  'edmn',
  'edmx',
  'edln',
  'edns',
  'edxs',
  'enma',
  'exma',
  'edma',
  'enms',
  'exms',
  'damn',
  'damx',
  'dmns',
  'dmxs',
  'pnma',
  'pxma',
  'pnms',
  'pxms',
  'toht',
  'mana',
  'usmc',
  'mps',
  'mael',
  'madm',
  'macr',
  'math',
]

/** Which table column each single-letter calc primitive reads. Mirrors `skillcalc.json`. */
const VARIABLE_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['clc1', 'calc1'],
  ['clc2', 'calc2'],
  ['clc3', 'calc3'],
  ['clc4', 'calc4'],
  ['clc5', 'calc5'],
  ['clc6', 'calc6'],
  ['clc7', 'calc7'],
  ['clc8', 'calc8'],
  ['clc9', 'calc9'],
  ['clc0', 'calc10'],
  ['ast1', 'aurastatcalc1'],
  ['ast2', 'aurastatcalc2'],
  ['ast3', 'aurastatcalc3'],
  ['ast4', 'aurastatcalc4'],
  ['ast5', 'aurastatcalc5'],
  ['ast6', 'aurastatcalc6'],
  ['pst1', 'passivecalc1'],
  ['pst2', 'passivecalc2'],
  ['pst3', 'passivecalc3'],
  ['pst4', 'passivecalc4'],
  ['pst5', 'passivecalc5'],
  ['pst6', 'passivecalc6'],
  ['pst7', 'passivecalc7'],
  ['pst8', 'passivecalc8'],
  ['pst9', 'passivecalc9'],
  ['ps10', 'passivecalc10'],
  ['ps11', 'passivecalc11'],
  ['ps12', 'passivecalc12'],
  ['ps13', 'passivecalc13'],
  ['ps14', 'passivecalc14'],
  ['len', 'auralencalc'],
  ['rng', 'aurarangecalc'],
  ['pets', 'petmax'],
  ['skpt', 'skpoints'],
]

/** The missile-side variables `misscalc.json` documents. */
const MISSILE_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['scl1', 'SrvCalc1'],
  ['ccl1', 'CltCalc1'],
  ['rad', 'Radius'],
  ['rang', 'Range'],
]

/**
 * Executes skills from the tables.
 *
 * One instance per game: it owns the parsed tables and the expression cache, so
 * evaluating Fire Bolt's ten calc columns twenty times a frame costs twenty
 * lookups rather than twenty parses.
 */
export class SkillRuntime {
  readonly tables: SkillTables
  private readonly statTable: StatTable | undefined
  private readonly cache = new Map<string, number>()
  /** Expressions currently being evaluated, for the recursion guard. */
  private readonly active = new Set<string>()

  constructor(tables: SkillTables, options: { statTable?: StatTable } = {}) {
    this.tables = tables
    this.statTable = options.statTable
  }

  /** The skill row, or undefined when the name is not in the table. */
  skill(name: string): SkillDef | undefined {
    return this.tables.byName.get(name)
  }

  /** The missile row, or undefined when the table does not define it. */
  missile(name: string): MissileDef | undefined {
    return this.tables.missileByName.get(name)
  }

  /**
   * The mana cost of a skill at a level. The linear column pair is the whole
   * answer for the retail skills — Teleport 24 (`lvlmana` -1, so it falls to
   * `minmana` as it levels), Static Field 9, Blessed Hammer 20, Meteor 34.
   */
  manaCost(skill: SkillDef | string, level: number): ManaCost {
    const def = typeof skill === 'string' ? this.tables.byName.get(skill) : skill
    if (!def) return { whole: 0, in256ths: 0, shift: null }
    const raw = def.mana + def.levelMana * Math.max(0, level - 1)
    const whole = Math.max(def.minMana, Math.round(raw))
    return { whole, in256ths: whole * 256, shift: def.manaShift }
  }

  /**
   * Every non-empty calc column of a skill row, evaluated.
   *
   * This is the entry point the game actually uses: a skill row is *mostly*
   * calc expressions, and the code paths that consume them (auras, passives,
   * summons, damage, tooltips) are the ones that know which column matters.
   */
  calcs(skill: SkillDef | string, level: number, caster?: SkillCaster): SkillCalcs {
    const def = typeof skill === 'string' ? this.tables.byName.get(skill) : skill
    if (!def) {
      return {
        columns: {},
        clientColumns: {},
        auraColumns: [],
        passiveColumns: [],
        auraLength: null,
        auraRange: null,
        toHit: null,
        elementalSynergy: null,
        physicalSynergy: null,
        lengthSynergy: null,
      }
    }
    const context = this.contextFor(def, level, caster)
    const columns: Record<string, number> = {}
    for (let index = 1; index <= 10; index += 1) {
      const source = def.calcs[`calc${index}`]
      if (source) columns[`calc${index}`] = evaluateCalc(source, context)
    }
    const clientColumns: Record<string, number> = {}
    for (let index = 1; index <= 3; index += 1) {
      const source = def.clientCalcs[`cltcalc${index}`]
      if (source) clientColumns[`cltcalc${index}`] = evaluateCalc(source, context)
    }
    const auraColumns: number[] = []
    for (let index = 1; index <= 6; index += 1) {
      auraColumns.push(evaluateCalc(def.row[AURA_COLUMN(index)], context))
    }
    const passiveColumns: number[] = []
    for (let index = 1; index <= 14; index += 1) {
      passiveColumns.push(evaluateCalc(def.row[PASSIVE_COLUMN(index)], context))
    }
    return {
      columns,
      clientColumns,
      auraColumns,
      passiveColumns,
      auraLength: this.optionalCalc(def.row['auralencalc'], context),
      auraRange: this.optionalCalc(def.row['aurarangecalc'], context),
      toHit: this.optionalCalc(def.toHitCalc, context),
      elementalSynergy: this.optionalCalc(def.elemental.synergy, context),
      physicalSynergy: this.optionalCalc(def.physical.synergy, context),
      lengthSynergy: this.optionalCalc(def.elemental.lengthSynergy, context),
    }
  }

  /**
   * The damage a skill deals at a level, with synergies applied.
   *
   * Physical and elemental damage are tracked separately because everything
   * downstream needs the element: resistances, immunities and the damage
   * display all key off `EType`, and a skill can carry both (Fire Arrow is a
   * physical arrow plus fire).
   */
  damage(
    skill: SkillDef | string,
    level: number,
    caster?: SkillCaster,
    known?: SkillCalcs,
  ): DamageResult {
    const def = typeof skill === 'string' ? this.tables.byName.get(skill) : skill
    if (!def) {
      return { physical: null, elemental: null, synergy: { physical: 0, elemental: 0 } }
    }
    const exact = known ?? this.calcs(def, level, caster)
    const synergy = {
      elemental: exact.elementalSynergy ?? 0,
      physical: exact.physicalSynergy ?? 0,
    }
    const elementalMultiplier = 1 + synergy.elemental / 100
    const physicalMultiplier = 1 + synergy.physical / 100
    const shift = def.hitShift

    const elementalBands = bandDamage(def.elemental.bands, level)
    const hasElemental =
      def.elemental.type !== null &&
      (def.elemental.bands.min !== 0 ||
        def.elemental.bands.max !== 0 ||
        def.elemental.bands.minPerLevel.some((value) => value !== 0))
    const elemental = hasElemental
      ? {
          type: def.elemental.type as ElementType,
          min: hitShiftScale(elementalBands.min, shift) * elementalMultiplier,
          max: hitShiftScale(elementalBands.max, shift) * elementalMultiplier,
          durationSeconds: framesToSeconds(
            bandDamage(
              {
                min: def.elemental.length,
                max: def.elemental.length,
                minPerLevel: def.elemental.lengthPerLevel,
                maxPerLevel: def.elemental.lengthPerLevel,
              },
              level,
            ).min * (1 + (exact.lengthSynergy ?? 0) / 100),
          ),
        }
      : null

    const physicalBands = bandDamage(def.physical.bands, level)
    // An "attack" skill (Zeal, Bash, Fire Arrow, Multiple Shot) has no flat
    // physical numbers at all: its damage *is* the weapon's, carried at
    // `SrcDam / 128`. Reporting zeros with the fraction lets the caller scale
    // the weapon's damage without this module having to know about items.
    const physical =
      def.physical.bands.min !== 0 ||
      def.physical.bands.max !== 0 ||
      def.physical.bands.minPerLevel.some((value) => value !== 0) ||
      def.physical.percentOfSource !== 0
        ? {
            min: hitShiftScale(physicalBands.min, shift) * physicalMultiplier,
            max: hitShiftScale(physicalBands.max, shift) * physicalMultiplier,
            percentOfSource: def.physical.percentOfSource / 128,
          }
        : null

    return { physical, elemental, synergy }
  }

  /** The missiles a cast actually spawns, resolved against `missiles.txt`. */
  missilesFor(skill: SkillDef | string): CastMissiles {
    const def = typeof skill === 'string' ? this.tables.byName.get(skill) : skill
    const lookup = (name: string | null): MissileDef | null =>
      name ? this.tables.missileByName.get(name) ?? null : null
    if (!def) {
      return { server: null, serverA: null, serverB: null, serverC: null, client: null }
    }
    return {
      server: lookup(def.missiles.server),
      serverA: lookup(def.missiles.serverA),
      serverB: lookup(def.missiles.serverB),
      serverC: lookup(def.missiles.serverC),
      client: lookup(def.missiles.client),
    }
  }

  /**
   * The stat set an aura grants at a level: `aurastatN` named by
   * `aurastatcalcN`, evaluated. Might's `damagepercent` × `ln34` = 40 + 10 per
   * level is the canonical example.
   */
  auraStats(skill: SkillDef | string, level: number, caster?: SkillCaster): StatSet {
    const def = typeof skill === 'string' ? this.tables.byName.get(skill) : skill
    const set = new StatSet(this.statTable ? { table: this.statTable } : {})
    if (!def) return set
    const context = this.contextFor(def, level, caster)
    for (let index = 1; index <= 6; index += 1) {
      const stat = toText(def.row[`aurastat${index}`])
      if (!stat) continue
      set.apply(stat, evaluateCalc(def.row[AURA_COLUMN(index)], context))
    }
    return set
  }

  /** The stat set a passive grants at a level: `passivestatN` × `passivecalcN`. */
  passiveStats(skill: SkillDef | string, level: number, caster?: SkillCaster): StatSet {
    const def = typeof skill === 'string' ? this.tables.byName.get(skill) : skill
    const set = new StatSet(this.statTable ? { table: this.statTable } : {})
    if (!def) return set
    const context = this.contextFor(def, level, caster)
    for (let index = 1; index <= 14; index += 1) {
      const stat = toText(def.row[`passivestat${index}`])
      if (!stat) continue
      set.apply(stat, evaluateCalc(def.row[PASSIVE_COLUMN(index)], context))
    }
    return set
  }

  /** The aura a skill provides, its duration and radius included. */
  aura(
    skill: SkillDef | string,
    level: number,
    caster?: SkillCaster,
    known?: SkillCalcs,
  ): AuraDef | null {
    const def = typeof skill === 'string' ? this.tables.byName.get(skill) : skill
    if (!def || !def.aura) return null
    const exact = known ?? this.calcs(def, level, caster)
    const duration =
      exact.auraLength === null ? null : framesToSeconds(Math.max(0, exact.auraLength))
    return {
      state: def.aura.state,
      targetState: def.aura.targetState,
      filter: toNumber(def.row.aurafilter),
      // A `auralencalc` of 0 means "no duration": the aura lasts while it is on.
      durationSeconds: duration !== null && duration > 0 ? duration : null,
      radius: exact.auraRange ?? 0,
    }
  }

  /** The passive a skill provides. */
  passive(skill: SkillDef | string): PassiveDef | null {
    const def = typeof skill === 'string' ? this.tables.byName.get(skill) : skill
    if (!def || !def.passive) return null
    return {
      state: def.passive.state,
      itemType: toText(def.row.passiveitype),
      requiredWeaponCount: toNumber(def.row.passivereqweaponcount),
    }
  }

  /**
   * Everything about one cast: mana, missiles, damage, duration, aura and
   * passive. This is what the game (and a UI tooltip) calls.
   */
  cast(skill: SkillDef | string, level: number, caster?: SkillCaster): SkillCast | null {
    const def = typeof skill === 'string' ? this.tables.byName.get(skill) : skill
    if (!def) return null
    const exact = this.calcs(def, level, caster)
    const auraDef = this.aura(def, level, caster, exact)
    const passiveDef = this.passive(def)
    const missiles = this.missilesFor(def)
    const damage = this.damage(def, level, caster, exact)
    const lengthBands = {
      min: def.elemental.length,
      max: def.elemental.length,
      minPerLevel: def.elemental.lengthPerLevel,
      maxPerLevel: def.elemental.lengthPerLevel,
    }
    const frames =
      lengthBands.min === 0
        ? 0
        : bandDamage(lengthBands, level).min * (1 + (exact.lengthSynergy ?? 0) / 100)
    return {
      skill: def.name,
      level,
      mana: this.manaCost(def, level),
      missiles: [missiles.server?.name ?? def.missiles.server].filter(
        (name): name is string => name !== null,
      ),
      damage,
      durationSeconds: frames > 0 ? framesToSeconds(frames) : null,
      aura: auraDef
        ? { ...auraDef, stats: statEntries(def, exact.auraColumns) }
        : null,
      passive: passiveDef
        ? { ...passiveDef, stats: statEntries(def, exact.passiveColumns) }
        : null,
      calcs: exact,
      attackRating: def.toHit + (exact.toHit ?? 0),
    }
  }

  /** A human-readable readout of a cast; used by the tests and the HUD. */
  describeCast(cast: SkillCast): string {
    const parts = [`${cast.skill} lvl ${cast.level}`, `${cast.mana.whole} mana`]
    if (cast.damage.physical) {
      parts.push(
        `phys ${cast.damage.physical.min.toFixed(1)}-${cast.damage.physical.max.toFixed(1)}`,
      )
    }
    if (cast.damage.elemental) {
      parts.push(
        `${cast.damage.elemental.type} ${cast.damage.elemental.min.toFixed(
          1,
        )}-${cast.damage.elemental.max.toFixed(1)}`,
      )
    }
    if (cast.damage.synergy.elemental !== 0) {
      parts.push(`+${cast.damage.synergy.elemental}% elemental synergy`)
    }
    if (cast.damage.synergy.physical !== 0) {
      parts.push(`+${cast.damage.synergy.physical}% physical synergy`)
    }
    if (cast.durationSeconds !== null) parts.push(`${cast.durationSeconds.toFixed(2)}s`)
    if (cast.missiles.length > 0) parts.push(cast.missiles.join('/'))
    if (cast.aura) {
      parts.push(`aura ${cast.aura.state ?? '-'} r${cast.aura.radius}`)
    }
    if (cast.passive) parts.push(`passive ${cast.passive.state ?? '-'}`)
    return parts.join(' · ')
  }

  /** Describes an aura's stats through `itemstatcost`, when that table is loaded. */
  describeStats(set: StatSet): readonly string[] {
    if (!this.statTable) return set.names().map((name) => `${name} ${set.get(name)}`)
    return describeStatSet(this.statTable, set)
  }

  /**
   * Every non-empty calc column of a `missiles` row, evaluated.
   *
   * The missile language is a little different from the skill one — `misscalc`
   * documents `par1..par5`, `cpa1..5`, `hpa1..3`, `dpa1..2`, `scl1`, `ccl1`,
   * `rad`, `rang` and the missile's own `lvl` — so it gets its own context.
   */
  missileCalcs(missile: MissileDef | string, level = 1): Readonly<Record<string, number>> {
    const def = typeof missile === 'string' ? this.tables.missileByName.get(missile) : missile
    if (!def) return {}
    const params: number[] = []
    for (let index = 1; index <= 5; index += 1) params.push(toNumber(def.row[`Param${index}`]) ?? 0)
    const vars: Record<string, number> = { lvl: level }
    for (const [variable, column] of MISSILE_COLUMNS) {
      vars[variable] = toNumber(def.row[column]) ?? 0
    }
    for (let index = 1; index <= 5; index += 1) {
      vars[`cpa${index}`] = toNumber(def.row[`CltParam${index}`]) ?? 0
    }
    for (let index = 1; index <= 3; index += 1) {
      vars[`hpa${index}`] = toNumber(def.row[`sHitPar${index}`]) ?? 0
      vars[`chp${index}`] = toNumber(def.row[`cHitPar${index}`]) ?? 0
    }
    for (let index = 1; index <= 2; index += 1) {
      vars[`dpa${index}`] = toNumber(def.row[`dParam${index}`]) ?? 0
    }
    const elemental = bandDamage(def.elemental.bands, level)
    const physical = bandDamage(def.physical, level)
    vars.edmn = hitShiftScale(elemental.min, def.hitShift, 0)
    vars.edmx = hitShiftScale(elemental.max, def.hitShift, 0)
    vars.edln = def.elemental.length
    vars.damn = hitShiftScale(physical.min, def.hitShift, 0)
    vars.damx = hitShiftScale(physical.max, def.hitShift, 0)
    vars.rang = def.range
    vars.rad = def.radius
    const context: CalcContext = {
      lvl: level,
      blvl: level,
      params,
      vars,
      formulas: this.tables.formulas,
    }
    const out: Record<string, number> = {}
    for (const column of ['SrvCalc1', 'CltCalc1', 'DmgCalc1', 'SHitCalc1', 'CHitCalc1']) {
      const source = def.row[column]
      if (source) out[column] = evaluateCalc(source, context)
    }
    return out
  }

  /** A reusable context for one row and level. */
  contextFor(def: SkillDef, level: number, caster?: SkillCaster): CalcContext {
    const params = def.params
    const formulas = this.tables.formulas
    const vars: Record<string, number> = {}
    // Getters, because `clc8` may read `calc1` of the same row: filling the map
    // eagerly would evaluate every column even when only one is needed.
    for (const [variable, column] of VARIABLE_COLUMNS) {
      Object.defineProperty(vars, variable, {
        enumerable: true,
        get: (): number =>
          this.column(def, column, level, caster),
      })
    }
    for (const primitive of DAMAGE_PRIMITIVES) {
      Object.defineProperty(vars, primitive, {
        enumerable: true,
        get: (): number => this.damagePrimitive(primitive, def, level, caster),
      })
    }
    return {
      lvl: level,
      blvl: level,
      ulvl: caster?.level ?? level,
      params,
      vars,
      formulas,
      statRef: caster?.stats
        ? (reference): number => caster.stats?.getField(reference.name, reference.field) ?? 0
        : undefined,
      skillRef: (reference): number => this.skillField(reference.name, reference.field, caster),
      sksrcRef: (reference): number => this.skillField(reference.name, reference.field, caster),
    }
  }

  /**
   * `skill('Name'.field)`: `blvl`/`lvl` are the caster's level in that skill
   * (this is the whole mechanism behind synergies), anything else is one of the
   * other skill's calc columns.
   */
  private skillField(name: string, field: string, caster?: SkillCaster): number {
    const lower = field.toLowerCase()
    if (lower === 'lvl' || lower === 'blvl') return caster?.skillLevel(name) ?? 0
    const other = this.tables.byName.get(name)
    if (!other) return 0
    const level = caster?.skillLevel(name) ?? 1
    if (lower === 'par1' || /^pa?\d+$/.test(lower)) {
      const index = /^par(\d)$/.test(lower) ? Number(lower.slice(3)) : Number(lower.slice(2))
      return other.params[index - 1] ?? 0
    }
    return this.column(other, field, level, caster)
  }

  /** Evaluate one named column of a skill row, memoised when the caster is identified. */
  private column(def: SkillDef, column: string, level: number, caster?: SkillCaster): number {
    const key =
      caster?.cacheKey === undefined ? null : `${caster.cacheKey}|${def.name}|${column}|${level}`
    if (key !== null) {
      const cached = this.cache.get(key)
      if (cached !== undefined) return cached
    }
    const source = def.row[column] ?? def.row[lowercaseColumn(def.row, column)]
    const value = source ? this.guardedEval(def, source, level, caster) : 0
    if (key !== null) this.cache.set(key, value)
    return value
  }

  private optionalCalc(source: string | null, context: CalcContext): number | null {
    return source === null || source.trim() === '' ? null : evaluateCalc(source, context)
  }

  /**
   * Evaluate an expression, refusing to re-enter the same one.
   *
   * The calc primitives form a graph — `calc2` may read `clc1`, a damage
   * primitive reads `ToHitCalc`, and `ToHitCalc` may read `clc2` — so a
   * self-referential table (or one of ours) has to terminate somewhere. The
   * tables contain no real cycles; this makes that a diagnostic instead of a
   * stack overflow.
   */
  private guardedEval(
    def: SkillDef,
    source: string,
    level: number,
    caster?: SkillCaster,
  ): number {
    const key = `${def.name}|${source}|${level}`
    if (this.active.has(key)) return 0
    this.active.add(key)
    try {
      return evaluateCalc(source, this.contextFor(def, level, caster))
    } finally {
      this.active.delete(key)
    }
  }

  /**
   * The damage/mana/attack-rating primitives `skillcalc.json` documents but the
   * calc language cannot read off a column: `edmn` (elemental min), `damn`
   * (physical min), `mana`, `toht`, and the 256ths variants the tooltips use.
   */
  private damagePrimitive(
    name: string,
    def: SkillDef,
    level: number,
    caster?: SkillCaster,
  ): number {
    const elemental = bandDamage(def.elemental.bands, level)
    const physical = bandDamage(def.physical.bands, level)
    const wholeMin = hitShiftScale(elemental.min, def.hitShift)
    const wholeMax = hitShiftScale(elemental.max, def.hitShift)
    const physMin = hitShiftScale(physical.min, def.hitShift)
    const physMax = hitShiftScale(physical.max, def.hitShift)
    const mana = this.manaCost(def, level).whole
    const toHit =
      def.toHit + (def.toHitCalc === null ? 0 : this.guardedEval(def, def.toHitCalc, level, caster))
    const duration = bandDamage(
      {
        min: def.elemental.length,
        max: def.elemental.length,
        minPerLevel: def.elemental.lengthPerLevel,
        maxPerLevel: def.elemental.lengthPerLevel,
      },
      level,
    ).min
    switch (name) {
      case 'edmn':
        return wholeMin
      case 'edmx':
        return wholeMax
      case 'edln':
        return duration
      case 'edns':
        return wholeMin * 256
      case 'edxs':
        return wholeMax * 256
      case 'damn':
      case 'pnma':
        return physMin
      case 'damx':
      case 'pxma':
        return physMax
      case 'dmns':
      case 'pnms':
        return physMin * 256
      case 'dmxs':
      case 'pxms':
        return physMax * 256
      case 'mana':
        return mana
      case 'usmc':
        return mana * 256
      case 'mps':
        // Mana per second for a periodic skill: `perdelay` frames per tick.
        return def.row.perdelay && def.row.periodic === '1'
          ? mana * LOGIC_FRAMES_PER_SECOND / (toNumber(def.row.perdelay) ?? 1)
          : 0
      case 'toht':
        return toHit
      case 'm1en':
      case 'm2en':
      case 'm3en':
        return wholeMin
      case 'm1ex':
      case 'm2ex':
      case 'm3ex':
        return wholeMax
      case 'm1el':
      case 'm2el':
      case 'm3el':
        return duration
      case 'm1eo':
      case 'm2eo':
      case 'me3o':
      case 'm1nm':
      case 'm2nm':
      case 'm3nm':
        return wholeMin * 256
      case 'm1ey':
      case 'm2ey':
      case 'me3y':
      case 'm1xm':
      case 'm2xm':
      case 'm3xm':
        return wholeMax * 256
      // Masteries are their own skills (`mael` = "Elemental Damage Mastery"),
      // and `enma`/`exma` are the damage with them applied. Without a mastery
      // provider the honest answer is "mastery 0, damage unchanged".
      case 'enma':
      case 'enms':
        return name === 'enms' ? wholeMin * 256 : wholeMin
      case 'exma':
      case 'exms':
        return name === 'exms' ? wholeMax * 256 : wholeMax
      case 'edma':
        return duration
      case 'mael':
      case 'madm':
      case 'macr':
      case 'math':
        return 0
      default:
        return 0
    }
  }
}

/** Column lookup that tolerates the tables' inconsistent capitalisation. */
function lowercaseColumn(row: TableRow, column: string): string {
  const lower = column.toLowerCase()
  for (const key of Object.keys(row)) if (key.toLowerCase() === lower) return key
  return column
}

function statEntries(def: SkillDef, values: readonly number[]): StatEntry[] {
  const entries: StatEntry[] = []
  for (let index = 0; index < values.length; index += 1) {
    const stat = toText(def.row[`aurastat${index + 1}`]) ?? toText(def.row[`passivestat${index + 1}`])
    if (!stat) continue
    entries.push({ stat, value: values[index] })
  }
  return entries
}

// --- missiles in flight -----------------------------------------------------

/**
 * A missile's damage when it lands.
 *
 * Two sources add up: the missile's own `MinDamage`/`EMin` bands, and
 * `SrcDamage` — the fraction of the *source's* damage the missile carries, in
 * 1/128 units. An arrow's `SrcDamage` 128 carries all of the bow damage; a
 * Multiple Shot arrow's 96 carries 75% of it.
 */
export interface MissileDamage extends DamageResult {
  /** `SrcDamage / 128`, the fraction of the attacker's damage carried. */
  sourceFraction: number
}

/** Speed of a missile at a missile level: `Vel` + `VelLev` per level. */
export function missileVelocity(missile: MissileDef, level = 1): number {
  const growth = missile.velocityPerLevel ?? 0
  return Math.min(missile.maxVelocity, missile.velocity + growth * Math.max(0, level - 1))
}

/** Flight time in seconds at a missile level. */
export function missileLifetime(missile: MissileDef, level = 1): number {
  const velocity = missileVelocity(missile, level)
  return velocity > 0 ? missile.range / velocity : 0
}

/** A missile's behaviour in flight, resolved but not simulated. */
export interface MissileFlight {
  speedSubtilesPerSecond: number
  speedTilesPerSecond: number
  rangeSubtiles: number
  lifetimeSeconds: number
  radius: number
  pierce: boolean
  explodes: boolean
  alwaysExplodes: boolean
  knockBack: boolean
  canSlow: boolean
  damage: MissileDamage
  /** What it leaves behind or becomes: `SubMissile*`, `HitSubMissile*`, explosion. */
  spawns: readonly string[]
}

/** Resolve a missile at a level, with the damage its source contributes. */
export function resolveMissile(
  missile: MissileDef,
  level = 1,
  source?: { min: number; max: number } | null,
): MissileFlight {
  const speed = missileVelocity(missile, level)
  const shift = missile.hitShift
  const physicalBands = bandDamage(missile.physical, level)
  const elementalBands = bandDamage(missile.elemental.bands, level)
  const sourceFraction = missile.percentOfSource / 128
  const carriedMin = (source?.min ?? 0) * sourceFraction
  const carriedMax = (source?.max ?? 0) * sourceFraction
  const ownMin = hitShiftScale(physicalBands.min, shift, 0)
  const ownMax = hitShiftScale(physicalBands.max, shift, 0)
  const hasPhysical =
    ownMin !== 0 || ownMax !== 0 || missile.percentOfSource !== 0
  const hasElemental =
    missile.elemental.type !== null &&
    (missile.elemental.bands.min !== 0 || missile.elemental.bands.max !== 0)

  return {
    speedSubtilesPerSecond: speed,
    speedTilesPerSecond: speed / SUBTILES_PER_TILE,
    rangeSubtiles: missile.range,
    lifetimeSeconds: speed > 0 ? missile.range / speed : 0,
    radius: missile.radius,
    pierce: missile.pierce,
    explodes: missile.explodes,
    alwaysExplodes: missile.alwaysExplodes,
    knockBack: missile.knockBack,
    canSlow: missile.canSlow,
    damage: {
      physical: hasPhysical
        ? { min: ownMin + carriedMin, max: ownMax + carriedMax, percentOfSource: sourceFraction }
        : null,
      elemental: hasElemental
        ? {
            type: missile.elemental.type as ElementType,
            min: hitShiftScale(elementalBands.min, shift, 0),
            max: hitShiftScale(elementalBands.max, shift, 0),
            durationSeconds: framesToSeconds(missile.elemental.length),
          }
        : null,
      synergy: { physical: 0, elemental: 0 },
      sourceFraction,
    },
    spawns: [
      ...missile.subMissiles,
      ...missile.hitSubMissiles,
      ...(missile.explosionMissile ? [missile.explosionMissile] : []),
    ],
  }
}

// --- auras and passives on the field ----------------------------------------

/** An aura that is currently switched on, with where its source stands. */
export interface ActiveAura {
  sourceId: string
  skill: string
  level: number
  /** Aura state name (`might`, `holyfire`, …); null when the row names none. */
  state: string | null
  targetState: string | null
  /** Radius in subtiles, from `aurarangecalc`. */
  radius: number
  /** Remaining seconds, or null for an aura that lasts while it is on. */
  remaining: number | null
  /** Position of the source, in subtiles — auras are a *field*, not a buff. */
  x: number
  y: number
  stats: StatSet
  /** The `aurastatN`/value pairs, for display. */
  entries: readonly StatEntry[]
}

export interface AuraFieldOptions {
  statTable?: StatTable
  /** Distance metric; D2 measures auras in subtiles of euclidean distance. */
  distance?: (ax: number, ay: number, bx: number, by: number) => number
}

/**
 * The live auras of a party.
 *
 * D2 auras are positional: they buff whoever stands inside `aurarangecalc`,
 * which is why a paladin's aura follows him rather than sticking to his friends.
 * This class keeps that model — register a source's aura, tick the clock, and
 * ask for the merged stats at a point.
 *
 * The same aura state from two sources does not stack: the strongest level wins,
 * and everything else merges multiplicatively through {@link StatSet}.
 */
export class AuraField {
  private readonly auras = new Map<string, ActiveAura>()
  private readonly options: AuraFieldOptions
  private readonly distance: (ax: number, ay: number, bx: number, by: number) => number

  constructor(options: AuraFieldOptions = {}) {
    this.options = options
    this.distance =
      options.distance ?? ((ax, ay, bx, by): number => Math.hypot(ax - bx, ay - by))
  }

  /** Switch an aura on, or refresh it. Keyed by source and skill. */
  set(
    aura: Omit<ActiveAura, 'stats' | 'entries'> & { stats?: StatSet; entries?: readonly StatEntry[] },
  ): ActiveAura {
    const resolved: ActiveAura = {
      ...aura,
      stats: aura.stats ?? new StatSet(this.options.statTable ? { table: this.options.statTable } : {}),
      entries: aura.entries ?? [],
    }
    this.auras.set(`${aura.sourceId}:${aura.skill}`, resolved)
    return resolved
  }

  /** Switch one aura off, or every aura of a source when no skill is named. */
  remove(sourceId: string, skill?: string): void {
    if (skill) {
      this.auras.delete(`${sourceId}:${skill}`)
      return
    }
    for (const key of [...this.auras.keys()]) {
      if (key.startsWith(`${sourceId}:`)) this.auras.delete(key)
    }
  }

  /** Move a source: auras are positional, so a moving paladin moves his aura. */
  moveSource(sourceId: string, x: number, y: number): void {
    for (const aura of this.auras.values()) {
      if (aura.sourceId === sourceId) {
        aura.x = x
        aura.y = y
      }
    }
  }

  /** Advance the clock; auras whose duration runs out switch themselves off. */
  tick(dt: number): void {
    for (const [key, aura] of [...this.auras]) {
      if (aura.remaining === null) continue
      const remaining = aura.remaining - dt
      if (remaining <= 0) this.auras.delete(key)
      else aura.remaining = remaining
    }
  }

  /** The auras currently covering a point, strongest state first. */
  aurasAt(x: number, y: number): readonly ActiveAura[] {
    const covering = [...this.auras.values()].filter(
      (aura) => this.distance(aura.x, aura.y, x, y) <= aura.radius,
    )
    const strongest = new Map<string, ActiveAura>()
    for (const aura of covering) {
      // No state name means the row is an "expand" aura (a curse applied by the
      // aura, like Holy Freeze's chill); those are keyed by skill instead.
      const key = aura.state ?? aura.skill
      const existing = strongest.get(key)
      if (!existing || aura.level > existing.level) strongest.set(key, aura)
    }
    return [...strongest.values()]
  }

  /** Every aura's stats at a point, merged into one set (the party case). */
  statsAt(x: number, y: number, statTable?: StatTable): StatSet {
    const table = statTable ?? this.options.statTable
    const set = new StatSet(table ? { table } : {})
    for (const aura of this.aurasAt(x, y)) mergeStatLayers(set, aura.stats)
    return set
  }

  /** The aura state names covering a point — what the renderer tints. */
  statesAt(x: number, y: number): readonly string[] {
    const states: string[] = []
    for (const aura of this.aurasAt(x, y)) if (aura.state) states.push(aura.state)
    return states
  }

  /** Every aura currently switched on. */
  entries(): readonly ActiveAura[] {
    return [...this.auras.values()]
  }

  /** How many sources are inside a point's own auras — for a HUD readout. */
  size(): number {
    return this.auras.size
  }
}

/**
 * Merge one stat set into another by copying each layer.
 *
 * Applying the *resolved* value of `damagepercent` to a second set would run it
 * through the stat's `op` a second time — a 230% aura would become 460%. Copying
 * the layers keeps "add", "percent of base" and "percent of total" apart.
 */
function mergeStatLayers(target: StatSet, source: StatSet): void {
  for (const name of source.names()) {
    const layers = source.layers(name)
    if (layers.base !== 0) target.addBase(name, layers.base)
    if (layers.add !== 0) target.addFlat(name, layers.add)
    if (layers.basePercent !== 0) target.addPercentOfBase(name, layers.basePercent)
    if (layers.totalPercent !== 0) target.addPercentOfTotal(name, layers.totalPercent)
  }
}

/**
 * Run an aura skill and put it on the field: the paladin case. Returns null when
 * the skill is not an aura.
 */
export function activateAura(
  runtime: SkillRuntime,
  field: AuraField,
  request: {
    sourceId: string
    skill: string
    level: number
    x: number
    y: number
    caster?: SkillCaster
  },
): ActiveAura | null {
  const auraDef = runtime.aura(request.skill, request.level, request.caster)
  if (!auraDef) return null
  const entries = runtime.cast(request.skill, request.level, request.caster)?.aura?.stats ?? []
  return field.set({
    sourceId: request.sourceId,
    skill: request.skill,
    level: request.level,
    state: auraDef.state,
    targetState: auraDef.targetState,
    radius: auraDef.radius,
    remaining: auraDef.durationSeconds,
    x: request.x,
    y: request.y,
    stats: runtime.auraStats(request.skill, request.level, request.caster),
    entries,
  })
}
