/**
 * `UiHost<CanvasNode>` — the widget primitives, drawn into the scene canvas.
 *
 * Every widget in `widgets.ts` goes through these three functions, so this file
 * is the entire cost of supporting the canvas target. It is small on purpose:
 * the interesting claim is that the cost *is* this small.
 */

import type { Mountable } from '@rasenjs/core'
import { group, rect, sprite, text } from '@rasenjs/canvas-2d'
import type { CanvasNode } from '@rasenjs/canvas-2d'
import type { BoxSpec, IconSpec, LabelSpec, MeasuredUiHost, StackSpec } from './kit'
import { estimateTextWidth, read } from './kit'
import { ATLAS_COLUMNS, itemFrame, type TileAtlas } from '../render/atlas'

/**
 * The atlas every icon on this target is cut from.
 *
 * A module-level binding rather than a host field, because the host is a plain
 * object literal and the atlas is a process-wide resource — there is exactly one
 * per page, built once in `main.tsx`.
 */
let atlas: TileAtlas | null = null

export function useCanvasAtlas(value: TileAtlas): void {
  atlas = value
}

const DEFAULT_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

/** Scratch context used only to measure text. Never drawn to. */
let scratch: CanvasRenderingContext2D | null = null

function measureContext(): CanvasRenderingContext2D {
  if (scratch) return scratch
  const canvas = document.createElement('canvas')
  canvas.width = 8
  canvas.height = 8
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable for text measurement')
  scratch = ctx
  return ctx
}

function fontOf(size: number, weight: 'normal' | 'bold'): string {
  return `${weight} ${size}px ${DEFAULT_FONT}`
}

export const canvasUiHost: MeasuredUiHost<CanvasNode> = {
  name: 'canvas',
  target: 'canvas',

  box(spec: BoxSpec): Mountable<CanvasNode> {
    return rect({
      x: spec.x,
      y: spec.y,
      width: spec.width,
      height: spec.height,
      fill: spec.fill,
      stroke: spec.stroke,
      lineWidth: spec.lineWidth ?? 1,
      cornerRadius: spec.radius,
      opacity: spec.opacity,
      onClick: spec.onClick,
    })
  },

  icon(spec: IconSpec): Mountable<CanvasNode> {
    const active = atlas
    if (!active) throw new Error('canvas atlas not registered; call useCanvasAtlas first')
    return sprite({
      image: active.canvas,
      x: spec.x,
      y: spec.y,
      // Static per atlas, so plain numbers. `frame` is the reactive one: it is what
      // changes when a slot's contents change.
      frameWidth: active.cell,
      frameHeight: active.cell,
      columns: ATLAS_COLUMNS,
      frame: () => {
        const item = read(spec.item)
        // Frame 0 is the (blank) air row, so an empty slot paints nothing rather than
        // whatever happens to be first in the atlas.
        return item === null || item < 0 ? 0 : itemFrame(item)
      },
      width: spec.size,
      height: spec.size,
      opacity: spec.opacity,
    })
  },

  label(spec: LabelSpec): Mountable<CanvasNode> {
    const weight = spec.weight ?? 'normal'
    return text({
      text: spec.text,
      x: spec.x,
      y: spec.y,
      fill: spec.fill,
      font: () => fontOf(read(spec.size), weight),
      textAlign: spec.align ?? 'left',
      // The DOM host uses flexbox for this; on canvas the baseline is explicit,
      // and the mapping is spelled out rather than hoped for.
      textBaseline:
        spec.baseline === 'middle' ? 'middle' : spec.baseline === 'bottom' ? 'bottom' : 'top',
      opacity: spec.opacity,
      // A soft dark halo instead of a four-pass outline: one node instead of
      // five, which matters because every HUD label is a scene node whose props
      // are re-read on every flush.
      shadowColor: spec.outline,
      shadowBlur: spec.outline === undefined ? undefined : 4,
    })
  },

  stack(spec: StackSpec<CanvasNode>): Mountable<CanvasNode> {
    return group({
      // Zero-size group at the top-left unless a position is given; children
      // carry their own absolute coordinates, as canvas-2d requires.
      x: spec.x ?? 0,
      y: spec.y ?? 0,
      opacity: spec.opacity,
      children: spec.children,
    })
  },

  measureText(label: string, size: number, weight: 'normal' | 'bold'): number {
    const ctx = measureContext()
    const previous = ctx.font
    ctx.font = fontOf(size, weight)
    const width = ctx.measureText(label).width
    ctx.font = previous
    return width
  },
}

/** Kept beside the host so the DOM path can be compared at a glance. */
export const canvasTextEstimate = estimateTextWidth
