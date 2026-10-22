/**
 * Monsters: what the retail tables actually say, and how a monster's numbers
 * are derived from them.
 *
 * Six tables feed this file:
 *
 * | table | what it contributes |
 * | ----- | ------------------- |
 * | `monstats` | the monster itself: name, AI, velocity, base hp/damage/armor/xp, resistances, its own skills and missiles |
 * | `monstats2` | the animation/geometry half: size, melee reach, answer to "does this monster even have an attack2 animation?" |
 * | `monlvl` | the per-level percentage multipliers applied to those base numbers |
 * | `monai` | the *documentation of each AI's parameters* — the tables name them, e.g. Skeleton `aip2` = "AI Delay (Frames)" |
 * | `monseq` | scripted skill sequences (`seq_skeletonraise`) with their frames and action frames |
 * | `levels` | per-area `MonLvl` (area level) and `MonLvlEx` (monster level) |
 *
 * ## The scaling rule, derived from the table contents
 *
 * A monster's level in an area is
 *
 *     mlvl = clamp(max(monstats.Level(D), levels.MonLvlEx(D)), 0, 110)
 *
 * and the `monlvl` columns are *percentages* of the `monstats` base columns:
 *
 *     hp     = monstats.maxHP(D)  * monlvl.HP(mlvl, D)  / 100
 *     damage = monstats.A1MaxD(D) * monlvl.DM(mlvl, D)  / 100
 *     armor  = monstats.AC(D)     * monlvl.AC(mlvl, D)  / 100
 *     toHit  = monstats.A1TH(D)   * monlvl.TH(mlvl, D)  / 100
 *     xp     = monstats.Exp(D)    * monlvl.XP(mlvl, D)  / 100
 *
 * Three pieces of evidence for "percentages, not absolute values":
 *
 * 1. Row 0 of `monlvl` is 1 in every column (1%), row 110 is 10000 (100x), and
 *    the nightmare/hell rows have the same shape — a curve, not a stat block.
 * 2. It is the only reading that reproduces the retail game. A Fallen in the
 *    Blood Moor (`monlvl` row 1) gets 61 * 7% = 4.3 hp, 101 * 2% = 2 max
 *    damage and 61 * 30% = 18 xp: at level 1 the player kills a Fallen in two
 *    hits and needs about 27 of them to reach level 2, which is what the game
 *    does. Read as absolute values it would be a 61 hp Fallen hitting for 101,
 *    i.e. one that one-shots a starting character.
 * 3. `monlvl` rows are indexed by level 0..110, which is exactly the range the
 *    game clamps monster levels to.
 *
 * ### The `L-` columns
 *
 * `monlvl` carries a second parallel set of columns prefixed `L-`. Measured
 * against the plain set across all 111 rows, excluding the saturated end rows 0
 * and 110 (where both sets are identical):
 *
 * - Normal: identical in every row (`L-HP` == `HP`, `L-AC` == `AC`, …).
 * - Nightmare: `L-AC(N)` is `AC(N)` × 1.1729..1.1803; the life, damage, attack
 *   rating and experience columns are identical.
 * - Hell: `L-AC(H)` is `AC(H)` × 1.1728..1.1780 and `L-HP(H)` is `HP(H)` ×
 *   1.3330..1.3337 — that is 4/3 to within 0.7 of an integer point, the residual
 *   being the rounding of what are plainly two hand-authored curves rather than
 *   one derived from the other (`L-DM`, `L-TH` and `L-XP` are identical in
 *   every difficulty).
 *
 * The sets therefore describe the same shape for two different level sources,
 * and the sources agree in Normal (early Normal areas have `MonLvl` ==
 * `MonLvlEx`) while diverging in Nightmare/Hell (`MonLvl(N)` 26 against
 * `MonLvlEx(N)` 36 for Act 1 Wilderness). A dead column would not agree with
 * the plain one across every Normal row, so this reads as "one set for monsters
 * raised to the area's level, one for monsters on their own level" — but nothing
 * in the data says which is which. Both are exposed as {@link MonLvlColumnSet}
 * and the caller picks; {@link scaleMonster} defaults to `'monsterLevel'` (the
 * plain columns), so the choice only ever costs ±18% armor in Nightmare/Hell and
 * ±33% life in Hell.
 *
 * ### Which level a monster gets
 *
 * `levels.MonLvlEx` is the area's monster level, and `monstats.Level(N)/(H)` sit
 * in the same number space: Fallen is 36/67, which is exactly Act 1
 * Wilderness 1's `MonLvlEx(N)/(H)`. A monster keeps its own level when that is
 * higher — Diablo is 94 in Hell, above the 85 of the Chaos Sanctuary — and is
 * raised to the area otherwise. The 34 rows with `noRatio` set are every summon
 * and pet in the game (golems, valkyrie, druid pets, shadow warrior, the
 * sentries), which is consistent with `noRatio` meaning "do not take the area's
 * level": a pet's level comes from the skill that summoned it.
 *
 * ## What the tables do not contain
 *
 * Behaviour *procedure*. `monai` documents what each AI parameter means but not
 * how the AI uses it, so the numbers in {@link MonsterBrain} are real while the
 * decision procedure is a reimplementation. Animation lengths are absent too —
 * except for the scripted `seq_*` skills, whose lengths come from `monseq`.
 *
 * ## The AI parameter mapping this module uses
 *
 * Every parameter {@link MonsterBrain} reads, named exactly as `monai` documents
 * it. The list is short because most AIs document four things and no more —
 * nothing here is invented, and anything a monster's AI does not document is
 * handled by a named fallback on the brain rather than a guessed number.
 *
 * | `monai` label (any slot) | what the brain does with it |
 * | ------------------------ | --------------------------- |
 * | `AI Delay (Frames)`, else the row's `aidel` | think interval: attack cooldown, hit recovery and the death animation all run for this long |
 * | `Enemy Awareness (Range)`, `Activate Range` | radius at which a target is noticed (fallback 18 subtiles) |
 * | `Approach Enemy (Range)`, `Min Target Range`, `Ranged Target Range` | how close to get before attacking (`monstats2.MeleeRng` adds reach) |
 * | `Attack Enemy (% Chance)`, `Attack (% Chance)`, `Melee Attack` | chance of committing to an attack on a think instead of holding |
 * | `Attack1 (% Chance), else Attack2`, `Attack2 (% Chance)`, `SkillN (% Chance)`, `Use Skill1/Skill2/Skill3 (% Chance)` | the weights {@link monsterAttackOptions} normalises into the attack table |
 * | `Wander behavior (% Chance)`, `Walk Randomly (% Chance)` | chance a wandering monster walks rather than idles; `Non-command Wander behavior` for the Fallen |
 * | `Hurt State (Life % threshold)`, `Hurt Life %`, `Run Away Life %`, `Fight Life %` | the life fraction that makes the AI run (Arach: 25%) |
 * | `Run Away (% Chance)` | kiting with no life condition at all (the rogue archers) |
 * | `Skill Range`, `Ranged Max Range`, `Attack/Skill1 Range`, `Skill1 Range` | how far a ranged attack reaches |
 * | `Velocity`/`Run` and `monstats2.mWL`/`mRN` | whether it can move at all, walk or run (a Catapult: neither) |
 * | `monstats2.MeleeRng` | extra melee reach on top of the standing distance |
 * | `monstats2.mA1`/`mA2`/`mS1..mS4` and `Skill1..Skill8` | which of its attacks exist |
 * | `Sk1..Sk8mode` + `monseq` | the mode a skill plays in and, when scripted, its length and action frames |
 */

/** Raw table cell: the exported JSON stores every value as a string or null. */
export type TableRow = Readonly<Record<string, string | null>>

/** A table cell as a number, or null when the cell is blank. */
export function tableNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** A table cell as a non-empty string, or null. */
export function tableString(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null
  return value
}

const num = tableNumber
const str = tableString

/** The three difficulties, named after the tables' own column suffixes. */
export type Difficulty = 'normal' | 'nightmare' | 'hell'

export const DIFFICULTIES: readonly Difficulty[] = ['normal', 'nightmare', 'hell']

/** Damage kinds, named after the `Res*` columns and the `EType` vocabulary. */
export type DamageType = 'phys' | 'fire' | 'cold' | 'ltng' | 'pois' | 'mag'

/** A min/max roll, as every damage and life column pair is stored. */
export interface DamageRange {
  min: number
  max: number
}

