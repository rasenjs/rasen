/**
 * Unified element factory for Lynx
 *
 * Single `element()` function creating any Lynx element, analogous to
 * `element()` in @rasenjs/react-native but backed directly by the Lynx
 * Element PAPIs — no intermediate DOM shim.
 *
 * @example
 * ```ts
 * import { element } from '@rasenjs/lynx'
 * import { ref } from '@vue/reactivity'
 *
 * const count = ref(0)
 *
 * const App = () => element('view', {
 *   style: { flex: '1', justifyContent: 'center' },
 *   children: [
 *     element('text', { style: { fontSize: '24px' }, children: count }),
 *     element('view', {
 *       style: () => ({ backgroundColor: count.value > 5 ? 'red' : 'blue' }),
 *       bindTap: () => count.value++,
 *       children: [element('text', { children: 'Tap me' })],
 *     }),
 *   ],
 * })
 * ```
 */

import type { HostHooks, Mountable, PropValue, Ref } from '@rasenjs/core'
import { getReactiveRuntime, toValue } from '@rasenjs/core'
import type { LynxNode } from './node'
import { createElementNode, createRawTextNode, mountNode, unmountNode } from './node'
import { lynxHostHooks } from './host-hooks'
import * as papi from './papi'

// ── Types ────────────────────────────────────────────────────────────────

export type LynxChild =
  | string
  | number
  | Mountable<LynxNode>
  | Ref<unknown>
  | (() => string | number)
  | null
  | undefined

export interface LynxElementProps {
  /** Inline styles; camelCase keys are converted to kebab-case */
  style?:
    | Record<string, string | number>
    | Ref<Record<string, string | number>>
    | (() => Record<string, string | number>)
  class?: PropValue<string>
  /** Alias of `class` */
  className?: PropValue<string>
  id?: PropValue<string>
  /** Static data-* attributes */
  dataset?: Record<string, string>
  children?: LynxChild | LynxChild[]
  /** Event props: bindTap / catchTap / onTap (shorthand for bindTap), ... */
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** camelCase → kebab-case ('fontSize' → 'font-size') */
function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
}

interface EventBinding {
  eventName: string
  handler: (event: unknown) => void
}

/**
 * Parse `bindXxx`, `catchXxx` and `onXxx` props into event bindings.
 * The remainder must start uppercase ('bindTap'), so ordinary attributes
 * such as `once` are never mistaken for events.
 */
function parseEventProp(key: string, value: unknown): EventBinding | null {
  if (typeof value !== 'function') return null
  let eventType: 'bindEvent' | 'catchEvent' | null = null
  let rest = ''
  if (key.startsWith('bind') && /^[A-Z]/.test(key.slice(4))) {
    eventType = 'bindEvent'
    rest = key.slice(4)
  } else if (key.startsWith('catch') && /^[A-Z]/.test(key.slice(5))) {
    eventType = 'catchEvent'
    rest = key.slice(5)
  } else if (key.startsWith('on') && /^[A-Z]/.test(key.slice(2))) {
    eventType = 'bindEvent'
    rest = key.slice(2)
  }
  if (eventType === null) return null
  // Lynx event names are all-lowercase ('tap', 'longpress', 'touchstart', ...)
  const eventName = rest.toLowerCase()
  return { eventName, handler: value as (event: unknown) => void }
}

/** Apply a style record as one inline-styles write */
function applyStyles(el: papi.LynxElement, style: Record<string, string | number>): void {
  const record: Record<string, string> = {}
  for (const [k, v] of Object.entries(style)) {
    record[kebab(k)] = String(v)
  }
  papi.setInlineStyles(el, record)
}

// ── Children ─────────────────────────────────────────────────────────────

/**
 * Render children into a parent node.
 * Returns cleanup functions to be called on unmount.
 *
 * Function children are disambiguated by their return value: primitives
 * mean a reactive text getter, anything else means a Mountable component.
 *
 * @internal Shared by `element()` and higher-level components.
 */
