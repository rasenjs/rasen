/**
 * @rasenjs/rn-dom — Event System
 *
 * DOM-standard event pipeline for the RN Fabric renderer.
 *
 * Model (aligned with the browser, not React's plugin registry):
 *
 *   Fabric low-level event (topTouchStart/topTouchEnd/topChange/topFocus…)
 *     │
 *     ▼
 *   resolveEventBehavior()   ← read RN viewConfig (bubblingEventTypes /
 *                              directEventTypes) for handler name + bubbling
 *     │
 *     ▼
 *   dispatchTwoPhase()       ← standard capture → target → bubble walk
 *     │
 *     ├─ capture phase: root → target (addEventListener capture listeners)
 *     ├─ target phase:  press synthesis (touch → press series) + handlers
 *     └─ bubble phase:  target → root, each node fires its handler
 *     │
 *     └─ propagation control (per-node, in order):
 *         1. user stopPropagation()          → stop immediately (DOM)
 *         2. viewConfig skipBubbling         → stop after this node (RN)
 *         3. synthesized press "exclusive"   → stop after press owner (RN
 *                                              Pressable semantics; can be
 *                                              disabled for pure-DOM bubbling)
 *
 * Everything is a plain DOM event with target/currentTarget/nativeEvent/
 * stopPropagation/preventDefault/timeStamp.
 */

import type { FabricUIManager } from './fabric-global'

// ============================================================================
// Types
// ============================================================================

export type DispatchEventFn = (
  instanceHandle: object,
  type: string,
  payload: Record<string, unknown>,
) => void

/** Minimal structural view of an RNNode the event system needs. */
export interface EventNode {
  nodeType: number
  tagName: string
  _nativeName: string
  parentNode: EventNode | null
  currentProps: Record<string, unknown>
  _listeners?: Map<string, Set<unknown>>
}

/** Fabric node id — nodes carry it under a shared symbol. */
export const FABRIC_NODE_ID_SYMBOL = Symbol.for('fabricNodeId')

/** Callback shape for Fabric measure (left, top, width, height, pageX, pageY). */
export type MeasureCallback = (
  left: number,
  top: number,
  width: number,
  height: number,
  pageX: number,
  pageY: number,
) => void

export interface EventSystemOptions {
  /** Resolve the node for a Fabric tag (instance map lookup). */
  getNodeByTag(tag: number): EventNode | null
  /** Focus management helpers (rn-dom owns _focusedNode). */
  focusNode(node: EventNode): void
  blurFocusedNode(): void
  getFocusedNode(): EventNode | null
  /** Fabric measure for press-rect checks. */
  measure(node: EventNode, cb: MeasureCallback): void
  /** ViewConfig registry access (ReactNativePrivateInterface). */
  getViewConfig(node: EventNode): Record<string, unknown> | undefined
  /** Fabric UIManager for blur/focus + measure. */
  getFabricUIManager(): FabricUIManager
}

// ============================================================================
// Native-module event bridge (non-Fabric events)
//
// Some RN events do NOT flow through Fabric viewConfigs. They are emitted by
// native modules on the global RCTDeviceEventEmitter, e.g.:
//   - Modal onDismiss: native sends `modalDismissed { modalID }`, the RN
//     Modal.js wrapper matches the id to its onDismiss callback.
// Since rn-dom renders native components directly (no RN wrapper components),
// we subscribe here and route by identifier.
// ============================================================================

interface ModalBridgeState {
  /** identifier → node with an onDismiss callback. */
  modals: Map<number, EventNode>
  /** Next identifier (mirrors RN's uniqueModalIdentifier). */
  nextId: number
  /** Whether the bridge is subscribed to RCTDeviceEventEmitter. */
  subscribed: boolean
}

const _modalBridge: ModalBridgeState = { modals: new Map(), nextId: 1, subscribed: false }

/** Lazy-load RCTDeviceEventEmitter (global native event emitter).
 *  Resolution order: globalThis injection (tests) → deep require (Metro). */
