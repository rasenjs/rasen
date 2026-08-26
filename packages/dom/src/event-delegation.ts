/**
 * Global event delegation subsystem (opt-in).
 *
 * When enabled via {@link configureEventDelegation}, `on()` (bindings.ts
 * facade) stops attaching per-element listeners and instead stores the
 * handler in a per-element bag under a symbol key. One listener per event
 * type on the delegation root dispatches to the nearest registered ancestor
 * of `event.target` — O(N·listeners) becomes O(1) listeners.
 *
 * Handlers live ON the element (same design as Svelte 5's `delegated()` /
 * Solid's `$$click`): when a subtree is discarded, its handlers are collected
 * by the GC together with the elements — no central registry to prune, no
 * removeEventListener teardown for dead nodes. The per-element remover only
 * detaches the handler while the element is still alive.
 *
 * Only known-bubbling event types delegate; anything else (focus/blur/
 * scroll/mouseenter…) silently never reaches a root listener, so those fall
 * back to direct attachment even while delegation is enabled.
 */

// ---------------------------------------------------------------------------
// Event delegation (P4 opt-in)
//
// When enabled, on() stops attaching per-element listeners and instead stores
// the handler in a per-element bag under a symbol key. One listener per event
// type on the delegation root dispatches to the nearest registered ancestor
// of event.target. Turns O(N·listeners) into O(1) listeners + zero teardown
// bookkeeping for discarded subtrees.
// ---------------------------------------------------------------------------

/** Per-element handler bag: element[EVENTS][type] -> handler. Symbol key so
 *  it never collides with DOM attributes or framework expandos, and never
 *  serializes into markup. */
const EVENTS: unique symbol = Symbol('rasen-events')

type HandlerBag = Record<string, EventListenerOrEventListenerObject>

let delegateRoot: Document | Element | null = null
const attachedRootEvents = new Set<string>()

function rootDispatch(event: Event): void {
  let node = event.target as Element | null
  while (node && node.nodeType === 1) {
    const bag = (node as unknown as Record<symbol, HandlerBag | undefined>)[
      EVENTS
    ]
    const handler = bag?.[event.type]
    if (handler !== undefined) {
      ;(handler as (e: Event) => void).call(node, event)
      return
    }
    node = node.parentElement
  }
}

function ensureRootListener(event: string): void {
  if (!delegateRoot || attachedRootEvents.has(event)) return
  delegateRoot.addEventListener(event, rootDispatch)
  attachedRootEvents.add(event)
}

/** Delegation-aware attach used by the bindings `on()` facade:
 *  bubbling event types store the handler on the element itself (no
 *  per-element listener, no central registry); non-delegatable types attach
 *  directly. Returns its remover. */
export function attachEvent(
  el: Element,
  event: string,
  handler: EventListenerOrEventListenerObject
): () => void {
  if (delegateRoot === null || !DELEGATABLE_EVENTS.has(event)) {
    el.addEventListener(event, handler)
    return () => el.removeEventListener(event, handler)
  }

  const host = el as unknown as Record<symbol, HandlerBag | undefined>
  let bag = host[EVENTS]
  if (!bag) {
    bag = host[EVENTS] = {}
  }
  bag[event] = handler
  ensureRootListener(event)
  // Detach only matters while the element is alive; discarded subtrees take
  // their bags with them to the GC.
  return () => {
    if (bag && bag[event] === handler) {
      delete bag[event]
    }
  }
}

export function configureEventDelegation(enabled: boolean): void {
  if (enabled && delegateRoot === null) {
    delegateRoot = document
  }
  if (!enabled) {
    // Remove root listeners; dispatch paths disappear with them. Handler bags
    // left on still-alive elements are inert (no dispatch path) and are
    // reclaimed by the GC once those elements become unreachable.
    if (delegateRoot) {
      for (const evt of attachedRootEvents) {
        delegateRoot.removeEventListener(evt, rootDispatch)
      }
      attachedRootEvents.clear()
    }
    delegateRoot = null
  }
}

/** Event types safe for delegation — they bubble to the root in every
 *  browser. Anything else (focus/blur/scroll/mouseenter/load…) silently
 *  never reaches a root listener, so on() falls back to direct attachment
 *  for those even while delegation is enabled. */
const DELEGATABLE_EVENTS = new Set([
  'click',
  'dblclick',
  'auxclick',
  'contextmenu',
  'mousedown',
  'mouseup',
  'mousemove',
  'mouseover',
  'mouseout',
  'wheel',
  'keydown',
  'keyup',
  'input',
  'change',
  'submit',
  'pointerdown',
  'pointerup',
  'pointermove',
  'pointerover',
  'pointerout',
  'touchstart',
  'touchend',
  'touchmove',
  'touchcancel',
])