/** Which animations a monster actually has (`monstats2`'s `m*` flags). */
export interface MonsterModes {
  idle: boolean
  walk: boolean
  run: boolean
  getHit: boolean
  attack1: boolean
  attack2: boolean
  block: boolean
  cast: boolean
  skill1: boolean
  skill2: boolean
  skill3: boolean
  skill4: boolean
  death: boolean
  dead: boolean
  knockBack: boolean
  sequence: boolean
}

/** `monstats2`'s geometry half. */
export interface MonsterSize {
  height: number
  sizeX: number
  sizeY: number
  /** Extra reach in D2 distance units (subtiles) on top of the melee baseline. */
  meleeRange: number
  hitClass: number
  baseWeapon: string
}

/** The `monmode` vocabulary, which `monstats2` flags and `SkNmode` both speak. */
export type MonsterMode =
  | 'NU'
  | 'WL'
  | 'RN'
  | 'GH'
  | 'A1'
  | 'A2'
  | 'BL'
  | 'SC'
  | 'S1'
  | 'S2'
  | 'S3'
  | 'S4'
  | 'DT'
  | 'DD'
  | 'KB'
  | 'xx'

/** One of the monster's own skills (`Skill1`..`Skill8` with `SkNmode`/`SkNlvl`). */
export interface MonsterSkill {
  /** `skills.skill` — always a real row (asserted by the tests). */
  skill: string
  /** The `SkNmode` cell verbatim: a `monseq.sequence` name, a mode token, or null. */
  castMode: string | null
  /** The level the monster casts it at (`SkNlvl`). */
  level: number
  /** The mode the monster plays while casting, resolved to a `monmode` token. */
  mode: MonsterMode
  /** Frames in the scripted sequence, when `SkNmode` names one (else null). */
  castFrames: number | null
  /** Frames inside the sequence carrying an event — the sequence's action frames. */
  actionFrames: readonly number[]
  /** `castFrames / 25`, or null when the skill has no scripted sequence. */
  castSeconds: number | null
  /** The missile from `monstats.MissS1..MissS4` for slots 1..4. */
  missile: string | null
}

/** Which missile each of the monster's attacks fires, where the tables give one. */
export interface MonsterMissiles {
  attack1: string | null
  attack2: string | null
  skill1: string | null
  skill2: string | null
  skill3: string | null
  skill4: string | null
  cast: string | null
  sequence: string | null
}

export interface MonsterFlags {
  /** `boss`: act bosses and the other set pieces. */
  boss: boolean
  primeEvil: boolean
  /** `SetBoss`: a boss whose death is wired to a quest. */
  setBoss: boolean
  /** `rangedtype` is set, or the monster owns a missile attack. */
  ranged: boolean
  /** `isMelee` is set. */
  melee: boolean
  demon: boolean
  undead: boolean
  flying: boolean
  killable: boolean
  enabled: boolean
  /** `noRatio`: the monster keeps its own level instead of the area's. */
  noRatio: boolean
  switchAi: boolean
  /** `Rarity` above zero and not flagged `isSpawn`/`isSpawn`-like: the level generator may pick it. */
  spawnable: boolean
  npc: boolean
  inTown: boolean
}

/** Resistances in percent, as the `Res*` columns store them (`50`, `-50`). */
export type MonsterResistances = Record<DamageType, number>

/**
 * A monster type exactly as the tables define it. Every number is the *base*
 * value for the difficulty named; {@link scaleMonster} applies `monlvl` on top.
 */
export interface MonsterDef {
  id: string
  name: string
  baseId: string
  nextInClass: string | null
  monsterType: string | null
  ai: string
  /** `aip1`..`aip8` per difficulty, in table order, null where the cell is blank. */
  aiParams: Record<Difficulty, readonly (number | null)[]>
  /** The meaning `monai` gives each of those parameters, e.g. "Approach Enemy (% Chance)". */
  aiParamLabels: readonly (string | null)[]
  /** `aidel` — the per-monster AI delay in frames; the only timing value `monstats` carries. */
  aiDelayFrames: Record<Difficulty, number | null>
  /** `aidist` — the AI distance column; blank in all 752 rows, kept so the absence is explicit. */
  aiDistance: Record<Difficulty, number | null>
  threat: number | null
  level: Record<Difficulty, number>
  hp: Record<Difficulty, DamageRange>
  armor: Record<Difficulty, number>
  xp: Record<Difficulty, number>
  /** Attack rating of attack1 (`A1TH`). */
  toHit: Record<Difficulty, number>
  damage: {
    attack1: Record<Difficulty, DamageRange | null>
    attack2: Record<Difficulty, DamageRange | null>
    skill1: Record<Difficulty, DamageRange | null>
  }
  /** `Velocity` and `Run`, in D2 distance units (subtiles) per second. */
  velocity: number
  run: number
  rarity: number | null
  groupMin: number | null
  groupMax: number | null
  partyMin: number | null
  partyMax: number | null
  size: MonsterSize
  modes: MonsterModes
  resistances: Record<Difficulty, MonsterResistances>
  /** `Drain` — how much life/mana leech the monster allows, in percent. */
  drain: Record<Difficulty, number>
  /** `DamageRegen` — the life regeneration rate. */
  damageRegen: number | null
  /** `Crit` — percent chance of a critical hit. */
  crit: number | null
  /** `ToBlock` — percent chance to block. */
  toBlock: Record<Difficulty, number>
  coldeffect: Record<Difficulty, number>
  /** The monster's own skills, in `Skill1`..`Skill8` order, blanks dropped. */
  skills: readonly MonsterSkill[]
  missiles: MonsterMissiles
  sound: string | null
  uniqueSound: string | null
  flags: MonsterFlags
  /** `act1`..`act5`: the acts the monster may spawn in. */
  acts: readonly number[]
  treasureClass: string | null
  /**
   * `Code` — the game's short token for the monster, and the name its art is filed
   * under. `monstats` gives the act 5 barbarians `Code` `0A` and their animations
   * live in `global/monsters/0a/`, so this is the key, not `Id`. Lower-cased when
   * used as a path, because the extracted tree is lower-case.
   */
  code: string
}

/** One set of `monlvl` multipliers, as percentages. */
export interface MonLvlSet {
  hp: Record<Difficulty, number>
  damage: Record<Difficulty, number>
  armor: Record<Difficulty, number>
  toHit: Record<Difficulty, number>
  xp: Record<Difficulty, number>
}

/** One row of `monlvl`: the two parallel percentage sets for a level. */
export interface MonLvlRow {
  level: number
  /** The plain columns. */
  plain: MonLvlSet
  /** The `L-` prefixed columns; see the file header for exactly what differs. */
  areaScaled: MonLvlSet
}

/** Which of the two parallel `monlvl` column sets to apply. */
export type MonLvlColumnSet = 'monsterLevel' | 'areaScaled'

/** A scripted monster sequence from `monseq`. */
export interface MonsterSequence {
  name: string
  /** The `monmode` token the sequence plays in, e.g. `S1` or `DT`. */
  mode: MonsterMode
  /** Number of frames in the sequence (highest frame + 1). */
  frames: number
  /**
   * The frames carrying an `event`. The tables do not document the event codes,
   * but only these frames do anything, so they are the sequence's action frames
   * (missile spawn, sound, hit).
   */
  actionFrames: readonly number[]
  /** `frames / 25`, the game's logic rate being 25 frames per second. */
  seconds: number
}

/** The area data scaling needs, decoded from `levels`. */
export interface AreaInfo {
  id: number
  name: string
  act: number
  /** `MonLvl` — the area level, used by the drop and object systems. */
  areaLevel: Record<Difficulty, number>
  /**
   * `MonLvlEx` — the exact monster level of the area, and the number the game
   * compares a monster's own level against.
   */
  monsterLevel: Record<Difficulty, number>
  /** `MonDen` — the area's monster density. */
  density: Record<Difficulty, number>
  uniqueMin: number | null
  uniqueMax: number | null
  /** The `mon1`..`mon25` roster, in table order with blanks dropped. */
  monsters: readonly string[]
}