function getDeviceEventEmitter(): { addListener: (name: string, cb: (e: unknown) => void) => { remove: () => void } } | null {
  const injected = (globalThis as Record<string, unknown>).__RASEN_DEVICE_EVENT_EMITTER__
  if (injected && typeof (injected as { addListener?: unknown }).addListener === 'function') {
    return injected as never
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native/Libraries/EventEmitter/RCTDeviceEventEmitter')
    const emitter = mod?.default ?? mod
    return typeof emitter?.addListener === 'function' ? emitter : null
  } catch {
    return null
  }
}

/** Ensure the modalDismissed listener is registered once. */
function ensureModalBridgeSubscribed(): void {
  if (_modalBridge.subscribed) return
  const emitter = getDeviceEventEmitter()
  if (!emitter) return
  emitter.addListener('modalDismissed', (event: unknown) => {
    const modalID = (event as { modalID?: number } | null)?.modalID
    if (modalID == null) return
    const node = _modalBridge.modals.get(modalID)
    if (!node) return
    const onDismiss = node.currentProps.onDismiss
    if (typeof onDismiss === 'function') {
      ;(onDismiss as () => void)()
    }
    _modalBridge.modals.delete(modalID)
  })
  _modalBridge.subscribed = true
}

/** Register a Modal node; assigns its native `identifier` prop. */
export function registerModalNode(node: EventNode, props: Record<string, unknown>): number {
  ensureModalBridgeSubscribed()
  const id = _modalBridge.nextId++
  // Store the identifier on the node so the renderer can pass it to native.
  ;(node as unknown as Record<string, unknown>).__modalID = id
  _modalBridge.modals.set(id, node)
  return id
}

/** Unregister a Modal node (called on unmount). */
export function unregisterModalNode(node: EventNode): void {
  const id = (node as unknown as Record<string, unknown>).__modalID as number | undefined
  if (id != null) _modalBridge.modals.delete(id)
}

/** Reset the modal bridge (tests). */
export function resetModalBridge(): void {
  _modalBridge.modals.clear()
  _modalBridge.nextId = 1
  _modalBridge.subscribed = false
}

// ============================================================================
// Behavior resolution (from RN viewConfig — reused, not duplicated)
// ============================================================================

export interface EventBehavior {
  /** DOM event type (for addEventListener-based listeners). */
  domType: string
  /** True: bubble through all ancestors. False: target only (direct event). */
  bubble: boolean
  /** Handler prop name (e.g. 'onTouchEnd') from viewConfig's bubbled name. */
  bubbledName?: string
  /** RN: skipBubbling → stop propagation after the first handling node. */
  skipBubbling: boolean
}

const DEFAULT_DOM_TYPES: Record<string, string> = {
  topTouchStart: 'touchstart',
  topTouchMove: 'touchmove',
  topTouchEnd: 'touchend',
  topTouchCancel: 'touchcancel',
  topClick: 'click',
  topChange: 'change',
  topPress: 'click',
}

/**
 * Resolve how a Fabric event should be dispatched from the target node's
 * viewConfig — RN's own bubblingEventTypes/directEventTypes are the source
 * of truth. Falls back to the RN convention: `topXxx` → `onXxx`, bubbles.
 */
export function resolveEventBehavior(
  type: string,
  viewConfig: Record<string, unknown> | undefined,
): EventBehavior {
  const domType = DEFAULT_DOM_TYPES[type] ?? type.replace(/^top/, '').toLowerCase()

  // Direct events: { directEventTypes: { topLayout: { registrationName: 'onLayout' } } }
  const direct = viewConfig?.directEventTypes as Record<string, unknown> | undefined
  const directCfg = direct?.[type] as Record<string, unknown> | undefined
  if (directCfg) {
    return {
      domType,
      bubble: false,
      bubbledName: (directCfg.registrationName as string) ?? 'on' + type.slice(3),
      skipBubbling: false,
    }
  }

  // Bubbling events: { bubblingEventTypes: { topTouchEnd: { phasedRegistrationNames: { bubbled: 'onTouchEnd', captured: 'onTouchEndCapture', skipBubbling? } } } }
  const bubbling = viewConfig?.bubblingEventTypes as Record<string, unknown> | undefined
  const bubblingCfg = bubbling?.[type] as Record<string, unknown> | undefined
  const names = bubblingCfg?.phasedRegistrationNames as Record<string, unknown> | undefined
  if (bubblingCfg) {
    return {
      domType,
      bubble: true,
      bubbledName: (names?.bubbled as string) ?? 'on' + type.slice(3),
      skipBubbling: names?.skipBubbling === true,
    }
  }

  // Unknown: assume RN convention (bubbles, onXxx).
  return {
    domType,
    bubble: true,
    bubbledName: 'on' + type.slice(3),
    skipBubbling: false,
  }
}

