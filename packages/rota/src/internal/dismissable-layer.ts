/**
 * Dismissable layer: report the ways a user asks to close an overlay.
 *
 * Escape, a press outside, and focus landing outside are three gestures with
 * one thing in common — the listeners belong on `document`, not on the panel,
 * because the whole point is to notice when the user is *not* inside it. A panel
 * that only listens on itself misses Escape while focus sits on the body, and
 * never hears a press on the page behind (which the overlay would swallow).
 *
 * What each gesture *does* is the caller's decision, so this reports instead of
 * closing: an AlertDialog answers Escape by doing nothing, a Dialog closes, and
 * a Popover would ignore the press that opened it. A callback cancels the
 * dismissal with `preventDefault()` — the same contract a DOM event has, so no
 * extra convention to learn.
 *
 * Inert until `activate()`, like the focus scope: none of this runs during a
 * string render.
 */

export interface DismissableLayerOptions {
  /** The element that counts as "inside". */
  container: () => HTMLElement | null
  /** Called when a gesture dismisses. `preventDefault()` on the event cancels it. */
  onDismiss?: (event: Event) => void
  /** Called before dismissing on Escape; preventDefault to keep it open. */
  onEscapeKeyDown?: (event: KeyboardEvent) => void
  /** Called before dismissing on a press outside; preventDefault to keep it open. */
  onPointerDownOutside?: (event: Event) => void
  /** Called before dismissing when focus leaves; preventDefault to keep it open. */
  onFocusOutside?: (event: FocusEvent) => void
  /** Whether Escape dismisses (default true). */
  dismissOnEscape?: boolean
  /** Whether a press outside dismisses (default true). */
  dismissOnPointerDownOutside?: boolean
  /**
   * Whether focus leaving dismisses (default false). Focus escaping a modal is
   * a bug to repair — that is the focus scope's job — not a reason to close it.
   */
  dismissOnFocusOutside?: boolean
  /**
   * Elements that count as inside although they are not descendants: a portalled
   * part, or the trigger that would otherwise read as an outside press.
   */
  isInside?: (target: Node | null) => boolean
}

export interface DismissableLayer {
  activate: () => void
  deactivate: () => void
  isActive: () => boolean
}

/**
 * The press event to listen for. `pointerdown` covers mouse, touch and pen in
 * one listener, but a host without PointerEvent still needs `mousedown`.
 * Listening to both is not an option: a real browser fires both for one press,
 * so every callback would run twice.
 */
function pressEventName(doc: Document): string {
  const view = doc.defaultView as (Window & { PointerEvent?: unknown }) | null
  return view && typeof view.PointerEvent === 'function'
    ? 'pointerdown'
    : 'mousedown'
}

export function createDismissableLayer(
  options: DismissableLayerOptions
): DismissableLayer {
  const { container, isInside } = options
  const dismissOnEscape = options.dismissOnEscape ?? true
  const dismissOnPointerDownOutside = options.dismissOnPointerDownOutside ?? true
  const dismissOnFocusOutside = options.dismissOnFocusOutside ?? false

  let active = false
  let doc: Document | null = null
  let pressEvent = 'pointerdown'

  const inside = (target: Node | null): boolean => {
    if (!target) return false
    if (isInside?.(target)) return true
    return !!container()?.contains(target)
  }

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented) return

    if (options.onEscapeKeyDown) {
      options.onEscapeKeyDown(event)
      if (event.defaultPrevented) return
    }
    if (!dismissOnEscape) return
    options.onDismiss?.(event)
  }

  const handlePress = (event: Event): void => {
    if (event.defaultPrevented) return
    if (inside(event.target as Node | null)) return

    if (options.onPointerDownOutside) {
      options.onPointerDownOutside(event)
      if (event.defaultPrevented) return
    }
    if (!dismissOnPointerDownOutside) return
    options.onDismiss?.(event)
  }

  const handleFocusIn = (event: FocusEvent): void => {
    if (event.defaultPrevented) return
    if (inside(event.target as Node | null)) return

    if (options.onFocusOutside) {
      options.onFocusOutside(event)
      if (event.defaultPrevented) return
    }
    if (!dismissOnFocusOutside) return
    options.onDismiss?.(event)
  }

  const activate = (): void => {
    if (active) return
    const el = container()
    if (!el) return
    doc = el.ownerDocument
    pressEvent = pressEventName(doc)
    // Capture phase: a handler on the way up must not be able to hide a press
    // that happened outside — including one the overlay would otherwise eat.
    doc.addEventListener('keydown', handleKeyDown, true)
    doc.addEventListener(pressEvent, handlePress, true)
    doc.addEventListener('focusin', handleFocusIn, true)
    active = true
  }

  const deactivate = (): void => {
    if (!active) return
    active = false
    if (!doc) return
    doc.removeEventListener('keydown', handleKeyDown, true)
    doc.removeEventListener(pressEvent, handlePress, true)
    doc.removeEventListener('focusin', handleFocusIn, true)
    doc = null
  }

  return { activate, deactivate, isActive: () => active }
}
