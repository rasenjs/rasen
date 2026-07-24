/**
 * @rasenjs/rn-dom — Shared utilities for Fabric DOM abstraction
 *
 * Provides CSS parsing, event name normalization, and other helpers
 * that are shared between rn-dom internals and framework adapters
 * (Vue renderer, etc.).
 */

// ============================================================================
// CSS string → object parser
// ============================================================================

export function parseCSS(css: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const decl of css.split(';')) {
    const colon = decl.indexOf(':')
    if (colon === -1) continue
    const key = decl.slice(0, colon).trim()
    const value = decl.slice(colon + 1).trim()
    if (!key || !value) continue
    const camelKey = key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    const num = Number(value)
    result[camelKey] = Number.isNaN(num) ? value : num
  }
  return result
}

// ============================================================================
// Event name normalization
// ============================================================================

const EVENT_ALIAS: Record<string, string> = {
  onclick: 'onTouchEnd',
  ontouchend: 'onTouchEnd',
  ontouchstart: 'onTouchStart',
  ontouchmove: 'onTouchMove',
  ontouchcancel: 'onTouchCancel',
  oninput: 'onChange',
}

/**
 * Normalize a Vue/HTML event name to RN convention (onXxx).
 *
 * Examples:
 *   'click'       → 'onTouchEnd'
 *   'onclick'     → 'onTouchEnd'
 *   'onTouchEnd'  → 'onTouchEnd' (passthrough)
 *   '@input'      → 'onChange'
 */
export function normalizeEventName(key: string): string {
  const lower = key.toLowerCase()
  if (EVENT_ALIAS[lower]) return EVENT_ALIAS[lower]
  if (key.startsWith('on:')) {
    const event = key.slice(3)
    return 'on' + event.charAt(0).toUpperCase() + event.slice(1)
  }
  if (key.charCodeAt(0) === 111 /* o */ && key.charCodeAt(1) === 110 /* n */) {
    return key.slice(0, 2) + key.charAt(2).toUpperCase() + key.slice(3)
  }
  return key
}

/** Check if a string looks like a Vue event binding (starts with "on") */
export const isEvent = (key: string): boolean =>
  key.length > 2 &&
  key.charCodeAt(0) === 111 /* o */ &&
  key.charCodeAt(1) === 110 /* n */

/**
 * Apply style patch to an element by diffing prev/next style objects.
 *
 * @param setProperty - function to set a style property on the element
 * @param removeProperty - function to remove a style property from the element
 * @param prev - previous style value (string or object)
 * @param next - next style value (string or object)
 */
export function applyStylePatch(
  setProperty: (key: string, value: unknown) => void,
  removeProperty: (key: string) => void,
  prev: string | Record<string, unknown> | null,
  next: string | Record<string, unknown> | null,
): void {
  if (prev) {
    const prevObj = typeof prev === 'string' ? parseCSS(prev) : prev
    for (const key of Object.keys(prevObj)) {
      removeProperty(key)
    }
  }
  if (next) {
    const nextObj = typeof next === 'string' ? parseCSS(next) : next
    for (const [key, value] of Object.entries(nextObj)) {
      setProperty(key, value)
    }
  }
}