// ============================================================================
// Press synthesis (touch sequence → press series)
// ============================================================================

/**
 * Press series: pressIn → (pressMove*) → [500ms longPress] → pressOut → press.
 * RN Pressability semantics, implemented as a small state machine:
 *  - long-press suppresses onPress
 *  - touch cancel terminates without pressOut/press
 *  - moving beyond the press rect (hitSlop/pressRectOffset) cancels the press
 *  - delays (delayPressIn/Out, minPressDuration) honored
 */

const DEFAULT_LONG_PRESS_DELAY_MS = 500
// Aligns with RN Pressability's default pressRectOffset {top:20,left:20,right:20,bottom:30}.
const DEFAULT_PRESS_RECT_OFFSETS = { bottom: 30, left: 20, right: 20, top: 20 }

/** Does this node bind any press-related surface handler? */
export function hasPressHandlers(props: Record<string, unknown>): boolean {
  return typeof props.onPressIn === 'function'
    || typeof props.onPressMove === 'function'
    || typeof props.onPressOut === 'function'
    || typeof props.onPress === 'function'
    || typeof props.onLongPress === 'function'
}

/** Consult RN responder props: can this node become/keep the responder?
 *  Mirrors onStartShouldSetResponder / onMoveShouldSetResponder /
 *  onResponderTerminationRequest — returns true by default when the node has
 *  press handlers (a View with onPress is implicitly pressable). */
function shouldClaimResponder(node: EventNode, type: string): boolean {
  const props = node.currentProps
  if (props.disabled === true) return false
  if (typeof props.onStartShouldSetResponder === 'function') {
    return (props.onStartShouldSetResponder as () => boolean)() === true
  }
  if (type === 'topTouchMove' && typeof props.onMoveShouldSetResponder === 'function') {
    return (props.onMoveShouldSetResponder as () => boolean)() === true
  }
  return hasPressHandlers(props)
}

function normalizeDelay(v: unknown, min = 0): number {
  return Math.max(min, typeof v === 'number' ? v : 0)
}

/** Touch coordinates from a nativeEvent (pageX/pageY, or touches[0]). */
function touchPoint(nativeEvent: Record<string, unknown>): { pageX: number, pageY: number } | null {
  const touches = nativeEvent.touches as Array<Record<string, unknown>> | undefined
  const t = touches?.[0]
  if (t) return { pageX: t.pageX as number, pageY: t.pageY as number }
  const changed = nativeEvent.changedTouches as Array<Record<string, unknown>> | undefined
  const c = changed?.[0]
  if (c) return { pageX: c.pageX as number, pageY: c.pageY as number }
  if (typeof nativeEvent.pageX === 'number') {
    return { pageX: nativeEvent.pageX as number, pageY: nativeEvent.pageY as number }
  }
  return null
}

/**
 * Press state — RN Pressability's press-rect behavior:
 * the touch may leave the press rect (pressOut fires) and re-enter
 * (pressIn fires again); releasing outside the rect does NOT fire onPress.
 */
interface PressState {
  /** Long-press timer (null once fired/cancelled). */
  timer: ReturnType<typeof setTimeout> | null
  isLong: boolean
  /** True while the touch is within the press rect. */
  withinRect: boolean
  /** Touch point at grant (fallback when node rect is unavailable). */
  touchStart: { pageX: number, pageY: number } | null
  /** Measured node rect (pageX/pageY based), like RN's responderRegion. */
  rect: { left: number, top: number, right: number, bottom: number } | null
  /** Timestamp of touchStart (for minPressDuration). */
  startTime: number
  /** True once onPressIn has actually fired (incl. delayPressIn). */
  inFired: boolean
}

