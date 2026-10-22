/**
 * What a layout widget is, before any resolution happens.
 *
 * Deliberately the shape the game's own files use, with nothing added: a `type`,
 * a `name`, the `fields` bag and the ordered `children`. Everything the renderer
 * needs to know about a widget is in `fields`, and the field names are the
 * game's (`rect`, `anchor`, `filename`, `frames`, `rows`, `text`, `style`,
 * `fontType`, …), so a layout file can be read beside the code without a
 * translation table in between.
 */

/** A layout rectangle, in layout units — see `layout.ts` for the unit scale. */
export interface UiRect {
  x?: number
  y?: number
  width?: number
  height?: number
  /**
   * Extra multiplier on the drawn size. Rounded to a tenth when applied, because
   * the original does — the reason is in `layout.ts`.
   */
  scale?: number
}

/** A widget from a layout file. */
export interface UiWidget {
  type: string
  /** The game's name for the widget, e.g. `HealthBall`. Stable and unique per panel. */
  name: string
  fields: Readonly<Record<string, unknown>>
  children: readonly UiWidget[]
}

/** A field read as a number, or undefined when absent or not a number. */
export function fieldNumber(fields: Readonly<Record<string, unknown>>, key: string): number | undefined {
  const value = fields[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** A field read as a string, or undefined. */
export function fieldString(fields: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = fields[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** A field read as a boolean, with the game's numbers accepted as flags. */
export function fieldFlag(fields: Readonly<Record<string, unknown>>, key: string, fallback = false): boolean {
  const value = fields[key]
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  return fallback
}

/** A `{x, y}` field read as a pair. */
export function fieldPair(
  fields: Readonly<Record<string, unknown>>,
  key: string,
): { x: number; y: number } | undefined {
  const value = fields[key]
  if (value === null || typeof value !== 'object') return undefined
  const source = value as { x?: unknown; y?: unknown }
  if (typeof source.x !== 'number' && typeof source.y !== 'number') return undefined
  return {
    x: typeof source.x === 'number' ? source.x : 0,
    y: typeof source.y === 'number' ? source.y : 0,
  }
}

/**
 * The sprite a widget draws, as the layout names it.
 *
 * `fields.filename` is the game's own asset name — `PANEL/HUD_02/front_panel`,
 * with forward slashes and upper-case directories — not a path, which is why
 * resolving it to a file is a separate step (`ui/atlas.ts`).
 */
export function widgetFilename(widget: UiWidget): string | undefined {
  return fieldString(widget.fields, 'filename')
}

/**
 * The text a widget shows, if any.
 *
 * Four spellings, all of them real: `textString` is what a button carries
 * (`"textString": "@OptionsHD"`), `text` is what a text box carries,
 * `string` appears on list items, and `textTemplate` on the ones the game fills
 * in at runtime. A caption is a string-table key (`@…`) or literal text; telling
 * those apart is `ui/strings.ts`'s job, not this one's.
 */
export function widgetText(widget: UiWidget): string | undefined {
  return (
    fieldString(widget.fields, 'text') ??
    fieldString(widget.fields, 'textString') ??
    fieldString(widget.fields, 'string') ??
    fieldString(widget.fields, 'textTemplate')
  )
}

/** All widgets of one type, depth first. */
export function findByType(root: UiWidget, type: string): UiWidget[] {
  const out: UiWidget[] = []
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop() as UiWidget
    if (current.type === type) out.push(current)
    for (const child of current.children) stack.push(child)
  }
  return out
}

/** The first widget with this name, depth first, or undefined. */
export function findByName(root: UiWidget, name: string): UiWidget | undefined {
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop() as UiWidget
    if (current.name === name) return current
    for (const child of current.children) stack.push(child)
  }
  return undefined
}
