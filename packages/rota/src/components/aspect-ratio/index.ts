/**
 * AspectRatio - fixed aspect ratio container.
 *
 * Keeps children locked to a width/height ratio (images, videos, cards...).
 * Composed on @rasenjs/dom element factories.
 */
import type { Mountable } from '@rasenjs/core'
import { div } from '@rasenjs/dom'

export interface AspectRatioProps {
  ratio?: number
  class?: string
  style?: Record<string, string | number> | string
}

/**
 * Create the AspectRatio component.
 */
export function createAspectRatio(): (
  props?: AspectRatioProps,
  children?: () => Mountable<HTMLElement>
) => Mountable<HTMLElement> {
  return (
    props?: AspectRatioProps,
    children?: () => Mountable<HTMLElement>
  ) => {
    const ratio = props?.ratio ?? 1

    return div({
      dataRatio: String(ratio),
      class: props?.class,
      // The padding-bottom technique IS the ratio mechanism — these inline
      // styles are functional, not cosmetic, and remain user-overridable.
      style: {
        position: 'relative',
        width: '100%',
        overflow: 'hidden',
        paddingBottom: `${(1 / ratio) * 100}%`,
        ...(typeof props?.style === 'object' ? props.style : {})
      },
      children: [
        // Content wrapper: fills the padding-established box.
        div({
          dataAspectRatioContent: '',
          style: {
            position: 'absolute',
            top: '0',
            right: '0',
            bottom: '0',
            left: '0'
          },
          children: children ? [children()] : undefined
        })
      ]
    })
  }
}

/**
 * AspectRatio component preset.
 */
export const aspectRatio = createAspectRatio()
