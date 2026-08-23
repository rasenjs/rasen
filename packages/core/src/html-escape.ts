/**
 * Shared HTML string utilities used by both render targets:
 *  - @rasenjs/dom (compiled SSR emitters, bindings)
 *  - @rasenjs/html (string renderer)
 *
 * Pure string transforms — no DOM access, safe in any environment.
 */

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
 *  factory chain. */
export function renderText(value: unknown): string {
  if (value == null || typeof value === 'boolean') return ''
  return String(value)
}

/** Serialize a camelCase-keyed style object to an inline css string.
 *  Keys are converted to kebab-case; null/undefined values are skipped. */
export function stringifyStyleInline(styles: Record<string, unknown>): string {
  return Object.entries(styles)
    .map(([k, v]) =>
      k.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase() + ':' + v
    )
    .join(';')
}
