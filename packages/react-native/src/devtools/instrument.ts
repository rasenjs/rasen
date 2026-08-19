/**
 * @rasenjs/react-native — devtools instrumentation
 *
 * Pure, testable collection logic for the Rasen RN devtools:
 *  - a global hook (`__RASEN_DEVTOOLS_HOOK__`) that `element()` calls around
 *    each mount so the devtools can time renders without coupling element.ts
 *    to the devtools package
 *  - render performance stats (count / total / max per tag)
 *  - node-tree serialization from an rn-dom RNDocument
 *
 * The socket.io transport lives in `./index.ts`; this module has no I/O so it
 * can be unit-tested in isolation.
 */

import type { RNDocument, RNNode } from '@rasenjs/rn-dom'

// ── Global hook ─────────────────────────────────────────────────────────

export interface RasenDevtoolsHook {
  /** Called before a node is mounted. */
  renderStart?: (tagName: string) => void
  /** Called after a node is mounted, with the elapsed time in ms. */
  renderEnd?: (tagName: string, elapsedMs: number) => void
}

const HOOK_KEY = '__RASEN_DEVTOOLS_HOOK__'

export function getDevtoolsHook(): RasenDevtoolsHook | null {
  const g = globalThis as Record<string, unknown>
  return (g[HOOK_KEY] as RasenDevtoolsHook | undefined) ?? null
}

export function setDevtoolsHook(hook: RasenDevtoolsHook | null): void {
  const g = globalThis as Record<string, unknown>
  if (hook == null) delete g[HOOK_KEY]
  else g[HOOK_KEY] = hook
}

// ── Render performance stats ────────────────────────────────────────────

export interface RenderStat {
  tagName: string
  count: number
  totalMs: number
  maxMs: number
}

const renderStats = new Map<string, RenderStat>()

/** Record a single render duration for a tag (called by the hook). */
export function recordRender(tagName: string, elapsedMs: number): void {
  const stat = renderStats.get(tagName) ?? { tagName, count: 0, totalMs: 0, maxMs: 0 }
  stat.count++
  stat.totalMs += elapsedMs
  if (elapsedMs > stat.maxMs) stat.maxMs = elapsedMs
  renderStats.set(tagName, stat)
}

/** Collect render stats, sorted by total time descending. */
export function collectPerf(): RenderStat[] {
  return [...renderStats.values()].sort((a, b) => b.totalMs - a.totalMs)
}

/** Reset render stats. */
export function resetPerf(): void {
  renderStats.clear()
}

// ── Node tree serialization ─────────────────────────────────────────────

export interface DevtoolsTreeNode {
  tag: string
  testID?: string
  /** A compact summary of the node's props (style keys, key values). */
  props: Record<string, unknown>
  children: DevtoolsTreeNode[]
}

/** Pick a small, JSON-safe summary of a node's props. */
function summarizeProps(node: RNNode): Record<string, unknown> {
  const n = node as unknown as { __RN_currentProps?: Record<string, unknown> }
  const props = n.__RN_currentProps ?? {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(props)) {
    if (k === 'style') {
      // Summarize style as its keys (values may be functions/objects).
      if (v && typeof v === 'object') {
        out.style = Object.keys(v as Record<string, unknown>)
      }
    } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v
    } else if (typeof v === 'function') {
      out[k] = '[fn]'
    }
  }
  return out
}

/** Serialize an rn-dom node (and its subtree) into a JSON-safe tree. */
export function serializeNode(node: RNNode): DevtoolsTreeNode {
  const n = node as unknown as { nodeName?: string; textContent?: string }
  const props = summarizeProps(node)

  // Text nodes: expose their text content.
  if (n.nodeName === '#text') {
    return {
      tag: '#text',
      props: { text: n.textContent ?? '' },
      children: [],
    }
  }

  const children: DevtoolsTreeNode[] = []
  let c = node.firstChild
  while (c) {
    children.push(serializeNode(c as RNNode))
    c = c.nextSibling
  }

  const testID = props.testID as string | undefined
  return { tag: node.tagName, ...(testID ? { testID } : {}), props, children }
}

/** Serialize the whole document body into a node tree. */
export function collectNodeTree(doc: RNDocument): DevtoolsTreeNode[] {
  const out: DevtoolsTreeNode[] = []
  let c = doc.body.firstChild
  while (c) {
    out.push(serializeNode(c as RNNode))
    c = c.nextSibling
  }
  return out
}

/** Count the total number of nodes in a serialized tree. */
export function countNodes(tree: DevtoolsTreeNode[]): number {
  let count = 0
  for (const node of tree) {
    count += 1 + countNodes(node.children)
  }
  return count
}
