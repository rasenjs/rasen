/**
 * `experience.txt` — the real levelling table.
 *
 * The app used to invent the curve (`90 * level^1.35`), which is a made-up shape
 * for the one number an action RPG is built around. The game ships the real thing:
 * a table whose rows are levels and whose columns are classes, plus the `ExpRatio`
 * that scales how much a monster's experience is worth.
 *
 * ```
 * Level, Amazon, Sorceress, Necromancer, Paladin, Barbarian, Druid, Assassin, Warlock, ExpRatio
 * MaxLvl, 99, 99, 99, 99, 99, 99, 99, 99, 10
 * 0,      0,  0,  0,  0,  0,  0,  0,  0,  1024
 * 1,      500, 500, …
 * 99,     3837739017, …
 * ```
 *
 * Three things about the table decide how it has to be read:
 *
 * 1. **The row labelled `MaxLvl` comes first and is not a level.** It carries the
 *    cap (99) in the class columns and the ratio `10`. It is a header row stored as
 *    data, which is the same quirk `charstats.txt` has with its `Expansion` row.
 * 2. **The values are absolute totals, not deltas.** Level 2 is 1500 total, so
 *    reaching level 2 from level 1 costs `1500 - 500`. The app's `xpToNext` wants
 *    the difference, so that is what {@link ExperienceTable.xpToNext} returns.
 * 3. **The class columns are identical in this build** — all eight hold the same
 *    numbers at every level — but the table is per class, so it is read per class
 *    rather than assuming the colum ns agree: a future build (or a mod) that
 *    differentiates them must not need this code changed. That the columns agree
 *    today is reported by the verification tool as a fact, not assumed here.
 *
 * `ExpRatio` is kept because it is the table's own answer to "how much experience
 * is a monster worth at this level"; it falls from 1024 at level 0 to 5 at level
 * 99, which is why a level-80 character killing a level-5 monster gains almost
 * nothing. The app does not use it yet — `Game.addXp` takes the monster's own `Exp`
 * — so it is exposed and documented rather than silently applied.
 */

import { tableNumber, tableString, type TableRow } from './monsters'

/** The level cap this build stores: the `MaxLvl` row's value. */
export interface ExperienceTable {
  /** `MaxLvl` for this build, 99 in retail. */
  readonly maxLevel: number
  /** The classes the table has columns for, in table order. */
  readonly classes: readonly string[]
  /**
   * Total experience needed to *be* a level, per class and level.
   *
   * Index 0 is level 0 (0 experience), so `total[level][classIndex]` is the
   * cumulative total, which is what the table stores.
   */
  totalFor(className: string, level: number): number
  /**
   * Experience to go from `level` to `level + 1`.
   *
   * The difference between the two cumulative totals, because that is what a
   * "next level" bar means. At the cap it returns 0, which is the signal that
   * there is nothing more to gain.
   */
  xpToNext(className: string, level: number): number
  /** `ExpRatio` at a level, the table's own experience-worth scale. */
  expRatio(level: number): number
  /**
   * The level a total experience puts a character at, capped.
   *
   * Used to place a hero whose experience came from a source other than this
   * table's own arithmetic — a save, a cheat, a test.
   */
  levelFor(className: string, total: number): number
}

/** The header row's label, which is not a level. */
const MAX_LEVEL_ROW = 'MaxLvl'

export function parseExperience(rows: readonly TableRow[]): ExperienceTable {
  let maxLevel = 0
  const classes: string[] = []
  // Per class, the cumulative total indexed by level. Built from the rows rather
  // than assumed rectangular, because the table's first row is a header.
  const totals = new Map<string, number[]>()
  const ratios: number[] = []

  for (const row of rows) {
    const label = tableString(row.Level)
    if (label === null) continue
    if (label === MAX_LEVEL_ROW) {
      // The cap sits in the first class column; take the largest so a build with
      // differing columns still reports a usable cap.
      for (const key of Object.keys(row)) {
        if (key === 'Level' || key === 'ExpRatio') continue
        const value = tableNumber(row[key])
        if (value !== null) maxLevel = Math.max(maxLevel, value)
      }
      continue
    }
    const level = Number(label)
    if (!Number.isFinite(level) || level < 0) continue
    for (const [key, value] of Object.entries(row)) {
      if (key === 'Level' || key === 'ExpRatio') continue
      const amount = tableNumber(value)
      if (amount === null) continue
      if (!classes.includes(key)) classes.push(key)
      const list = totals.get(key) ?? []
      list[level] = amount
      totals.set(key, list)
    }
    const ratio = tableNumber(row.ExpRatio)
    if (ratio !== null) ratios[level] = ratio
  }

  // A class the table left blank falls back to the first class that has data, which
  // is what a build that adds a class column without filling it would need.
  const fallback = classes.find((name) => (totals.get(name)?.length ?? 0) > 0) ?? ''
  const stated = maxLevel > 0 ? maxLevel : Math.max(0, ...[...totals.values()].map((list) => list.length - 1))
  /**
   * The highest level the rows actually carry.
   *
   * Lookups clamp to this rather than to `MaxLvl` because the two can disagree: a
   * truncated or partial export states 99 in its header row and then stops at level
   * 3, and clamping to 99 would answer 0 for everything above 3 — a levelling table
   * that claims the next level is free. In retail the two agree exactly, so this
   * changes nothing there.
   */
  let dataExtent = 0
  for (const list of totals.values()) {
    for (let index = list.length - 1; index >= 0; index -= 1) {
      if (list[index] !== undefined) {
        dataExtent = Math.max(dataExtent, index)
        break
      }
    }
  }
  const cap = Math.min(stated, dataExtent)

  const listFor = (className: string): number[] =>
    totals.get(className) ?? totals.get(fallback) ?? []

  const clamped = (level: number): number => Math.max(0, Math.min(cap, Math.floor(level)))

  const totalFor = (className: string, level: number): number => listFor(className)[clamped(level)] ?? 0

  return {
    maxLevel: cap,
    classes,
    totalFor,
    xpToNext: (className: string, level: number): number => {
      const current = clamped(level)
      if (current >= cap) return 0
      return Math.max(0, totalFor(className, current + 1) - totalFor(className, current))
    },
    expRatio: (level: number): number => ratios[clamped(level)] ?? 0,
    levelFor: (className: string, total: number): number => {
      const list = listFor(className)
      let level = 0
      for (let index = 0; index < list.length; index += 1) {
        if ((list[index] ?? 0) <= total) level = index
        else break
      }
      return Math.min(level, cap)
    },
  }
}

/**
 * The class column for a class name or its three-letter code.
 *
 * The table spells the classes out (`Amazon`, `Necromancer`) while the skill tables
 * use three-letter codes (`ama`, `nec`), which is the same split
 * `anim-art.ts`'s `classAnimCode` bridges for the animation tree. Kept local
 * because this module must not depend on the animation code just to spell a column.
 */
export function experienceClassOf(table: ExperienceTable, classNameOrCode: string): string {
  const key = classNameOrCode.trim().toLowerCase()
  for (const name of table.classes) {
    if (name.toLowerCase() === key) return name
    // A code is the first three letters for six of the eight classes; the two that
    // differ are listed because guessing them is what the animation table taught us
    // not to do.
    if (name.toLowerCase().slice(0, 3) === key) return name
  }
  const codes: Record<string, string> = { ass: 'Assassin', dru: 'Druid', war: 'Warlock', wiz: 'Warlock' }
  return codes[key] ?? table.classes[0] ?? ''
}
