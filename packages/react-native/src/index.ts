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

import { element, tag } from './element'
import type { ElementProps, Child } from './element'

// ── Core API ────────────────────────────────────────────────────────────

export { element, element as component, element as h, tag }
export type { ElementProps, Child }

// Re-export types from rn-dom for convenience
export type { RNNode, RNTextNode, RNCommentNode, RNStyle, RNEvent }

/** N node type for this renderer (alias for RNNode). */
export type N = RNNode

// Utility exports from rn-dom
export { dispatchCommand, sendAccessibilityEvent, findNodeHandle }

// Tag alias components
export * from './components'

// ── N Hooks (internal, for registerApp) ────────────────────────────

type RNAnyNode = RNNode | RNTextNode | RNCommentNode

function guardedInsertBefore(
  host: RNNode,
  node: RNAnyNode,
  ref: RNAnyNode | null
): void {
  if (ref) host.insertBefore(node, ref)
  else host.appendChild(node)
}

export const hostHooks = {
  /** Create a detached marker comment; position decided by insert */
  createMarker: (host: RNNode, kind: string): RNCommentNode =>
    host.ownerDocument.createComment(kind),
  /** Insert node before ref (null = append); also used for moves */
  insert: (host: RNNode, node: RNAnyNode, ref: RNAnyNode | null): void => {
    guardedInsertBefore(host, node, ref)
  },
  /** Detach node from the tree */
  detach: (node: RNAnyNode): void => {
    node.parentNode?.removeChild(node)
  },
  /** Next sibling (marker region walks) */
  nextSibling: (node: RNAnyNode): RNAnyNode | null => node.nextSibling,
  /** Create a detached text node handle */
  createText: (host: RNNode, content: string) => {
    const textNode = host.ownerDocument.createTextNode(content)
    return {
      node: textNode,
      update: (v: string) => {
        textNode.textContent = v
      },
    }
  },
  /**
   * Bounded host view: transparently forwards all properties, intercepts
   * appendChild/insertBefore to redirect appends before the marker.
   */
  boundedHost: (host: RNNode, marker: RNAnyNode): RNNode =>
    new Proxy(host, {
      get(target, prop, receiver) {
        if (prop === 'appendChild') {
          return (node: RNAnyNode) => {
            guardedInsertBefore(target, node, marker)
            return node
          }
        }
        if (prop === 'insertBefore') {
          return (node: RNAnyNode, ref: RNAnyNode | null) => {
            guardedInsertBefore(target, node, ref || marker)
            return node
          }
        }
        return Reflect.get(target, prop, receiver)
      },
    }) as RNNode,
  /** DocumentFragment batch insertion */
  batch: (
    host: RNNode
  ): {
    host: RNNode
    flush: (host: RNNode, ref: RNAnyNode | null) => void
  } => {
    const fragment = host.ownerDocument.createDocumentFragment()
    return {
      host: fragment as unknown as RNNode,
      flush: (targetHost: RNNode, ref: RNAnyNode | null) => {
        fragment.flush(targetHost, ref)
      },
    }
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
      // RN hooks 显式传递——hooks 即上下文
      App()(doc.body, hostHooks as unknown as Parameters<typeof App>['length'] extends never ? never : Record<string, unknown> as never)
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

