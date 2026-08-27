/**
 * Lynx host hooks — HostHooks<LynxNode> implementation
 *
 * Maps core's structural contract (markers / insert / traversal / batch)
 * onto the JS-side linked list in node.ts. Markers never reach the native
 * tree; only element and raw-text nodes issue PAPI calls.
 */

import type { HostHooks, TextHandle } from '@rasenjs/core'
import * as papi from './papi'
import type { LynxNode } from './node'
import {
  APPEND_BEFORE,
  createMarkerNode,
  createRawTextNode,
  linkBefore,
  mountNode,
  nextNativeAnchor,
  unmountNode,
} from './node'

/** Create a detached pure-JS marker (position decided by a later insert) */
function createMarker(_parent: LynxNode, kind: string): LynxNode {
  return createMarkerNode(kind)
}

/** Create a detached raw-text node with an attribute-driven update handle */
function createText(_parent: LynxNode, content: string): TextHandle<LynxNode> {
  const node = createRawTextNode(content)
  return {
    node,
    update: (v: string) => {
      if (node.el !== null) papi.setAttribute(node.el, 'text', v)
      papi.scheduleFlush()
    },
  }
}

/** Insert (or move) node under parent before ref (null = append/barrier) */
function insert(parent: LynxNode, node: LynxNode, ref: LynxNode | null): void {
  mountNode(parent, node, ref)
}

/** Unlink and remove from the native tree */
function detach(node: LynxNode): void {
  unmountNode(node)
}

/** Pure-JS sibling walk — O(1), no PAPI round-trip */
function nextSibling(node: LynxNode): LynxNode | null {
  return node.nextSibling
}

/**
 * Bounded host: appends performed on the returned host land immediately
 * before `marker` instead of at the end. Implemented as a shallow clone
 * carrying an append barrier — the shared native handle keeps all PAPI
 * calls targeting the real parent element.
 */
function boundedHost(parent: LynxNode, marker: LynxNode): LynxNode {
  return { ...parent, [APPEND_BEFORE]: marker }
}

/**
 * Batch staging: mounts performed on the returned staging parent touch no
 * native API; flush() replays the staged children, in order, into the real
 * parent with a single positioning pass.
 */
function batch(
  _parent: LynxNode
): {
  parent: LynxNode
  flush: (parent: LynxNode, ref: LynxNode | null) => void
} {
  const staging: LynxNode = {
    tag: '#staging',
    el: null,
    parentNode: null,
    prevSibling: null,
    nextSibling: null,
    firstChild: null,
    lastChild: null,
  }

  return {
    parent: staging,
    flush: (target: LynxNode, ref: LynxNode | null) => {
      const barrier = ref ?? target[APPEND_BEFORE] ?? null
      let child = staging.firstChild
      while (child !== null) {
        const next = child.nextSibling
        if (child.el !== null && target.el !== null) {
          linkBefore(target, child, barrier)
          const anchor = nextNativeAnchor(child)
          if (anchor !== null) papi.insertElementBefore(target.el, child.el, anchor)
          else papi.appendElement(target.el, child.el)
        } else {
          // Pure-JS nodes (markers created inside the batch) move as entries only
          linkBefore(target, child, barrier)
        }
        child = next
      }
      papi.scheduleFlush()
    },
  }
}

/**
 * Range removal: unlink every sibling strictly between start and end and
 * drop their native presence. The JS-list walk avoids per-node PAPI
 * traversal; native removals are plain `__RemoveElement` calls.
 */
function extractRange(_parent: LynxNode, start: LynxNode, end: LynxNode): void {
  const removed: LynxNode[] = []
  let n = start.nextSibling
  while (n !== null && n !== end) {
    removed.push(n)
    n = n.nextSibling
  }
  // Collect first, then unmount — unmounting mutates the sibling list
  for (const node of removed) unmountNode(node)
}

/** Unified host hooks for the Lynx renderer */
export const lynxHostHooks: HostHooks<LynxNode> = {
  createMarker,
  createText,
  insert,
  detach,
  nextSibling,
  boundedHost,
  batch,
  extractRange,
}
