/**
 * Perry UI bridge — applies a `tw()` style record to a native Perry widget
 * by mapping each record key to the matching `perry_ui_*` FFI setter.
 *
 * This module is **Perry-only**: the `perry_ui_*` functions are ambient
 * declarations that the Perry compiler rewrites to native FFI calls at build
 * time (the same pattern `perry-styling` uses). Importing it in a browser or
 * Node context is harmless, but calling `applyTw` there will throw a
 * `ReferenceError` — it must run inside a Perry-compiled app.
 *
 * Colors are CSS strings in the record (`'#3B82F6'`, `'rgba(0,0,0,0.5)'`);
 * the bridge converts them to normalized RGBA channels in `[0, 1]` via
 * `parseColor`, the shape Perry's FFI setters expect.
 *
 * @example
 * ```ts
 * import { Text } from 'perry/ui'
 * import { applyTw } from '@rasenjs/tw/perry'
 *
 * const title = Text('Hello')
 * applyTw(title, 'text-xl font-bold text-blue-500')
 * ```
 */

import { parseColor } from './color'
import { tw } from './interpreter'
import type { TwStyle } from './types'

// ---------------------------------------------------------------------------
// Perry UI FFI declarations (rewritten to native calls by the compiler)
// ---------------------------------------------------------------------------

declare function perry_ui_widget_set_background_color(handle: number, r: number, g: number, b: number, a: number): void
declare function perry_ui_widget_set_corner_radius(handle: number, radius: number): void
declare function perry_ui_widget_set_border_color(handle: number, r: number, g: number, b: number, a: number): void
declare function perry_ui_widget_set_border_width(handle: number, width: number): void
declare function perry_ui_widget_set_edge_insets(handle: number, top: number, left: number, bottom: number, right: number): void
declare function perry_ui_widget_set_opacity(handle: number, alpha: number): void
declare function perry_ui_widget_set_shadow(
  handle: number,
  r: number,
  g: number,
  b: number,
  a: number,
  blur: number,
  offset_x: number,
  offset_y: number
): void
declare function perry_ui_widget_set_hidden(handle: number, hidden: number): void
declare function perry_ui_widget_set_enabled(handle: number, enabled: number): void
declare function perry_ui_widget_set_tooltip(handle: number, text: string): void
declare function perry_ui_widget_set_width(handle: number, width: number): void
declare function perry_ui_widget_set_height(handle: number, height: number): void

declare function perry_ui_text_set_color(handle: number, r: number, g: number, b: number, a: number): void
declare function perry_ui_text_set_font_size(handle: number, size: number): void
declare function perry_ui_text_set_font_weight(handle: number, size: number, weight: number): void
declare function perry_ui_text_set_font_family(handle: number, family: string): void

declare function perry_ui_button_set_text_color(handle: number, r: number, g: number, b: number, a: number): void
declare function perry_ui_button_set_bordered(handle: number, bordered: number): void

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rgba(css: string): [number, number, number, number] {
  const c = parseColor(css)
  if (!c) return [0, 0, 0, 1]
  return [c.r, c.g, c.b, c.a]
}

/** Convert a record width/height (number | string) to a numeric px value. */
function toPx(value: number | string | undefined): number | null {
  if (value === undefined) return null
  if (typeof value === 'number') return value
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** The widget kind — controls which text-color setter `color` maps to. */
export type PerryWidgetKind = 'text' | 'button'

/**
 * Apply a Tailwind-style class string to a native Perry widget.
 *
 * @param handle  - the widget handle returned by a `perry/ui` constructor.
 * @param classes - the class string, e.g. `'flex flex-col gap-2 bg-[#505050]'`.
 * @param kind    - `'text'` (default) routes `color`/fonts to the text
 *                  setters; `'button'` routes `color` to the button setter.
 */
export function applyTw(handle: number, classes: string, kind: PerryWidgetKind = 'text'): void {
  const s: TwStyle = tw(classes)

  if (s.backgroundColor) {
    const [r, g, b, a] = rgba(s.backgroundColor)
    perry_ui_widget_set_background_color(handle, r, g, b, a)
  }
  if (s.color) {
    const [r, g, b, a] = rgba(s.color)
    if (kind === 'button') perry_ui_button_set_text_color(handle, r, g, b, a)
    else perry_ui_text_set_color(handle, r, g, b, a)
  }
  if (s.borderColor) {
    const [r, g, b, a] = rgba(s.borderColor)
    perry_ui_widget_set_border_color(handle, r, g, b, a)
  }
  if (s.borderWidth !== undefined) {
    perry_ui_widget_set_border_width(handle, s.borderWidth)
    // Buttons also expose a native "bordered" flag.
    if (kind === 'button') perry_ui_button_set_bordered(handle, s.borderWidth > 0 ? 1 : 0)
  }
  if (s.borderRadius !== undefined) perry_ui_widget_set_corner_radius(handle, s.borderRadius)

  if (
    s.paddingTop !== undefined ||
    s.paddingRight !== undefined ||
    s.paddingBottom !== undefined ||
    s.paddingLeft !== undefined
  ) {
    perry_ui_widget_set_edge_insets(
      handle,
      s.paddingTop ?? 0,
      s.paddingLeft ?? 0,
      s.paddingBottom ?? 0,
      s.paddingRight ?? 0
    )
  }

  if (s.opacity !== undefined) perry_ui_widget_set_opacity(handle, s.opacity)

  if (s.shadowColor !== undefined || s.shadowBlur !== undefined) {
    const [r, g, b, a] = s.shadowColor ? rgba(s.shadowColor) : [0, 0, 0, 1]
    perry_ui_widget_set_shadow(handle, r, g, b, a, s.shadowBlur ?? 0, s.shadowOffsetX ?? 0, s.shadowOffsetY ?? 0)
  }

  if (s.fontSize !== undefined) perry_ui_text_set_font_size(handle, s.fontSize)
  if (s.fontWeight !== undefined) perry_ui_text_set_font_weight(handle, s.fontSize ?? 0, s.fontWeight)
  if (s.fontFamily) perry_ui_text_set_font_family(handle, s.fontFamily)

  if (s.display === 'none' || s.hidden === true) perry_ui_widget_set_hidden(handle, 1)
  if (s.enabled !== undefined) perry_ui_widget_set_enabled(handle, s.enabled ? 1 : 0)
  if (s.tooltip) perry_ui_widget_set_tooltip(handle, s.tooltip)

  const w = toPx(s.width)
  if (w !== null) perry_ui_widget_set_width(handle, w)
  const h = toPx(s.height)
  if (h !== null) perry_ui_widget_set_height(handle, h)
}

export { parseColor } from './color'
export type { RgbaColor } from './color'