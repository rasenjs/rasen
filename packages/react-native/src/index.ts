/**
 * @rasenjs/react-native — Rasen renderer for React Native Fabric
 *
 * Thin binding layer over @rasenjs/rn-dom that provides:
 * - Unified `component()` factory for creating any RN native element
 * - Convenience `registerApp()` for app bootstrap
 *
 * @example
 * ```ts
 * import { component, registerApp } from '@rasenjs/react-native'
 * import { ref, computed } from '@vue/reactivity'
 *
 * const todos = ref([{ id: 1, text: 'Hello' }])
 *
 * registerApp('MyApp', () =>
 *   component('View', { style: { flex: 1 },
 *     children: [
 *       component('Text', { children: 'Hello' })
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
import type { Mountable } from '@rasenjs/core'
import { provideHostContext } from '@rasenjs/core'

import { element, tag } from './element'
import type { ElementProps, Child } from './element'

// ── Core API ────────────────────────────────────────────────────────────

export { element, element as component, element as h, tag }
export type { ElementProps, Child }

// Re-export types from rn-dom for convenience
export type { RNNode, RNTextNode, RNCommentNode, RNStyle, RNEvent }

/** Host node type for this renderer (alias for RNNode). */
export type Host = RNNode

// Utility exports from rn-dom
export { dispatchCommand, sendAccessibilityEvent, findNodeHandle }

// Tag alias components
export * from './components'

// ── Host Hooks (internal, for registerApp) ────────────────────────────

export const hostHooks = {
  createMarker: (host: RNNode, content: string): RNCommentNode =>
    host.ownerDocument.createComment(content),
  appendMarker: (_host: RNNode, _marker: RNCommentNode): void => {},
  insertBefore: (host: RNNode, node: RNNode | RNTextNode | RNCommentNode, before: RNCommentNode | null): void => {
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
export type HostHooks = typeof hostHooks

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
    rerender = () => {
      // 内部提供 RN 宿主上下文，用户无感
      provideHostContext({ hooks: hostHooks }, () => App()(doc.body))
    }
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

