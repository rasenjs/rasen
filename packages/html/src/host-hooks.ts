/**
 * Host hooks for control flow components (when/each/match) in SSR
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
import type { StringHost } from './types'
import { createMarker } from './marker-constants'

/**
 * Unified HTML host hooks for when/each/match
 */
export const htmlHostHooks = {
  /** Create a detached marker string; position decided by insert */
  createMarker: (_host: StringHost, kind: string): string => {
    return createMarker(kind)
  },
  /** Append node content (ref ignored — append order == document order) */
  insert: (host: StringHost, node: string, _ref: string | null): void => {
    host.append(node)
  },
  /** No live tree in SSR */
  detach: (_node: string): void => {},
  /** No traversal in SSR */
  nextSibling: (_node: string): string | null => null,
  /** Detached text content; update is a no-op (SSR never updates) */
  createText: (_host: StringHost, content: string): TextHandle<string> => {
    return {
      node: content,
      update: () => {},
    }
  },
  /** Identity — sequential appends already land in document order */
  boundedHost: (host: StringHost): StringHost => host,
  /** Buffer chunks, flush as one block before ref (ref ignored) */
  batch: (
    _host: StringHost
  ): {
    host: StringHost
    flush: (host: StringHost, ref: string | null) => void
  } => {
    const chunks: string[] = []
    return {
      host: {
        fragments: chunks,
        append: (chunk: string) => chunks.push(chunk),
        toString: () => chunks.join('')
      } as StringHost,
      flush: (targetHost: StringHost, _ref: string | null) => {
        targetHost.append(chunks.join(''))
      }
    }
  }
}
