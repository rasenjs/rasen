/**
 * Focus scope: keep the keyboard inside one container while it is active.
 *
 * A modal needs two things the browser does not do by itself — Tab has to wrap
 * at the ends instead of walking into the page behind, and focus has to go back
 * where it came from when the modal closes. Both are DOM facts, so this is one
 * of the few places in the package that touches `document`, and it stays inert
 * until `activate()`: a string render never calls it, and the components only
 * call it once an element exists.
 *
 * Focusability is judged from markup — `hidden`, `aria-hidden`, and the
 * computed `display` / `visibility` — not from layout. `getClientRects()` is
 * always empty under jsdom, so a layout test would quietly skip every element
 * and leave the trap untested. The cost is that an off-screen or zero-size
 * element still counts as a candidate; every mechanism the components use to
 * hide a panel (`hidden`, `display`) is covered.
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

/** Is this element reachable by Tab / programmatic focus? */
function isFocusable(el: HTMLElement): boolean {
  // The selector above is a union, so a `<button tabindex="-1">` matches the
  // button clause even though it is out of the tab order. `tabIndex` is the
  // authoritative answer: 0 for a natively focusable element with no attribute,
  // -1 for anything opted out (or not focusable at all).
  if (el.tabIndex < 0) return false
  if (el.hasAttribute('hidden')) return false
  if (el.getAttribute('aria-hidden') === 'true') return false
  // An ancestor being hidden hides this element too.
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    if (node.hasAttribute('hidden')) return false
    if (node.getAttribute('aria-hidden') === 'true') return false
  }
  const style = (el.ownerDocument.defaultView ?? window).getComputedStyle(el)
  if (style.display === 'none' || style.visibility === 'hidden') return false
  return true
}

/** Tab order within a container, in document order (what Tab follows). */
export function focusablesIn(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter(isFocusable)
}

export interface FocusScope {
  /** Start trapping. Idempotent. Remembers where focus is now. */
  activate: () => void
  /**
   * Stop trapping.
   *
   * `restoreFocus` (default true) puts focus back where it was — the modal
   * convention. Pass false when the consumer takes over, which is how a
   * `preventDefault()`ed `onCloseAutoFocus` reads: it means "I will decide where
   * focus goes", and the scope must then stop rather than fight it.
   */
  deactivate: (restoreFocus?: boolean) => void
  /** Focus an element, or the first focusable in the scope (or the container). */
  focus: (target?: HTMLElement | null) => void
  /** Whether the node is inside the scope's container. */
  contains: (node: Node | null) => boolean
  /** Whether the scope is trapping right now (tests and parts ask this). */
  isActive: () => boolean
}

export interface FocusScopeOptions {
  /** The element whose subtree the keyboard must stay inside. */
  container: () => HTMLElement | null
}

export function createFocusScope(options: FocusScopeOptions): FocusScope {
  const { container } = options
  let previous: HTMLElement | null = null
  let active = false

  const contains = (node: Node | null): boolean => {
    const el = container()
    return !!el && !!node && el.contains(node)
  }

  const focus = (target?: HTMLElement | null): void => {
    const el = container()
    if (!el) return
    if (target) {
      target.focus()
      return
    }
    const first = focusablesIn(el)[0]
    // A container with nothing focusable is still a valid place for focus:
    // it carries tabindex="-1" precisely so that it can hold it.
    ;(first ?? el).focus()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return
    const el = container()
    if (!el) return

    const candidates = focusablesIn(el)
    if (candidates.length === 0) {
      // Nothing to move to: keep focus on the container rather than let it go.
      event.preventDefault()
      el.focus()
      return
    }

    const first = candidates[0]!
    const last = candidates[candidates.length - 1]!
    const current = el.ownerDocument.activeElement as HTMLElement | null

    if (!current || !el.contains(current)) {
      // Focus escaped (or never arrived): pull it back to the near end.
      event.preventDefault()
      ;(event.shiftKey ? last : first).focus()
      return
    }
    if (event.shiftKey && current === first) {
      event.preventDefault()
      last.focus()
      return
    }
    if (!event.shiftKey && current === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const activate = (): void => {
    if (active) return
    const el = container()
    if (!el) return
    const doc = el.ownerDocument
    previous = (doc.activeElement as HTMLElement | null) ?? null
    // Capture phase: the trap has to see Tab even when focus sits outside the
    // container, which is exactly the case it exists to repair.
    doc.addEventListener('keydown', onKeyDown, true)
    active = true
  }

  const deactivate = (restoreFocus = true): void => {
    if (!active) return
    active = false
    const el = container()
    const doc = el?.ownerDocument ?? previous?.ownerDocument ?? null
    doc?.removeEventListener('keydown', onKeyDown, true)

    const toRestore = previous
    previous = null
    if (!restoreFocus || !doc || !toRestore || !toRestore.isConnected) return

    // Give focus back only when it is still ours to give back: either nothing
    // is focused, or focus is inside the container we are closing. A consumer
    // that deliberately moved focus elsewhere keeps it.
    const current: Node | null = doc.activeElement
    const stillOurs =
      current === null || current === doc.body || (!!el && el.contains(current))
    if (stillOurs) toRestore.focus()
  }

  return { activate, deactivate, focus, contains, isActive: () => active }
}
