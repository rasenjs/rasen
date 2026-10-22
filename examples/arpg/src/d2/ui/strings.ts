/**
 * The text a layout shows.
 *
 * A widget's `text`, `textString` or `textTemplate` is usually **not** the words:
 * it is a key into the game's own string tables, written with a leading `@` —
 * `@OptionsHD`, `@strGameCinematics`, `@strexitentiregame`,
 * `@MessageOfTheDayTitle`. All 8 of the keys the main menu uses live in
 * `strings_ui.json`, which is what the layouts' front end reads, so that table is
 * the default source.
 *
 * Anything without the `@` is literal text and is passed through, which matters
 * because the layouts mix the two (`"text": "Act 1"` sits beside
 * `"text": "@MessageOfTheDayTitle"`).
 *
 * An unknown key resolves to the key itself rather than to an empty string: a
 * missing table should be visible as `@OptionsHD` on screen, not as a blank
 * button that looks like a layout bug.
 */

import { tableString, type TableRow } from '../monsters'

/** A string-table key, as the layouts spell it. */
export const STRING_KEY_PREFIX = '@'

export interface UiStrings {
  /** Resolves a layout's text. Undefined stays undefined. */
  resolve(text: string | undefined): string | undefined
  /** False when the text named a table key that no table has. */
  has(text: string): boolean
  readonly keys: number
}

export interface UiStringsOptions {
  /** Language column; defaults to the table's English column. */
  language?: string
}

/** Builds the resolver from already-parsed tables. */
export function createUiStrings(
  tables: readonly (readonly TableRow[])[],
  options: UiStringsOptions = {},
): UiStrings {
  const language = options.language ?? 'enUS'
  const byKey = new Map<string, string>()
  for (const table of tables) {
    for (const row of table) {
      const key = tableString(row.Key)
      if (key === null || byKey.has(key)) continue
      const value = tableString(row[language]) ?? tableString(row.enUS)
      if (value !== null) byKey.set(key, value)
    }
  }

  return {
    resolve: (text: string | undefined): string | undefined => {
      if (text === undefined) return undefined
      if (!text.startsWith(STRING_KEY_PREFIX)) return text
      const key = text.slice(STRING_KEY_PREFIX.length)
      return byKey.get(key) ?? text
    },
    has: (text: string): boolean => {
      if (!text.startsWith(STRING_KEY_PREFIX)) return true
      return byKey.has(text.slice(STRING_KEY_PREFIX.length))
    },
    keys: byKey.size,
  }
}

/** A resolver that passes text through, for a build with no string tables. */
export function passthroughUiStrings(): UiStrings {
  return {
    resolve: (text: string | undefined): string | undefined => text,
    has: (text: string): boolean => !text.startsWith(STRING_KEY_PREFIX),
    keys: 0,
  }
}

/**
 * The tables a layout's captions actually come from, in precedence order.
 *
 * `strings_ui.json` alone is not enough, and the gap is visible rather than
 * theoretical: `bankexpansionlayouthd` writes `@stash`, `@gems` and `@runes` on its tab
 * bar, and those three keys are in **three different tables** — `strings_objects.json`
 * has `stash` and `stashRemoveOnly`, `strings_item-names.json` has `gems` and `runes`,
 * and only `personal`, `shared` and `materials` are in the UI table. Reading one table
 * left the stash panel captioned "@stash / @gems / @runes / @stashRemoveOnly" in the
 * running page while its neighbours read "Personal" and "Materials", which is how this
 * was found.
 *
 * Order is precedence: the first table to define a key wins, so the interface's own
 * table comes first and the others fill in what it does not name.
 */
export const UI_STRING_TABLES: readonly string[] = [
  'strings_ui.json',
  'strings_objects.json',
  'strings_item-names.json',
  'strings_item-gems.json',
  'strings_item-runes.json',
  'strings_item-modifiers.json',
  'strings_levels.json',
  'strings_monsters.json',
  'strings_npcs.json',
  'strings_skills.json',
  'strings_quests.json',
]

/** Fetches every table a layout's captions come from, pass-through when none is there. */
export async function loadUiStrings(
  base: string,
  options: UiStringsOptions = {},
): Promise<UiStrings> {
  try {
    const tables = await Promise.all(
      UI_STRING_TABLES.map(async (file) => {
        try {
          const response = await fetch(`${base}original/${file}`, { cache: 'no-store' })
          if (!response.ok) return [] as TableRow[]
          return (await response.json()) as TableRow[]
        } catch {
          return [] as TableRow[]
        }
      }),
    )
    if (tables.every((table) => table.length === 0)) return passthroughUiStrings()
    return createUiStrings(tables, options)
  } catch {
    return passthroughUiStrings()
  }
}
