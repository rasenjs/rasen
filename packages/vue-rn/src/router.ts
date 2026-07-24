/**
 * @rasenjs/vue-rn — vue-router integration
 *
 * Export RN-compatible RouterLink + a re-branded MemoryHistory creator
 * from a dedicated sub-path.
 *
 * Usage:
 *   import { RouterLink, createRNHistory } from '@rasenjs/vue-rn/router'
 *
 *   const router = createRouter({
 *     history: createRNHistory(),
 *     routes,
 *   })
 */

import { createMemoryHistory } from 'vue-router'

export { RouterLink } from './router-link'

/**
 * Creates a router history suitable for React Native.
 *
 * RN has no real URL bar, so we use an in-memory history.
 * The `createRNHistory` name leaves room for future enhancements
 * (e.g. deep-link support via a custom RouterHistory implementation)
 * without changing the public API.
 *
 * @param base - Optional base path (default '/')
 * @returns RouterHistory instance
 */
export function createRNHistory(base?: string): ReturnType<typeof createMemoryHistory> {
  return createMemoryHistory(base)
}