/** A monster's numbers once `monlvl` has been applied. */
export interface MonsterStats {
  id: string
  name: string
  difficulty: Difficulty
  level: number
  /** Which level won: the monster's own, or the area's `MonLvlEx`. */
  levelSource: 'monster' | 'area'
  columnSet: MonLvlColumnSet
  hp: DamageRange
  armor: number
  toHit: number
  xp: number
  damage: {
    attack1: DamageRange | null
    attack2: DamageRange | null
    skill1: DamageRange | null
  }
  resistances: MonsterResistances
  drain: number
  toBlock: number
  crit: number
  /** Walk speed in D2 distance units (subtiles) per second. */
  velocity: number
  run: number
}

/** Everything the tables gave us, parsed and indexed. */
export interface MonsterTables {
  monsters: readonly MonsterDef[]
  byId: ReadonlyMap<string, MonsterDef>
  /** `monlvl` by level, 0..110. */
  monLvl: ReadonlyMap<number, MonLvlRow>
  /** `monseq` by sequence name. */
  sequences: ReadonlyMap<string, MonsterSequence>
  areas: readonly AreaInfo[]
  areaById: ReadonlyMap<number, AreaInfo>
  /** `monai` labels by AI name. */
  aiLabels: ReadonlyMap<string, readonly (string | null)[]>
  /**
   * `monstats2`'s geometry per monster id.
   *
   * Exposed because it is the only place `BaseW` appears, and `BaseW` is which arm
   * art set the creature uses — the animation tree is keyed by it. 128 of the 751
   * monsters have no row at all, so a caller has to handle a miss.
   */
  geometry: ReadonlyMap<string, MonsterGeometry>
}

// --- table helpers ----------------------------------------------------------

function flag(row: TableRow, key: string): boolean {
  const value = str(row[key])
  return value !== null && value !== '0'
}

function range(
  row: TableRow,
  minKey: string,
  maxKey: string,
): DamageRange | null {
  const min = num(row[minKey])
  const max = num(row[maxKey])
  if (min === null && max === null) return null
  return { min: min ?? 0, max: max ?? min ?? 0 }
}

/** Run a reader for each difficulty's column suffix. */
function perDifficulty<T>(read: (suffix: string) => T): Record<Difficulty, T> {
  return { normal: read(''), nightmare: read('(N)'), hell: read('(H)') }
}

// --- monstats2 --------------------------------------------------------------

/** The `monstats2` half of a monster: geometry and which animations exist. */
export interface MonsterGeometry {
  size: MonsterSize
  modes: MonsterModes
}

/**
 * Decode `monstats2`. Its 624 rows are keyed by the same `Id` as `monstats`;
 * one of them (`Expansion`) belongs to the spacer row `monstats` also carries,
 * so 128 of the 751 monsters have no geometry row at all. They keep neutral
 * geometry (see {@link NEUTRAL_GEOMETRY}) rather than being dropped: `monstats`
 * is the authority on stats, and `monstats2` only says what the animations are.
 */
export function parseMonStats2(rows: readonly TableRow[]): Map<string, MonsterGeometry> {
  const out = new Map<string, MonsterGeometry>()
  for (const row of rows) {
    const id = str(row.Id)
    if (!id) continue
    out.set(id, {
      size: {
        height: num(row.Height) ?? 1,
        sizeX: num(row.SizeX) ?? 1,
        sizeY: num(row.SizeY) ?? 1,
        meleeRange: num(row.MeleeRng) ?? 0,
        hitClass: num(row.HitClass) ?? 0,
        baseWeapon: str(row.BaseW) ?? '',
      },
      modes: {
        idle: flag(row, 'mNU'),
        walk: flag(row, 'mWL'),
        run: flag(row, 'mRN'),
        getHit: flag(row, 'mGH'),
        attack1: flag(row, 'mA1'),
        attack2: flag(row, 'mA2'),
        block: flag(row, 'mBL'),
        cast: flag(row, 'mSC'),
        skill1: flag(row, 'mS1'),
        skill2: flag(row, 'mS2'),
        skill3: flag(row, 'mS3'),
        skill4: flag(row, 'mS4'),
        death: flag(row, 'mDT'),
        dead: flag(row, 'mDD'),
        knockBack: flag(row, 'mKB'),
        sequence: flag(row, 'mSQ'),
      },
    })
  }
  return out
}

const NEUTRAL_GEOMETRY: MonsterGeometry = {
  size: { height: 1, sizeX: 1, sizeY: 1, meleeRange: 0, hitClass: 0, baseWeapon: '' },
  modes: {
    idle: true,
    walk: true,
    run: false,
    getHit: true,
    attack1: true,
    attack2: false,
    block: false,
    cast: false,
    skill1: false,
    skill2: false,
    skill3: false,
    skill4: false,
    death: true,
    dead: true,
    knockBack: false,
    sequence: false,
  },
}

// --- monlvl -----------------------------------------------------------------

/** Decode `monlvl`: 111 rows of percentage multipliers in two parallel sets. */
export function parseMonLvl(rows: readonly TableRow[]): Map<number, MonLvlRow> {
  const readSet = (row: TableRow, prefix: string): MonLvlSet => ({
    hp: perDifficulty((s) => num(row[`${prefix}HP${s}`]) ?? 100),
    damage: perDifficulty((s) => num(row[`${prefix}DM${s}`]) ?? 100),
    armor: perDifficulty((s) => num(row[`${prefix}AC${s}`]) ?? 100),
    toHit: perDifficulty((s) => num(row[`${prefix}TH${s}`]) ?? 100),
    xp: perDifficulty((s) => num(row[`${prefix}XP${s}`]) ?? 100),
  })
  const out = new Map<number, MonLvlRow>()
  for (const row of rows) {
    const level = num(row.Level)
    if (level === null) continue
    out.set(level, { level, plain: readSet(row, ''), areaScaled: readSet(row, 'L-') })
  }
  return out
}

// --- monai ------------------------------------------------------------------

/**
 * The AI parameter labels, verbatim from `monai`'s `*aipN` columns.
 *
 * This is the one place the retail data documents AI behaviour, and it is what
 * lets this module be faithful about ai *parameters* even though the ai
 * *procedure* is compiled into the game. Skeleton, for example:
 *
 * ```
 * aip1 "Approach Enemy (% Chance)"  aip2 "AI Delay (Frames)"
 * aip3 "Attack Enemy (% Chance)"    aip4 "Attack1 (% Chance), else Attack2"
 * ```
 */
export function parseMonAi(rows: readonly TableRow[]): Map<string, readonly (string | null)[]> {
  const out = new Map<string, readonly (string | null)[]>()
  for (const row of rows) {
    const ai = str(row.AI)
    if (!ai) continue
    const labels: (string | null)[] = []
    for (let slot = 1; slot <= 8; slot += 1) labels.push(str(row[`*aip${slot}`]))
    out.set(ai, labels)
  }
  return out
}

/** What kind of number an AI parameter is, read off its own `monai` label. */
export type AiParamKind =
  | 'chance'
  | 'frames'
  | 'range'
  | 'life-threshold'
  | 'velocity'
  | 'count'
  | 'flag'
  | 'unknown'

/**
 * Classify an AI parameter from its label. The labels end in a parenthesised
 * unit ("(% Chance)", "(Frames)", "(Range)"), so the unit can be read without a
 * hand-written table of all 155 AI types.
 */
export function aiParamKind(label: string): AiParamKind {
  const text = label.toLowerCase()
  if (text.includes('chance')) return 'chance'
  if (text.includes('frame') || text.includes('interval') || text.includes('delay')) return 'frames'
  if (text.includes('range') || text.includes('distance') || text.includes('awareness')) {
    return 'range'
  }
  if (text.includes('life %') || text.includes('life%') || text.includes('hpregen')) {
    return 'life-threshold'
  }
  if (text.includes('velocity') || text.includes('speed')) return 'velocity'
  if (text.includes('count') || text.includes('max unit') || text.includes('leash')) return 'count'
  if (text.includes('overlay') || text.includes('flags') || text.includes('type')) return 'flag'
  return 'unknown'
}

/** A resolved AI parameter: its slot, its `monai` label, its value and its kind. */
export interface AiParam {
  slot: number
  label: string
  value: number
  kind: AiParamKind
}

/** A monster's AI at one difficulty, with its documented parameters resolved. */
export interface MonsterAi {
  name: string
  params: readonly AiParam[]
  /** Values `monstats` sets whose slot `monai` leaves unlabelled. */
  unlabelled: readonly { slot: number; value: number }[]
}

