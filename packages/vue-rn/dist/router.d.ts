/**
 * @rasenjs/vue-rn — vue-router integration
 *
 * Usage:
 *   import { RouterLink } from '@rasenjs/vue-rn/router'
 */

import { defineComponent } from 'vue'

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
