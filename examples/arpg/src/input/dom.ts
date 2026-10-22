/**
 * Host binding — the DOM side of the input state machines.
 *
 * The machines in `gestures.ts` / `stick.ts` never see an event; this is the
 * only place that does. It answers one question per contact ("who owns this
 * finger?") and then hands samples to the owner.
 *
 * ## Ownership rules
 *
 * 1. A contact is offered to the stick first. The stick claims at most one
 *    contact, so a second finger falls through to the gestures.
 * 2. Every contact that passes the gesture filter is also fed to the recognizer
 *    — that is what lets one press be *both* "start walking" and "a tap, if I
 *    release right away". A floating thumbstick and tap-to-move share one
 *    surface this way.
 * 3. Once a stick-owned contact travels past the drag threshold the recognizer's
 *    verdict for it is cancelled: a finger steering the stick is not a tap and
 *    must not produce a drop.
 * 4. Contacts that start on a HUD control never reach either machine — the
 *    control owns its own pointer. This is a *target* test rather than a
 *    geometry test, so a skill button may be repositioned, resized or nested
 *    without this file learning anything about it.
 *
 * Time-driven verdicts (long press, double-tap expiry, stick release decay) run
 * off the app's frame source — the same `rafSchedule` the renderer and
 * `@rasenjs/animation` use, so the game has one clock rather than three.
 */

import { rafSchedule, type Cancel, type FrameSchedule } from '@rasenjs/core'
import type { GestureRecognizer } from './gestures'
import type { VirtualStick } from './stick'
import type { PointerSample, Vec2 } from './types'

export interface StickBinding {
  stick: VirtualStick
  /** Only contacts inside this region can claim the stick. Default: all. */
  claims?: (x: number, y: number) => boolean
}

export interface GestureBinding {
  recognizer: GestureRecognizer
  /** Only contacts inside this region reach the recognizer. Default: all. */
  claims?: (x: number, y: number) => boolean
}

export interface BindInputOptions {
  stick?: StickBinding
  gestures?: GestureBinding
  /**
   * Coordinate space of emitted samples. `'element'` (default) is relative to
   * the bound element's bounding box; `'viewport'` is raw client coordinates.
   */
  space?: 'element' | 'viewport'
  /** Full control over the mapping; wins over `space`. */
  toPoint?: (event: PointerEvent) => Vec2
  /**
   * CSS `touch-action` applied to the element so the browser stops panning and
   * zooming mid-gesture. Pass `null` to leave the element's own value alone.
   * Default `'none'`.
   */
  touchAction?: string | null
  /**
   * Selector for elements that own their own pointers. A contact starting
   * inside one is ignored entirely. Default `'[data-hud]'`.
   */
  ignoreTargets?: string
  /** Frame source for the time-driven verdicts. Default: the core rAF source. */
  schedule?: FrameSchedule
}

/** Element-space sample from a raw pointer event on `element`. */
export function sampleFromEvent(
  element: HTMLElement,
  event: PointerEvent,
): PointerSample {
  const rect = element.getBoundingClientRect()
  return {
    id: event.pointerId,
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    time: event.timeStamp || performance.now(),
  }
}

/**
 * Bind a virtual stick plus a gesture recognizer to one surface.
 *
 * @returns an unbind function that detaches every listener and timer.
 */