/** Resolve a monster's AI parameters for a difficulty, labelling them from `monai`. */
export function resolveMonsterAi(
  def: MonsterDef,
  difficulty: Difficulty,
  labels: readonly (string | null)[] = def.aiParamLabels,
): MonsterAi {
  const params: AiParam[] = []
  const unlabelled: { slot: number; value: number }[] = []
  const values = def.aiParams[difficulty]
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === null) continue
    const label = labels[index] ?? null
    if (label === null) unlabelled.push({ slot: index + 1, value })
    else params.push({ slot: index + 1, label, value, kind: aiParamKind(label) })
  }
  return { name: def.ai, params, unlabelled }
}

/** Find the first AI parameter whose label contains all of `required` and none of `forbidden`. */
export function findAiParam(
  ai: MonsterAi,
  required: readonly string[],
  forbidden: readonly string[] = [],
): AiParam | undefined {
  const has = (label: string, needle: string): boolean =>
    label.toLowerCase().includes(needle.toLowerCase())
  return ai.params.find(
    (param) =>
      required.every((needle) => has(param.label, needle)) &&
      forbidden.every((needle) => !has(param.label, needle)),
  )
}

// --- monseq -----------------------------------------------------------------

const MODE_TOKENS: ReadonlySet<string> = new Set([
  'NU',
  'WL',
  'RN',
  'GH',
  'A1',
  'A2',
  'BL',
  'SC',
  'S1',
  'S2',
  'S3',
  'S4',
  'DT',
  'DD',
  'KB',
  'xx',
])

/**
 * Decode `monseq`. Only 61 sequences exist, for the monsters whose skill
 * animation is scripted (`SkNmode` = `seq_skeletonraise` and friends), but they
 * are the only real animation timing in the whole data set: frames × 1/25 s is
 * how long the cast takes.
 */
export function parseMonSeq(rows: readonly TableRow[]): Map<string, MonsterSequence> {
  interface Group {
    modes: Map<string, number>
    highestFrame: number
    events: Set<number>
  }
  const grouped = new Map<string, Group>()
  for (const row of rows) {
    const name = str(row.sequence)
    if (!name) continue
    const group = grouped.get(name) ?? { modes: new Map(), highestFrame: -1, events: new Set() }
    const mode = str(row.mode) ?? ''
    group.modes.set(mode, (group.modes.get(mode) ?? 0) + 1)
    const frame = num(row.frame)
    if (frame !== null) {
      group.highestFrame = Math.max(group.highestFrame, frame)
      if (str(row.event)) group.events.add(frame)
    }
    grouped.set(name, group)
  }
  const out = new Map<string, MonsterSequence>()
  for (const [name, group] of grouped) {
    // A scripted sequence plays in one mode throughout; when the table is
    // inconsistent the mode with the most rows is the one it is for.
    let mode: MonsterMode = 'xx'
    let best = 0
    for (const [candidate, count] of group.modes) {
      if (count > best && MODE_TOKENS.has(candidate)) {
        mode = candidate as MonsterMode
        best = count
      }
    }
    const frames = group.highestFrame + 1
    out.set(name, {
      name,
      mode,
      frames,
      actionFrames: [...group.events].sort((a, b) => a - b),
      seconds: framesToSeconds(frames),
    })
  }
  return out
}

// --- levels -----------------------------------------------------------------

/** Decode the `levels` columns that area-based monster spawning needs. */
export function parseAreas(rows: readonly TableRow[]): AreaInfo[] {
  const areas: AreaInfo[] = []
  for (const row of rows) {
    const id = num(row.Id)
    const name = str(row.Name)
    if (id === null || name === null) continue
    const monsters: string[] = []
    for (let index = 1; index <= 25; index += 1) {
      const monsterId = str(row[`mon${index}`])
      if (monsterId) monsters.push(monsterId)
    }
    areas.push({
      id,
      name,
      act: num(row.Act) ?? 0,
      areaLevel: perDifficulty((s) => num(row[`MonLvl${s}`]) ?? 0),
      // `MonLvlEx` is the monster level; some rows (towns) leave it blank and
      // then the area level is the only number available.
      monsterLevel: perDifficulty((s) => num(row[`MonLvlEx${s}`]) ?? num(row[`MonLvl${s}`]) ?? 0),
      density: perDifficulty((s) => num(row[`MonDen${s}`]) ?? 0),
      uniqueMin: num(row.MonUMin),
      uniqueMax: num(row.MonUMax),
      monsters,
    })
  }
  return areas
}

// --- monstats ---------------------------------------------------------------

/**
 * Decode one `monstats` row into a {@link MonsterDef}.
 *
 * Returns null for the rows without an `Id` or an `AI`, which are the table's
 * trailing padding rather than monsters.
 */
export function parseMonster(
  row: TableRow,
  geometry: ReadonlyMap<string, MonsterGeometry>,
  aiLabels: ReadonlyMap<string, readonly (string | null)[]>,
  sequences: ReadonlyMap<string, MonsterSequence>,
): MonsterDef | null {
  const id = str(row.Id)
  const ai = str(row.AI)
  if (!id || !ai) return null

  const missiles: MonsterMissiles = {
    attack1: str(row.MissA1),
    attack2: str(row.MissA2),
    skill1: str(row.MissS1),
    skill2: str(row.MissS2),
    skill3: str(row.MissS3),
    skill4: str(row.MissS4),
    cast: str(row.MissC),
    sequence: str(row.MissSQ),
  }
  const skillMissiles: (string | null)[] = [
    missiles.skill1,
    missiles.skill2,
    missiles.skill3,
    missiles.skill4,
  ]
  const skills: MonsterSkill[] = []
  for (let slot = 1; slot <= 8; slot += 1) {
    const skill = str(row[`Skill${slot}`])
    if (!skill) continue
    const castMode = str(row[`Sk${slot}mode`])
    const sequence = castMode ? sequences.get(castMode) ?? null : null
    // `SkNmode` is either a scripted sequence name, a bare mode token, or
    // blank — in which case the skill plays in the mode its slot maps to.
    const mode: MonsterMode = sequence
      ? sequence.mode
      : castMode && MODE_TOKENS.has(castMode)
        ? (castMode as MonsterMode)
        : (`S${slot}` as MonsterMode)
    skills.push({
      skill,
      castMode,
      level: num(row[`Sk${slot}lvl`]) ?? 1,
      mode,
      castFrames: sequence?.frames ?? null,
      actionFrames: sequence?.actionFrames ?? [],
      castSeconds: sequence?.seconds ?? null,
      missile: skillMissiles[slot - 1] ?? null,
    })
  }

  const readResistances = (suffix: string): MonsterResistances => ({
    phys: num(row[`ResDm${suffix}`]) ?? 0,
    mag: num(row[`ResMa${suffix}`]) ?? 0,
    fire: num(row[`ResFi${suffix}`]) ?? 0,
    ltng: num(row[`ResLi${suffix}`]) ?? 0,
    cold: num(row[`ResCo${suffix}`]) ?? 0,
    pois: num(row[`ResPo${suffix}`]) ?? 0,
  })

  const acts: number[] = []
  for (let act = 1; act <= 5; act += 1) if (flag(row, `act${act}`)) acts.push(act)

  const part = geometry.get(id) ?? NEUTRAL_GEOMETRY
  return {
    id,
    name: str(row.NameStr) ?? id,
    baseId: str(row.BaseId) ?? id,
    nextInClass: str(row.NextInClass),
    monsterType: str(row.MonType),
    ai,
    aiParams: perDifficulty((s) => {
      const values: (number | null)[] = []
      for (let slot = 1; slot <= 8; slot += 1) values.push(num(row[`aip${slot}${s}`]))
      return values
    }),
    aiParamLabels: aiLabels.get(ai) ?? [null, null, null, null, null, null, null, null],
    aiDelayFrames: perDifficulty((s) => num(row[`aidel${s}`])),
    aiDistance: perDifficulty((s) => num(row[`aidist${s}`])),
    threat: num(row.threat),
    level: perDifficulty((s) => num(row[`Level${s}`]) ?? 0),
    // The life pair is the one column group whose Normal spelling differs from
    // its scaled spellings: `minHP`/`maxHP` but `MinHP(N)`/`MaxHP(N)`.
    hp: perDifficulty((s) =>
      range(row, s === '' ? 'minHP' : `MinHP${s}`, s === '' ? 'maxHP' : `MaxHP${s}`) ?? {
        min: 1,
        max: 1,
      },
    ),
    armor: perDifficulty((s) => num(row[`AC${s}`]) ?? 0),
    xp: perDifficulty((s) => num(row[`Exp${s}`]) ?? 0),
    toHit: perDifficulty((s) => num(row[`A1TH${s}`]) ?? 0),
    damage: {
      attack1: perDifficulty((s) => range(row, `A1MinD${s}`, `A1MaxD${s}`)),
      attack2: perDifficulty((s) => range(row, `A2MinD${s}`, `A2MaxD${s}`)),
      skill1: perDifficulty((s) => range(row, `S1MinD${s}`, `S1MaxD${s}`)),
    },
    velocity: num(row.Velocity) ?? 0,
    run: num(row.Run) ?? 0,
    rarity: num(row.Rarity),
    groupMin: num(row.MinGrp),
    groupMax: num(row.MaxGrp),
    partyMin: num(row.PartyMin),
    partyMax: num(row.PartyMax),
    size: part.size,
    modes: part.modes,
    resistances: {
      normal: readResistances(''),
      nightmare: readResistances('(N)'),
      hell: readResistances('(H)'),
    },
    drain: perDifficulty((s) => num(row[`Drain${s}`]) ?? 0),
    damageRegen: num(row.DamageRegen),
    crit: num(row.Crit),
    toBlock: perDifficulty((s) => num(row[`ToBlock${s}`]) ?? 0),
    coldeffect: perDifficulty((s) => num(row[`coldeffect${s}`]) ?? 0),
    skills,
    missiles,
    sound: str(row.MonSound),
    uniqueSound: str(row.UMonSound),
    flags: {
      boss: flag(row, 'boss'),
      primeEvil: flag(row, 'primeevil'),
      setBoss: flag(row, 'SetBoss'),
      ranged:
        str(row.rangedtype) !== null ||
        str(row.MissA1) !== null ||
        str(row.MissA2) !== null ||
        str(row.MissS1) !== null ||
        str(row.MissS2) !== null,
      melee: flag(row, 'isMelee'),
      demon: flag(row, 'demon'),
      undead: flag(row, 'lUndead') || flag(row, 'hUndead'),
      flying: flag(row, 'flying'),
      killable: flag(row, 'killable'),
      enabled: flag(row, 'enabled'),
      noRatio: flag(row, 'noRatio'),
      switchAi: flag(row, 'switchai'),
      // `isSpawn` marks the rows that only exist as a spawn of another monster
      // (tentacles, maggot eggs), so they are not part of a level's roster.
      spawnable: (num(row.Rarity) ?? 0) > 0 && !flag(row, 'isSpawn'),
      npc: flag(row, 'npc'),
      inTown: flag(row, 'inTown'),
    },
    acts,
    treasureClass: str(row.TreasureClass),
    // The art key. Empty for a row without one, which a caller then cannot look up.
    code: str(row.Code) ?? '',
  }
}

