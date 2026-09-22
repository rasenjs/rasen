/**
 * Scroll lock for modal layers.
 *
 * A modal that leaves the page scrollable underneath can be scrolled *behind*,
 * which moves the layer's own content out from under the pointer and reads as a
 * bug in the dialog. The visible symptom is usually "the page jumped".
 *
 * Counting rather than a flag, because layers nest: opening a dialog inside a
 * dialog must not unlock the page when the inner one closes, and the outer one
 * is the one that restores. The previous inline value is remembered rather than
 * cleared, so a consumer that had its own `overflow` keeps it.
 *
 * Browser-only by nature: with no `document` (server rendering, a layout-free
 * test environment) this is a no-op, so a component can call it unconditionally.
 */
let locks = 0
let previousOverflow = ''

/** Lock page scrolling. Every call must be matched by one `unlockScroll()`. */
export function lockScroll(): void {
  if (typeof document === 'undefined') return
  if (locks === 0) {
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  locks += 1
}

/** Release one lock. The page unlocks when the last one goes. */
export function unlockScroll(): void {
  if (typeof document === 'undefined') return
  if (locks === 0) return
  locks -= 1
  if (locks === 0) {
    document.body.style.overflow = previousOverflow
  }
}
