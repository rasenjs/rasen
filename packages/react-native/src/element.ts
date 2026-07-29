/**
 * Unified element factory for React Native Fabric
 *
 * Single `element()` function that creates any RN native element,
 * analogous to `element()` in @rasenjs/dom but backed by @rasenjs/rn-dom.
 *
 * @example
 * ```ts
 * import { element } from '@rasenjs/react-native'
 * import { ref } from '@vue/reactivity'
 *
 * const count = ref(0)
 *
 * const App = () => element('View', {
 *   style: { flex: 1, justifyContent: 'center' },
 *   children: [
 *     element('Text', { style: { fontSize: 24 }, children: count }),
 *     element('View', {
 *       style: () => ({ backgroundColor: count.value > 5 ? 'red' : 'blue' }),
 *       onTouchEnd: () => count.value++,
 *       children: [element('Text', { children: 'Tap me' })],
 *     }),
 *   ],
 * })
 * ```
 */

import type { Mountable, Ref } from '@rasenjs/core'
import { getReactiveRuntime } from '@rasenjs/core'
import type { RNNode } from '@rasenjs/rn-dom'
import type { RNElementPropMap } from '@rasenjs/rn-dom/elements'

// ── Types ────────────────────────────────────────────────────────────────

export interface ElementProps {
  style?: Record<string, unknown> | (() => Record<string, unknown>)
  class?: string
  children?: Child | Child[]
  [key: string]: unknown
}

export type Child =
  | string
  | number
  | Mountable<RNNode>
  | Ref<unknown>
  | (() => string | number)
  | null
  | undefined

// ── Children Rendering ──────────────────────────────────────────────────

/**
 * Render children into a parent RNNode.
 * Returns an array of cleanup functions to be called on unmount.
 */
function renderChildren(
  parent: RNNode,
  children: Child | Child[],
): (() => void)[] {
  const runtime = getReactiveRuntime()
  const unmounts: (() => void)[] = []
  const list = Array.isArray(children) ? children : [children]

  for (const child of list) {
    if (child == null) continue

    if (typeof child === 'string' || typeof child === 'number') {
      const textNode = parent.ownerDocument.createTextNode(String(child))
      parent.appendChild(textNode)
      unmounts.push(() => parent.removeChild(textNode))
    } else if (runtime.isRef(child)) {
      const initial = String(runtime.unref(child))
      const textNode = parent.ownerDocument.createTextNode(initial)
      parent.appendChild(textNode)
      const stop = runtime.watch(
        () => String(runtime.unref(child)),
        (v) => { textNode.textContent = v },
      )
      unmounts.push(() => { stop(); parent.removeChild(textNode) })
    } else if (typeof child === 'function') {
      // Could be Mountable or reactive text getter — check return type
      const result = child(parent as RNNode)
      if (typeof result === 'string' || typeof result === 'number') {
        // Reactive getter — create text node and watch for changes
        const textNode = parent.ownerDocument.createTextNode(String(result))
        parent.appendChild(textNode)
        const stop = runtime.watch(
          child as () => string | number,
          (v) => { textNode.textContent = String(v) },
        )
        unmounts.push(() => { stop(); parent.removeChild(textNode) })
      } else {
        // Mountable component
        if (result) unmounts.push(result)
      }
    }
  }

  return unmounts
}

// ── Element Factory ───────────────────────────────────────────────────

/**
 * Create a Rasen element for any React Native native component.
 *
 * @param tagName - RN component tag name (e.g. 'View', 'Text', 'Image', 'ScrollView')
 * @param props - Component properties (style, children, events, attributes)
 * @returns Mountable function
 */
