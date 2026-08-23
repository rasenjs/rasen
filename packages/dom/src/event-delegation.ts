/**
 * Global event delegation subsystem (opt-in).
 *
 * When enabled via {@link configureEventDelegation}, `on()` (bindings.ts
 * facade) stops attaching per-element listeners and instead tags elements
 * with a data attribute + registers handlers in a shared table. One listener
 * per event type on the delegation root dispatches to the nearest registered
 * ancestor of `event.target` — O(N·listeners) becomes O(1) listeners.
 *
 * Only known-bubbling event types delegate; anything else (focus/blur/
 * scroll/mouseenter…) silently never reaches a root listener, so those fall
 * back to direct attachment even while delegation is enabled.
 */

// ---------------------------------------------------------------------------
// Event delegation (P4 opt-in)
//
// When enabled, on() stops attaching per-element listeners and instead tags
// the element with a data attribute + registers the handler in a registry.
// One listener per event type on the delegation root dispatches to the
// nearest registered ancestor of event.target. Turns O(N·listeners) into
// O(1) listeners + O(N) registry entries (e.g. 10k rows × 2 clicks → 1
// listener).
// ---------------------------------------------------------------------------

const DELEGATE_ATTR = 'data-rasen-eid'

/** event type -> eid -> handler */
const delegateRegistry = new Map<string, Map<number, EventListenerOrEventListenerObject>>()
let delegateEid = 0
let delegateRoot: Document | Element | null = null
const attachedRootEvents = new Set<string>()

function rootDispatch(event: Event): void {
  const table = delegateRegistry.get(event.type)
  if (!table) return
  let node = event.target as Element | null
  while (node && node.nodeType === 1) {
    const eid = (node as HTMLElement).getAttribute?.(DELEGATE_ATTR)
    if (eid !== null) {
      const handler = table.get(Number(eid))
      if (handler !== undefined) {
        ;(handler as (e: Event) => void).call(node, event)
        return
      }
    }
    node = node.parentElement
  }
}

function ensureRootListener(event: string): void {
  if (!delegateRoot || attachedRootEvents.has(event)) return
  delegateRoot.addEventListener(event, rootDispatch)
  attachedRootEvents.add(event)
}

/** Enable/disable global event delegation for subsequently bound events.
 *  While disabled, on() attaches direct listeners as before; handlers
 *  already registered through delegation keep working until removed. */
/** Delegation-aware attach used by the bindings `on()` facade:
 *  bubbling event types register in the shared table (no per-element
 *  listener); non-delegatable types attach directly. Returns its remover. */
export function attachEvent(
  el: Element,
  event: string,
  handler: EventListenerOrEventListenerObject
): () => void {
  if (delegateRoot === null || !DELEGATABLE_EVENTS.has(event)) {
    el.addEventListener(event, handler)
    return () => el.removeEventListener(event, handler)
  }

  const existing = (el as HTMLElement).getAttribute?.(DELEGATE_ATTR)
  let eid = existing !== null && existing !== undefined ? Number(existing) : NaN
  if (!Number.isInteger(eid)) {
    eid = ++delegateEid
    ;(el as HTMLElement).setAttribute(DELEGATE_ATTR, String(eid))
  }
  let table = delegateRegistry.get(event)
  if (!table) {
    table = new Map()
    delegateRegistry.set(event, table)
    ensureRootListener(event)
  }
  table.set(eid, handler)
  return () => {
    table!.delete(eid)
  }
}

export function configureEventDelegation(enabled: boolean): void {
  if (enabled && delegateRoot === null) {
    delegateRoot = document
  }
  if (!enabled) {
    // Detach root listeners and clear the registry: handlers registered
    // while delegation was on lose their dispatch path with the root
    // listener, so keeping their entries would only block re-attachment
    // after a subsequent enable.
    if (delegateRoot) {
      for (const evt of attachedRootEvents) {
        delegateRoot.removeEventListener(evt, rootDispatch)
      }
      attachedRootEvents.clear()
    }
    delegateRegistry.clear()
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

