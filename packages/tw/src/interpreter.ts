/**
 * The runtime interpreter.
 *
 * `tw(classes)` splits a class string on whitespace, resolves each token
 * against the curated token table (or the arbitrary-value parser), and merges
 * the results into a single flat `TwStyle` record.
 *
 * Performance model:
 * - **Memoization**: identical class strings return the *same frozen record*
 *   instance — zero re-parsing, zero GC churn on hot paths.
 * - **AOT table**: `createTw(prebuilt)` checks a build-time generated
 *   full-string table first (O(1) lookup, no parsing at all for known
 *   strings), falling back to runtime parse + memoize for anything new.
 */

import { parseArbitrary } from './arbitrary'
import { TOKENS } from './tokens'
import type { TwStyle } from './types'

/**
 * Resolve a class string into a fresh style record without memoization.
 * Shared by the runtime interpreter and the AOT generator.
 */
export function resolveClasses(classes: string, table: Record<string, TwStyle> = TOKENS): TwStyle {
  const record: TwStyle = {}
  for (const token of classes.split(/\s+/)) {
    if (!token) continue
    const entry = table[token]
    if (entry) {
      Object.assign(record, entry)
    } else {
      const arb = parseArbitrary(token)
      if (arb) Object.assign(record, arb)
    }
  }
  return record
}

/**
 * Create a bound `tw` function with its own memo cache.
 *
 * @param prebuilt - optional AOT-generated table mapping *full class strings*
 *                   to precomputed records (see `tw-generate`). When present,
 *                   known strings short-circuit to an O(1) lookup.
 */
export function createTw(prebuilt?: Record<string, TwStyle>): (classes: string) => TwStyle {
  const cache = new Map<string, TwStyle>()
  return function tw(classes: string): TwStyle {
    if (prebuilt) {
      const hit = prebuilt[classes]
      if (hit) return hit
    }
    const cached = cache.get(classes)
    if (cached) return cached
    const record = resolveClasses(classes)
    Object.freeze(record)
    cache.set(classes, record)
    return record
  }
}

/**
 * Default interpreter backed by the built-in curated token table.
 *
 * @example
 * ```ts
 * import { tw } from '@rasenjs/tw'
 * tw('flex flex-col gap-2 bg-[#505050]')
 * // => { display: 'flex', flexDirection: 'column', gap: 8, backgroundColor: '#505050' }
 * ```
 */
export const tw: (classes: string) => TwStyle = createTw()