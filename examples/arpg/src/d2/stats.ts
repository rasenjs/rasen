/**
 * The stat system, built on `itemstatcost.txt` and `charstats.txt`.
 *
 * Every number a Diablo II character has — strength, life, defence, resistances,
 * "X% Enhanced Damage" — is a *stat*, and every stat's behaviour is described by
 * one row of `itemstatcost.txt`. The row says how the stat is stored on the wire
 * (`Save Bits`, `Save Add`), which other stats its value feeds (`op`, `op base`,
 * `op stat1..3`) and how it is written out in an item tooltip (`descfunc`,
 * `descstrpos`, `descstrneg`).
 *
 * ## Why `op` is the whole ballgame
 *
 * A stat is not just a number, because the same number means different things
 * depending on which stat it is attached to. `item_armor_percent` with value 200
 * is not "+200 defence", it is "+200% *of the base defence*", and that is
 * expressed by `op = 13` plus `op stat1 = armorclass`. `vitality` with value 5 is
 * not five of anything on its own: `op = 9`, `op stat1 = maxhp`,
 * `op stat2 = maxstamina` mean five points of vitality feed hit points at the
 * class's life-per-vitality rate. The actual op codes present in the exported
 * table were enumerated rather than guessed:
 *
 * | op | rows | meaning                              | where the value goes |
 * | -- | ---- | ------------------------------------ | -------------------- |
 * | —  | 283  | no operation (a plain stat)          | flat add             |
 * | 1  | 2    | add                                  | flat add             |
 * | 2  | 34   | add, value already per level         | flat add             |
 * | 3  | 0    | percent of the running total         | total percent        |
 * | 4  | 2    | add, per level (`op base`, `op param`)| flat add            |
 * | 5  | 2    | percent of base, per level           | base percent         |
 * | 6  | 34   | as 2, for "…by time" stats           | flat add             |
 * | 7  | 2    | as 5, for "…by time" stats           | base percent         |
 * | 8  | 1    | attribute feed: `energy` → `maxmana` | attribute link       |
 * | 9  | 1    | attribute feed: `vitality` → `maxhp`, `maxstamina` | attribute link |
 * | 11 | 2    | percent of base (`item_maxhp_percent`) | base percent       |
 * | 13 | 5    | percent of base (`item_armor_percent`) | base percent       |
 *
 * So a {@link StatSet} keeps four layers per stat — `base`, `add`, `basePercent`
 * and `totalPercent` — plus the attribute links, and derives the value the game
 * reads:
 *
 * ```
 * ownBase    = base + Σ rate × total(attribute)          // op 8/9 and per-level rows
 * ownPercent = basePercent + Σ rate × total(level)       // per-level percentages, op 5/7
 * total      = (ownBase + ownBase × ownPercent/100 + add) × (1 + totalPercent/100)
 * ```
 *
 * Keeping the layers apart matters because they answer different questions: a
 * tooltip wants the flat `add` ("+40 to Life"), while combat wants `total`.
 *
 * `apply` also folds a modifier into the stats its row names in `op stat1..3`, so
 * `item_armor_percent = 200` raises `armorclass` by 200% of its base rather than
 * sitting inert on a stat nothing reads. The per-level rows (`op param`,
 * `op base`) are divided by their parameter and multiplied by the stat in
 * `op base`, which is `level` for every row that has both.
 *
 * Two rows disagree with their own names: `skill_staminapercent` and
 * `skill_passive_staminapercent` say "percent" but carry `op 1`, which is a plain
 * addition. The op code wins here, because the mod's own `item_maxhp_percent`
 * family uses `op 11` for exactly that percentage behaviour — so the tables
 * clearly distinguish the two, and a reader chasing strange stamina numbers
 * should look at those two rows first.
 *
 * One caveat is worth stating plainly. The tables say *that* `item_maxhp_percent`
 * is a percentage of the base; they do not say whether the original folds
 * "+X to Life" into that base or not. This implementation treats base as the
 * character's own value (attributes and levels) and leaves item flat additions in
 * the `add` layer, which is why `op = 3` exists separately for
 * "percent of everything" effects such as Battle Orders.
 *
 * ## Character stats
 *
 * `charstats.txt` is one row per class and holds exactly what a level-N character
 * needs: the starting attribute values and the per-level and per-point growth
 * rates. {@link createCharacterStats} turns a row plus a level and an attribute
 * allocation into a populated {@link StatSet}, so a level-90 Sorceress has
 * thousands of life rather than an invented constant.
 *
 * ## Tooltips
 *
 * The `descstrpos`/`descstrneg` keys resolve against the exported string tables
 * (`strings_item-modifiers.json` holds the `ModStr*` keys), and the templates
 * already carry their own printf-style placeholders (`%+d to Strength`,
 * `%d%% Chance to cast level %d %s on striking`). {@link describeStat} picks the
 * positive or negative variant, fills the placeholders per `descfunc`, and
 * returns the line an item tooltip would show.
 */

