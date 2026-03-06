/**
 * DOM-specific marker utilities
 * 
 * Re-exports marker constants from @rasenjs/core and provides
 * DOM-specific helper functions for working with comment markers.
 */
export { MARKERS, MARKER_DEBUG_MAP, type MarkerType } from '@rasenjs/core'

/**
 * Check if a comment node matches the expected marker type
 */
export function isMarkerMatch(node: Comment, expectedType: string): boolean {
  return node.textContent?.trim() === expectedType
}