export function element(
  tagName: string,
  props: ElementProps = {},
): Mountable<RNNode> {
  return (host: RNNode) => {
    const el = host.ownerDocument.createElement(tagName)
    host.appendChild(el)

    const { children, style: styleProp, ...attrs } = props
    const cleanups: (() => void)[] = []

    // ── Style ────────────────────────────────────────────────────
    if (styleProp !== undefined) {
      if (typeof styleProp === 'function') {
        // Apply initial style immediately, then watch for changes
        const runtime = getReactiveRuntime()
        const stop = runtime.watch(
          styleProp as () => Record<string, unknown>,
          (next) => {
            if (next && typeof next === 'object') {
              for (const [k, v] of Object.entries(next)) {
                el.style.setProperty(k, v)
              }
            }
          },
          { immediate: true },
        )
        cleanups.push(stop)
      } else if (typeof styleProp === 'object' && styleProp !== null) {
        for (const [k, v] of Object.entries(styleProp)) {
          el.style.setProperty(k, v)
        }
      }
    }

    // ── Attributes & Events ──────────────────────────────────────
    const runtime = getReactiveRuntime()
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined) continue

      if (runtime.isRef(value)) {
        const stop = runtime.watch(
          () => runtime.unref(value),
          (next) => {
            if (next == null) {
              el.removeAttribute(key)
            } else {
              el.setAttribute(key, next)
            }
          },
        )
        cleanups.push(stop)
      } else {
        el.setAttribute(key, value)
      }
    }

    // ── Children ─────────────────────────────────────────────────
    if (children !== undefined) {
      const childUnmounts = renderChildren(el, children as Child | Child[])
      cleanups.push(...childUnmounts)
    }

    // ── Cleanup ──────────────────────────────────────────────────
    const unmount = () => {
      for (let i = cleanups.length - 1; i >= 0; i--) {
        cleanups[i]()
      }
      if (el.parentNode) el.parentNode.removeChild(el)
    }

    // Attach node reference for eachImpl position tracking
    ;(unmount as { node?: RNNode }).node = el

    return unmount
  }
}

// ── Tag Factory ─────────────────────────────────────────────────────────

/** RN tag props for the tag() factory. */
type TagElementProps<K extends keyof RNElementPropMap> = Omit<
  RNElementPropMap[K],
  'children' | 'style'
> & {
  children?: Child | Child[]
  style?: Record<string, unknown> | (() => Record<string, unknown>)
  [key: string]: unknown
}

function isChild(v: unknown): v is Child {
  if (v == null) return true
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'function') return true
  if (typeof v === 'object' && v !== null && 'value' in v) return true
  return false
}

/**
 * Tag factory — create a typed element function for any RN tag.
 *
 * Export so consumers can create custom RN component aliases:
 *   const myView = tag('MyCustomView')
 *
 * For built-in RN tags, use the named exports (view, text, …).
 */
export function tag<T extends keyof RNElementPropMap>(tagName: T) {
  function el(): Mountable<RNNode>
  function el(child: Child): Mountable<RNNode>
  function el(props: TagElementProps<T>): Mountable<RNNode>
  function el(props: TagElementProps<T>, ...extraChildren: Child[]): Mountable<RNNode>

  function el(
    propsOrChild?: TagElementProps<T> | Child,
    ...extraChildren: Child[]
  ): Mountable<RNNode> {
    if (propsOrChild === undefined) {
      return element(tagName as string, {})
    }

    if (isChild(propsOrChild)) {
      return element(tagName as string, {
        children: [propsOrChild as Child, ...extraChildren],
      })
    }

    const props = propsOrChild as TagElementProps<T>
    if (extraChildren.length > 0) {
      const existing = props.children
      const merged = Array.isArray(existing)
        ? [...existing, ...extraChildren]
        : existing !== undefined
          ? [existing, ...extraChildren]
          : extraChildren
      return element(tagName as string, { ...props, children: merged })
    }

    return element(tagName as string, props as unknown as Record<string, unknown>)
  }

  return el
}

// ── Aliases ─────────────────────────────────────────────────────────────

/** @alias element — backward compatible with older code. */
export { element as component }
/** hyperscript alias */
export { element as h }