/**
 * Parse every monster table into one indexed {@link MonsterTables}. Pure, so
 * the tests can hand it JSON read off disk and the browser loader can fetch it.
 */
export function parseMonsterTables(tables: {
  monstats: readonly TableRow[]
  monstats2?: readonly TableRow[]
  monlvl: readonly TableRow[]
  monai?: readonly TableRow[]
  monseq?: readonly TableRow[]
  levels?: readonly TableRow[]
}): MonsterTables {
  const geometry = parseMonStats2(tables.monstats2 ?? [])
  const aiLabels = parseMonAi(tables.monai ?? [])
  const sequences = parseMonSeq(tables.monseq ?? [])
  const monsters: MonsterDef[] = []
  for (const row of tables.monstats) {
    const def = parseMonster(row, geometry, aiLabels, sequences)
    if (def) monsters.push(def)
  }
  const areas = parseAreas(tables.levels ?? [])
  return {
    monsters,
    byId: new Map(monsters.map((monster) => [monster.id, monster])),
    monLvl: parseMonLvl(tables.monlvl),
    sequences,
    areas,
    areaById: new Map(areas.map((area) => [area.id, area])),
    aiLabels,
    geometry,
  }
}

/**
 * Fetch the six tables from the exported JSON. Mirrors `gamedata.ts`: paths are
 * relative to the page, and a missing table degrades instead of throwing.
 */
export async function loadMonsterTables(base: string): Promise<MonsterTables> {
  const read = async (name: string): Promise<TableRow[]> => {
    try {
      const response = await fetch(`${base}original/${name}.json`, { cache: 'no-store' })
      if (!response.ok) return []
      return (await response.json()) as TableRow[]
    } catch {
      return []
    }
  }
  const [monstats, monstats2, monlvl, monai, monseq, levels] = await Promise.all([
    read('table_monstats'),
    read('table_monstats2'),
    read('table_monlvl'),
    read('table_monai'),
    read('table_monseq'),
    read('table_levels'),
  ])
  return parseMonsterTables({ monstats, monstats2, monlvl, monai, monseq, levels })
}

// --- scaling ----------------------------------------------------------------

export interface ScaleOptions {
  difficulty?: Difficulty
  /** Defaults to `'monsterLevel'` (the plain columns); see the file header. */
  columnSet?: MonLvlColumnSet
}

/** The game's logic rate: D2's fixed step is 25 frames per second. */
export const LOGIC_FRAMES_PER_SECOND = 25

/** Frames → seconds. The single timing conversion this file uses. */
export function framesToSeconds(frames: number): number {
  return frames / LOGIC_FRAMES_PER_SECOND
}

/** The `monlvl` row for a level, clamped into the table's own 0..110 range. */
export function monLvlRow(tables: MonsterTables, level: number): MonLvlRow {
  const clamped = Math.max(0, Math.min(110, Math.round(level)))
  const row = tables.monLvl.get(clamped)
  if (row) return row
  // Only reachable when `monlvl` was not exported. Identity scaling — 100% of
  // the base values — is the fallback that keeps a game running without data.
  const identity: MonLvlSet = {
    hp: { normal: 100, nightmare: 100, hell: 100 },
    damage: { normal: 100, nightmare: 100, hell: 100 },
    armor: { normal: 100, nightmare: 100, hell: 100 },
    toHit: { normal: 100, nightmare: 100, hell: 100 },
    xp: { normal: 100, nightmare: 100, hell: 100 },
  }
  return { level: clamped, plain: identity, areaScaled: identity }
}

function scaled(range_: DamageRange | null, percent: number): DamageRange | null {
  if (!range_) return null
  return { min: (range_.min * percent) / 100, max: (range_.max * percent) / 100 }
}

/**
 * A monster's real numbers once `monlvl` has been applied.
 *
 * The result is deliberately *unrounded*: the game keeps a fractional life
 * total and rounds when it draws it, and rounding here would erase the curve at
 * low levels (a Fallen at level 1 has 1.47..4.27 hp, which rounds to 1..4 and
 * hides exactly the scaling this function exists to expose).
 */
export function scaleMonster(
  tables: MonsterTables,
  def: MonsterDef,
  level: number,
  options: ScaleOptions = {},
): MonsterStats {
  const difficulty = options.difficulty ?? 'normal'
  const columnSet = options.columnSet ?? 'monsterLevel'
  const row = monLvlRow(tables, level)
  const set = columnSet === 'areaScaled' ? row.areaScaled : row.plain
  return {
    id: def.id,
    name: def.name,
    difficulty,
    level: row.level,
    levelSource: 'monster',
    columnSet,
    hp: scaled(def.hp[difficulty], set.hp[difficulty]) ?? { min: 1, max: 1 },
    armor: (def.armor[difficulty] * set.armor[difficulty]) / 100,
    toHit: (def.toHit[difficulty] * set.toHit[difficulty]) / 100,
    xp: (def.xp[difficulty] * set.xp[difficulty]) / 100,
    damage: {
      attack1: scaled(def.damage.attack1[difficulty], set.damage[difficulty]),
      attack2: scaled(def.damage.attack2[difficulty], set.damage[difficulty]),
      skill1: scaled(def.damage.skill1[difficulty], set.damage[difficulty]),
    },
    resistances: def.resistances[difficulty],
    drain: def.drain[difficulty],
    toBlock: def.toBlock[difficulty],
    crit: def.crit ?? 0,
    velocity: def.velocity,
    run: def.run,
  }
}