export function renderChildren(
  parent: LynxNode,
  children: LynxChild | LynxChild[],
  hooks: HostHooks<LynxNode>
): (() => void)[] {
  const runtime = getReactiveRuntime()
  const unmounts: (() => void)[] = []
  const list = Array.isArray(children) ? children : [children]

  const mountReactiveText = (source: () => string | number, initial: string): void => {
    const textNode = createRawTextNode(initial)
    mountNode(parent, textNode, null)
    const stop = runtime.subscribe(source, (v) => {
      if (textNode.el !== null) papi.setAttribute(textNode.el, 'text', String(v))
      papi.scheduleFlush()
    })
    unmounts.push(() => {
      stop()
      unmountNode(textNode)
    })
  }

  for (const child of list) {
    if (child == null) continue

    if (typeof child === 'string' || typeof child === 'number') {
      const textNode = createRawTextNode(String(child))
      mountNode(parent, textNode, null)
      unmounts.push(() => unmountNode(textNode))
    } else if (typeof child === 'function') {
      // Could be a Mountable or a reactive text getter — decide by result
      const result = (child as Mountable<LynxNode>)(parent, hooks)
      if (typeof result === 'string' || typeof result === 'number') {
        mountReactiveText(child as () => string | number, String(result))
      } else if (result) {
        unmounts.push(result)
      }
    } else if (runtime.isRef(child)) {
      mountReactiveText(
        () => String(runtime.unref(child)),
        String(runtime.unref(child))
      )
    }
  }

  return unmounts
}

// ── Element factory ──────────────────────────────────────────────────────

/**
 * Create a Rasen element for any Lynx tag.
 *
 * @param tagName - Lynx element tag ('view', 'text', 'image', 'scroll-view',
 *                  or any custom element tag)
 * @param props - style / class / id / dataset / events / attributes / children
 * @returns Mountable function
 */
export function element(
  tagName: string,
  props: LynxElementProps = {}
): Mountable<LynxNode> {
  return (host: LynxNode, incomingHooks?: HostHooks<LynxNode>) => {
    const hooks = incomingHooks ?? lynxHostHooks
    const runtime = getReactiveRuntime()

    const node = createElementNode(tagName)
    mountNode(host, node, null)
    if (node.el === null) return undefined
    const el = node.el

    const cleanups: (() => void)[] = []
    const {
      children,
      style: styleProp,
      class: classProp,
      className,
      id,
      dataset,
      ...rest
    } = props

    /** Subscribe to a reactive prop source (getter or ref) */
    const bindProp = <T>(
      source: Ref<T> | (() => T),
      apply: (next: T) => void,
      initial: T
    ): void => {
      apply(initial)
      cleanups.push(runtime.subscribe(source as () => T, apply))
    }

    // ── Style ──────────────────────────────────────────────────────────
    if (styleProp !== undefined) {
      if (typeof styleProp === 'function' || runtime.isRef(styleProp)) {
        const source = styleProp as () => Record<string, string | number>
        bindProp(
          source,
          (next) => applyStyles(el, next),
          toValue(styleProp as PropValue<Record<string, string | number>>)
        )
      } else {
        applyStyles(el, styleProp as Record<string, string | number>)
      }
    }

    // ── Class ──────────────────────────────────────────────────────────
    const cls = classProp ?? className
    if (cls !== undefined) {
      if (typeof cls === 'function' || runtime.isRef(cls)) {
        const source = cls as () => string
        bindProp(
          source,
          (next) => papi.setClasses(el, next),
          toValue(cls as PropValue<string>)
        )
      } else {
        papi.setClasses(el, String(cls))
      }
    }

    // ── ID ─────────────────────────────────────────────────────────────
    if (id !== undefined) {
      if (typeof id === 'function' || runtime.isRef(id)) {
        const source = id as () => string
        bindProp(
          source,
          (next) => papi.setID(el, next),
          toValue(id as PropValue<string>)
        )
      } else {
        papi.setID(el, String(id))
      }
    }

    // ── Dataset (static) ───────────────────────────────────────────────
    if (dataset !== undefined) {
      for (const [k, v] of Object.entries(dataset)) {
        papi.addDataset(el, k, String(v))
      }
    }

    // ── Events + generic attributes ────────────────────────────────────
    for (const [key, value] of Object.entries(rest)) {
      if (value === undefined || value === null) continue
      const binding = parseEventProp(key, value)
      if (binding !== null) {
        papi.addEventListener(el, binding.eventName, binding.handler)
        cleanups.push(() =>
          papi.removeEventListener(el, binding.eventName, binding.handler)
        )
        continue
      }
      if (typeof value === 'function' || runtime.isRef(value)) {
        const source = value as () => unknown
        bindProp(
          source,
          (next) => papi.setAttribute(el, key, attrValue(next)),
          attrValue(toValue(value as PropValue<unknown>))
        )
      } else {
        papi.setAttribute(el, key, attrValue(value))
      }
    }

    // ── Children ───────────────────────────────────────────────────────
    if (children !== undefined && children !== null) {
      cleanups.unshift(...renderChildren(node, children, hooks))
    }

    papi.scheduleFlush()

    return () => {
      // Children first (they may hold subscriptions touching subtree nodes),
      // then attribute/event subscriptions, then detach from the tree.
      for (const cleanup of cleanups) cleanup()
      unmountNode(node)
    }
  }
}

function attrValue(v: unknown): string | number | boolean {
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  return String(v)
}
