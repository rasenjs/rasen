/**
 * Treasure class resolution, driven by `treasureclassex.txt`.
 *
 * A treasure class is a weighted list of entries; an entry can be
 *
 * - another treasure class (`Act 1 Equip A`), which is descended into,
 * - a base item code (`hax`, `r01`, `gld,mul=1280`),
 * - or an *item type plus a level* (`weap3`), which the game expands into the
 *   base items of that type whose quality level falls in the three-level band
 *   ending at the number (`weap3` = levels 1–3, `weap6` = 4–6, …). That band is
 *   what makes the per-act lists (`weap6`, `weap9`, `weap12`…) cover every level
 *   exactly once.
 *
 * The quality of whatever falls out is decided by the items module, using the
 * `Unique`/`Set`/`Rare`/`Magic` columns of every class on the way down (the game
 * takes the best value seen, so an outer class can improve a whole branch).
 */

import {
  createRandom,
  makeItem,
  NO_QUALITY_FACTORS,
  tableNumber,
  type Item,
  type ItemIndex,
  type ItemTableRow,
  type QualityFactors,
  type Random,
} from './items'

/** One weighted entry of a treasure class. */
export interface TreasureClassEntry {
  readonly name: string
  /** The slot the entry sits in (`Item1`…`Item10`); its `Prob` shares the number. */
  readonly slot: number
  /** The probability as it stands without a monster level (see {@link classNumbers}). */
  readonly prob: number
}

export interface TreasureClass {
  readonly name: string
  /** `group` — classes sharing a group are interchangeable by monster level. */
  readonly group: number
  /** `level` — the monster level this class is picked at, when grouped. */
  readonly level: number
  /** `Picks`; negative means "guaranteed quantity". */
  readonly picks: number
  readonly noDrop: number
  /** The `Unique`/`Set`/`Rare`/`Magic` columns, zero when the class has none. */
  readonly factors: QualityFactors
  readonly entries: readonly TreasureClassEntry[]
  /** Sum of `Prob*`, the denominator a pick is rolled against. */
  readonly total: number
  /**
   * The row this class came from, or `null` for the item-type bands, which exist
   * only as references in the file. The row is kept so that a cell holding a calc
   * expression (`1/((mlvl-25)/20)`) can be evaluated with the monster level in
   * scope at roll time.
   */
  readonly row: ItemTableRow | null
}

/** The numbers of a class, evaluated for one monster level. */
export interface TreasureClassNumbers {
  readonly picks: number
  readonly noDrop: number
  readonly level: number
  readonly factors: QualityFactors
  /** One probability per entry, in `entries` order. */
  readonly probs: readonly number[]
  readonly total: number
}

/**
 * Evaluates a class's numeric columns, with the monster level in scope.
 *
 * The retail export holds plain integers in every one of these cells, so this is
 * normally a `parseInt` per column. The treasure class file *can* hold formulas
 * (`1/((mlvl-25)/20)`), which is why they go through the calc evaluator with
 * `mlvl` bound rather than `parseInt`, which would keep only the leading digits.
 */
export function classNumbers(
  treasureClass: TreasureClass,
  monsterLevel: number
): TreasureClassNumbers {
  const row = treasureClass.row
  if (row === null) {
    return {
      picks: treasureClass.picks,
      noDrop: treasureClass.noDrop,
      level: treasureClass.level,
      factors: treasureClass.factors,
      probs: treasureClass.entries.map((entry) => entry.prob),
      total: treasureClass.total,
    }
  }
  const context = { vars: { mlvl: monsterLevel, ilvl: monsterLevel, alvl: monsterLevel } }
  const number = (column: string): number => tableNumber(row[column] ?? null, context)
  const probs = treasureClass.entries.map((entry) => number(`Prob${entry.slot}`))
  let total = 0
  for (const prob of probs) total += prob
  return {
    picks: number('Picks') || treasureClass.picks,
    noDrop: number('NoDrop'),
    level: number('level'),
    factors: {
      unique: number('Unique'),
      set: number('Set'),
      rare: number('Rare'),
      magic: number('Magic'),
    },
    probs,
    total,
  }
}

export interface TreasureClassIndex {
  readonly classes: ReadonlyMap<string, TreasureClass>
  /**
   * Entry names that resolve to nothing — neither a class, nor an item-type band,
   * nor a base item. The retail tables have none; a non-empty set means the export
   * lost a table the classes refer to.
   */
  readonly unknownEntries: ReadonlySet<string>
  /**
   * The class a monster at `monsterLevel` uses: within the class's group, the
   * highest-level class that is not above the monster.
   */
  resolve(name: string, monsterLevel: number): string
}