/**
 * The level a monster spawns at in an area: its own `monstats.Level(D)` when
 * that is higher, the area's `MonLvlEx(D)` otherwise. `noRatio` monsters are
 * never raised — every one of the 34 rows that sets it is a summon or a pet.
 */
export function monsterLevelInArea(
  def: MonsterDef,
  area: AreaInfo,
  difficulty: Difficulty,
): { level: number; source: 'monster' | 'area' } {
  const own = def.level[difficulty]
  if (def.flags.noRatio) return { level: own, source: 'monster' }
  const areaLevel = area.monsterLevel[difficulty]
  return areaLevel > own ? { level: areaLevel, source: 'area' } : { level: own, source: 'monster' }
}

/** Scale a monster as it appears in a specific area at a specific difficulty. */
export function monsterStatsInArea(
  tables: MonsterTables,
  def: MonsterDef,
  area: AreaInfo,
  options: ScaleOptions & { level?: number } = {},
): MonsterStats {
  const difficulty = options.difficulty ?? 'normal'
  const chosen =
    options.level !== undefined
      ? { level: options.level, source: 'monster' as const }
      : monsterLevelInArea(def, area, difficulty)
  const stats = scaleMonster(tables, def, chosen.level, {
    difficulty,
    columnSet: options.columnSet ?? 'monsterLevel',
  })
  return { ...stats, levelSource: chosen.source }
}

/**
 * Roll the life of one spawned monster: `monstats` gives a min/max pair and the
 * game rolls inside it, so two Fallen are never identical. `random` is injected
 * so runs stay reproducible.
 */
export function rollMonsterHp(stats: MonsterStats, random: () => number): number {
  const rolled = stats.hp.min + random() * Math.max(0, stats.hp.max - stats.hp.min)
  return Math.max(1, Math.round(rolled))
}

/** A one-line readout of scaled stats, used by the tests and the HUD. */
export function describeMonsterStats(stats: MonsterStats): string {
  const attack1 = stats.damage.attack1
  return [
    `${stats.name} (${stats.id})`,
    stats.difficulty,
    `lvl ${stats.level} from ${stats.levelSource}`,
    `hp ${stats.hp.min.toFixed(1)}-${stats.hp.max.toFixed(1)}`,
    `dmg ${attack1 ? `${attack1.min.toFixed(1)}-${attack1.max.toFixed(1)}` : '-'}`,
    `ac ${stats.armor.toFixed(1)}`,
    `ar ${stats.toHit.toFixed(1)}`,
    `xp ${stats.xp.toFixed(1)}`,
    `res f${stats.resistances.fire}/c${stats.resistances.cold}/l${stats.resistances.ltng}/p${stats.resistances.pois}`,
  ].join(' ')
}

// --- behaviour --------------------------------------------------------------

/**
 * The behaviour states. `idle`/`wander`/`approach`/`attack`/`hit-recovery`/
 * `death` are the required core; `cast` (a skill rather than a swing), `flee`
 * (the AI documents `Run Away`) and `dead` (the corpse state the tables model
 * with the `DD` mode) come from the data.
 */
export type BrainState =
  | 'idle'
  | 'wander'
  | 'approach'
  | 'attack'
  | 'cast'
  | 'hit-recovery'
  | 'flee'
  | 'death'
  | 'dead'

export type AttackKind = 'attack1' | 'attack2' | 'skill'

/** One attack the monster can perform, with the AI's own weight for choosing it. */
export interface MonsterAttackOption {
  kind: AttackKind
  /** Index into `def.skills` when `kind === 'skill'`. */
  skillIndex: number
  skill: string | null
  /** The missile this attack launches, from `monstats` or from the skill row. */
  missile: string | null
  /** The `monmode` the attack plays in. */
  mode: MonsterMode
  /** 0..1, normalised across the monster's options. */
  weight: number
  /** Seconds before the payload lands: the `monseq` cast time, else the AI delay. */
  windup: number
  ranged: boolean
}

/**
 * The monster's attacks with the weights its AI's own parameters give them.
 *
 * The reading of the `% Chance` labels, all of them `monai`'s wording and none
 * invented:
 *
 * - `Attack1 (% Chance), else Attack2` → attack1 gets the value, attack2 the
 *   remainder (the label says "else").
 * - a separate `Attack2 (% Chance)` → attack2 gets its own value.
 * - `SkillN (% Chance)` / `Use Skill1/Skill2/Skill3 (% Chance)` → that slot's skill.
 * - an AI that documents nothing (BloodRaven, Diablo, BaalCrab, …) weights the
 *   attacks its `monstats2` flags say it has equally, because its chooser is
 *   compiled and the tables hold no chance to honour.
 */
export function monsterAttackOptions(
  def: MonsterDef,
  difficulty: Difficulty,
  labels: readonly (string | null)[] = def.aiParamLabels,
  resolveMissile?: (skill: string) => string | null,
): MonsterAttackOption[] {
  const ai = resolveMonsterAi(def, difficulty, labels)
  const delay = def.aiDelayFrames[difficulty]
  const aiDelaySeconds = framesToSeconds(delay ?? 15)
  const options: MonsterAttackOption[] = []

  // An attack exists when the monster has either the animation for it, the
  // damage columns for it, or a missile to fire from it — `monstats` and
  // `monstats2` disagree on a handful of rows and both are evidence.
  if (def.modes.attack1 || def.damage.attack1[difficulty] || def.missiles.attack1) {
    options.push({
      kind: 'attack1',
      skillIndex: -1,
      skill: null,
      missile: def.missiles.attack1,
      mode: 'A1',
      weight: 0,
      windup: aiDelaySeconds,
      ranged: def.missiles.attack1 !== null,
    })
  }
  if (def.modes.attack2 || def.damage.attack2[difficulty] || def.missiles.attack2) {
    options.push({
      kind: 'attack2',
      skillIndex: -1,
      skill: null,
      missile: def.missiles.attack2,
      mode: 'A2',
      weight: 0,
      windup: aiDelaySeconds,
      ranged: def.missiles.attack2 !== null,
    })
  }
  def.skills.forEach((skill, index) => {
    // `monstats.MissS1..MissS4` covers a monster's four skill missiles; the
    // skills table says whether the skill fires a missile at all, so the caller
    // can inject that lookup (`resolveMissile`) and get the ranged/melee split
    // right for skills whose `monstats` missile column is blank.
    const missile = skill.missile ?? resolveMissile?.(skill.skill) ?? null
    options.push({
      kind: 'skill',
      skillIndex: index,
      skill: skill.skill,
      missile,
      mode: skill.mode,
      weight: 0,
      windup: skill.castSeconds ?? aiDelaySeconds,
      ranged: missile !== null || skill.mode === 'SC',
    })
  })

  let documented = 0
  for (const param of ai.params) {
    if (param.kind !== 'chance') continue
    const label = param.label.toLowerCase()
    const attack1 = options.find((option) => option.kind === 'attack1')
    const attack2 = options.find((option) => option.kind === 'attack2')
    if (label.includes('attack1') || label.includes('attack 1')) {
      if (attack1) {
        attack1.weight = Math.max(attack1.weight, param.value)
        documented += 1
      }
      if (label.includes('else attack2') && attack2) {
        attack2.weight = Math.max(attack2.weight, Math.max(0, 100 - param.value))
        documented += 1
      }
      continue
    }
    if (label.includes('attack2') || label.includes('attack 2')) {
      if (attack2) {
        attack2.weight = Math.max(attack2.weight, param.value)
        documented += 1
      }
      continue
    }
    if (label.includes('skill')) {
      for (const option of options) {
        if (option.kind !== 'skill') continue
        if (label.includes(`skill${option.skillIndex + 1}`)) {
          option.weight = Math.max(option.weight, param.value)
          documented += 1
        }
      }
    }
  }

  // `monstats.SkillN` is the authority on what a monster can cast: Andariel has
  // `AndyPoisonBolt` with no `Sk2mode` and no `mS2` flag, and still casts it in
  // the retail game, so the mode flags are not used to filter skills.
  const usable = options
  if (documented === 0) {
    for (const option of usable) option.weight = 1
  }
  const total = usable.reduce((sum, option) => sum + option.weight, 0)
  if (total <= 0) return []
  for (const option of usable) option.weight /= total
  return usable
}

