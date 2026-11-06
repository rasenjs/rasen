/**
 * `UiHost<HTMLElement>` — the same three primitives, expressed in the DOM.
 *
 * This is the other half of the two-target demonstration. Note how little it
 * shares with `kit-canvas.ts` and how much it *does* share: the primitives differ
 * completely (a `div` with a reactive style record versus a `rect` node), while
 * every widget built on top of them is literally the same code.
 *
 * Positioning is absolute rather than a flow layout, because the widgets carry
 * canvas-style coordinates. A production DOM panel would use CSS grid and pass
 * different geometry; the widgets do not care which, since they never assume
 * their own position.
 */

import type { Mountable } from '@rasenjs/core'
import { div, span, text } from '@rasenjs/dom'
import type { BoxSpec, IconSpec, LabelSpec, MeasuredUiHost, StackSpec } from './kit'
import { estimateTextWidth, read } from './kit'
import { iconStyle, type TileAtlas } from '../render/atlas'

let atlas: TileAtlas | null = null

export function useDomAtlas(value: TileAtlas): void {
  atlas = value
}

const DEFAULT_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

/**
 * A whole style record, rebuilt reactively.
 *
 * `bindStyle` treats a style object as the element's entire style and removes any
 * declaration the record does not carry, so these getters must be complete — that
 * is the contract, and it is why nothing here spreads a partial object in from
 * outside.
 */
function boxStyle(spec: BoxSpec): () => Record<string, string> {
  return () => {
    const style: Record<string, string> = {
      position: 'absolute',
      left: `${read(spec.x)}px`,
      top: `${read(spec.y)}px`,
      width: `${read(spec.width)}px`,
      height: `${read(spec.height)}px`,
      background: read(spec.fill),
      boxSizing: 'border-box',
    }
    const radius = spec.radius === undefined ? 0 : read(spec.radius)
    if (radius) style.borderRadius = `${radius}px`
    if (spec.stroke !== undefined) {
      style.border = `${read(spec.lineWidth ?? 1)}px solid ${read(spec.stroke)}`
    }
    if (spec.opacity !== undefined) style.opacity = String(read(spec.opacity))
    if (spec.interactive) {
      style.cursor = 'pointer'
      style.pointerEvents = 'auto'
    }
    return style
  }
}

function labelStyle(spec: LabelSpec): () => Record<string, string> {
  const weight = spec.weight ?? 'normal'
  return () => {
    const style: Record<string, string> = {
      position: 'absolute',
      left: `${read(spec.x)}px`,
      top: `${read(spec.y)}px`,
      color: read(spec.fill),
      font: `${weight} ${read(spec.size)}px ${DEFAULT_FONT}`,
      lineHeight: '1',
      // DOM has no baseline concept; a translate based on the requested baseline
      // is the closest honest equivalent.
      transform:
        spec.baseline === 'middle'
          ? 'translateY(-50%)'
          : spec.baseline === 'bottom'
            ? 'translateY(-100%)'
            : 'none',
      whiteSpace: 'nowrap',
    }
    if (spec.align === 'center') style.textAlign = 'center'
    else if (spec.align === 'right') style.textAlign = 'right'
    if (spec.opacity !== undefined) style.opacity = String(read(spec.opacity))
    // Canvas draws a soft halo behind the glyphs via a shadow; the DOM equivalent
    // is a text-shadow, so in-world labels stay legible over terrain in both
    // targets. Same intent, different primitive — which is the whole point of the
    // host split.
    if (spec.outline !== undefined) {
      const outline = read(spec.outline)
      if (outline) style.textShadow = `0 0 4px ${outline}, 0 1px 2px ${outline}`
    }
    return style
  }
}

export const domUiHost: MeasuredUiHost<HTMLElement> = {
  name: 'dom',
  target: 'dom',

  box(spec: BoxSpec): Mountable<HTMLElement> {
    return div({
      style: boxStyle(spec),
      ...(spec.onClick ? { onClick: spec.onClick } : {}),
    })
  },

  icon(spec: IconSpec): Mountable<HTMLElement> {
    const active = atlas
    if (!active) throw new Error('dom atlas not registered; call useDomAtlas first')
    // The same sheet cut the canvas path draws, addressed by background-position
    // instead of a drawImage source rect. `iconStyle` is shared with the canvas
    // side's geometry helper, so the two can never disagree about which cell a
    // tile lives in.
    const style = (): Record<string, string> => {
      const item = read(spec.item)
      const size = read(spec.size)
      if (item === null || item < 0) {
        return {
          position: 'absolute',
          left: `${read(spec.x)}px`,
          top: `${read(spec.y)}px`,
          width: `${size}px`,
          height: `${size}px`,
        }
      }
      const cut = iconStyle(active, item, size)
      return {
        ...cut,
        position: 'absolute',
        left: `${read(spec.x)}px`,
        top: `${read(spec.y)}px`,
        opacity: String(read(spec.opacity ?? 1)),
      }
    }
    return div({ style })
  },

  label(spec: LabelSpec): Mountable<HTMLElement> {
    return span({ style: labelStyle(spec) }, text({ content: () => read(spec.text) }))
  },

  stack(spec: StackSpec<HTMLElement>): Mountable<HTMLElement> {
    const style = (): Record<string, string> => {
      const s: Record<string, string> = { position: 'absolute', left: '0', top: '0' }
      if (spec.x !== undefined) s.left = `${read(spec.x)}px`
      if (spec.y !== undefined) s.top = `${read(spec.y)}px`
      if (spec.opacity !== undefined) s.opacity = String(read(spec.opacity))
      return s
    }
    // The children are canvas→DOM-agnostic mountables built by `domUiHost`
    // themselves, so passing them straight through is correct here; no hooks
    // switch is involved because both sides are DOM nodes.
    return div({ style }, ...spec.children)
  },

  measureText(label: string, size: number, weight: 'normal' | 'bold'): number {
    // No synchronous measurement in the DOM. The estimate is documented in
    // `kit.ts`; widgets that depend on it leave room for the error.
    return estimateTextWidth(label, size, weight)
  },
}
