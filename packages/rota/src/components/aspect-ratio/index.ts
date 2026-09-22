/**
 * AspectRatio - fixed aspect ratio container.
 *
 * Keeps children locked to a width/height ratio (images, videos, cards...).
 * Composed on @rasenjs/dom element factories.
 */
import type { Mountable } from '@rasenjs/core'
import { com } from '@rasenjs/core'
import { div } from '@rasenjs/web/elements'

export interface AspectRatioProps {
  /** Id for the ratio container itself. */
  id?: string
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
  const component = (
    props?: AspectRatioProps,
    children?: () => Mountable<HTMLElement>
  ) => {
    const ratio = props?.ratio ?? 1

    return div({
      id: props?.id,
      'data-ratio': String(ratio),
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
        // Content wrapper: fills the padding-established box and centres what
        // it holds. Centring is the useful default for a ratio box - content
        // smaller than the box looks deliberate in the middle and broken in a
        // corner - and it costs nothing for the common case, an image or video
        // pinned with `position: absolute; inset: 0`, because out-of-flow
        // children are unaffected by the flex layout.
        //
        // A child that should stretch instead of centring is the case to be
        // aware of: a flex item no longer fills its container's width on its
        // own. The wrapper carries `data-aspect-ratio-content` so that policy
        // stays overridable from CSS without new props.
        div({
          'data-aspect-ratio-content': '',
          style: {
            position: 'absolute',
            top: '0',
            right: '0',
            bottom: '0',
            left: '0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          },
          children: children ? [children()] : undefined
        })
      ]
    })
  }
  return com(component)
}

/**
 * AspectRatio component preset.
 */
export const aspectRatio = createAspectRatio()