/* -------------------------------------------------------------------------- */
/* Stat definitions                                                           */
/* -------------------------------------------------------------------------- */

/** A row of `itemstatcost.txt` as it appears in `table_itemstatcost.json`. */
export type StatRow = Readonly<Record<string, string | null>>

/** How a stat's value is combined with the stats it feeds. */
export type StatAccumulation =
  | 'add'
  | 'base-percent'
  | 'total-percent'
  | 'attribute'

/** One parsed `itemstatcost.txt` row. */
export interface StatDef {
  /** The `*ID` column: the index the original uses for this stat. */
  readonly id: number
  /** The `Stat` column, lower case (`item_armor_percent`). */
  readonly name: string
  /** True for `item_*`/`skill_*` stats, i.e. the ones that appear on gear. */
  readonly itemStat: boolean
  readonly op: number
  readonly accumulation: StatAccumulation
  /** Divisor/detail of the operation; 0 when absent. */
  readonly opParam: number
  /** The stat whose value the operation is relative to (`level` for per-level stats). */
  readonly opBase: string | null
  /** The stats this stat's value is folded into. */
  readonly opStats: readonly string[]
  readonly saveBits: number | null
  readonly saveAdd: number | null
  readonly saveParamBits: number | null
  /**
   * `ValShift`: the item property list stores `value >> valShift`, and the reader
   * shifts it back. Only `maxhp` and `maxmana` are non-zero (8) in the shipped
   * table — the in-memory value keeps the eight fraction bits, the file does not.
   */
  readonly valShift: number
  /**
   * `CSvBits`: the width of this stat in a save's `gf` list, and the reason a
   * save holds fewer stats than the character has. Zero means the stat is never
   * saved — experience and the level-derived stats are rebuilt on load instead.
   */
  readonly csvBits: number
  /** `CSvParam`: width of the `gf` list's param field for this stat, 0 for most. */
  readonly csvParam: number
  /** `CSvSigned`: how the `gf` list clamps a `csvBits`-wide value. */
  readonly csvSigned: boolean
  readonly encode: number | null
  readonly sendBits: number | null
  readonly signed: boolean
  readonly direct: boolean
  readonly minAccr: number | null
  readonly maxStat: string | null
  readonly damageRelated: boolean
  readonly descFunc: number | null
  readonly descVal: number | null
  readonly descPriority: number | null
  readonly descStrPos: string | null
  readonly descStrNeg: string | null
  readonly descStr2: string | null
}

