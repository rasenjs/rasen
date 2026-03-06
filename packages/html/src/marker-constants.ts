/**
 * HTML/SSR-specific marker utilities
 * 
 * Re-exports marker constants from @rasenjs/core and provides
 * HTML-specific helper functions for generating comment markers.
 */
export { MARKERS, MARKER_DEBUG_MAP, type MarkerType } from '@rasenjs/core'

/**
 * Create an HTML comment marker
 * @example
 * createMarker(MARKERS.FRAGMENT_START) // <!-- f -->
 * createMarker(MARKERS.WHEN_END) // <!-- /w -->
 */
export function createMarker(type: string): string {
  return `<!-- ${type} -->`
}