const _pressStates = new WeakMap<EventNode, PressState>()
/** Current press responder (nearest ancestor with press handlers). */
let _pressOwner: EventNode | null = null

/** Start the long-press timer; fires onLongPress after delay. */
function startPressTracking(
  node: EventNode,
  state: PressState,
): void {
  const props = node.currentProps
  const delay = normalizeDelay(props.delayLongPress, DEFAULT_LONG_PRESS_DELAY_MS)
  state.timer = setTimeout(() => {
    state.isLong = true
    const onLongPress = props.onLongPress
    if (typeof onLongPress === 'function') {
      ;(onLongPress as (e: Record<string, unknown>) => void)({
        type: 'longpress',
        target: node,
        currentTarget: node,
        nativeEvent: { timestamp: Date.now() },
      })
    }
  }, delay)
}

/** Clear the long-press timer. Returns true if it was a long-press. */
function endPressTracking(node: EventNode): boolean {
  const state = _pressStates.get(node)
  if (state) {
    if (state.timer) clearTimeout(state.timer)
    _pressStates.delete(node)
    return state.isLong
  }
  return false
}

/**
 * Check whether the touch is within the press rect.
 * RN Pressability measures the NODE's rect (responderRegion) and checks the
 * touch against it + pressRectOffset/hitSlop. We mirror that: use the measured
 * node rect; if it's unavailable (measure not returned yet / no native
 * measure), do NOT cancel — like RN when responderRegion is null.
 */
function isTouchWithinRect(
  node: EventNode,
  nativeEvent: Record<string, unknown>,
): boolean {
  const state = _pressStates.get(node)
  const touch = touchPoint(nativeEvent)
  if (!state || !touch) return true // unknown: don't cancel

  const props = node.currentProps
  const hitSlop = props.hitSlop as Record<string, number> | undefined
  // pressRectOffset may be a number (applied to all sides) or an Insets
  // object, like RN Pressability.
  const rawOffset = typeof props.pressRectOffset === 'number'
    ? { bottom: props.pressRectOffset, left: props.pressRectOffset, right: props.pressRectOffset, top: props.pressRectOffset }
    : (props.pressRectOffset as Record<string, number> | null | undefined) ?? {}
  const offset = {
    bottom: rawOffset.bottom ?? DEFAULT_PRESS_RECT_OFFSETS.bottom,
    left: rawOffset.left ?? DEFAULT_PRESS_RECT_OFFSETS.left,
    right: rawOffset.right ?? DEFAULT_PRESS_RECT_OFFSETS.right,
    top: rawOffset.top ?? DEFAULT_PRESS_RECT_OFFSETS.top,
  }
  if (hitSlop) {
    // RN hitSlop expands the press rect outward on every side.
    offset.bottom += hitSlop.bottom ?? 0
    offset.left += hitSlop.left ?? 0
    offset.right += hitSlop.right ?? 0
    offset.top += hitSlop.top ?? 0
  }

  // Prefer the measured node rect (RN responderRegion semantics).
  const rect = state.rect
  if (rect) {
    return (
      touch.pageX >= rect.left - offset.left &&
      touch.pageX <= rect.right + offset.right &&
      touch.pageY >= rect.top - offset.top &&
      touch.pageY <= rect.bottom + offset.bottom
    )
  }
  // No measured rect: fall back to the grant point (looser than node rect,
  // but avoids cancelling on tiny finger movement).
  const start = state.touchStart
  if (!start) return true
  return (
    touch.pageX >= start.pageX - offset.left &&
    touch.pageX <= start.pageX + offset.right &&
    touch.pageY >= start.pageY - offset.top &&
    touch.pageY <= start.pageY + offset.bottom
  )
}

/** Fire onPressIn with delayPressIn honored (RN Pressability). */
function firePressIn(node: EventNode, eventObj: Record<string, unknown>, state: PressState): void {
  const props = node.currentProps
  const delay = normalizeDelay(props.delayPressIn)
  const onPressIn = props.onPressIn
  if (typeof onPressIn !== 'function') return
  if (delay > 0) {
    setTimeout(() => {
      if (_pressStates.get(node) === state) {
        state.inFired = true
        ;(onPressIn as (e: Record<string, unknown>) => void)(eventObj)
      }
    }, delay)
  } else {
    state.inFired = true
    ;(onPressIn as (e: Record<string, unknown>) => void)(eventObj)
  }
}

