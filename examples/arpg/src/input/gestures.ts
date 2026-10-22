/**
 * Gesture recognition — a pure state machine fed by pointer samples.
 *
 * This is the piece every touch game rewrites from scratch, and the piece the
 * reference product (d2r-mobile) treats as its core value: one recognizer that
 * turns raw contacts into `tap` / `doubleTap` / `longPress` / drag-and-drop, so
 * the game only ever sees intent.
 *
 * It owns no event API: the host adapter (see `bindInput`) feeds it samples and
 * drives `tick` once per frame for the time-based verdicts. That is exactly
 * what makes it testable without a device.
 *
 * ## Verdict rules
 *
 * - A contact that never travels further than `dragThreshold` and is released
 *   before `longPressDelay` is a **tap**.
 * - Two taps close together in time *and* space also emit a **doubleTap** —
 *   the tap itself is still emitted first, mirroring the browser's
 *   `click` + `dblclick` pairing, so a single-tap action feels immediate.
 * - A contact held past `longPressDelay` without travelling emits **longPress**
 *   (and can never become a tap or double-tap afterwards).
 * - A contact that travels past `dragThreshold` becomes a drag:
 *   **dragStart** once, then **drag** per sample, then **drop** on release —
 *   a press-drag-release is one continuous stream, which is what "drag an item
 *   onto the vendor to sell it" needs.
 * - A drag that the host cancels emits **dragCancel** instead of **drop**, so
 *   the UI can snap back.
 */

import { distance, type PointerSample, type Vec2 } from './types'

export interface GestureOptions {
  /** Travel (px) that turns a press into a drag. Default `8`. */
  dragThreshold?: number
  /** Hold time (ms) before `longPress` fires. Default `500`. */
  longPressDelay?: number
  /** Maximum gap (ms) between two taps to pair them. Default `280`. */
  doubleTapDelay?: number
  /** Maximum distance (px) between two taps to pair them. Default `24`. */
  doubleTapDistance?: number
}

export type GestureEvent =
  | { type: 'tap'; id: number; x: number; y: number; target?: unknown }
  | { type: 'doubleTap'; id: number; x: number; y: number; target?: unknown }
  | { type: 'longPress'; id: number; x: number; y: number; target?: unknown }
  | {
      type: 'dragStart'
      id: number
      x: number
      y: number
      origin: Vec2
      target?: unknown
    }
  | {
      type: 'drag'
      id: number
      x: number
      y: number
      /** Offset from the drag origin (px). */
      dx: number
      dy: number
      origin: Vec2
      target?: unknown
    }
  | {
      type: 'drop'
      id: number
      x: number
      y: number
      dx: number
      dy: number
      origin: Vec2
      target?: unknown
    }
  | { type: 'dragCancel'; id: number; origin: Vec2 }

export type GestureHandler = (event: GestureEvent) => void

export interface GestureRecognizer {
  /** A contact started. */
  down(sample: PointerSample): void
  /** A contact moved. Samples for unknown ids are ignored. */
  move(sample: PointerSample): void
  /** A contact ended normally (tap / drop / nothing after a long press). */
  up(sample: PointerSample): void
  /** A contact was cancelled (system gesture, lost capture, blur). */
  cancel(id: number): void
  /**
   * Advance the time-driven verdicts. Call once per frame with the host clock;
   * long presses and double-tap expiry never fire without it.
   */
  tick(now: number): void
  /** Subscribe to gestures. Returns an unsubscribe function. */
  on(handler: GestureHandler): () => void
  /** True while the given contact has crossed the drag threshold. */
  isDragging(id: number): boolean
  /** Drop every in-flight contact without emitting. */
  reset(): void
}

interface PointerState {
  id: number
  x: number
  y: number
  originX: number
  originY: number
  startTime: number
  dragging: boolean
  longPressed: boolean
  target?: unknown
}

