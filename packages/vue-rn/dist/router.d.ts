/**
 * @rasenjs/vue-rn — vue-router integration
 *
 * Usage:
 *   import { RouterLink, createRNHistory } from '@rasenjs/vue-rn/router'
 */

import { defineComponent } from 'vue'
import type { RouterHistory } from 'vue-router'

/**
 * RN-compatible RouterLink for vue-router.
 *
 * Default: renders touchable View wrapping your slot content.
 * Plain text content is auto-wrapped in <Text>.
 *
 * Examples:
 *   <RouterLink to="/">Home</RouterLink>
 *   <RouterLink to="/about" custom v-slot="{ isActive }">
 *     <Text :style="{ color: isActive ? '#16c79a' : '#e0e0ee' }">About</Text>
 *   </RouterLink>
 */
export declare const RouterLink: ReturnType<typeof defineComponent>

/**
 * Creates an in-memory history for React Native.
 *
 * This is a re-branded `createMemoryHistory` from vue-router, named
 * `createRNHistory` to leave room for future RN-specific enhancements
 * (deep-link support, etc.) without API breakage.
 *
 * @param base - Optional base path (default '/')
 */
export declare function createRNHistory(base?: string): RouterHistory