/** Fire onPressOut with delayPressOut + minPressDuration honored. */
function firePressOut(node: EventNode, eventObj: Record<string, unknown>, state: PressState): void {
  const props = node.currentProps
  const onPressOut = props.onPressOut
  if (typeof onPressOut !== 'function') return
  const minPressDuration = normalizeDelay(props.minPressDuration, 0) // RN default 130ms
  const elapsed = Date.now() - state.startTime
  const delayPressOut = Math.max(
    normalizeDelay(props.delayPressOut),
    minPressDuration - elapsed,
  )
  if (delayPressOut > 0) {
    setTimeout(() => {
      if (_pressStates.get(node) === state) {
        ;(onPressOut as (e: Record<string, unknown>) => void)(eventObj)
      }
    }, delayPressOut)
  } else {
    ;(onPressOut as (e: Record<string, unknown>) => void)(eventObj)
  }
}

/**
 * Drive the press state machine for the current press owner.
 * Returns true when the press owner consumed the touch (press series fired).
 */
export function drivePress(
  node: EventNode,
  type: string,
  eventObj: Record<string, unknown>,
  opts: EventSystemOptions,
): boolean {
  const props = node.currentProps
  const nativeEvent = eventObj.nativeEvent as Record<string, unknown>

  switch (type) {
    case 'topTouchStart': {
      if (_pressOwner) return false // already in a press
      if (!shouldClaimResponder(node, type)) return false
      _pressOwner = node
      const state: PressState = {
        timer: null,
        isLong: false,
        withinRect: true,
        touchStart: touchPoint(nativeEvent),
        rect: null,
        startTime: Date.now(),
        inFired: false,
      }
      _pressStates.set(node, state)
      startPressTracking(node, state)
      firePressIn(node, eventObj, state)
      // Measure the node's rect for press-rect checks (like RN's
      // responderRegion). Async: may not be ready for the first move — that's
      // fine (isTouchWithinRect is lenient while rect is null).
      try {
        opts.measure(node, (left, top, width, height, pageX, pageY) => {
          const s = _pressStates.get(node)
          if (s && (left || top || width || height || pageX || pageY)) {
            s.rect = { left: pageX, top: pageY, right: pageX + width, bottom: pageY + height }
          }
        })
      } catch { /* measure unavailable: rect stays null (lenient) */ }
      return true
    }
    case 'topTouchMove': {
      if (_pressOwner !== node) return false
      const state = _pressStates.get(node)
      if (!state) return true
      const onPressMove = props.onPressMove
      if (typeof onPressMove === 'function') {
        ;(onPressMove as (e: Record<string, unknown>) => void)(eventObj)
      }
      // Press-rect transitions (RN Pressability):
      // leaving → pressOut + cancel long-press; re-entering → pressIn again.
      const within = isTouchWithinRect(node, nativeEvent)
      if (within !== state.withinRect) {
        state.withinRect = within
        if (within) {
          firePressIn(node, eventObj, state)
        } else {
          // Leave rect: cancel the long-press timer but KEEP the state so
          // re-entering can fire pressIn again. State is fully cleared on
          // release/cancel only.
          if (state.timer) clearTimeout(state.timer)
          state.timer = null
          firePressOut(node, eventObj, state)
        }
      }
      return true
    }
    case 'topTouchEnd': {
      if (_pressOwner !== node) return false
      const state = _pressStates.get(node)
      const isLong = endPressTracking(node)
      const wasWithin = state?.withinRect ?? true
      // RN Pressability: release fires pressOut + onPress ONLY while still
      // within the press rect (ACTIVE_PRESS_IN.RELEASE → deactivate + press).
      // If the touch already left the rect (pressOut fired on leave →
      // ACTIVE_PRESS_OUT), release does NOT fire pressOut again and never
      // fires onPress.
      if (state && wasWithin) firePressOut(node, eventObj, state)
      if (!isLong && wasWithin) {
        const onPress = props.onPress
        if (typeof onPress === 'function') {
          ;(onPress as (e: Record<string, unknown>) => void)(eventObj)
        }
      }
      _pressOwner = null
      return true
    }
    case 'topTouchCancel': {
      if (_pressOwner !== node) return false
      // RN: a cancelled press (responder stolen / touchCancel) fires
      // onPressOut immediately and never fires onPress.
      cancelPress(node, eventObj)
      _pressOwner = null
      return true
    }
    default:
      return false
  }
}

