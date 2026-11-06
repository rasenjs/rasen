/**
 * The widget set. Every function here works on **any** `UiHost<Node>`.
 *
 * Read this file with `kit.ts` beside it: nothing below imports the DOM or the
 * canvas. `itemSlot` does not know whether it is being drawn into the world HUD or
 * into an HTML panel, and it never needs to. That is the demonstration — the
 * duplicated XNA-widget-tree-plus-DOM-panels arrangement upstream collapses into
 * one implementation per widget.
 *
 * Geometry is passed in rather than computed, because layout is the one thing the
 * two targets genuinely do differently (see the note in `kit.ts`).
 */

import type { Mountable, PropValue } from '@rasenjs/core'
import type { ItemStack } from '../core/world'
import type { MeasuredUiHost, TextAlign, UiHost } from './kit'
import { PALETTE, read, rgba } from './kit'

export interface SlotGeometry {
  x: number
  y: number
  size: number
}

export interface ItemSlotProps {
  readonly stack: PropValue<ItemStack | null>
  readonly geometry: SlotGeometry
  /** Highlighted as the active hotbar slot. */
  readonly active?: PropValue<boolean>
  /** Highlighted because the pointer is over it. */
  readonly hovered?: PropValue<boolean>
  readonly onClick?: () => void
}

/**
 * A single inventory slot: frame, block icon, stack count.
 *
 * Icon art is a cut from the shared tile atlas in both targets — on canvas via
 * `drawImage`'s source rect, in the DOM via `background-position`. Same pixels,
 * same atlas, no second art pipeline.
 */
export function itemSlot<Node>(
  host: UiHost<Node>,
  props: ItemSlotProps
): Mountable<Node> {
  const { x, y, size } = props.geometry
  const pad = 2

  const frameFill: PropValue<string> = () => {
    if (read(props.active as PropValue<boolean> | undefined)) return rgba(58, 48, 24, 0.95)
    if (read(props.hovered as PropValue<boolean> | undefined)) return rgba(44, 50, 64, 0.95)
    return PALETTE.slot
  }
  const frameEdge: PropValue<string> = () => {
    if (read(props.active as PropValue<boolean> | undefined)) return PALETTE.slotHot
    if (read(props.hovered as PropValue<boolean> | undefined)) return PALETTE.slotHot
    return PALETTE.slotEdge
  }

  const children: Array<Mountable<Node>> = [
    host.box({
      x,
      y,
      width: size,
      height: size,
      fill: frameFill,
      stroke: frameEdge,
      lineWidth: props.active ? 1.5 : 1,
      radius: 3,
      interactive: props.onClick !== undefined,
      onClick: props.onClick,
    }),
    // One call, no target branch: the host paints the atlas cut with whatever
    // mechanism its platform uses. See `IconSpec` for why this one *is*
    // abstracted while the layout above is not.
    host.icon({
      x: x + pad,
      y: y + pad,
      size: size - pad * 2,
      // The host maps the item to its atlas row; the widget only knows "something
      // or nothing".
      item: () => {
        const stack = read(props.stack)
        return stack ? stack.item : null
      },
      opacity: () => (read(props.stack) ? 1 : 0),
    }),
  ]

  // Stack count, bottom-right, only when > 1.
  children.push(
    host.label({
      x: x + size - 3,
      y: y + size - 3,
      text: () => {
        const stack = read(props.stack)
        return stack && stack.count > 1 ? String(stack.count) : ''
      },
      fill: PALETTE.ink,
      size: Math.round(size * 0.3),
      align: 'right',
      baseline: 'bottom',
      weight: 'bold',
      outline: 'rgba(0,0,0,0.85)',
    })
  )

  return host.stack({ children })
}

export interface BarProps {
  readonly value: PropValue<number> // 0..1
  readonly x: PropValue<number>
  readonly y: PropValue<number>
  readonly width: PropValue<number>
  readonly height: PropValue<number>
  readonly fill: PropValue<string>
  readonly track?: PropValue<string>
}

/** A chunky progress bar. Used for health, breath and the loading screen. */
export function bar<Node>(host: UiHost<Node>, props: BarProps): Mountable<Node> {
  const { x, y, width, height } = props
  return host.stack({
    children: [
      host.box({
        x,
        y,
        width,
        height,
        fill: props.track ?? rgba(12, 13, 18, 0.9),
        stroke: 'rgba(0,0,0,0.5)',
        lineWidth: 1,
        radius: 2,
      }),
      host.box({
        x,
        y,
        width: () => Math.max(0, Math.min(1, read(props.value))) * read(width),
        height,
        fill: props.fill,
        radius: 2,
      }),
    ],
  })
}

export interface TooltipProps {
  readonly x: PropValue<number>
  readonly y: PropValue<number>
  readonly title: PropValue<string>
  readonly lines: PropValue<readonly string[]>
  readonly visible: PropValue<boolean>
  readonly fontSize?: number
}

