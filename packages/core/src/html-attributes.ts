/**
 * Shared HTML attribute conventions — the single definition of how a prop key
 * becomes an attribute name, and how a value becomes an attribute string.
 *
 * Both render targets must agree. The same component tree is emitted as markup
 * on the server and written onto live elements in the browser; a rule that
 * exists twice drifts, and the drift shows up as markup that changes the moment
 * it hydrates.
 *
 *  - `@rasenjs/dom`  → `setAttribute` / `bindKey` (writes onto an element)
 *  - `@rasenjs/html` → the string renderer (concatenates markup)
 *
 * No DOM access here — pure string rules, safe in any environment.
 */

/** `ariaChecked` → `aria-checked`, `flexDirection` → `flex-direction`.
 *  Keys that are already kebab-case pass through unchanged. */
export function camelToKebab(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

/** Attribute name for a prop key.
 *
 *  `aria*` / `data*` are camelCase in source (`ariaChecked`) but kebab-case as
 *  attributes (`aria-checked`). Other keys are written as they are: both the
 *  DOM API and the HTML parser lowercase attribute names, so `tabIndex` and
 *  `tabindex` address the same attribute. */
export function getAttrName(key: string): string {
  return key.startsWith('data') || key.startsWith('aria')
    ? camelToKebab(key)
    : key
}

/** `onClick` → true; `once` / `only` → false (no uppercase third character).
 *  Guards against treating an ordinary attribute as an event handler. */
export function isEventProp(key: string): boolean {
  if (!key.startsWith('on') || key.length < 3) return false
  const c = key.charCodeAt(2)
  return c >= 65 && c <= 90
}

/** `onClick` → `click`, `onMouseEnter` → `mouseenter`. */
export function getEventName(key: string): string {
  return key.slice(2).toLowerCase()
}

/**
 * The attribute string for a value, or `null` when the attribute must not be
 * written at all.
 *
 * Expects an already-normalized attribute name (`getAttrName`), because the
 * `data-*` rule is decided on the name.
 *
 * Contract, identical on both targets:
 *  - `null` / `undefined`     → absent
 *  - boolean on `data-*`      → `"true"` / `"false"` (the value is data, not a flag)
 *  - boolean elsewhere        → `true` present and empty, `false` absent
 *  - anything else            → `String(value)`
 *
 * Returns `''` for a present-but-empty attribute, which is why the absent case
 * is `null` rather than an empty string.
 */
export function attrValue(name: string, value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') {
    if (name.startsWith('data-')) return String(value)
    return value ? '' : null
  }
  return String(value)
}
