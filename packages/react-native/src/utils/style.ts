/**
 * Shared style helpers for @rasenjs/react-native components.
 *
 * RN components accept `style` as a plain object, an array, or a function
 * `(state) => style` (e.g. Pressable's `({ pressed }) => style`). These
 * helpers resolve such styles and apply them to an rn-dom node reactively.
 */

import { getReactiveRuntime } from '@rasenjs/core'
import type { RNNode } from '@rasenjs/rn-dom'

export type StyleValue = Record<string, unknown> | null | undefined

/**
 * Style prop: plain style object, array of them, or a function receiving the
 * component state (e.g. `({ pressed }) => style`).
 *
 * `S` is the state object passed to function styles — plain object styles are
 * always `Record<string, unknown>` so any RN style object is accepted.
 */
export type StyleProp<S extends object = Record<string, unknown>> =
  | Record<string, unknown>
  | ((state: S) => StyleValue)
  | Array<Record<string, unknown> | ((state: S) => StyleValue)>
  | null
  | undefined

/** Resolve a StyleProp into a plain style object for a given state. */
export function resolveStyle<S extends object>(
  style: StyleProp<S>,
  state: S,
): Record<string, unknown> {
  if (style == null) return {}
  const value = typeof style === 'function' ? style(state) : style
  if (Array.isArray(value)) {
    return Object.assign({}, ...value.filter(Boolean)) as Record<string, unknown>
  }
  return (value ?? {}) as Record<string, unknown>
}

/**
 * Apply a resolved style object to an rn-dom node, tracking previously-set
 * keys so they can be removed on re-apply (function styles may drop keys
 * between states).
 *
 * @returns a cleanup that clears the applied keys.
 */
export function applyStyleToNode(el: RNNode, style: Record<string, unknown>): () => void {
  const keys = Object.keys(style)
  for (const [k, v] of Object.entries(style)) {
    el.style.setProperty(k, v)
  }
  return () => {
    for (const k of keys) el.style.removeProperty(k)
  }
}

/**
 * Apply a StyleProp to an rn-dom node, keeping it reactive when the style is
 * a function (re-evaluated whenever its reactive deps change).
 *
 * @param getState - returns the state object passed to function styles
 *                   (e.g. `{ pressed }`). Its reactive reads are tracked.
 * @returns a cleanup that stops the watcher and clears applied keys.
 */
export function applyStyle<S extends object = Record<string, unknown>>(
  el: RNNode,
  style: StyleProp<S>,
  getState: () => S = () => ({}) as S,
): () => void {
  const runtime = getReactiveRuntime()

  const apply = (): void => {
    const resolved = resolveStyle(style, getState() as never)
    const current = el.style as unknown as { getPropertyValue(k: string): unknown }
    for (const k of Object.keys(resolved)) {
      if (current.getPropertyValue(k) !== resolved[k]) {
        el.style.setProperty(k, resolved[k])
      }
    }
  }

  apply()

  const stop = typeof style === 'function'
    ? runtime.watch(() => {
        // Touch reactive deps by resolving inside the watcher source.
        resolveStyle(style, getState() as never)
        return getState()
      }, apply)
    : null

  return () => {
    stop?.()
    // Clear every key we may have applied.
    const resolved = resolveStyle(style, getState() as never)
    for (const k of Object.keys(resolved)) el.style.removeProperty(k)
  }
}