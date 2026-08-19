/**
 * Control-flow components for @rasenjs/react-native.
 *
 * Wraps core's `each` / `when` / `match` with rn-dom host hooks so list and
 * conditional rendering position nodes correctly inside the Fabric tree.
 *
 * Extracted into its own module so higher-level components (e.g. FlatList)
 * can reuse `each` without a circular import through the package index.
 */

import type {
  RNNode,
  RNTextNode,
  RNCommentNode,
} from '@rasenjs/rn-dom'
import {
  eachImpl,
  when as coreWhen,
  match as coreMatch,
  unref,
} from '@rasenjs/core'
import type { Mountable, PropValue, Ref } from '@rasenjs/core'

// ── Host Hooks ─────────────────────────────────────────────────────────

export const hostHooks = {
  createMarker: (host: RNNode, content: string): RNCommentNode =>
    host.ownerDocument.createComment(content),

  // NOTE: The marker is intentionally NOT appended to the tree.
  // core's eachImpl treats the end marker as "the position after the last
  // item" — new items are inserted *before* it. If we appended the marker
  // first (before items render), it would sit at the *beginning* and new
  // items would be inserted at the front (wrong order). rn-dom's
  // insertBefore() appends when the ref is not in the tree, so a detached
  // marker yields correct append-at-end semantics.
  appendMarker: (_host: RNNode, _marker: RNCommentNode): void => {
    // no-op — see note above
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

export type HostHooks = typeof hostHooks

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
    items: () => (Array.isArray(items) ? items : unref(items as Ref<T[]>)),
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
  return coreWhen(withHooks(config as never))
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
  return coreMatch(withHooks(config as never))
}