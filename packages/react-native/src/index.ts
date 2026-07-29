/**
 * @rasenjs/react-native — Rasen renderer for React Native Fabric
 *
 * Thin binding layer over @rasenjs/rn-dom that provides:
 * - Unified `component()` factory for creating any RN native element
 * - Control-flow components (`each`, `when`, `match`) with RN host hooks
 * - Convenience `registerApp()` for app bootstrap
 *
 * @example
 * ```ts
 * import { component, registerApp, each, when } from '@rasenjs/react-native'
 * import { ref, computed } from '@vue/reactivity'
 *
 * const todos = ref([{ id: 1, text: 'Hello' }])
 *
 * registerApp('MyApp', () =>
 *   component('View', { style: { flex: 1 },
 *     children: [
 *       each(todos, (todo) =>
 *         component('Text', { children: todo.text })
 *       )
 *     ]
 *   })
 * )
 * ```
 */

import { AppRegistry } from 'react-native'
import {
  RNDocument,
  dispatchCommand,
  sendAccessibilityEvent,
  findNodeHandle,
} from '@rasenjs/rn-dom'
import type {
  RNNode,
  RNTextNode,
  RNCommentNode,
  RNStyle,
  RNEvent,
} from '@rasenjs/rn-dom'
import {
  eachImpl,
  when as coreWhen,
  match as coreMatch,
} from '@rasenjs/core'
import type { Mountable, PropValue, Ref } from '@rasenjs/core'

import { element } from './element'
import type { ElementProps, Child } from './element'

// ── Core API ────────────────────────────────────────────────────────────

export { element, element as component, element as h }
export type { ElementProps, Child }

// Re-export types from rn-dom for convenience
export type { RNNode, RNTextNode, RNCommentNode, RNStyle, RNEvent }

// Utility exports from rn-dom
export { dispatchCommand, sendAccessibilityEvent, findNodeHandle }

// Tag alias components
export * from './components'

// ── Host Hooks ─────────────────────────────────────────────────────────

const hostHooks = {
  createMarker: (host: RNNode, content: string): RNCommentNode =>
    host.ownerDocument.createComment(content),

  appendMarker: (host: RNNode, marker: RNCommentNode): void => {
    host.appendChild(marker)
  },

  insertBefore: (
    host: RNNode,
    node: RNNode | RNTextNode | RNCommentNode,
    before: RNCommentNode | null,
  ): void => {
    if (before) host.insertBefore(node, before)
    else host.appendChild(node)
  },

  removeNode: (node: RNNode | RNTextNode | RNCommentNode): void => {
    node.parentNode?.removeChild(node)
  },

  removeMarker: (marker: RNCommentNode): void => {
    marker.parentNode?.removeChild(marker)
  },
}

export { hostHooks }
export type HostHooks = typeof hostHooks

// ── Control Flow ─────────────────────────────────────────────────────────

function withHooks<T extends Record<string, unknown>>(hooks: T): T {
  return { ...hostHooks, ...hooks } as unknown as T
}

/**
 * List rendering — wraps core's eachImpl with RN host hooks.
 *
 * @example
 * ```ts
 * const todos = ref([{ id: 1, text: 'Learn Rasen' }])
 *
 * each(todos, (todo) =>
 *   component('Text', { children: todo.text })
 * )
 * ```
 */
export function each<T extends object>(
  items: T[] | Ref<T[]> | (() => T[]),
  render: (item: T, index: number) => Mountable<RNNode>,
): Mountable<RNNode> {
  return eachImpl(withHooks({
    items: () => (Array.isArray(items) ? items : (items as Ref<T[]>).value),
    render,
  }))
}

/**
 * Conditional rendering — wraps core's `when` with RN host hooks.
 *
 * @example
 * ```ts
 * when({ condition: isLoggedIn, then: () => ..., else: () => ... })
 * ```
 */
export function when(
  config: {
    condition: PropValue<boolean>
    then: () => Mountable<RNNode>
    else?: () => Mountable<RNNode>
  },
): Mountable<RNNode> {
  return coreWhen(withHooks(config as any))
}

/**
 * Multi-branch conditional — wraps core's `match` with RN host hooks.
 *
 * @example
 * ```ts
 * match({ value: tab, cases: { home: () => ..., profile: () => ... } })
 * ```
 */
export function match<K extends string = string>(
  config: {
    value: PropValue<K | null | undefined>
    cases: Partial<Record<K, (key: K) => Mountable<RNNode>>>
    default?: () => Mountable<RNNode>
    cache?: boolean
  },
): Mountable<RNNode> {
  return coreMatch(withHooks(config as any))
}

// ── App Bootstrap ───────────────────────────────────────────────────────

export type AppComponent = () => Mountable<RNNode>

/**
 * Register and mount a Rasen React Native application.
 *
 * @param appName - Application name (must match app.json)
 * @param App - Application component factory
 * @returns Re-render function
 *
 * @example
 * ```ts
 * import { component, registerApp } from '@rasenjs/react-native'
 *
 * registerApp('MyApp', () =>
 *   component('View', {
 *     style: { flex: 1, justifyContent: 'center' },
 *     children: component('Text', { children: 'Hello Rasen!' }),
 *   })
 * )
 * ```
 */
export function registerApp(
  appName: string,
  App: AppComponent,
): () => void {
  let rerender: (() => void) | null = null

  AppRegistry.registerRunnable(appName, ({ rootTag }: { rootTag: number }) => {
    const doc = RNDocument.getOrCreate(rootTag)
    rerender = () => { App()(doc.body) }
    rerender()
  })

  return () => rerender?.()
}

// ── JSX Type Namespace (for jsxImportSource) ───────────────────────────
// Self-contained — no dependency on @rasenjs/jsx.

export namespace JSX {
  export interface IntrinsicElements {
    [tag: string]: Record<string, unknown>
  }
  // Mountable is already imported at top of file
  export type Element = import('@rasenjs/core').Mountable<unknown>
  export interface ElementChildrenAttribute { children: unknown }
  export interface IntrinsicAttributes { key?: string | number }
}

// ── JSX Host Registration ─────────────────────────────────────────────
// Side effect: register components for JSX auto-detection.
import { registerHostComponents } from '@rasenjs/core'
import * as __components from './components'
registerHostComponents('@rasenjs/react-native', __components)
