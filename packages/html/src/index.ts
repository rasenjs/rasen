/**
 * Rasen HTML - HTML 渲染器 (用于 SSR/SSG)
 */

export * from './components'
export * from './types'
// The fragment compiled from `<>…</>`: THIS host's text-capable
// implementation (core's structural fragment + html's hydration-markered
// hooks) — emitted code binds `Fragment` through the app's auto-import from
// this root, and HTML_TAGS lists it.
export { Fragment } from './components/fragment'
// The host's tag names as pure data — the binding half of JSX (see
// www/guide/advanced/jsx).
export { HTML_TAGS } from './tags'
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
export { htmlHostHooks } from './host-hooks'
export type { SSRNode } from './host-hooks'