/**
 * An item tooltip.
 *
 * This is the widget that makes the point best: upstream it exists twice — once
 * as a canvas-drawn XNA panel and once as a DOM element — with the text wrapping,
 * the padding and the close-on-outside-click handled separately in each. Here the
 * construction is written once; only the two primitives underneath differ.
 *
 * It measures itself through the host, which is why the host interface carries
 * `measureText`. Canvas measures exactly, the DOM estimates, and the widget is
 * written so a few pixels of error is not visible.
 */
export function tooltip<Node>(host: MeasuredUiHost<Node>, props: TooltipProps): Mountable<Node> {
  const fontSize = props.fontSize ?? 12
  const lineHeight = Math.round(fontSize * 1.45)
  const padX = 9
  const padY = 7

  const titleWidth = (): number => host.measureText(read(props.title), fontSize + 2, 'bold')
  const bodyWidth = (): number =>
    read(props.lines).reduce((max, line) => Math.max(max, host.measureText(line, fontSize, 'normal')), 0)

  const boxWidth = (): number => Math.ceil(Math.max(titleWidth(), bodyWidth()) + padX * 2)
  const boxHeight = (): number =>
    padY * 2 + lineHeight + (read(props.lines).length > 0 ? lineHeight * read(props.lines).length + 3 : 0)

  const rows: Array<Mountable<Node>> = [
    host.label({
      x: padX,
      y: padY,
      text: props.title,
      fill: PALETTE.accent,
      size: fontSize + 2,
      weight: 'bold',
      baseline: 'top',
    }),
  ]

  // Body lines. `lines` is a stable-length array in practice (an item's stat
  // block), so building them eagerly and driving visibility with the text is
  // cheaper than mounting and unmounting rows as the tooltip moves.
  const maxLines = 6
  for (let i = 0; i < maxLines; i++) {
    rows.push(
      host.label({
        x: padX,
        y: padY + lineHeight + 3 + i * lineHeight,
        text: () => read(props.lines)[i] ?? '',
        fill: PALETTE.inkDim,
        size: fontSize,
        baseline: 'top',
      })
    )
  }

  return host.stack({
    x: props.x,
    y: props.y,
    opacity: () => (read(props.visible) ? 1 : 0),
    children: [
      host.box({
        x: 0,
        y: 0,
        width: boxWidth,
        height: boxHeight,
        fill: PALETTE.panel,
        stroke: PALETTE.panelEdge,
        lineWidth: 1,
        radius: 4,
      }),
      host.stack({ x: 0, y: 0, children: rows }),
    ],
  })
}

export interface ReadoutProps {
  readonly x: PropValue<number>
  readonly y: PropValue<number>
  readonly text: PropValue<string>
  readonly fill?: PropValue<string>
  readonly size?: PropValue<number>
  readonly align?: TextAlign
  readonly outline?: PropValue<string>
}

/** A single line of small print — coordinates, FPS, hotkey hints. */
export function readout<Node>(host: UiHost<Node>, props: ReadoutProps): Mountable<Node> {
  return host.label({
    x: props.x,
    y: props.y,
    text: props.text,
    fill: props.fill ?? PALETTE.inkDim,
    size: props.size ?? 11,
    align: props.align ?? 'left',
    baseline: 'top',
    outline: props.outline ?? 'rgba(0,0,0,0.75)',
  })
}

/**
 * The crafting recipe row: an icon per ingredient plus a result arrow.
 *
 * Mounted once and driven by the selected recipe rather than rebuilt per
 * selection — the same reason the hit flash in arpg's renderer is always mounted
 * and driven by opacity.
 */
export function recipeRow<Node>(
  host: MeasuredUiHost<Node>,
  props: {
    readonly x: number
    readonly y: number
    readonly ingredient: PropValue<ItemStack | null>
    readonly hasIngredient: PropValue<boolean>
    readonly size?: number
  }
): Mountable<Node> {
  const size = props.size ?? 28
  return host.stack({
    children: [
      itemSlot(host, { stack: props.ingredient, geometry: { x: props.x, y: props.y, size } }),
      host.box({
        x: props.x + size + 6,
        y: props.y + size / 2 - 1,
        width: 14,
        height: 2,
        fill: () => (read(props.hasIngredient) ? PALETTE.accent : PALETTE.slotEdge),
      }),
    ],
  })
}

/** A keycap, for the control hints. */
export function keycap<Node>(
  host: MeasuredUiHost<Node>,
  props: { readonly x: number; readonly y: number; readonly label: string; readonly size?: number }
): Mountable<Node> {
  const size = props.size ?? 15
  const width = Math.max(size, host.measureText(props.label, size - 3, 'bold') + 8)
  return host.stack({
    children: [
      host.box({
        x: props.x,
        y: props.y,
        width,
        height: size,
        fill: rgba(48, 54, 70, 0.95),
        stroke: rgba(120, 132, 158, 0.8),
        lineWidth: 1,
        radius: 3,
      }),
      host.label({
        x: props.x + width / 2,
        y: props.y + size / 2,
        text: () => props.label,
        fill: PALETTE.ink,
        size: size - 4,
        align: 'center',
        baseline: 'middle',
        weight: 'bold',
      }),
    ],
  })
}

