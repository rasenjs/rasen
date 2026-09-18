/**
 * Separator - divider component.
 *
 * Separates content regions, horizontally or vertically. Can be decorative
 * (no semantics) or semantic (exposed to assistive technology).
 *
 * Composed on @rasenjs/dom element factories; styling is left to the
 * consumer (headless contract) — orientation is exposed via data attribute.
 */
import type { Mountable } from '@rasenjs/core'
import { hr } from '@rasenjs/dom'

export interface SeparatorProps {
  orientation?: 'horizontal' | 'vertical'
  decorative?: boolean
  class?: string
  style?: Record<string, string | number> | string
}

/**
 * Create the Separator component.
 */
export function createSeparator(): (
  props?: SeparatorProps
) => Mountable<HTMLElement> {
  return (props?: SeparatorProps) => {
    const orientation = props?.orientation ?? 'horizontal'
    const decorative = props?.decorative ?? false

    return hr({
      role: decorative ? undefined : 'separator',
      ariaOrientation: decorative ? undefined : orientation,
      dataOrientation: orientation,
      class: props?.class,
      // The 1px sizing IS the visible output of a separator — functional
      // defaults, still overridable via style/class.
      style: {
        border: 'none',
        flexShrink: 0,
        ...(orientation === 'vertical'
          ? { width: '1px', height: 'auto', margin: '0 8px' }
          : { width: 'auto', height: '1px', margin: '8px 0' }),
        ...(typeof props?.style === 'object' ? props.style : {})
      }
    })
  }
}

/**
 * Separator component preset.
 */
export const separator = createSeparator()

/**
 * Horizontal separator.
 */
export const hseparator = (props?: Omit<SeparatorProps, 'orientation'>) =>
  separator({ ...props, orientation: 'horizontal' })

/**
 * Vertical separator.
 */
export const vseparator = (props?: Omit<SeparatorProps, 'orientation'>) =>
  separator({ ...props, orientation: 'vertical' })
