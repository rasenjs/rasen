/**
 * Shared element-binding layer — the single implementation of "how a prop /
 * attribute / event / text value is written onto a DOM node", plus the
 * attribute classification that decides property-vs-attribute per tag+key.
 *
 * Both entry points consume this layer; they differ only in how the node is
 * acquired:
 *  - element factory (`components/element.ts`): document.createElement
 *  - compiled template (`template.ts`): cloneNode from a parsed skeleton
 *
 * NOT part of this module (kept separate by concern):
 *  - event delegation state machine → `event-delegation.ts`
 *    (`on()` here is the facade)
 *  - slot mounting primitives → `template.ts` (node-acquisition layer)
 *
 * Hydration contract:
 *  - DOM property writes ALWAYS apply on init (attributes already carry
 *    server values, but properties like input.value must be forced to
 *    client state so subsequent updates stay consistent).
 *  - Attribute writes SKIP the initial application while hydrating — the
 *    server-rendered markup is the source of truth for the first frame.
 */

import { getReactiveRuntime, isRef, type PropValue } from '@rasenjs/core'

// Re-exported for the compiler's single import source
// ('@rasenjs/dom/template' → bindings): generated SSR code references these.
export {
  escapeHtml,
  escapeAttr,
  renderText,
} from '@rasenjs/core'
export { configureEventDelegation } from './event-delegation'
import { setAttribute, watchProp, unref, watchObjectProps, setStyle } from './utils'
import { isHydrating } from './hydration-context'
import { attachEvent } from './event-delegation'

// ---------------------------------------------------------------------------
// Attribute classification — single source of truth shared by both entry
// points (element factory chain and compiled template primitives). Decides
// property-vs-attribute per tag+key and provides name mapping.
// ---------------------------------------------------------------------------

const TAG_SPECIFIC_PROPERTIES: Record<string, Set<string>> = {
  input: new Set(['value', 'checked', 'indeterminate']),
  textarea: new Set(['value']),
  select: new Set(['value', 'selectedIndex']),
  option: new Set(['selected']),
}

const COMMON_DOM_PROPERTIES = new Set([
  'disabled',
  'readOnly',
  'multiple',
  'hidden',
])

const lowerTagCache = new Map<string, string>()

function isDOMProperty(tag: string, key: string): boolean {
  let lowerTag = lowerTagCache.get(tag)
  if (lowerTag === undefined) {
    lowerTag = tag.toLowerCase()
    lowerTagCache.set(tag, lowerTag)
  }
  const tagProps = TAG_SPECIFIC_PROPERTIES[lowerTag]
  if (tagProps?.has(key)) return true
  return COMMON_DOM_PROPERTIES.has(key)
}