export interface TreasureClassOptions {
  /**
   * No-drop scaling, `1 + (players - 1) / 2 + partyNear / 2`, the game's own
   * player-count exponent. 1 (the default) leaves `NoDrop` alone, i.e. one
   * player alone.
   */
  readonly playerExponent?: number
}

/**
 * The largest multiplier used to keep item-type probabilities integral.
 *
 * `rarity` is documented as "chance 1/#", so an item's weight is `1 / rarity`;
 * 60 is a common multiple of every value the column uses (1–5), which keeps the
 * ratios exact without floating point in the roll.
 */
const RARITY_SCALE = 60

/** The game drops at most this many items for one kill/drop event. */
export const MAX_DROPS = 6

function cell(row: ItemTableRow, column: string): string | null {
  return row[column] ?? null
}

function trimmed(value: string | null): string | null {
  if (value === null) return null
  const result = value.trim()
  return result === '' || result === '0' ? null : result
}

/** A `Prob*`/`NoDrop`/`Picks` cell. These are plain integers in the export. */
function integer(value: string | null): number {
  const text = trimmed(value)
  if (text === null) return 0
  const parsed = Number.parseInt(text, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

/** `gld,mul=1280` → code `gld`, gold multiplier 1280 (in 256ths). */
export function parseItemReference(reference: string): { code: string; goldMultiplier: number } {
  const [code, ...mods] = reference.split(',')
  let goldMultiplier = 256
  for (const mod of mods) {
    const [key, value] = mod.split('=')
    if (key === 'mul') {
      const parsed = Number.parseInt(value ?? '', 10)
      if (Number.isFinite(parsed) && parsed > 0) goldMultiplier = parsed
    }
  }
  return { code, goldMultiplier }
}

/**
 * Builds every treasure class, including the item-type ones the file only
 * implies.
 *
 * `treasureclassex.txt` names `weap3` and friends but has no row for them; they
 * are expanded here into real classes so that the walker has a single kind of
 * thing to descend into.
 */
export function createTreasureClasses(index: ItemIndex): TreasureClassIndex {
  const classes = new Map<string, TreasureClass>()
  const unresolvable = new Set<string>()

  for (const row of index.tables.treasureclassex) {
    const name = trimmed(cell(row, 'Treasure Class'))
    if (name === null) continue
    const entries: TreasureClassEntry[] = []
    let total = 0
    for (let slot = 1; slot <= 10; slot += 1) {
      const entry = trimmed(cell(row, `Item${slot}`))
      const rawProb = trimmed(cell(row, `Prob${slot}`))
      if (entry === null || rawProb === null) continue
      const prob = integer(rawProb)
      // A cell that is not a plain integer is a calc expression, whose real value
      // is only known once a monster level is in scope, so it is kept.
      if (prob <= 0 && /^[+-]?\d+$/.test(rawProb)) continue
      entries.push({ name: entry, slot, prob })
      total += prob
    }
    if (entries.length === 0 && integer(cell(row, 'NoDrop')) <= 0) continue
    classes.set(name, {
      name,
      group: integer(cell(row, 'group')),
      level: integer(cell(row, 'level')),
      picks: trimmed(cell(row, 'Picks')) === null ? 1 : integer(cell(row, 'Picks')),
      noDrop: integer(cell(row, 'NoDrop')),
      factors: {
        unique: integer(cell(row, 'Unique')),
        set: integer(cell(row, 'Set')),
        rare: integer(cell(row, 'Rare')),
        magic: integer(cell(row, 'Magic')),
      },
      entries,
      total,
      row,
    })
  }

  // Item-type classes: `weap3`, `armo6`, `mele12`, `bow15`, … Each covers the
  // three quality levels ending at its number, so the per-act lists tile the
  // whole range. Only the bands the file actually names are built, and a band
  // with no eligible item is built too — the tables name it, so it resolves to
  // "nothing drops" rather than to an unknown name.
  const bandNames = new Set<string>()
  for (const treasureClass of classes.values()) {
    for (const entry of treasureClass.entries) {
      const match = /^([a-z]+)(\d+)$/.exec(entry.name)
      if (match === null || index.bases.has(entry.name)) continue
      if (index.types.has(match[1])) bandNames.add(entry.name)
    }
  }
  for (const name of bandNames) {
    const match = /^([a-z]+)(\d+)$/.exec(name)
    if (match === null) continue
    const family = match[1]
    const band = Number.parseInt(match[2], 10)
    const candidates: TreasureClassEntry[] = []
    let total = 0
    for (const base of index.bases.values()) {
      if (!base.spawnable || base.quest) continue
      if (base.level <= band - 3 || base.level > band) continue
      if (!index.hasType(base.type, family)) continue
      // `rarity` is "chance 1/#", so it divides the weight.
      const prob = Math.max(1, Math.round(RARITY_SCALE / Math.max(1, base.rarity)))
      candidates.push({ name: base.code, slot: candidates.length + 1, prob })
      total += prob
    }
    classes.set(name, {
      name,
      group: 0,
      level: 0,
      picks: 1,
      noDrop: 0,
      factors: NO_QUALITY_FACTORS,
      entries: candidates,
      total,
      row: null,
    })
  }

  const byGroup = new Map<number, TreasureClass[]>()
  for (const treasureClass of classes.values()) {
    if (treasureClass.group === 0) continue
    const group = byGroup.get(treasureClass.group)
    if (group === undefined) byGroup.set(treasureClass.group, [treasureClass])
    else group.push(treasureClass)
  }

  // Every entry must resolve to a class, a base item or a named unique/set item;
  // the rest is reported instead of being dropped silently.
  for (const treasureClass of classes.values()) {
    for (const entry of treasureClass.entries) {
      if (classes.has(entry.name)) continue
      if (index.bases.has(parseItemReference(entry.name).code)) continue
      if (index.uniquesByName.has(entry.name)) continue
      if (index.setItemsByName.has(entry.name)) continue
      unresolvable.add(entry.name)
    }
  }

  return {
    classes,
    unknownEntries: unresolvable,
    resolve(name: string, monsterLevel: number): string {
      const treasureClass = classes.get(name)
      if (treasureClass === undefined || treasureClass.group === 0) return name
      let best = classNumbers(treasureClass, monsterLevel)
      let bestName = treasureClass.name
      for (const candidate of byGroup.get(treasureClass.group) ?? []) {
        // "Monsters … pick the Treasure Class that has a level value less than or
        // equal to the monster's level."
        const numbers = classNumbers(candidate, monsterLevel)
        if (numbers.level <= monsterLevel && numbers.level > best.level) {
          best = numbers
          bestName = candidate.name
        }
      }
      return bestName
    },
  }
}

/**
 * No-drop shrinks as more players are in the game.
 *
 * The formula is the game's (`D2`'s "player exponent" applied to the no-drop
 * share); with the default single-player exponent it returns `noDrop` unchanged.
 */
export function scaledNoDrop(noDrop: number, total: number, playerExponent: number): number {
  if (noDrop <= 0 || total <= 0 || playerExponent <= 1) return noDrop
  return Math.floor(total / Math.pow((noDrop + total) / noDrop, playerExponent) - 1)
}

export interface DropOptions {
  /** Player-count exponent; see {@link TreasureClassOptions}. */
  readonly playerExponent?: number
  /** Drop cap; the game's own limit is {@link MAX_DROPS}. */
  readonly maxItems?: number
  /** A floor for the item level, for callers that know better than the class. */
  readonly itemLevel?: number
}

interface DropState {
  readonly items: Item[]
  readonly maxItems: number
  /** Classes on the current path, so a cycle stops instead of recursing forever. */
  readonly path: Set<string>
}

export interface DropResolver {
  readonly index: ItemIndex
  readonly treasure: TreasureClassIndex
  /**
   * Rolls one treasure class.
   *
   * `monsterLevel` is used three ways: to pick the class within its group, as the
   * item level of what drops, and (through the item module) as the level the
   * affixes are filtered against. `magicFind` only affects the quality roll.
   */
  rollDrops(
    tcName: string,
    monsterLevel: number,
    magicFind: number,
    random: Random,
    options?: DropOptions
  ): Item[]
}

export interface DropResolverOptions {
  readonly index: ItemIndex
  readonly treasure?: TreasureClassIndex
}

export function createDropResolver(options: DropResolverOptions): DropResolver {
  const { index } = options
  const treasure = options.treasure ?? createTreasureClasses(index)

  const walk = (
    name: string,
    monsterLevel: number,
    magicFind: number,
    facts: QualityFactors,
    random: Random,
    state: DropState,
    settings: Required<Pick<DropOptions, 'playerExponent' | 'maxItems' | 'itemLevel'>>,
    depth: number
  ): void => {
    if (state.items.length >= state.maxItems || depth > 32) return
    if (state.path.has(name)) return
    const treasureClass = treasure.classes.get(name)
    if (treasureClass === undefined) {
      const reference = parseItemReference(name)
      const base = index.bases.get(reference.code)
      if (base !== undefined) {
        state.items.push(
          makeItem({
            index,
            random,
            ilvl: Math.max(monsterLevel, settings.itemLevel),
            code: reference.code,
            magicFind,
            factors: facts,
            goldMultiplier: reference.goldMultiplier,
          })
        )
        return
      }
      // D2R also lets a class name a unique or set item directly ("Annihilus",
      // "PreCrafted Cold Rupture"). Those entries force that exact item, which is
      // the only way to obtain them: their own level is above the level cap, so
      // they never come out of a random unique roll.
      const named = index.uniquesByName.get(name)
      if (named !== undefined) {
        state.items.push(
          makeItem({
            index,
            random,
            ilvl: Math.max(monsterLevel, settings.itemLevel),
            code: named.code,
            quality: 'unique',
            unique: named.name,
            magicFind,
            factors: facts,
          })
        )
        return
      }
      const namedSet = index.setItemsByName.get(name)
      if (namedSet !== undefined) {
        state.items.push(
          makeItem({
            index,
            random,
            ilvl: Math.max(monsterLevel, settings.itemLevel),
            code: namedSet.code,
            quality: 'set',
            setItem: namedSet.name,
            magicFind,
            factors: facts,
          })
        )
      }
      return
    }

    const numbers = classNumbers(treasureClass, monsterLevel)
    // The quality factors of every class on the way down are combined by taking
    // the best of each: a class that names no factors keeps its parent's.
    const merged: QualityFactors = {
      unique: Math.max(facts.unique, numbers.factors.unique),
      set: Math.max(facts.set, numbers.factors.set),
      rare: Math.max(facts.rare, numbers.factors.rare),
      magic: Math.max(facts.magic, numbers.factors.magic),
    }
    if (numbers.total <= 0 && numbers.noDrop <= 0) return

    state.path.add(name)
    if (numbers.picks < 0) {
      // Negative picks: the class owes |picks| items, and each entry's `Prob` is
      // now the *quantity* that entry contributes.
      let remaining = -numbers.picks
      for (const [position, entry] of treasureClass.entries.entries()) {
        const quantity = numbers.probs[position] ?? entry.prob
        for (let count = 0; count < quantity && remaining > 0; count += 1, remaining -= 1) {
          walk(entry.name, monsterLevel, magicFind, merged, random, state, settings, depth + 1)
          if (state.items.length >= state.maxItems) break
        }
        if (remaining <= 0 || state.items.length >= state.maxItems) break
      }
      state.path.delete(name)
      return
    }

    const noDrop = scaledNoDrop(numbers.noDrop, numbers.total, settings.playerExponent)
    for (let pick = 0; pick < numbers.picks; pick += 1) {
      if (state.items.length >= state.maxItems) break
      let roll = random.int(noDrop + numbers.total) - noDrop
      if (roll < 0) continue
      for (const [position, entry] of treasureClass.entries.entries()) {
        const prob = numbers.probs[position] ?? entry.prob
        if (roll < prob) {
          walk(entry.name, monsterLevel, magicFind, merged, random, state, settings, depth + 1)
          break
        }
        roll -= prob
      }
    }
    state.path.delete(name)
  }

  const rollDrops = (
    tcName: string,
    monsterLevel: number,
    magicFind: number,
    random: Random,
    options: DropOptions = {}
  ): Item[] => {
    const settings = {
      playerExponent: options.playerExponent ?? 1,
      maxItems: options.maxItems ?? MAX_DROPS,
      itemLevel: options.itemLevel ?? 0,
    }
    const state: DropState = { items: [], maxItems: settings.maxItems, path: new Set() }
    const root = treasure.resolve(tcName, monsterLevel)
    walk(
      root,
      monsterLevel,
      magicFind,
      NO_QUALITY_FACTORS,
      random,
      state,
      settings,
      0
    )
    return state.items
  }

  return { index, treasure, rollDrops }
}

/**
 * Rolls one treasure class without holding on to a resolver.
 *
 * The same call as {@link DropResolver.rollDrops} with the resolver passed last,
 * for callers that only need a single drop.
 */
export function rollDrops(
  tcName: string,
  monsterLevel: number,
  magicFind: number,
  random: Random,
  resolver: DropResolver,
  options: DropOptions = {}
): Item[] {
  return resolver.rollDrops(tcName, monsterLevel, magicFind, random, options)
}

/** Convenience for tests and tools: a resolver over a fresh seeded generator. */
export function createDropContext(
  index: ItemIndex,
  seed: number
): { resolver: DropResolver; random: Random } {
  return { resolver: createDropResolver({ index }), random: createRandom(seed) }
}