function text(row: StatRow, column: string): string | null {
  const value = row[column]
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function integer(row: StatRow, column: string): number | null {
  const value = text(row, column)
  if (value === null) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function flag(row: StatRow, column: string): boolean {
  return integer(row, column) === 1
}

/**
 * Maps an `op` code onto the layer it feeds.
 *
 * Unknown codes fall back to a flat add, which is the game's own default and is
 * never *wrong* in the sense of losing the number.
 */
export function accumulationOf(op: number): StatAccumulation {
  switch (op) {
    case 3:
      return 'total-percent'
    case 5:
    case 7:
    case 11:
    case 13:
      return 'base-percent'
    case 8:
    case 9:
      return 'attribute'
    default:
      return 'add'
  }
}

/** Parses one `itemstatcost.txt` row. */
export function parseStatRow(row: StatRow): StatDef | null {
  const name = text(row, 'Stat')
  if (!name) return null
  const id = integer(row, '*ID') ?? 0
  const op = integer(row, 'op') ?? 0
  const opStats = [
    text(row, 'op stat1'),
    text(row, 'op stat2'),
    text(row, 'op stat3')
  ]
    .filter((stat): stat is string => stat !== null)
    .map((stat) => stat.toLowerCase())
  const lowerName = name.toLowerCase()
  return {
    id,
    name: lowerName,
    itemStat: lowerName.startsWith('item_') || lowerName.startsWith('skill_'),
    op,
    accumulation: accumulationOf(op),
    opParam: integer(row, 'op param') ?? 0,
    opBase: text(row, 'op base')?.toLowerCase() ?? null,
    opStats,
    saveBits: integer(row, 'Save Bits'),
    saveAdd: integer(row, 'Save Add'),
    saveParamBits: integer(row, 'Save Param Bits'),
    valShift: integer(row, 'ValShift') ?? 0,
    csvBits: integer(row, 'CSvBits') ?? 0,
    csvParam: integer(row, 'CSvParam') ?? 0,
    csvSigned: flag(row, 'CSvSigned'),
    encode: integer(row, 'Encode'),
    sendBits: integer(row, 'Send Bits'),
    signed: flag(row, 'Signed'),
    direct: flag(row, 'direct'),
    minAccr: integer(row, 'MinAccr'),
    maxStat: text(row, 'maxstat')?.toLowerCase() ?? null,
    damageRelated: flag(row, 'damagerelated'),
    descFunc: integer(row, 'descfunc'),
    descVal: integer(row, 'descval'),
    descPriority: integer(row, 'descpriority'),
    descStrPos: text(row, 'descstrpos'),
    descStrNeg: text(row, 'descstrneg'),
    descStr2: text(row, 'descstr2')
  }
}

/** The parsed `itemstatcost.txt`. */
export class StatTable {
  private readonly byName = new Map<string, StatDef>()
  private readonly byId = new Map<number, StatDef>()
  private readonly order: StatDef[] = []

  constructor(defs: readonly StatDef[]) {
    for (const def of defs) {
      if (!this.byName.has(def.name)) this.byName.set(def.name, def)
      if (!this.byId.has(def.id)) this.byId.set(def.id, def)
      this.order.push(def)
    }
  }

  /** Every definition, in table order. */
  get defs(): readonly StatDef[] {
    return this.order
  }

  /** Looks a stat up by name (`maxhp`) or by `*ID`. */
  get(stat: string | number): StatDef | null {
    if (typeof stat === 'number') return this.byId.get(stat) ?? null
    return this.byName.get(stat.toLowerCase()) ?? null
  }

  has(stat: string | number): boolean {
    return this.get(stat) !== null
  }

  /** All definitions carrying the given operation code. */
  withOperation(op: number): readonly StatDef[] {
    return this.order.filter((def) => def.op === op)
  }
}

/** Parses the rows of `table_itemstatcost.json`. */
export function parseStatTable(rows: readonly StatRow[]): StatTable {
  const defs: StatDef[] = []
  for (const row of rows) {
    const def = parseStatRow(row)
    if (def) defs.push(def)
  }
  return new StatTable(defs)
}

/* -------------------------------------------------------------------------- */
/* Stat set                                                                   */
/* -------------------------------------------------------------------------- */

/** The four layers a stat's value can arrive in. */
export interface StatLayers {
  /** The character's or item's own value. */
  readonly base: number
  /** Flat additions from modifiers. */
  readonly add: number
  /** Percentages applied to `base`. */
  readonly basePercent: number
  /** Percentages applied to the whole value. */
  readonly totalPercent: number
}

/** A derived dependency: `rate × total(from)` is added to `to`'s base. */
export interface StatLink {
  readonly from: string
  readonly to: string
  readonly rate: number
  /** When set, the contribution is a percentage of `to`'s base rather than a flat amount. */
  readonly percent?: boolean
}

export interface StatSetOptions {
  /** The stat definitions; without one every stat is a plain additive stat. */
  readonly table?: StatTable
  /**
   * Per-point rates for attribute feeds (`op` 8/9), i.e. `maxhp → LifePerVitality`.
   * A target with no rate receives nothing from its attribute.
   */
  readonly attributeRates?: Readonly<Record<string, number>>
  /** Extra derived dependencies, e.g. attack rating following dexterity. */
  readonly links?: readonly StatLink[]
  /** Called for every stat name the table does not know. */
  readonly onUnknownStat?: (name: string, value: number) => void
}

const EMPTY_LAYERS: StatLayers = {
  base: 0,
  add: 0,
  basePercent: 0,
  totalPercent: 0
}

/**
 * An accumulated set of stats.
 *
 * Adding a value goes through the stat's `op` so that "+200% enhanced defence"
 * lands in the right layer without the caller having to know which layer that is;
 * `apply` is therefore the method items and skills should use. The explicit
 * `addFlat`/`addPercentOfBase`/`addPercentOfTotal` variants exist for callers that
 * already know the layer, which is what the calc-driven `aurastat`/`passivestat`
 * columns mostly are.
 */
export class StatSet {
  private readonly table: StatTable | undefined
  private readonly onUnknownStat:
    | ((name: string, value: number) => void)
    | undefined
  private readonly layersByName = new Map<
    string,
    { base: number; add: number; basePercent: number; totalPercent: number }
  >()
  private readonly links: StatLink[] = []
  private readonly linkByTarget = new Map<string, StatLink[]>()
  private readonly totals = new Map<string, number>()
  private readonly resolving = new Set<string>()

  constructor(options: StatSetOptions = {}) {
    this.table = options.table
    this.onUnknownStat = options.onUnknownStat
    for (const link of options.links ?? []) this.addLink(link)
    for (const def of this.table?.withOperation(8) ?? [])
      this.linkAttribute(def, options.attributeRates)
    for (const def of this.table?.withOperation(9) ?? [])
      this.linkAttribute(def, options.attributeRates)
  }

  private linkAttribute(
    def: StatDef,
    rates: Readonly<Record<string, number>> | undefined
  ): void {
    for (const target of def.opStats) {
      const rate = rates?.[target]
      if (rate === undefined || rate === 0) continue
      this.addLink({ from: def.name, to: target, rate })
    }
  }

  /** Registers a derived dependency. */
  addLink(link: StatLink): void {
    const existing = this.linkByTarget.get(link.to)
    if (existing) existing.push(link)
    else this.linkByTarget.set(link.to, [link])
    this.links.push(link)
    this.invalidate()
  }

  private invalidate(): void {
    this.totals.clear()
  }

  private layersOf(name: string): {
    base: number
    add: number
    basePercent: number
    totalPercent: number
  } {
    const key = name.toLowerCase()
    let layers = this.layersByName.get(key)
    if (!layers) {
      layers = { base: 0, add: 0, basePercent: 0, totalPercent: 0 }
      this.layersByName.set(key, layers)
    }
    return layers
  }

  /** Declares a stat's own value, replacing any previous base. */
  setBase(name: string, value: number): this {
    this.layersOf(name).base = value
    this.invalidate()
    return this
  }

  /** Adds to a stat's own value. */
  addBase(name: string, value: number): this {
    this.layersOf(name).base += value
    this.invalidate()
    return this
  }

  /** Adds a flat modifier. */
  addFlat(name: string, value: number): this {
    this.layersOf(name).add += value
    this.invalidate()
    return this
  }

  /** Adds a percentage that applies to the stat's base. */
  addPercentOfBase(name: string, percent: number): this {
    this.layersOf(name).basePercent += percent
    this.invalidate()
    return this
  }

  /** Adds a percentage that applies to the stat's whole value. */
  addPercentOfTotal(name: string, percent: number): this {
    this.layersOf(name).totalPercent += percent
    this.invalidate()
    return this
  }

  /**
   * Applies a modifier the way the game would, using the stat's own `op`.
   *
   * This is the entry point for item, affix, aura and passive values. The
   * modifier's own stat stays readable — `stat('item_pierce_cold_immunity'.accr)`
   * is used by the summoning skills — and its value is additionally folded into
   * every stat the row lists in `op stat1..3`, in the layer the operation names:
   *
   * - `+40 to Life` (`maxhp`, no op) lands in `add`;
   * - `+30% Enhanced Defence` (`item_armor_percent`, op 13) reaches `armorclass`
   *   as a percentage of *its* base;
   * - `+5 to Vitality` (op 9) reaches life through the class's per-point rate;
   * - `item_hp_perlevel` (op 2, `op param 3`, `op base level`) reaches life
   *   divided by its parameter and multiplied by the `level` stat. A set that has
   *   no `level` therefore contributes nothing for a per-level modifier, which is
   *   the honest answer: the effect depends on the wearer.
   */
  apply(name: string, value: number): this {
    if (value === 0) return this
    const key = name.toLowerCase()
    const def = this.table?.get(key) ?? null
    if (!def) {
      this.onUnknownStat?.(key, value)
      this.addFlat(key, value)
      return this
    }
    // The modifier's own stat stays readable; `stat('item_pierce_cold_immunity'.accr)`
    // is read by every summoning skill.
    this.addFlat(key, value)
    if (def.accumulation === 'attribute' || def.opStats.length === 0)
      return this

    const operand = value / (def.opParam > 1 ? def.opParam : 1)
    const percent = def.accumulation === 'base-percent'
    if (def.opBase !== null) {
      // A level-scaled row is a derived link rather than a baked-in number, so
      // that the effect follows the wearer's level and the order in which the
      // level and the modifier arrive does not matter. Every such row in the
      // table is either a flat add or a percentage of the base; none combines
      // `op base` with the unused `op 3`.
      for (const target of def.opStats) {
        this.addLink({ from: def.opBase, to: target, rate: operand, percent })
      }
      return this
    }
    for (const target of def.opStats) {
      if (percent) this.addPercentOfBase(target, operand)
      else if (def.accumulation === 'total-percent') {
        this.addPercentOfTotal(target, operand)
      } else this.addFlat(target, operand)
    }
    return this
  }

  /** Applies a sequence of modifiers. */
  applyAll(entries: Iterable<readonly [string, number]>): this {
    for (const [name, value] of entries) this.apply(name, value)
    return this
  }

  /** True when anything at all has been recorded for the stat. */
  has(name: string): boolean {
    return this.layersByName.has(name.toLowerCase())
  }

  /** The raw layers recorded for a stat. */
  layers(name: string): StatLayers {
    return this.layersByName.get(name.toLowerCase()) ?? EMPTY_LAYERS
  }

  /** The value the game reads. */
  get(name: string): number {
    const key = name.toLowerCase()
    const cached = this.totals.get(key)
    if (cached !== undefined) return cached
    if (this.resolving.has(key)) return 0

    this.resolving.add(key)
    // Reading a stat must not create it, otherwise `names()` would list every
    // stat any calculator ever asked about.
    const layers = this.layersByName.get(key) ?? EMPTY_LAYERS
    let ownBase = layers.base
    let ownBasePercent = layers.basePercent
    for (const link of this.linkByTarget.get(key) ?? []) {
      const contribution = link.rate * this.get(link.from)
      if (link.percent) ownBasePercent += contribution
      else ownBase += contribution
    }
    const withBasePercent = ownBase + (ownBase * ownBasePercent) / 100
    const total =
      (withBasePercent + layers.add) * (1 + layers.totalPercent / 100)
    this.resolving.delete(key)
    if (total !== 0 || this.linkByTarget.has(key)) this.totals.set(key, total)
    return total
  }

  /**
   * Reads a stat through a `stat('name'.field)` accessor.
   *
   * `accr` (accumulated) is the value the game's calculators use and is what the
   * tables ask for; `base` and `add` expose the layers.
   */
  getField(name: string, field: string): number {
    switch (field.toLowerCase()) {
      case 'base':
        return this.layers(name).base
      case 'add':
      case 'mod':
        return this.layers(name).add
      case 'percent':
        return this.layers(name).basePercent
      default:
        return this.get(name)
    }
  }

  /** Every stat with a non-zero value. */
  snapshot(): Record<string, number> {
    const result: Record<string, number> = {}
    for (const name of this.names()) {
      const value = this.get(name)
      if (value !== 0) result[name] = value
    }
    return result
  }

  /** Every stat that has been given a value, in insertion order. */
  names(): readonly string[] {
    return [...this.layersByName.keys()]
  }

  /** The derived dependencies currently registered. */
  get statLinks(): readonly StatLink[] {
    return this.links
  }

  /** Builds the calc context view of this set. */
  statResolver(): (reference: { name: string; field: string }) => number {
    return (reference) => this.getField(reference.name, reference.field)
  }

  /**
   * Resolves a *bare* stat name for the calc language.
   *
   * Expressions such as `min(edmn,95)` name stats directly, and this is where a
   * stat set plugs in. A stat the set has never been told about resolves to
   * `undefined` rather than `0`, so the evaluator can report the missing name
   * instead of silently reading a zero.
   */
  variableResolver(): (name: string) => number | undefined {
    return (name) => (this.has(name) ? this.get(name) : undefined)
  }
}

/* -------------------------------------------------------------------------- */
/* Character stats                                                            */
/* -------------------------------------------------------------------------- */

/** The four attribute names as `charstats.txt` spells them. */
export type AttributeName = 'strength' | 'dexterity' | 'energy' | 'vitality'

/** One row of `charstats.txt`. */
export interface CharStatsRow {
  readonly charClass: string
  /**
   * False for the `Expansion` marker row, which `charstats.txt` carries (as
   * `playerclass.txt` does) with no attribute values at all.
   */
  readonly playable: boolean
  readonly strength: number
  readonly dexterity: number
  /** `charstats.txt` calls this `int`; the stat table calls it `energy`. */
  readonly energy: number
  readonly vitality: number
  readonly stamina: number
  /** The flat life every character starts with. */
  readonly hpAdd: number
  readonly manaRegen: number
  readonly toHitFactor: number
  readonly lifePerLevel: number
  readonly staminaPerLevel: number
  readonly manaPerLevel: number
  readonly lifePerVitality: number
  readonly staminaPerVitality: number
  readonly manaPerMagic: number
  readonly statPerLevel: number
  readonly skillsPerLevel: number
  readonly lightRadius: number
  readonly blockFactor: number
  readonly startSkill: string | null
  /** The `Skill 1..10` columns, in order. */
  readonly skills: readonly string[]
}

/** The parsed `charstats.txt`. */
export class CharStatsTable {
  private readonly rows = new Map<string, CharStatsRow>()

  constructor(rows: readonly CharStatsRow[]) {
    for (const row of rows) this.rows.set(row.charClass.toLowerCase(), row)
  }

  get(charClass: string): CharStatsRow | null {
    return this.rows.get(charClass.toLowerCase()) ?? null
  }

  /** Every playable class, in table order. */
  names(): readonly string[] {
    return [...this.rows.values()]
      .filter((row) => row.playable)
      .map((row) => row.charClass)
  }

  /** Every row in the table, including the `Expansion` marker. */
  get all(): readonly CharStatsRow[] {
    return [...this.rows.values()]
  }
}

/** Parses the rows of `table_charstats.json`. */
export function parseCharStats(rows: readonly StatRow[]): CharStatsTable {
  const parsed: CharStatsRow[] = []
  for (const row of rows) {
    const charClass = text(row, 'class')
    if (!charClass) continue
    const skills: string[] = []
    for (let index = 1; index <= 10; index += 1) {
      const skill = text(row, `Skill ${index}`) ?? text(row, `Skill${index}`)
      if (skill) skills.push(skill)
    }
    const strength = integer(row, 'str') ?? 0
    const dexterity = integer(row, 'dex') ?? 0
    const energy = integer(row, 'int') ?? 0
    const vitality = integer(row, 'vit') ?? 0
    parsed.push({
      charClass,
      playable: strength + dexterity + energy + vitality > 0,
      strength,
      dexterity,
      energy,
      vitality,
      stamina: integer(row, 'stamina') ?? 0,
      hpAdd: integer(row, 'hpadd') ?? 0,
      manaRegen: integer(row, 'ManaRegen') ?? 0,
      toHitFactor: integer(row, 'ToHitFactor') ?? 0,
      lifePerLevel: integer(row, 'LifePerLevel') ?? 0,
      staminaPerLevel: integer(row, 'StaminaPerLevel') ?? 0,
      manaPerLevel: integer(row, 'ManaPerLevel') ?? 0,
      lifePerVitality: integer(row, 'LifePerVitality') ?? 0,
      staminaPerVitality: integer(row, 'StaminaPerVitality') ?? 0,
      manaPerMagic: integer(row, 'ManaPerMagic') ?? 0,
      statPerLevel: integer(row, 'StatPerLevel') ?? 0,
      skillsPerLevel: integer(row, 'SkillsPerLevel') ?? 0,
      lightRadius: integer(row, 'LightRadius') ?? 0,
      blockFactor: integer(row, 'BlockFactor') ?? 0,
      startSkill: text(row, 'StartSkill'),
      skills
    })
  }
  return new CharStatsTable(parsed)
}

export interface CharacterStatsOptions {
  readonly table?: StatTable
  /** Attribute points to spend, on top of the class's starting values. */
  readonly allocation?: Partial<Record<AttributeName, number>>
  readonly onUnknownStat?: (name: string, value: number) => void
}

/**
 * Builds the stat set of a level-`level` character of one class.
 *
 * The life/mana/stamina numbers come from three places, all of them the class's
 * own row: the flat `hpadd`/`stamina` starting values, the per-level growth
 * (`LifePerLevel` and friends × levels gained), and the per-attribute rates
 * (`LifePerVitality` and friends), which reach the derived stats through the
 * `op`-8/9 links in `itemstatcost.txt` — the same mechanism an item's "+5 to
 * Vitality" uses, so both paths agree.
 */
export function createCharacterStats(
  charClass: CharStatsRow,
  level: number,
  options: CharacterStatsOptions = {}
): StatSet {
  const levels = Math.max(0, Math.floor(level) - 1)
  const allocation = options.allocation ?? {}
  const rates: Record<string, number> = {
    maxhp: charClass.lifePerVitality,
    maxstamina: charClass.staminaPerVitality,
    maxmana: charClass.manaPerMagic
  }
  const set = new StatSet({
    table: options.table,
    attributeRates: rates,
    onUnknownStat: options.onUnknownStat,
    links: [
      // Attack rating is the one character number the tables do not give a
      // formula for: `charstats.txt` carries the per-class `ToHitFactor` but not
      // how it is used. The documented formula — five per point of dexterity,
      // minus the 35-point constant, plus the class factor — is what is modelled
      // here; it is the reason a naked Sorceress has ~75 attack rating rather
      // than a negative number.
      { from: 'dexterity', to: 'tohit', rate: 5 }
    ]
  })

  set.setBase('level', level)
  set.setBase('strength', charClass.strength + (allocation.strength ?? 0))
  set.setBase('dexterity', charClass.dexterity + (allocation.dexterity ?? 0))
  set.setBase('energy', charClass.energy + (allocation.energy ?? 0))
  set.setBase('vitality', charClass.vitality + (allocation.vitality ?? 0))

  set.setBase('maxhp', charClass.hpAdd + charClass.lifePerLevel * levels)
  set.setBase(
    'maxstamina',
    charClass.stamina + charClass.staminaPerLevel * levels
  )
  set.setBase('maxmana', charClass.manaPerLevel * levels)
  set.setBase('statpts', charClass.statPerLevel * levels)
  set.setBase('newskills', charClass.skillsPerLevel * levels)
  set.setBase('lightradius', charClass.lightRadius)
  set.setBase('tohit', charClass.toHitFactor - 35)

  return set
}

/* -------------------------------------------------------------------------- */
/* Description strings                                                        */
/* -------------------------------------------------------------------------- */

/** A localized string table, keyed by the game's string key (`ModStr1a`). */
export interface StringTable {
  get(key: string): string | undefined
}

/** Rows of `strings_*.json`, which carry one column per locale. */
export type StringRow = Readonly<Record<string, string | number | null>>

/** Builds a {@link StringTable} from exported string rows. */
export function parseStringTable(
  rows: readonly StringRow[],
  locale = 'enUS'
): StringTable {
  const values = new Map<string, string>()
  for (const row of rows) {
    const key = row['Key']
    if (typeof key !== 'string' || key === '') continue
    const value = row[locale]
    if (typeof value === 'string' && value !== '') values.set(key, value)
  }
  return {
    get: (key: string): string | undefined => values.get(key)
  }
}

/**
 * Formats one of the game's description templates.
 *
 * The templates are printf-like but not exactly printf: `%+d` and `%d` for
 * integers, `%.2f` for fractions, `%s` for names, `%%` for a literal percent, and
 * `%0`/`%1` for positional arguments (the "Reanimate as" line uses those).
 */
export function formatStatTemplate(
  template: string,
  args: readonly (string | number)[]
): string {
  let next = 0
  const take = (): string | number => {
    const value = args[next] ?? ''
    next += 1
    return value
  }
  return template.replace(
    /%([+]?(?:\d+)?(?:\.\d+)?)[dsifu]|%(\d+)|%%/g,
    (
      match,
      specifier: string | undefined,
      position: string | undefined
    ): string => {
      if (match === '%%') return '%'
      if (position !== undefined) {
        const index = Number.parseInt(position, 10)
        return String(args[index] ?? '')
      }
      const value = take()
      if (typeof value === 'string')
        return specifier?.endsWith('s') ? value : value
      if (specifier !== undefined && specifier.includes('.')) {
        const precision = Number.parseInt(specifier.split('.')[1], 10)
        return value.toFixed(Number.isFinite(precision) ? precision : 0)
      }
      const rounded = Math.round(value)
      if (specifier !== undefined && specifier.startsWith('+')) {
        return rounded >= 0 ? `+${rounded}` : String(rounded)
      }
      return String(rounded)
    }
  )
}

export interface DescribeStatOptions {
  /** Localized strings; without one the stat name is used as a fallback. */
  readonly strings?: StringTable
  /**
   * Extra arguments for the descfuncs that need them, in template order: skill
   * name, class name, monster type, charge counts.
   */
  readonly args?: readonly (string | number)[]
}

/**
 * The descfuncs whose templates expect more than the stat's own value.
 *
 * `options.args` supplies those extras in template order after the value — the
 * skill name for "Level %d %s Aura When Equipped", the charge counts for
 * "(%d/%d Charges)", and so on. Templates whose extras come from the item's
 * param rather than from the stat's value cannot be filled without an item, so
 * they fall back to the text with the placeholders the caller did supply.
 */
function extraArguments(
  func: number,
  options: DescribeStatOptions
): readonly (string | number)[] {
  const args = options.args ?? []
  switch (func) {
    // "%d%% Chance to cast level %d %s …" – skill level, skill name.
    case 15:
      return [args[0] ?? 0, args[1] ?? '']
    // "Level %d %s Aura When Equipped" – skill name.
    case 16:
      return [args[0] ?? '']
    // "Level %d %s (%d/%d Charges)" – skill name, charges, maximum charges.
    case 24:
      return [args[0] ?? '', args[1] ?? 0, args[2] ?? 0]
    // "%0%% Reanimate as: %1" – positional, so the monster name is the second
    // argument of the same list.
    case 23:
      return [args[0] ?? '']
    // "%+d to <class> <skill>"
    case 27:
      return [args[0] ?? '', args[1] ?? '']
    // "%+d to <skill>"
    case 28:
      return [args[0] ?? '']
    default:
      return []
  }
}

/**
 * Chooses the template and the value to put in it.
 *
 * `descstrneg` exists for stats whose text changes with the sign — "Replenish
 * Life %+d" becomes "Drain Life %d", "Physical Damage Received Reduced by %d%%"
 * becomes "…Increased by %d%%". When the two templates are the same string (the
 * common case) the sign belongs in the number and `%+d` prints it; when they
 * differ, the negative template carries the sign in its wording and takes the
 * magnitude.
 */
function templateFor(
  def: StatDef,
  value: number
): { template: string | null; magnitude: boolean } {
  if (
    value < 0 &&
    def.descStrNeg !== null &&
    def.descStrNeg !== def.descStrPos
  ) {
    return { template: def.descStrNeg, magnitude: true }
  }
  const template = def.descStrPos ?? def.descStrNeg
  return { template, magnitude: false }
}

/**
 * Renders one stat the way an item tooltip would.
 *
 * The positive or negative template is chosen by the value's sign, the value is
 * made absolute for the negative template (the game has separate strings for
 * "Replenish Life %+d" and "Drain Life %d"), and the placeholders are filled
 * according to `descfunc`.
 *
 * `descval` is parsed but does not change the output: in the exported table the
 * only values it takes are `0` and `2`, on stats whose templates already decide
 * where the number goes.
 */
export function describeStat(
  table: StatTable,
  stat: string | number,
  value: number,
  options: DescribeStatOptions = {}
): string {
  const def = table.get(stat)
  if (!def) {
    const label = typeof stat === 'number' ? `#${stat}` : stat
    return `${label} ${value}`
  }
  const { template, magnitude } = templateFor(def, value)
  const resolved =
    template === null ? undefined : options.strings?.get(template)
  const shown = magnitude ? Math.abs(value) : value
  const args = [shown, ...extraArguments(def.descFunc ?? 0, options)]
  if (resolved === undefined) {
    // No string table loaded (the export may not include one): say the same thing
    // with the stat's own name rather than rendering a bare key.
    return `${def.name} ${value}`
  }
  return formatStatTemplate(resolved, args)
}

/**
 * Describes the *modifiers* a set carries, most valuable line first.
 *
 * This is a tooltip, not a character sheet: `+40 to Life` on a ring is the `add`
 * layer of `maxhp`, while the sheet would show the derived total. Asking a set
 * for its totals is `set.get('maxhp')`.
 */
export function describeStatSet(
  table: StatTable,
  set: StatSet,
  options: DescribeStatOptions = {}
): readonly string[] {
  return [...set.names()]
    .map((name) => ({ name, def: table.get(name) }))
    .sort(
      (left, right) =>
        (right.def?.descPriority ?? 0) - (left.def?.descPriority ?? 0)
    )
    .map(({ name }) => describeStat(table, name, set.layers(name).add, options))
    .filter((line) => line !== '')
}

/* -------------------------------------------------------------------------- */
/* Loading                                                                    */
/* -------------------------------------------------------------------------- */

async function fetchRows(
  base: string,
  file: string
): Promise<readonly StatRow[] | null> {
  try {
    const response = await fetch(`${base}original/${file}`, {
      cache: 'no-store'
    })
    if (!response.ok) return null
    return (await response.json()) as readonly StatRow[]
  } catch {
    // A missing export means the game runs on its built-in content instead.
    return null
  }
}

/** Loads `itemstatcost.txt` from the extracted tables. Returns `null` when absent. */
export async function loadStatTable(base: string): Promise<StatTable | null> {
  const rows = await fetchRows(base, 'table_itemstatcost.json')
  return rows ? parseStatTable(rows) : null
}

/** Loads `charstats.txt` from the extracted tables. Returns `null` when absent. */
export async function loadCharStats(
  base: string
): Promise<CharStatsTable | null> {
  const rows = await fetchRows(base, 'table_charstats.json')
  return rows ? parseCharStats(rows) : null
}

/** Loads a localized string table, e.g. `strings_item-modifiers.json`. */
export async function loadStringTable(
  base: string,
  file: string,
  locale = 'enUS'
): Promise<StringTable | null> {
  const rows = await fetchRows(base, file)
  return rows ? parseStringTable(rows, locale) : null
}