/** Seeded PRNG (mulberry32): the AI must repeat for tests and replays. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), 1 | t)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface BrainOptions {
  difficulty?: Difficulty
  /** Deterministic RNG. Defaults to a mulberry32 seeded from `seed`. */
  random?: () => number
  seed?: number
  /**
   * Distance (subtiles) at which a monster notices a target when its AI
   * documents no awareness range. The AIs that document none are the bosses
   * (Diablo, BaalCrab, BloodRaven, Griswold…), whose sight is compiled into the
   * game, so this is a named stand-in rather than a table value.
   */
  fallbackAwareness?: number
  /** Distance a monster with no documented standoff tries to keep, in subtiles. */
  fallbackStandoff?: number
  /**
   * Missile a skill fires, per the skills table. Injected so this module stays
   * independent of `skills.ts` while still knowing which of a monster's skills
   * are ranged.
   */
  skillMissile?: (skill: string) => string | null
}

/** What the caller must do this tick. */
export interface BrainAction {
  state: BrainState
  /** The `monmode` the monster should be playing. */
  mode: MonsterMode
  movement: 'none' | 'walk' | 'run'
  /** Speed in D2 subtiles per second; 0 when not moving. */
  speed: number
  /**
   * The attack being played. `phase` runs `windup` → `fire` → `recover`, and
   * the payload's numbers are due on the `fire` tick.
   */
  attack: {
    kind: AttackKind
    skill: string | null
    missile: string | null
    phase: 'windup' | 'fire' | 'recover'
    windup: number
    recover: number
  } | null
  /** The skill to feed to the skills engine, on the tick it fires. */
  castSkill: { skill: string; level: number } | null
  /** The distance the monster is trying to hold, in subtiles. */
  standoff: number
  /**
   * Direction the monster is wandering in, in world radians, or null when the
   * action has a target: the brain only ever sees the *distance* to its target,
   * so approaching and fleeing are the caller's to aim.
   */
  wanderAngle: number | null
}

export interface BrainInput {
  /** Seconds since the previous tick. */
  dt: number
  /** Distance to the target in subtiles, or null when there is no target. */
  targetDistance: number | null
  /** Life remaining as a fraction of maximum (1 = untouched). */
  hpFraction: number
}

/**
 * A monster's behaviour.
 *
 * Every distance and duration comes from the tables where the tables have one:
 * awareness and standoff from the AI's own `Range` parameters, attack cooldown
 * from `aidel` or the AI's `AI Delay (Frames)`, cast time from `monseq`, the
 * choice between attacks from the AI's `% Chance` parameters, and even whether
 * the monster can move at all from `Velocity` and `monstats2`'s `mWL`/`mRN`
 * flags (a Catapult has neither a walk nor a run animation and a velocity of 0,
 * so it can only stand and fire — which is what it does in the retail game).
 *
 * The two fallbacks that exist (`fallbackAwareness`, `fallbackStandoff`) apply
 * only to the AIs that document nothing at all — Diablo, BaalCrab, BloodRaven,
 * Griswold and the other set pieces, whose sight and reach live in the compiled
 * program — and they are constructor options with documented defaults rather
 * than numbers buried in the middle of a decision.
 */
export class MonsterBrain {
  readonly def: MonsterDef
  readonly difficulty: Difficulty
  readonly attackOptions: readonly MonsterAttackOption[]
  private readonly ai: MonsterAi
  private readonly random: () => number
  private readonly fallbackAwareness: number
  private readonly fallbackStandoff: number

  private currentState: BrainState = 'idle'
  /** Seconds until the AI makes its next decision: `aidel`/AI Delay (Frames). */
  private thinkTimer = 0
  private cooldown = 0
  private recovery = 0
  private windup = 0
  private currentAttack: MonsterAttackOption | null = null
  private fired = false
  private moveMode: 'none' | 'walk' | 'run' = 'none'
  private wanderTimer = 0
  private wanderAngle = 0
  private deathTimer = 0
  private hpFraction = 1

  constructor(def: MonsterDef, options: BrainOptions = {}) {
    this.def = def
    this.difficulty = options.difficulty ?? 'normal'
    this.ai = resolveMonsterAi(def, this.difficulty)
    this.attackOptions = monsterAttackOptions(
      def,
      this.difficulty,
      def.aiParamLabels,
      options.skillMissile,
    )
    this.random = options.random ?? createRandom(options.seed ?? 0x5eed)
    this.fallbackAwareness = options.fallbackAwareness ?? 18
    this.fallbackStandoff = options.fallbackStandoff ?? 2
    this.wanderAngle = this.random() * Math.PI * 2
    this.wanderTimer = 0.5 + this.random() * 1.5
  }

  get state(): BrainState {
    return this.currentState
  }

  /** The AI's own parameters for this monster at this difficulty. */
  get parameters(): MonsterAi {
    return this.ai
  }

  /** `aidel`, or the AI's "AI Delay (Frames)" parameter, in seconds. */
  get thinkDelay(): number {
    const param = findAiParam(this.ai, ['AI Delay'])
    if (param) return framesToSeconds(param.value)
    const delay = this.def.aiDelayFrames[this.difficulty]
    return framesToSeconds(delay ?? 15)
  }

  /** How far the monster notices a target, in subtiles. */
  get awareness(): number {
    const param =
      findAiParam(this.ai, ['Enemy Awareness']) ??
      findAiParam(this.ai, ['Activate Range']) ??
      findAiParam(this.ai, ['Awareness Range'])
    return param ? param.value : this.fallbackAwareness
  }

  /** How close the monster gets before attacking, in subtiles. */
  get standoff(): number {
    const param =
      findAiParam(this.ai, ['Approach Enemy (Range)']) ??
      findAiParam(this.ai, ['Min Target Range']) ??
      findAiParam(this.ai, ['Ranged Target Range'])
    // `monstats2.MeleeRng` is extra reach on top; the base is the grid cell the
    // attacker and its target occupy (a tile is 2 subtiles, so 2).
    return param ? param.value : this.fallbackStandoff + this.def.size.meleeRange
  }

  /** The life fraction below which this AI runs away, when it documents one. */
  get hurtThreshold(): number | null {
    const param =
      findAiParam(this.ai, ['Hurt State (Life %']) ??
      findAiParam(this.ai, ['Hurt Life %']) ??
      findAiParam(this.ai, ['Run Away Life %'])
    return param ? param.value / 100 : null
  }

  /** True when the AI documents any way of running away. */
  get canFlee(): boolean {
    return this.ai.params.some((param) => param.label.toLowerCase().includes('run away'))
  }

  /** True when the monster can move at all: `Velocity` 0 means it cannot. */
  get canMove(): boolean {
    return this.def.velocity > 0 && this.def.modes.walk
  }

  /**
   * True when the monster has the run animation. `Run` may equal `Velocity`
   * (a Corrupt Rogue archer runs at walking pace), so the `mRN` flag — not the
   * speed difference — is what decides whether the mode is available.
   */
  get canRun(): boolean {
    return this.def.modes.run
  }

  /** The damage system tells the brain when the monster is hit. */
  notifyHit(damageFraction = 0): void {
    if (this.currentState === 'death' || this.currentState === 'dead') return
    this.hpFraction = Math.max(0, this.hpFraction - damageFraction)
    this.recovery = this.thinkDelay
    this.windup = 0
    this.currentAttack = null
    this.fired = false
    this.currentState = 'hit-recovery'
  }

  /** The life total reached zero: play the death mode, then become a corpse. */
  notifyDeath(): void {
    this.currentState = 'death'
    this.deathTimer = 0
  }

  /** Drive the state machine explicitly, for tests and for scripted spawns. */
  setState(state: BrainState): void {
    this.currentState = state
  }

  /** The monster's life fraction as the brain last saw it. */
  get lifeFraction(): number {
    return this.hpFraction
  }