/** Scroll/other responder-stealing events release the press responder
 *  (RN: ScrollView takes the responder, cancelling the press). */
export function releasePressFor(node: EventNode): void {
  if (_pressOwner === node) {
    cancelPress(node)
    _pressOwner = null
  }
}

/**
 * Cancel an active press (RN Pressability responder-terminate path).
 * Fires onPressOut immediately only if onPressIn has actually fired, and
 * never fires onPress. Clears the long-press timer + press state.
 */
function cancelPress(node: EventNode, eventObj?: Record<string, unknown>): void {
  const state = _pressStates.get(node)
  if (state && state.inFired) {
    const onPressOut = node.currentProps.onPressOut
    if (typeof onPressOut === 'function') {
      ;(onPressOut as (e: Record<string, unknown>) => void)(
        eventObj ?? { nativeEvent: { timestamp: Date.now() } },
      )
    }
  }
  endPressTracking(node)
}

/** Reset module-level press state (used by tests via resetTagCounter). */
export function resetPressState(): void {
  _pressOwner = null
}

// ============================================================================
// Dispatcher (DOM-standard two-phase walk)
// ============================================================================

/** Fire one surface handler (props-based). */
function firePropsHandler(
  node: EventNode,
  propName: string,
  eventObj: Record<string, unknown>,
  transform?: 'text' | 'value',
): void {
  const handler = node.currentProps[propName]
  if (typeof handler !== 'function') return
  if (transform === 'text') {
    // onChangeText: pass the raw text string (RN TextInput surface API).
    ;(handler as (text: string) => void)(
      String((eventObj.nativeEvent as Record<string, unknown>)?.text ?? ''),
    )
  } else if (transform === 'value') {
    // onValueChange: pass the boolean (RN Switch surface API).
    ;(handler as (value: boolean) => void)(
      (eventObj.nativeEvent as Record<string, unknown>)?.value as boolean,
    )
  } else {
    ;(handler as (e: Record<string, unknown>) => void)(eventObj)
  }
}

/** Fire addEventListener-based listeners (DOM standard). */
function fireListeners(
  node: EventNode,
  domType: string,
  event: Record<string, unknown>,
): void {
  const listeners = node._listeners?.get(domType)
  if (!listeners) return
  for (const listener of listeners) {
    if (event.propagationStopped) return
    if (typeof listener === 'function') listener(event)
    else (listener as { handleEvent(e: unknown): void }).handleEvent(event)
  }
}

/**
 * Build the shared synthetic event. stopPropagation / preventDefault are the
 * standard DOM controls.
 */
function buildEvent(
  domType: string,
  nativeEvent: Record<string, unknown>,
  timeStamp: number,
): Record<string, unknown> {
  let _stopped = false
  let _prevented = false
  return {
    // Spread native payload to top level (RN events expose e.g. e.text) AND
    // keep nativeEvent nested (RN convention) — both access patterns work.
    ...nativeEvent,
    type: domType,
    target: null as unknown,
    currentTarget: null as unknown,
    nativeEvent,
    timeStamp,
    get defaultPrevented() { return _prevented },
    preventDefault() { _prevented = true },
    stopPropagation() { _stopped = true },
    get propagationStopped() { return _stopped },
  }
}

/**
 * Main entry — Fabric calls this for every native event.
 * `instanceHandle.stateNode` is the target RNNode; payload carries `.target`.
 */
