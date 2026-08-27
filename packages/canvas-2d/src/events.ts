/**
 * Pointer event contracts for canvas shapes.
 *
 * Handlers are plain callbacks dispatched by the RenderContext's delegated
 * listeners — no per-shape DOM listeners, zero per-frame cost.
 */

import type { CanvasNode } from './node'

/**
 * Synthetic pointer event delivered to shape handlers.
 * Coordinates are canvas CSS pixels, matching drawing coordinates.
 */
export interface CanvasPointerEvent {
  readonly x: number
  readonly y: number
  /** Topmost shape under the point (the hit target). */
  readonly node: CanvasNode
  /** Raw host event (DOM PointerEvent/MouseEvent in browser hosts). */
  readonly nativeEvent: unknown
}

export type CanvasEventHandler = (e: CanvasPointerEvent) => void

/** Supported delegated pointer event types. */
export interface CanvasEventHandlers {
  click?: CanvasEventHandler
  pointerdown?: CanvasEventHandler
  pointerup?: CanvasEventHandler
  pointermove?: CanvasEventHandler
}

/** Delegated pointer event types the renderer dispatches. */
export type CanvasPointerEventType = keyof CanvasEventHandlers

/** Canonical list of pointer event types (host adapters bind these). */
export const CANVAS_POINTER_EVENT_TYPES: readonly CanvasPointerEventType[] = [
  'click',
  'pointerdown',
  'pointerup',
  'pointermove'
]