export function bindInput(
  element: HTMLElement,
  options: BindInputOptions = {},
): () => void {
  const stickBinding = options.stick
  const gestureBinding = options.gestures
  const schedule = options.schedule ?? rafSchedule()
  const ignoreTargets = options.ignoreTargets ?? '[data-hud]'

  const stickOwners = new Set<number>()
  const gestureOwners = new Set<number>()
  let captured: number[] = []

  if (options.touchAction !== null) {
    element.style.touchAction = options.touchAction ?? 'none'
  }

  const toPoint = (event: PointerEvent): Vec2 => {
    if (options.toPoint) return options.toPoint(event)
    if (options.space === 'viewport') return { x: event.clientX, y: event.clientY }
    const rect = element.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const toSample = (event: PointerEvent): PointerSample => {
    const point = toPoint(event)
    return {
      id: event.pointerId,
      x: point.x,
      y: point.y,
      time: event.timeStamp || performance.now(),
    }
  }

  const onHud = (event: Event): boolean => {
    const target = event.target
    if (!(target instanceof Element)) return false
    return target.closest(ignoreTargets) !== null
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (onHud(event)) return
    const sample = toSample(event)
    let claimed = false

    if (stickBinding) {
      const { stick, claims } = stickBinding
      if ((!claims || claims(sample.x, sample.y)) && stick.begin(sample)) {
        stickOwners.add(sample.id)
        claimed = true
      }
    }

    if (gestureBinding) {
      const { recognizer, claims } = gestureBinding
      if (!claims || claims(sample.x, sample.y)) {
        recognizer.down(sample)
        gestureOwners.add(sample.id)
        claimed = true
      }
    }

    if (!claimed) return
    try {
      element.setPointerCapture(sample.id)
      captured.push(sample.id)
    } catch {
      // Capture is best-effort: without it a drag that leaves the element just
      // stops reporting, which the machines already tolerate.
    }
    event.preventDefault()
  }

  const onPointerMove = (event: PointerEvent): void => {
    const sample = toSample(event)
    const ownStick = stickOwners.has(sample.id)
    const ownGesture = gestureOwners.has(sample.id)
    if (!ownStick && !ownGesture) return

    if (ownStick) stickBinding!.stick.move(sample)
    if (ownGesture) {
      const recognizer = gestureBinding!.recognizer
      recognizer.move(sample)
      // Rule 3: steering the stick is not a tap and not a drop.
      if (ownStick && recognizer.isDragging(sample.id)) {
        recognizer.cancel(sample.id)
        gestureOwners.delete(sample.id)
      }
    }
    event.preventDefault()
  }

  const release = (id: number): void => {
    const index = captured.indexOf(id)
    if (index < 0) return
    captured.splice(index, 1)
    try {
      element.releasePointerCapture(id)
    } catch {
      // Already gone — a cancelled contact is exactly the case this handles.
    }
  }

  const finish = (event: PointerEvent, cancelled: boolean): void => {
    const sample = toSample(event)
    let handled = false

    if (gestureOwners.delete(sample.id)) {
      if (cancelled) gestureBinding!.recognizer.cancel(sample.id)
      else gestureBinding!.recognizer.up(sample)
      handled = true
    }
    if (stickOwners.delete(sample.id)) {
      stickBinding!.stick.end(sample.id)
      handled = true
    }
    if (!handled) return

    release(sample.id)
    event.preventDefault()
  }

  const onPointerUp = (event: PointerEvent): void => finish(event, false)
  const onPointerCancel = (event: PointerEvent): void => finish(event, true)
  const onLostCapture = (event: PointerEvent): void => finish(event, true)

  element.addEventListener('pointerdown', onPointerDown)
  element.addEventListener('pointermove', onPointerMove)
  element.addEventListener('pointerup', onPointerUp)
  element.addEventListener('pointercancel', onPointerCancel)
  element.addEventListener('lostpointercapture', onLostCapture)

  let cancel: Cancel | null = null
  let lastTime = 0
  const loop = (now: number): void => {
    const dt = lastTime === 0 ? 0 : now - lastTime
    lastTime = now
    gestureBinding?.recognizer.tick(now)
    stickBinding?.stick.tick(dt)
    cancel = schedule(loop)
  }
  cancel = schedule(loop)

  return () => {
    element.removeEventListener('pointerdown', onPointerDown)
    element.removeEventListener('pointermove', onPointerMove)
    element.removeEventListener('pointerup', onPointerUp)
    element.removeEventListener('pointercancel', onPointerCancel)
    element.removeEventListener('lostpointercapture', onLostCapture)
    cancel?.()
    cancel = null
    for (const id of captured) release(id)
    captured = []
    // A contact the machine never sees released would stay "active" forever, so
    // end them explicitly.
    for (const id of stickOwners) stickBinding?.stick.end(id)
    stickOwners.clear()
    gestureOwners.clear()
    gestureBinding?.recognizer.reset()
  }
}
