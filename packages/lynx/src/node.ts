/**
 * LynxNode — JS-side node wrapper with sibling linked list
 *
 * Every node managed by the renderer is a small JS object wrapping an
 * optional native element handle (`el`). Structural markers created by
 * core's when/each are pure-JS nodes (`el === null`) and never reach the
 * native tree, so positioning costs zero native objects.
 *
 * The linked list mirrors the native child order for native-backed nodes;
 * marker-only entries occupy no native slot. `insert` translates a logical
 * position into the nearest following native anchor and issues a single
 * `__InsertElementBefore` (or `__AppendElement`).
 */

import type { LynxElement } from './papi'
import * as papi from './papi'

/** Component id used for all elements created by the renderer. */
const COMPONENT_ID = 0

/** Internal field: bounded-host append barrier (see host-hooks.boundedHost). */
export const APPEND_BEFORE = '__appendBefore' as const

export interface LynxNode {
  /** Element tag ('view', 'text', ...) or '#kind' for pure-JS markers */
  tag: string
  /** Native element handle; null for markers and staging parents */
  el: LynxElement | null
  parentNode: LynxNode | null
  prevSibling: LynxNode | null
  nextSibling: LynxNode | null
  firstChild: LynxNode | null
  lastChild: LynxNode | null
  /** Bounded-host barrier: appends land before this sibling instead of at the end */
  [APPEND_BEFORE]?: LynxNode
}

function makeNode(tag: string, el: LynxElement | null): LynxNode {
  return {
    tag,
    el,
    parentNode: null,
    prevSibling: null,
    nextSibling: null,
    firstChild: null,
    lastChild: null,
  }
}

/** Create factory tags backed by dedicated create PAPIs */
const CREATE_BY_TAG: Record<string, (id: number) => LynxElement> = {
  view: papi.createView,
  text: papi.createText,
  image: papi.createImage,
  'scroll-view': papi.createScrollView,
}

/**
 * Create a detached element node.
 * Built-in tags use their dedicated create PAPIs; anything else falls back
 * to the generic `__CreateElement` (custom elements).
 */
export function createElementNode(tag: string): LynxNode {
  const factory = CREATE_BY_TAG[tag]
  const el = factory ? factory(COMPONENT_ID) : papi.createElement(tag, COMPONENT_ID)
  return makeNode(tag, el)
}

/** Create a raw-text node (child content of <text> etc.) */
export function createRawTextNode(content: string): LynxNode {
  return makeNode('raw-text', papi.createRawText(content))
}

/** Create a pure-JS structural marker — no native object is allocated */
export function createMarkerNode(kind: string): LynxNode {
  return makeNode(`#${kind}`, null)
}

/** Wrap an existing native element (e.g. the page root) as a node */
export function wrapElement(el: LynxElement, tag: string): LynxNode {
  return makeNode(tag, el)
}

/** First native anchor strictly after `node` within its sibling list */
export function nextNativeAnchor(node: LynxNode): LynxElement | null {
  let n = node.nextSibling
  while (n !== null) {
    if (n.el !== null) return n.el
    n = n.nextSibling
  }
  return null
}

/**
 * Link `node` into parent's list immediately before `before`
 * (`before === null` appends). Pure list operation — no native calls.
 */
export function linkBefore(parent: LynxNode, node: LynxNode, before: LynxNode | null): void {
  // Detach from previous position first (defensive: nodes may be moved)
  unlink(node)

  node.parentNode = parent
  if (before === null) {
    const last = parent.lastChild
    node.prevSibling = last
    node.nextSibling = null
    if (last !== null) last.nextSibling = node
    else parent.firstChild = node
    parent.lastChild = node
    return
  }
  node.prevSibling = before.prevSibling
  node.nextSibling = before
  if (before.prevSibling !== null) before.prevSibling.nextSibling = node
  else parent.firstChild = node
  before.prevSibling = node
}

/** Remove node from its sibling list (list operation only) */
export function unlink(node: LynxNode): void {
  const parent = node.parentNode
  if (parent === null) return
  if (node.prevSibling !== null) node.prevSibling.nextSibling = node.nextSibling
  else parent.firstChild = node.nextSibling
  if (node.nextSibling !== null) node.nextSibling.prevSibling = node.prevSibling
  else parent.lastChild = node.prevSibling
  node.parentNode = null
  node.prevSibling = null
  node.nextSibling = null
}

/**
 * Position + mount `node` under `parent` before `before`
 * (`before === null` respects any bounded-host barrier, else appends).
 *
 * Native translation: find the first native-backed sibling at or after the
 * logical position and insert before it; append when there is none.
 */
export function mountNode(parent: LynxNode, node: LynxNode, before: LynxNode | null): void {
  const barrier = before ?? parent[APPEND_BEFORE] ?? null
  linkBefore(parent, node, barrier)

  if (node.el === null || parent.el === null) return
  // Native translation: insert before the nearest following native-backed
  // sibling; append when none exists (trailing siblings are pure-JS markers).
  const anchor = nextNativeAnchor(node)
  if (anchor !== null) {
    papi.insertElementBefore(parent.el, node.el, anchor)
  } else {
    papi.appendElement(parent.el, node.el)
  }
  papi.scheduleFlush()
}

/**
 * Unlink `node` and remove its native presence from the tree.
 * Children of a detached subtree stay reachable through the returned node
 * (native removal takes the whole subtree down at once).
 */
export function unmountNode(node: LynxNode): void {
  const parent = node.parentNode
  unlink(node)
  if (node.el !== null && parent !== null && parent.el !== null) {
    papi.removeElement(parent.el, node.el)
    papi.scheduleFlush()
  }
}
