/**
 * Hydration marker constants
 * 
 * These markers are used across different rendering targets (DOM, HTML, etc.)
 * to identify component boundaries for SSR hydration and control flow.
 * 
 * @packageDocumentation
 */

/**
 * Marker constants for component boundaries
 * 
 * Used in:
 * - Fragment component (f, /f)
 * - Control flow components (when, each, match)
 * - Text node boundaries in SSR
 */
export const MARKERS = {
  // Fragment boundaries
  FRAGMENT_START: 'f',
  FRAGMENT_END: '/f',

  // Text node wrappers (within fragments for SSR)
  TEXT_START: 't',
  TEXT_END: '/t',

  // Control flow components
  WHEN_START: 'w',
  WHEN_END: '/w',

  EACH_START: 'e',
  EACH_END: '/e',

  MATCH_START: 'm',
  MATCH_END: '/m',
} as const

/**
 * Type for marker constant values
 */
export type MarkerType = typeof MARKERS[keyof typeof MARKERS]

/**
 * Debug map for development tools
 */
export const MARKER_DEBUG_MAP: Record<string, string> = {
  [MARKERS.FRAGMENT_START]: 'Fragment Start',
  [MARKERS.FRAGMENT_END]: 'Fragment End',
  [MARKERS.TEXT_START]: 'Text Start',
  [MARKERS.TEXT_END]: 'Text End',
  [MARKERS.WHEN_START]: 'When Start',
  [MARKERS.WHEN_END]: 'When End',
  [MARKERS.EACH_START]: 'Each Start',
  [MARKERS.EACH_END]: 'Each End',
  [MARKERS.MATCH_START]: 'Match Start',
  [MARKERS.MATCH_END]: 'Match End',
}
