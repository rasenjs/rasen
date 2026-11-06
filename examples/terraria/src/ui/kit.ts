/**
 * The host-agnostic widget layer — one widget definition, two render targets.
 *
 * ## Why this exists
 *
 * Open-Terraria draws its interface twice. `src/vui/` is a line-by-line port of
 * Terraria's XNA widget tree (a hand-written `UIElement` hierarchy with per-frame
 * `update()` and `draw(batch)`), and separately `src/ui/` has ~30 DOM panels for
 * the panels that were awkward on canvas. An item slot therefore exists in two
 * places that have to be kept in sync by hand, and the two implementations share
 * no code at all.
 *
 * Rasen's claim is that this duplication is unnecessary: a component is a
 * function from props to `Mountable<Node>`, and `Node` is a type parameter. The
 * only thing a widget actually needs from a host is the ability to *place a box*,
 * *place some text* and *group children* — everything else (what a slot looks
 * like, when it is highlighted, what its tooltip says) is host-independent logic.
 *
 * So this file defines that minimum as `UiHost<Node>`, and `widgets.ts` writes
 * every interface element against it. `kit-canvas.ts` implements the host with
 * `rect`/`text`/`group`; `kit-dom.ts` implements it with `div`/`span`. The same
 * `itemSlot()` call then renders into the in-world canvas HUD *and* the DOM
 * inventory panel.
 *
 * ## What this is not
 *
 * It is not a layout engine, and that is a deliberate boundary. `@rasenjs/canvas-2d`
 * has no flex/flow model — every node takes explicit `x`/`y` — so a real
 * `StyleDimension` equivalent would be a large piece of work, and forcing one on
 * the DOM side would mean reimplementing the browser's layout in JavaScript. The
 * widgets below therefore take their geometry from the caller, and the
 * *arrangement* differs per target (absolute coordinates on canvas, CSS grid in
 * the DOM). What is shared is the widget, not the layout — which is exactly the
 * duplicated half upstream.
 */

import type { Getter, Mountable, PropValue } from '@rasenjs/core'

/** A box, in the host's own coordinate space. */
export interface BoxSpec {
  x: PropValue<number>
  y: PropValue<number>
  width: PropValue<number>
  height: PropValue<number>
  fill: PropValue<string>
  /** Draws a border in this colour. */
  stroke?: PropValue<string>
  lineWidth?: PropValue<number>
  /** Corner rounding. Canvas uses an arc, DOM uses `border-radius`. */
  radius?: PropValue<number>
  opacity?: PropValue<number>
  /** Applied when the host has a hover concept; canvas ignores it. */
  interactive?: boolean
  onClick?: () => void
}

export type TextAlign = 'left' | 'center' | 'right'
export type TextBaseline = 'top' | 'middle' | 'bottom'

export interface LabelSpec {
  x: PropValue<number>
  y: PropValue<number>
  text: PropValue<string>
  fill: PropValue<string>
  /** Font size in the host's own units. */
  size: PropValue<number>
  align?: TextAlign
  baseline?: TextBaseline
  weight?: 'normal' | 'bold'
  opacity?: PropValue<number>
  /** A soft colour halo behind the glyphs, for legibility over terrain. */
  outline?: PropValue<string>
}

export interface StackSpec<Node> {
  x?: PropValue<number>
  y?: PropValue<number>
  opacity?: PropValue<number>
  children: Array<Mountable<Node>>
}

/**
 * A bitmap cut out of a shared sheet.
 *
 * This *is* a primitive the two targets share — both can paint a sub-rectangle of
 * an image — even though the mechanism differs completely (a `drawImage` source
 * rect versus `background-position`). Abstracting it is therefore the right call:
 * without it, `itemSlot` would need a canvas branch and a DOM branch, which is
 * precisely the duplication this layer exists to remove.
 */
export interface IconSpec {
  x: PropValue<number>
  y: PropValue<number>
  size: PropValue<number>
  /**
   * Which item to paint, or `null` for an empty slot.
   *
   * Addressed by **item**, not by tile: a pickaxe has no tile, and both the DOM and
   * the canvas need the same lookup. The host owns the item→atlas-row mapping.
   */
  item: PropValue<number | null>
  opacity?: PropValue<number>
}

/**
 * The minimum a render target must provide to host the widget set.
 *
 * Keeping it to four primitives is the point: a new target (LVGL, GPUI, a text
 * renderer for SSR) becomes viable by implementing `box`, `label`, `stack` and
 * `icon`, and every widget in `widgets.ts` works unmodified.
 *
 * `StackSpec` is generic over `Node` rather than reusing a single erased child
 * type because `Mountable<Node>` is *contravariant* in `Node` — a
 * `Mountable<CanvasNode>` genuinely cannot be passed where a `Mountable<unknown>`
 * is expected, so the parameter has to be threaded through.
 */
export interface UiHost<Node> {
  readonly name: string
  /** Which render target this is, for the few places that must branch. */
  readonly target: 'canvas' | 'dom'
  box(spec: BoxSpec): Mountable<Node>
  label(spec: LabelSpec): Mountable<Node>
  stack(spec: StackSpec<Node>): Mountable<Node>
  icon(spec: IconSpec): Mountable<Node>
}

/**
 * A host that can also measure text.
 *
 * Used by the widgets that size themselves to their content (the tooltip, the
 * crafting rows). Canvas can measure exactly; DOM cannot synchronously, so it
 * estimates — see `estimateTextWidth`. Both are honest about being estimates of
 * different quality, and the widgets take the measured value as an input rather
 * than assuming.
 */
export interface MeasuredUiHost<Node> extends UiHost<Node> {
  measureText(text: string, size: number, weight: 'normal' | 'bold'): number
}

/** Shared fallback so the DOM host does not need a canvas to size a label. */
export function estimateTextWidth(text: string, size: number, weight: 'normal' | 'bold'): number {
  // Average advance width for a UI sans face at weight 400/700. Wrong by a few
  // percent, which is the right amount of wrong for a tooltip that is allowed to
  // be a pixel or two off.
  const factor = weight === 'bold' ? 0.58 : 0.53
  return text.length * size * factor
}

/** Resolve a `PropValue` to a concrete value, through the active runtime. */
export function read<T>(v: PropValue<T>): T {
  if (typeof v === 'function') return (v as Getter<T>)()
  if (v !== null && typeof v === 'object' && 'value' in v) {
    // A ref. `Ref<T>` is a deliberately empty interface that adapters augment, so
    // the shape has to be asserted rather than narrowed.
    return (v as unknown as { value: T }).value
  }
  return v as T
}

export const rgba = (r: number, g: number, b: number, a = 1): string =>
  `rgba(${r},${g},${b},${a})`

/**
 * The palette. One place, so the canvas HUD and the DOM panel cannot drift into
 * two different greens.
 */
export const PALETTE = {
  panel: rgba(18, 20, 26, 0.92),
  panelEdge: rgba(96, 106, 128, 0.85),
  slot: rgba(30, 34, 44, 0.9),
  slotEdge: rgba(88, 98, 120, 0.7),
  slotHot: rgba(232, 196, 110, 0.95),
  ink: rgba(232, 236, 245, 1),
  inkDim: rgba(158, 168, 188, 1),
  accent: rgba(232, 196, 110, 1),
  danger: rgba(226, 96, 84, 1),
  hp: rgba(198, 52, 44, 1),
  mana: rgba(72, 122, 216, 1),
} as const