function camelToKebab(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

function needsKebabConversion(key: string): boolean {
  return key.startsWith('data') || key.startsWith('aria')
}

function getDOMAttrName(key: string): string {
  if (needsKebabConversion(key)) {
    return camelToKebab(key)
  }
  return key
}

/** 判断是否是事件处理器：onClick、onMouseEnter 等 */
export function isEventProp(key: string): boolean {
  if (!key.startsWith('on') || key.length < 3) return false
  const c = key.charCodeAt(2)
  return c >= 65 && c <= 90 // 'A' - 'Z'
}

/** onClick -> click；onMouseEnter -> mouseenter */
export function getEventName(key: string): string {
  return key.slice(2).toLowerCase()
}

// ---------------------------------------------------------------------------
// Value-kind dispatch (static vs reactive)
// ---------------------------------------------------------------------------

/** A prop value is reactive when it is a getter function or when the active
 *  reactive runtime brands it as a ref. Detection goes through the runtime's
 *  authoritative `isRef` — never structural duck-typing — so every adapter's
 *  ref flavor works and plain objects stay static. Single source of truth
 *  for both entry points (element factory passes raw props; compiled code
 *  passes getters). */
function isReactiveValue(v: unknown): boolean {
  return typeof v === 'function' || isRef(v)
}

const noop = () => {}

// HTML escaping / text semantics live in @rasenjs/core (shared with the
// html string renderer); re-exported below for the compiler's import source.

/** Normalize a reactive PropValue into a plain getter. dom's unref (= toValue)
 *  unwraps refs AND calls getters, so one wrapper covers both shapes. */
function toGetter<T>(value: PropValue<T>): () => T {
  return () => unref(value)
}

// ---------------------------------------------------------------------------
// One-time writes (static values)
// ---------------------------------------------------------------------------

/** One-time classified write: property vs attribute. See module hydration
 *  contract above for the property/attribute asymmetry. */
function setStaticProp(
  el: Element,
  tag: string,
  key: string,
  value: string | number | boolean
): void {
  if (isDOMProperty(tag, key)) {
    ;(el as unknown as Record<string, unknown>)[key] = value
    return
  }
  if (!isHydrating()) {
    setAttribute(el as HTMLElement, getDOMAttrName(key), value)
  }
}

// ---------------------------------------------------------------------------
// Reactive binds — one call per dynamic slot; each returns its stop function.
// Initial value is applied synchronously UNLESS hydrating (per contract).
// ---------------------------------------------------------------------------

/** Class binding — accepts a static string, a ref, or a getter.
 *  Static: written once, no watcher. Reactive: watched with redundant-write
 *  skip (unchanged class is not re-applied). */
export function bindClass(el: HTMLElement, value: PropValue<string>): () => void {
  if (!isReactiveValue(value)) {
    el.className = String(value || '')
    return noop
  }
  let current = ''
  return watchProp(
    toGetter(value),
    (v) => {
      const next = String(v || '')
      if (current !== next) {
        el.className = next
        current = next
      }
    },
    isHydrating()
  )
}

type StyleValue = string | number | null | undefined
export type StyleSource = string | Record<string, StyleValue>

function applyStyle(
  el: HTMLElement,
  v: StyleSource,
  prev: Record<string, unknown> | null
): Record<string, unknown> | null {
  const decl = el.style as unknown as Record<string, StyleValue>
  if (typeof v === 'string') {
    el.style.cssText = v
    return null
  }
  if (!v || typeof v !== 'object') {
    el.style.cssText = ''
    return null
  }
  // Remove keys that disappeared since the previous object
  if (prev) {
    for (const k in prev) {
      if (!(k in v)) decl[k] = ''
    }
  }
  for (const k in v) {
    decl[k] = v[k] ?? ''
  }
  return v
}

/** Style binding — accepts a css string, a camelCase-keyed object, or a
 *  ref/getter of either.
 *  Static string: cssText once. Static object: per-key watch via
 *  watchObjectProps (inner values may be refs). Reactive source: full-source
 *  watch with stale-key removal against the previous value. */
export function bindStyle(
  el: HTMLElement,
  value: PropValue<StyleSource>
): () => void {
  if (!isReactiveValue(value)) {
    if (typeof value === 'string') {
      el.style.cssText = value
      return noop
    }
    if (value && typeof value === 'object') {
      return watchObjectProps(
        value as Record<string, unknown>,
        (key, v) => {
          // setStyle converts camelCase keys and removes null values
          setStyle(el, { [key]: v } as Record<string, string | number>)
        },
        !isHydrating()
      )
    }
    return noop
  }
  const getter = toGetter(value)
  let prev: Record<string, unknown> | null = null
  if (!isHydrating()) prev = applyStyle(el, getter(), null)
  return getReactiveRuntime().watch(getter, (v) => {
    prev = applyStyle(el, v, prev)
  })
}

/** Reactive text binding on a node (a Text node handle).
 *  Semantics mirror the element factory's children handling: a ref getter
 *  stays reactive (watched, unref'd on each run); a plain value is written
 *  once and no watcher is created. Hydration skips the initial write in
 *  both cases (server-rendered text is already in the DOM). */
export function bindText(node: Node, getter: () => unknown): () => void {
  const runtime = getReactiveRuntime()
  const initial = getter()
  if (runtime.isRef(initial)) {
    const apply = () => {
      node.textContent = String(runtime.unref(initial))
    }
    if (!isHydrating()) apply()
    return runtime.watch(() => String(runtime.unref(initial)), apply)
  }
  if (!isHydrating()) node.textContent = String(initial)
  return () => {}
}

/** Reactive DOM property binding (value / checked / selected …).
 *  Properties are written directly, NOT via setAttribute, and always apply
 *  on init (see module hydration contract). */
export function bindProp(
  el: Element,
  key: string,
  getter: () => unknown
): () => void {
  const target = el as unknown as Record<string, unknown>
  return watchProp(
    getter,
    (v) => {
      target[key] = v
    },
    false
  )
}

/** Reactive attribute binding via the shared attribute writer (boolean /
 *  data-* aware). Skips initial application while hydrating. */
export function bindAttr(
  el: Element,
  name: string,
  getter: () => unknown
): () => void {
  return watchProp(
    getter,
    (v) => {
      setAttribute(el as HTMLElement, name, v as string | number | boolean | null | undefined)
    },
    isHydrating()
  )
}

/** Generic binding that dispatches property-vs-attribute by key using the
 *  shared classification, and static-vs-reactive by value kind:
 *  static → one-time classified write (setStaticProp semantics);
 *  reactive → property direct-write or attribute watch.
 *  Used by the element factory loop and by compiled code for cold keys. */
export function bindKey(
  el: Element,
  tag: string,
  key: string,
  value: PropValue<unknown>
): () => void {
  if (!isReactiveValue(value)) {
    setStaticProp(el, tag, key, value as string | number | boolean)
    return noop
  }
  const getter = toGetter(value as PropValue<unknown>)
  return isDOMProperty(tag, key)
    ? bindProp(el, key, getter)
    : bindAttr(el, key, getter)
}

/** Register an event listener; returns its removal function.
 *  Delegation mode (bubbling event types only): tags el with an eid and
 *  registers in the shared table — no per-element listener is created.
 *  Non-bubbling types and direct mode attach as usual. */
export function on(
  el: Element,
  event: string,
  handler: EventListenerOrEventListenerObject
): () => void {
  return attachEvent(el, event, handler)
}
