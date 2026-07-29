/**
 * Rasen HTML - HTML 渲染器 (用于 SSR/SSG)
 */

export * from './components'
export * from './types'
export {
  escapeHtml,
  escapeAttr,
  stringifyAttr,
  stringifyStyle,
  stringifyClass,
  isVoidElement,
  VOID_ELEMENTS
} from './utils'
export { MARKERS, createMarker, MARKER_DEBUG_MAP } from './marker-constants'
export { whenHostHooks, eachHostHooks, matchHostHooks } from './host-hooks'

// ── JSX Host Registration ─────────────────────────────────────────────
// Side effect: register components for JSX auto-detection.
import { registerHostComponents } from '@rasenjs/core'
import * as __components from './components'
registerHostComponents('@rasenjs/html', __components)