  /** Ask for the next action. */
  tick(input: BrainInput): BrainAction {
    const dt = Math.max(0, input.dt)
    const distance = input.targetDistance
    this.hpFraction = input.hpFraction
    this.cooldown = Math.max(0, this.cooldown - dt)
    this.recovery = Math.max(0, this.recovery - dt)
    this.thinkTimer = Math.max(0, this.thinkTimer - dt)

    if (this.currentState === 'death' || this.currentState === 'dead') {
      this.deathTimer += dt
      const done = this.currentState === 'death' && this.deathTimer >= this.thinkDelay
      if (done) this.currentState = 'dead'
      return this.action('none', 0, null)
    }

    if (this.recovery > 0) return this.action('none', 0, null, 'hit-recovery')

    if (this.currentAttack) {
      if (!this.fired) {
        this.windup = Math.max(0, this.windup - dt)
        if (this.windup > 0) return this.action('none', 0, this.attackPayload('windup'))
        this.fired = true
        return this.action('none', 0, this.attackPayload('fire'))
      }
      // The recovery ends when the AI delay elapses; `recover` is reported so
      // the caller can hold the animation for exactly that long.
      if (this.cooldown > 0) return this.action('none', 0, this.attackPayload('recover'))
      this.currentAttack = null
      this.fired = false
      this.moveMode = 'none'
      return this.action('none', 0, null, 'idle')
    }

    // The AI decides on its own timer — `aidel`, or the AI's own "AI Delay
    // (Frames)" — not once per rendered frame. Between decisions the monster
    // keeps doing what it chose.
    if (this.thinkTimer > 0) return this.continueAction()
    this.thinkTimer = this.thinkDelay
    return this.think(dt, distance)
  }

  /** What the monster keeps doing between AI decisions. */
  private continueAction(): BrainAction {
    switch (this.currentState) {
      case 'wander':
        return this.action('walk', this.def.velocity * 0.6, null)
      case 'flee':
        return this.action(
          this.moveMode,
          this.moveMode === 'run' ? this.def.run : this.def.velocity,
          null,
        )
      case 'approach':
        return this.action(
          this.moveMode,
          this.moveMode === 'run' ? this.def.run : this.def.velocity,
          null,
        )
      default:
        return this.action('none', 0, null)
    }
  }

  /** One AI decision: pick a state and, if it is an attack, start it. */
  private think(dt: number, distance: number | null): BrainAction {
    if (distance === null || distance > this.awareness) return this.wander(dt)
    if (this.shouldFlee()) return this.flee()

    const reach = this.standoff
    if (distance > reach) {
      if (!this.canMove) return this.action('none', 0, null, 'idle')
      const run = this.canRun && distance > reach * 2
      this.moveMode = run ? 'run' : 'walk'
      return this.action(run ? 'run' : 'walk', run ? this.def.run : this.def.velocity, null, 'approach')
    }

    if (this.cooldown > 0) return this.action('none', 0, null, 'idle')

    // "Attack Enemy (% Chance)": the AI's own chance of committing to an attack
    // rather than holding position.
    const attackChance =
      findAiParam(this.ai, ['Attack Enemy']) ??
      findAiParam(this.ai, ['Attack (% Chance)']) ??
      findAiParam(this.ai, ['Melee Attack'])
    if (attackChance && attackChance.kind === 'chance') {
      if (this.random() * 100 > attackChance.value) return this.action('none', 0, null, 'idle')
    }

    const option = this.pickAttack(distance)
    if (!option) return this.action('none', 0, null, 'idle')
    this.currentAttack = option
    this.fired = false
    this.windup = option.windup
    this.cooldown = option.windup + this.thinkDelay
    this.moveMode = 'none'
    this.currentState = option.kind === 'skill' ? 'cast' : 'attack'
    return this.action('none', 0, this.attackPayload('windup'))
  }

  private attackPayload(phase: 'windup' | 'fire' | 'recover'): BrainAction['attack'] {
    const option = this.currentAttack
    if (!option) return null
    return {
      kind: option.kind,
      skill: option.skill,
      missile: option.missile,
      phase,
      windup: option.windup,
      recover: this.thinkDelay,
    }
  }

  private pickAttack(distance: number): MonsterAttackOption | null {
    const usable = this.attackOptions.filter((option) => {
      if (option.weight <= 0) return false
      if (!option.ranged) return distance <= this.standoff + this.def.size.meleeRange + 1
      // A ranged attack needs a range; the AI's own range parameters are the
      // only ones in the tables, so they bound the check.
      const documentedRange =
        findAiParam(this.ai, ['Skill Range']) ??
        findAiParam(this.ai, ['Ranged Max Range']) ??
        findAiParam(this.ai, ['Attack/Skill1 Range'])
      const limit = documentedRange ? documentedRange.value : this.awareness
      return distance <= limit
    })
    if (usable.length === 0) return null
    const roll = this.random()
    let cumulative = 0
    for (const option of usable) {
      cumulative += option.weight
      if (roll <= cumulative) return option
    }
    return usable[usable.length - 1]
  }

  /**
   * Whether the AI runs away this decision. Two table-driven ways in: a life
   * threshold ("Hurt State (Life % threshold)", "Run Away Life % Threshold") or
   * a plain "Run Away (% Chance)" that has nothing to do with life — the rogue
   * archers kite, and the tables say so.
   */
  private shouldFlee(): boolean {
    if (!this.canFlee || !this.canMove) return false
    const threshold = this.hurtThreshold
    if (threshold !== null && this.hpFraction <= threshold) return true
    const chance = findAiParam(this.ai, ['Run Away'], ['range', 'frames'])
    if (chance && chance.kind === 'chance') return this.random() * 100 <= chance.value
    return false
  }

  private wander(dt: number): BrainAction {
    if (!this.canMove) return this.action('none', 0, null, 'idle')
    this.wanderTimer -= dt
    if (this.wanderTimer > 0 && this.currentState === 'wander') {
      this.moveMode = 'walk'
      return this.action('walk', this.def.velocity * 0.6, null)
    }
    this.wanderTimer = 0.8 + this.random() * 2.2
    this.wanderAngle += (this.random() - 0.5) * Math.PI
    // The AI's own wander chance decides whether this space is a walk or a
    // pause: Fallen "Non-command Wander behavior (% Chance)", BloodHawk
    // "Wander behavior (% Chance)".
    const wanderChance =
      findAiParam(this.ai, ['Wander']) ?? findAiParam(this.ai, ['Walk Randomly'])
    if (wanderChance && wanderChance.kind === 'chance' && this.random() * 100 > wanderChance.value) {
      return this.action('none', 0, null, 'idle')
    }
    this.moveMode = 'walk'
    return this.action('walk', this.def.velocity * 0.6, null, 'wander')
  }

  private flee(): BrainAction {
    if (!this.canMove) return this.action('none', 0, null, 'idle')
    // Running needs the `mRN` animation; an Arach has none and walks away.
    this.moveMode = this.canRun ? 'run' : 'walk'
    return this.action(
      this.moveMode,
      this.moveMode === 'run' ? this.def.run : this.def.velocity,
      null,
      'flee',
    )
  }

  private action(
    movement: 'none' | 'walk' | 'run',
    speed: number,
    attack: BrainAction['attack'],
    state?: BrainState,
  ): BrainAction {
    if (state) this.currentState = state
    const castSkill =
      attack && attack.phase === 'fire' && attack.skill
        ? { skill: attack.skill, level: this.skillLevel(attack.skill) }
        : null
    return {
      state: this.currentState,
      mode: this.modeFor(this.currentState, movement),
      movement,
      speed,
      attack,
      castSkill,
      standoff: this.standoff,
      wanderAngle: this.currentState === 'wander' ? this.wanderAngle : null,
    }
  }

  private skillLevel(skill: string): number {
    const slot = this.def.skills.find((entry) => entry.skill === skill)
    return slot ? slot.level : 1
  }

  private modeFor(state: BrainState, movement: 'none' | 'walk' | 'run'): MonsterMode {
    switch (state) {
      case 'death':
        return 'DT'
      case 'dead':
        return 'DD'
      case 'hit-recovery':
        return 'GH'
      case 'flee':
      case 'wander':
      case 'approach':
        return movement === 'run' ? 'RN' : movement === 'walk' ? 'WL' : 'NU'
      case 'attack':
      case 'cast':
        return this.currentAttack ? this.currentAttack.mode : 'NU'
      default:
        return 'NU'
    }
  }
}

/**
 * Build a brain for a monster id and a difficulty, or null when the id is not
 * in the tables. Behaviour is level-independent in the tables — `aip` values
 * vary by difficulty but not by level — so scaling is a separate call.
 */
export function createMonsterBrain(
  tables: MonsterTables,
  id: string,
  options: BrainOptions = {},
): MonsterBrain | null {
  const def = tables.byId.get(id)
  return def ? new MonsterBrain(def, options) : null
}
