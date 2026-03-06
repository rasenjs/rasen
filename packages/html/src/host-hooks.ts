/**
 * Host hooks for control flow components (when/each/switch) in SSR
 */
import type { StringHost } from './types'
import { MARKERS, createMarker } from './marker-constants'

/**
 * Host hooks for When component
 */
export const whenHostHooks = {
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
  captureNode: (callback: (node: string) => void) => {
    const capturedChunks: string[] = []
    const captureHost: StringHost = {
      fragments: capturedChunks,
      append: (chunk: string) => {
        capturedChunks.push(chunk)
      },
      toString: () => capturedChunks.join('')
    }
    
    // Capture all appended content
    const result = capturedChunks.join('')
    callback(result)
    
    return captureHost
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
        host.append(createMarker('/w'))
      }
    }
  },
  removeMarker: () => {
    // SSR doesn't need to remove markers
  }
}

/**
 * Host hooks for Each component
 */
export const eachHostHooks = {
  createMarker: (_host: StringHost, content: string) => {
    return createMarker(content)
  },
  appendMarker: (host: StringHost, marker: string) => {
    host.append(marker)
  },
  insertBefore: (host: StringHost, node: string, _before: string | null) => {
    host.append(node)
  },
  removeNode: () => {},
  captureNode: (callback: (node: string) => void) => {
    const capturedChunks: string[] = []
    const captureHost: StringHost = {
      fragments: capturedChunks,
      append: (chunk: string) => {
        capturedChunks.push(chunk)
      },
      toString: () => capturedChunks.join('')
    }
    
    const result = capturedChunks.join('')
    callback(result)
    
    return captureHost
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
  removeMarker: () => {}
}

/**
 * Host hooks for Match component
 */
export const matchHostHooks = {
  createMarker: (_host: StringHost, content: string) => {
    return createMarker(content)
  },
  appendMarker: (host: StringHost, marker: string) => {
    host.append(marker)
  },
  insertBefore: (host: StringHost, node: string, _before: string | null) => {
    host.append(node)
  },
  removeNode: () => {},
  captureNode: (callback: (node: string) => void) => {
    const capturedChunks: string[] = []
    const captureHost: StringHost = {
      fragments: capturedChunks,
      append: (chunk: string) => {
        capturedChunks.push(chunk)
      },
      toString: () => capturedChunks.join('')
    }
    
    const result = capturedChunks.join('')
    callback(result)
    
    return captureHost
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
        host.append(createMarker(MARKERS.MATCH_END))
      }
    }
  },
  removeMarker: () => {}
}