export function createDispatcher(opts: EventSystemOptions): DispatchEventFn {
  return function dispatchEventWithBubble(
    instanceHandle: object,
    type: string,
    nativeEvent: Record<string, unknown>,
  ): void {
    const targetTag = (nativeEvent as Record<string, unknown>).target
    if (targetTag == null || typeof targetTag !== 'number') return

    let current = opts.getNodeByTag(targetTag)
    if (!current) {
      try {
        current = ((instanceHandle as Record<string, unknown>).stateNode as EventNode) ?? null
      } catch { /* ignore */ }
    }
    if (!current) return

    const behavior = resolveEventBehavior(type, opts.getViewConfig(current))
    const domType = behavior.domType

    // Blur check: tapping a non-focusable area while something is focused.
    if (type === 'topTouchEnd') {
      const focused = opts.getFocusedNode()
      const focusedId = (focused as unknown as Record<symbol, number> | null)?.[FABRIC_NODE_ID]
      const currentId = (current as unknown as Record<symbol, number>)[FABRIC_NODE_ID]
      if (focused && focusedId !== currentId) {
        // Tapping another node: blur the old one (auto-focus below may refocus).
        opts.blurFocusedNode()
      }
    }

    // A new touch always starts a fresh press session: release any leaked
    // press owner (e.g. a ScrollView swallowed the previous touchEnd, or the
    // user started a new tap elsewhere). Done once, before the walk, so the
    // walk can re-negotiate the responder cleanly.
    if (type === 'topTouchStart' && _pressOwner) {
      cancelPress(_pressOwner)
      _pressOwner = null
    }

    const timeStamp = (nativeEvent.timestamp as number)
      ?? (nativeEvent.timeStamp as number)
      ?? Date.now()
    const event = buildEvent(domType, nativeEvent, timeStamp)

    // ── Capture phase: root → target (addEventListener capture listeners) ──
    const chain: EventNode[] = []
    let w: EventNode | null = current
    while (w) {
      chain.push(w)
      w = w.parentNode
    }
    for (let i = chain.length - 1; i >= 0; i--) {
      if (event.propagationStopped) break
      const node = chain[i]
      event.currentTarget = node
      fireListeners(node, `__capture_${domType}`, event)
    }

    // ── Target + bubble phase: target → root ──
    // (direct events: target only)
    const walk: EventNode[] = behavior.bubble ? chain : [current]
    for (const node of walk) {
      if (event.propagationStopped) break
      event.currentTarget = node
      const props = node.currentProps

      // Press synthesis (touch series → press). The press owner is the
      // nearest ancestor with press handlers; drivePress tracks it via
      // _pressOwner, so once the owner handled the touch, outer nodes'
      // press series naturally don't fire (RN Pressable exclusivity).
      // Touch handlers (onTouchStart/Move/End) bubble independently below.
      if (type === 'topTouchStart' || type === 'topTouchMove' ||
          type === 'topTouchEnd' || type === 'topTouchCancel') {
        drivePress(node, type, event, opts)
      } else if (type === 'topScroll' && _pressOwner) {
        // ScrollView steals the responder (RN) → cancel any active press.
        releasePressFor(_pressOwner)
      }

      // Surface handlers (from viewConfig name, RN convention or special).
      const name = behavior.bubbledName
      if (type === 'topChange') {
        // RN: onChange (event) + value transforms fire together.
        //  - TextInput: onChangeText(text: string)
        //  - Switch:    onValueChange(value: boolean)
        firePropsHandler(node, 'onChange', event)
        firePropsHandler(node, 'onChangeText', event, 'text')
        firePropsHandler(node, 'onValueChange', event, 'value')
      } else if (name) {
        firePropsHandler(node, name, event)
      }

      // DOM addEventListener listeners (bubble phase).
      fireListeners(node, domType, event)

      // RN skipBubbling: stop after the first node that handled it.
      if (behavior.skipBubbling && (name || type === 'topChange')) {
        event.stopPropagation()
      }
    }

    // Auto-focus focusable components on touch when nothing claimed the event.
    if (type === 'topTouchEnd') {
      const focusable = new Set(['TextInput', 'AndroidTextInput'])
      if (focusable.has(current.tagName)) {
        opts.focusNode(current)
      }
    }
  }
}

/** Access the node's Fabric id symbol. */
const FABRIC_NODE_ID = FABRIC_NODE_ID_SYMBOL