const DEFAULTS = {
  dragThreshold: 8,
  longPressDelay: 500,
  doubleTapDelay: 280,
  doubleTapDistance: 24,
} as const

export function createGestureRecognizer(
  options: GestureOptions = {},
): GestureRecognizer {
  const dragThreshold = options.dragThreshold ?? DEFAULTS.dragThreshold
  const longPressDelay = options.longPressDelay ?? DEFAULTS.longPressDelay
  const doubleTapDelay = options.doubleTapDelay ?? DEFAULTS.doubleTapDelay
  const doubleTapDistance =
    options.doubleTapDistance ?? DEFAULTS.doubleTapDistance

  const pointers = new Map<number, PointerState>()
  const handlers = new Set<GestureHandler>()
  let lastTap: { time: number; x: number; y: number } | null = null

  const emit = (event: GestureEvent): void => {
    for (const handler of handlers) handler(event)
  }

  return {
    down(sample) {
      const existing = pointers.get(sample.id)
      if (existing) {
        existing.x = sample.x
        existing.y = sample.y
        return
      }
      pointers.set(sample.id, {
        id: sample.id,
        x: sample.x,
        y: sample.y,
        originX: sample.x,
        originY: sample.y,
        startTime: sample.time,
        dragging: false,
        longPressed: false,
        target: sample.target,
      })
    },

    move(sample) {
      const p = pointers.get(sample.id)
      if (!p) return
      p.x = sample.x
      p.y = sample.y

      const dx = p.x - p.originX
      const dy = p.y - p.originY
      if (!p.dragging) {
        if (dx * dx + dy * dy < dragThreshold * dragThreshold) return
        p.dragging = true
        emit({
          type: 'dragStart',
          id: p.id,
          x: p.x,
          y: p.y,
          origin: { x: p.originX, y: p.originY },
          target: p.target,
        })
      }
      emit({
        type: 'drag',
        id: p.id,
        x: p.x,
        y: p.y,
        dx,
        dy,
        origin: { x: p.originX, y: p.originY },
        target: p.target,
      })
    },

    up(sample) {
      const p = pointers.get(sample.id)
      if (!p) return
      pointers.delete(sample.id)

      const dx = p.x - p.originX
      const dy = p.y - p.originY

      if (p.dragging) {
        emit({
          type: 'drop',
          id: p.id,
          x: p.x,
          y: p.y,
          dx,
          dy,
          origin: { x: p.originX, y: p.originY },
          target: p.target,
        })
        return
      }

      // A long press already consumed this contact.
      if (p.longPressed) return

      emit({ type: 'tap', id: p.id, x: p.x, y: p.y, target: p.target })

      const paired =
        lastTap !== null &&
        sample.time - lastTap.time <= doubleTapDelay &&
        distance(lastTap, p) <= doubleTapDistance

      if (paired) {
        lastTap = null
        emit({
          type: 'doubleTap',
          id: p.id,
          x: p.x,
          y: p.y,
          target: p.target,
        })
      } else {
        lastTap = { time: sample.time, x: p.x, y: p.y }
      }
    },

    cancel(id) {
      const p = pointers.get(id)
      if (!p) return
      pointers.delete(id)
      if (p.dragging) {
        emit({ type: 'dragCancel', id: p.id, origin: { x: p.originX, y: p.originY } })
      }
    },

    tick(now) {
      for (const p of pointers.values()) {
        if (p.dragging || p.longPressed) continue
        if (now - p.startTime >= longPressDelay) {
          p.longPressed = true
          emit({
            type: 'longPress',
            id: p.id,
            x: p.x,
            y: p.y,
            target: p.target,
          })
        }
      }
      if (lastTap && now - lastTap.time > doubleTapDelay) lastTap = null
    },

    on(handler) {
      handlers.add(handler)
      return () => {
        handlers.delete(handler)
      }
    },

    isDragging(id) {
      return pointers.get(id)?.dragging ?? false
    },

    reset() {
      pointers.clear()
      lastTap = null
    },
  }
}
