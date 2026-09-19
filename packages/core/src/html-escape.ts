/**
 * Shared HTML string utilities used by both render targets:
 *  - @rasenjs/dom (compiled SSR emitters, bindings)
 *  - @rasenjs/html (string renderer)
 *
 * No DOM access — safe in any environment. `renderText` consults the active
 * reactive runtime to unwrap a ref, which is itself host-agnostic.
 */

import { getReactiveRuntime, toValue } from './reactive'
import { camelToKebab } from './html-attributes'
import type { PropValue } from './types'

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Escape dynamic text content for SSR emission. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char] || char)
}

/** Escape dynamic attribute values for SSR emission. */
export function escapeAttr(value: string): string {
  return value.replace(/[&<>"]/g, (char) => HTML_ESCAPE_MAP[char] || char)
}

/** React-style text child semantics: null / undefined / booleans render as an
 *  empty string; everything else is stringified. Matches jsx-runtime's
 *  processChildren skipping rules so compiled output stays aligned with the
 *  factory chain.
 *
 *  A *ref* is unwrapped first, through the active runtime: `Ref` is an opaque
 *  placeholder whose shape the reactive adapter defines (Vue's `.value`, TC39
 *  Signals' `get()`, alien callables …), so the only legal read is the
 *  runtime's `isRef` / `unref` pair — see `reactive.ts`. Stringifying the ref
 *  object itself would yield "[object Object]".
 *
 *  Functions are deliberately NOT invoked: in a child position a function is a
 *  mountable, not a getter. */
export function renderText(value: unknown): string {
  if (value !== null && typeof value === 'object') {
    const runtime = getReactiveRuntime()
    if (runtime.isRef(value)) return renderText(runtime.unref(value))
  }
  if (value == null || typeof value === 'boolean') return ''
  return String(value)
}

/** Serialize a style object to an inline css string.
 *
 *  Keys are camelCase and converted to kebab-case. Values go through the same
 *  `PropValue` dispatch as any other prop: a style object may hold a ref or a
 *  getter **per declaration**, which is how a component binds one CSS property
 *  to a reactive value (`opacity: () => visible() ? '1' : '0'`). That is the
 *  contract `bindStyle` implements for the DOM renderer, so a string renderer
 *  that skipped it would emit the function source instead of a value.
 *
 *  Nullish values are omitted rather than serialized ("color: null"). */
export function stringifyStyleInline(styles: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(styles)) {
    const resolved = toValue(value as PropValue<unknown>)
    if (resolved === null || resolved === undefined) continue
    parts.push(`${camelToKebab(key)}: ${String(resolved)}`)
  }
  return parts.join('; ')
}
