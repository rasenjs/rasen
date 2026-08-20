/**
 * Host hooks for control flow components (when/each/match) in SSR
 *
 * Unified single set of hooks — provided via HostContext by the render entry
 * (renderToString), so core's when/each/match get them automatically.
 */
import type { StringHost } from './types'
import { MARKERS, createMarker } from './marker-constants'

/**
 * Unified HTML host hooks for when/each/match
 */
export const htmlHostHooks = {
  createMarker: (_host: StringHost, content: string) => {
    return createMarker(content)
  },
  appendMarker: (host: StringHost, marker: string) => {
    host.append(marker)
  },
  insertBefore: (host: StringHost, node: string, _before: string | null) => {
    // In SSR, we just append; there's no concept of "insert before"
    host.append(node)
  },
  removeNode: () => {
    // SSR doesn't need to remove nodes
  },
  createFragment: () => {
    const chunks: string[] = []
    return {
      host: {
        fragments: chunks,
        append: (chunk: string) => chunks.push(chunk),
        toString: () => chunks.join('')
      } as StringHost,
      flush: (host: StringHost, _before: string | null) => {
        const content = chunks.join('')
        host.append(content)
        host.append(createMarker(MARKERS.EACH_END))
      }
    }
  },
  removeMarker: () => {
    // SSR doesn't need to remove markers
  }
}

/**
 * @deprecated Use htmlHostHooks instead
 */
export const whenHostHooks = htmlHostHooks

/**
 * @deprecated Use htmlHostHooks instead
 */
export const eachHostHooks = htmlHostHooks

/**
 * @deprecated Use htmlHostHooks instead
 */
export const matchHostHooks = htmlHostHooks
