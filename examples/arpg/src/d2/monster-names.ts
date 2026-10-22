/**
 * The name to put on a monster.
 *
 * `monstats.txt` carries `NameStr`, which is a key into the string tables rather
 * than a name, and for a good many rows it is the literal `Dummy`: the act 1
 * town guards are `rogue1`, whose `NameStr` is `Dummy`, and the act 2 merchants
 * are `act2vendor1` and friends with no name at all. The rows that do carry a
 * name put it in `strings_monsters` (`RogueScout` → "Rogue Scout") while the
 * town's characters put theirs in `strings_npcs` (`Gheed`, `Akara`, `Kashya`),
 * so both tables are needed.
 *
 * The lookup, in order:
 *
 * 1. `NameStr`, `MonStatsEx` and the id, each also tried with its trailing
 *    digits removed — the tables add a digit per act (`warriv1`, `cain1`) while
 *    the string keys spell the base name — against both tables, ignoring case.
 *    This is what names `rogue1` as "Rogue" and `cain1` as "Deckard Cain".
 * 2. `NameStr` itself, when it is readable rather than a placeholder. This is
 *    what names the act 5 statues "Ancient Statue 1".
 * 3. A formatting of the id: the act prefix dropped, the per-variant digits
 *    dropped, and the remainder title-cased. `act2guard1` becomes "Guard" and
 *    `chicken` becomes "Chicken".
 *
 * A caller that wants to know whether the game actually names a monster should
 * use {@link MonsterNames.named}, not compare against the fallback: the two are
 * different statements and only the tables can answer the first.
 *
 * When two string tables carry the same key the **first table passed wins**, so
 * the caller orders them by precedence; the NPC table is passed first because
 * its spellings are the ones the town's dialogue uses.
 */

import type { TableRow } from './monsters'

/** `NameStr` values the tables use to mean "no nameplate". */
const PLACEHOLDERS = new Set(['dummy', ''])

/** An `act<N>` prefix before a per-act id like `act2guard1`. */
const ACT_PREFIX = /^act\d+/

export interface MonsterNames {
  /** The name to display for a monster id. */
  of(monsterId: string): string
  /** False when the name is a formatting of the id rather than a retail name. */
  named(monsterId: string): boolean
  readonly known: number
}

/** A table row as `monstats.txt` exports it, or any row with a `Key`. */
function keysOf(rows: readonly TableRow[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const row of rows) {
    const key = row.Key
    if (typeof key !== 'string' || key === '') continue
    const value = row.enUS ?? row.Key
    if (typeof value !== 'string' || value === '') continue
    map.set(key.toLowerCase(), value)
  }
  return map
}

function stripDigits(value: string): string {
  return value.replace(/\d+$/, '')
}

/**
 * The spellings a row can be recognised by, most specific first.
 *
 * Exported for the verification tool, so the same list is what gets checked.
 */
export function nameForms(row: TableRow): string[] {
  const forms: string[] = []
  for (const raw of [row.NameStr, row.MonStatsEx, row.Id]) {
    if (typeof raw !== 'string' || raw === '') continue
    forms.push(raw)
    const trimmed = stripDigits(raw)
    if (trimmed !== '' && trimmed !== raw) forms.push(trimmed)
  }
  return forms
}

/** Title-cases an id so a fallback reads as a label rather than an identifier. */
function formatId(id: string): string {
  const withoutAct = id.replace(ACT_PREFIX, '')
  const withoutDigits = stripDigits(withoutAct)
  const words = withoutDigits
    // `ancientStatue` style ids are not used here, but `-` and `_` are.
    .split(/[-_\s]+/)
    .filter((word) => word !== '')
  if (words.length === 0) return id
  return words.map((word) => word[0].toUpperCase() + word.slice(1)).join(' ')
}

export function createMonsterNames(
  monsters: readonly TableRow[],
  stringTables: readonly (readonly TableRow[])[],
): MonsterNames {
  const strings = new Map<string, string>()
  for (const table of stringTables) {
    for (const [key, value] of keysOf(table)) {
      if (!strings.has(key)) strings.set(key, value)
    }
  }

  const rows = new Map<string, TableRow>()
  for (const row of monsters) {
    const id = row.Id
    if (typeof id === 'string' && id !== '') rows.set(id, row)
  }

  const display = new Map<string, string>()
  const fromTables = new Set<string>()

  // Resolved eagerly rather than on demand: 752 rows is nothing, and a count
  // that depends on which ids happen to have been asked for is a trap.
  for (const [id, row] of rows) {
    let name: string | null = null
    for (const form of nameForms(row)) {
      const found = strings.get(form.toLowerCase())
      if (found !== undefined) {
        name = found
        break
      }
    }
    if (name === null) {
      const raw = row.NameStr
      if (typeof raw === 'string' && !PLACEHOLDERS.has(raw.trim().toLowerCase())) name = raw
    }
    if (name !== null) {
      fromTables.add(id)
      display.set(id, name)
    }
  }

  return {
    of: (monsterId: string): string => display.get(monsterId) ?? formatId(monsterId),
    named: (monsterId: string): boolean => fromTables.has(monsterId),
    known: fromTables.size,
  }
}
