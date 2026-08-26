/**
 * N hooks for control flow components (when/each/match) in SSR
 *
 * Unified single set of hooks — provided via HostContext by the render entry
 * (renderToString), so core's when/each/match get them automatically.
 *
 * SSR semantics:
 *  - createMarker/createText produce detached string markers/content;
 *    positioning is done by insert, which ignores ref and appends in order
 *    (append order == document order in SSR, so bounded semantics is trivial).
 *  - detach/nextSibling are no-ops/null (no live tree).
 *  - batch buffers chunks and flushes them as one appended block.
 */
import type { TextHandle } from '@rasenjs/core'
import type { HostHooks } from '@rasenjs/core'
import type { StringHost } from './types'
import { createMarker } from './marker-constants'

/**
 * SSR node space: content chunks and markers are plain strings, while the
 * container is the mutable StringHost buffer. The union is the honest type —
 * hooks methods accept both shapes.
 */
export type SSRNode = string | StringHost

/**
 * Unified HTML host hooks for when/each/match
 */
export const htmlHostHooks: HostHooks<SSRNode> = {
  /** Create a detached marker string; position decided by insert */
  createMarker: (_parent: SSRNode, kind: string): string => {
    return createMarker(kind)
  },
  /** Append node content (ref ignored — append order == document order) */
  insert: (_parent: SSRNode, node: SSRNode, _ref: SSRNode | null): void => {
    // Content chunks are strings by construction; the container (when the
    // compiler's SSR branch hands it back as `parent`) carries .append().
    const target = parent as unknown as StringHost
    target.append(node as string)
  },
  /** No live tree in SSR */
  detach: (_node: SSRNode): void => {},
  /** No traversal in SSR */
  nextSibling: (_node: SSRNode): SSRNode | null => null,
  /** Detached text content; update is a no-op (SSR never updates) */
  createText: (_parent: SSRNode, content: string): TextHandle<string> => {
    return {
      node: content,
      update: () => {},
    }
  },
  /** Identity — sequential appends already land in document order */
  boundedHost: (parent: SSRNode): SSRNode => parent,
  /** Buffer chunks, flush as one block before ref (ref ignored) */
  batch: (
    _parent: SSRNode
  ): {
    host: SSRNode
    flush: (parent: SSRNode, ref: SSRNode | null) => void
  } => {
    const chunks: string[] = []
    return {
      host: {
        fragments: chunks,
        append: (chunk: string) => chunks.push(chunk),
        toString: () => chunks.join('')
      } as StringHost,
      flush: (targetHost: SSRNode, _ref: SSRNode | null) => {
        ;(targetHost as StringHost).append(chunks.join(''))
      }
    }
  }
}
