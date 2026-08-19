/**
 * @rasenjs/react-native — component-level test render helper.
 *
 * Mounts a rasen component (a function returning a `Mountable<RNNode>`)
 * into a fresh rn-dom RNDocument, then exposes helpers to inspect the
 * resulting Fabric node tree and to synthesize press events.
 *
 * Mirrors the helper used by vue-rn (`src/__tests__/render-helper.ts`),
 * adapted for rasen's functional component model:
 *
 * ```ts
 * const { root } = mountComponent(Pressable, { onPress })
 * expect(nodeProps(root).accessible).toBe(true)
 * ```
 */

import {
  RNDocument,
  FABRIC_NODE_ID,
  resetTagCounter,
  type RNNode,
} from '@rasenjs/rn-dom'
import type { Mountable } from '@rasenjs/core'
import { resetFabricMocks, nativeFabricUIManager } from './setup'

export interface Mounted {
  /** Component-rendered root node (rn-dom node tree). */
  root: RNNode
  /** RNDocument (with body). */
  doc: RNDocument
  /** Unmount. */
  unmount: () => void
}

/** Flush microtasks (rn-dom flushes Fabric on a microtask). */
export function tick(): Promise<void> {
  return new Promise<void>(r => setTimeout(r, 0))
}

/**
 * Mount a rasen component factory into a fresh rn-dom document.
 *
 * @param factory - `(props) => Mountable<RNNode>` component
 * @param props   - props passed to the factory
 */
export function mountComponent(
  factory: (props: Record<string, unknown>) => Mountable<RNNode>,
  props: Record<string, unknown> = {},
): Mounted {
  RNDocument.reset()
  resetTagCounter()
  resetFabricMocks()
  const doc = RNDocument.getOrCreate(1)

  const mountable = factory(props)
  const unmount = mountable(doc.body) ?? (() => {})

  // Component-rendered root = body's first child (component root element).
  const root = doc.body.firstChild as RNNode

  return { root, doc, unmount }
}

/** Collect an rn-dom node's (normalized) props. */
export function nodeProps(node: RNNode): Record<string, unknown> {
  const n = node as unknown as { __RN_currentProps: Record<string, unknown> }
  return n.__RN_currentProps ?? {}
}

/** Collect a flat list of props for the whole subtree. */
export function collectProps(node: RNNode): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  function walk(n: RNNode): void {
    out.push(nodeProps(n))
    let c = n.firstChild
    while (c) {
      walk(c as RNNode)
      c = c.nextSibling
    }
  }
  walk(node)
  return out
}

/** Find the first node satisfying a predicate (depth-first). */
export function findNode(
  node: RNNode,
  predicate: (n: RNNode) => boolean,
): RNNode | null {
  if (predicate(node)) return node
  let c = node.firstChild
  while (c) {
    const found = findNode(c as RNNode, predicate)
    if (found) return found
    c = c.nextSibling
  }
  return null
}

/** Find the first node with the given tagName. */
export function findByTag(node: RNNode, tag: string): RNNode | null {
  return findNode(node, n => n.tagName === tag)
}

/** Concatenate all text content in the subtree. */
export function textContentOf(node: RNNode): string {
  const n = node as unknown as { nodeName?: string; textContent?: string }
  if (n.nodeName === '#text') {
    return n.textContent ?? ''
  }
  let out = ''
  let c = node.firstChild
  while (c) {
    out += textContentOf(c as RNNode)
    c = c.nextSibling
  }
  return out
}

/** Simulate a full press (topTouchStart → topTouchEnd). */
export function firePress(node: RNNode, location?: { x?: number; y?: number }): void {
  firePressIn(node, location)
  firePressOut(node, location)
}

/** Simulate press-down (topTouchStart → onPressIn). */
export function firePressIn(node: RNNode, location?: { x?: number; y?: number }): void {
  const handler = getFabricHandler()
  const target = (node as unknown as Record<symbol, unknown>)[FABRIC_NODE_ID]
  handler(
    { stateNode: node },
    'topTouchStart',
    { target, locationX: location?.x ?? 0, locationY: location?.y ?? 0 },
  )
}

/** Simulate press-up (topTouchEnd → onPressOut + onPress). */
export function firePressOut(node: RNNode, location?: { x?: number; y?: number }): void {
  const handler = getFabricHandler()
  const target = (node as unknown as Record<symbol, unknown>)[FABRIC_NODE_ID]
  handler(
    { stateNode: node },
    'topTouchEnd',
    { target, locationX: location?.x ?? 0, locationY: location?.y ?? 0 },
  )
}

/** Simulate touch move (topTouchMove → onPressMove). */
export function firePressMove(node: RNNode, location: { x?: number; y?: number }): void {
  const handler = getFabricHandler()
  const target = (node as unknown as Record<symbol, unknown>)[FABRIC_NODE_ID]
  handler(
    { stateNode: node },
    'topTouchMove',
    { target, locationX: location.x ?? 0, locationY: location.y ?? 0 },
  )
}

/** Get the Fabric-registered event handler. */
function getFabricHandler(): (
  instanceHandle: object,
  type: string,
  payload: Record<string, unknown>,
) => void {
  const calls = nativeFabricUIManager.registerEventHandler.mock.calls
  if (calls.length === 0) {
    throw new Error('firePress: registerEventHandler was never called')
  }
  return calls[calls.length - 1][0] as (
    instanceHandle: object,
    type: string,
    payload: Record<string, unknown>,
  ) => void
}
