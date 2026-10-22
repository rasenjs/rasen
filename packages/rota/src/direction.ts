/**
 * Writing direction: how a component behaves when the text runs right to left.
 *
 * ## Why direction is provided, not detected
 *
 * Reading `document.documentElement.dir` would be the obvious way to detect it,
 * and it is the wrong one here. Direction changes *markup* - the slider emits
 * `left: 30%` or `right: 30%`, the popover's alignment swaps sides - so a value
 * that differs between the server (no document) and the client would produce
 * markup that does not match, and hydration exists to catch exactly that. The
 * direction therefore has to be stated, and `directionProvider` is where.
 *
 * ## What mirrors, and what does not
 *
 * - **Arrow keys along the inline axis mirror.** In RTL, ArrowLeft moves
 *   forward and ArrowRight moves back. Keys on the block axis (ArrowUp /
 *   ArrowDown) keep their meaning whatever the direction: up is still up.
 * - **`align: 'start' | 'end'` mirrors when the alignment axis is the inline
 *   axis** - that is, for `side: 'top' | 'bottom'`. For `side: 'left' |
 *   'right'` the alignment runs down the block axis, so `start` still means
 *   top. This is the same rule Radix applies.
 * - **`side` stays physical.** `side: 'left'` is the left edge in every
 *   direction. A logical vocabulary there would have to answer "start of
 *   what?", and consumers who want mirroring can choose the side themselves.
 * - **Digit entry does not mirror.** PinInput's cells stay left-to-right:
 *   digits are read as a number, not as text.
 *
 * ## The same ambient mechanism as the rest of the library
 *
 * There is no injectable context in this framework, so a value that parts must
 * agree on without being handed it travels through a module-level slot set
 * around the provider's synchronous mount recursion - the same mechanism
 * Accordion's part contexts and Tooltip's shared delay use, with the same
 * caveat: a part mounted asynchronously is outside that recursion.
 */
import type { HostHooks, Mountable } from '@rasenjs/core'
import { com } from '@rasenjs/core'
import { toMountables } from './internal/children'

export type Direction = 'ltr' | 'rtl'

let ambient: Direction | undefined

/** The direction in force, or `'ltr'` outside any provider. */
export function getDirection(): Direction {
  return ambient ?? 'ltr'
}

/** Whether the active direction is right-to-left. */
export function isRtl(): boolean {
  return getDirection() === 'rtl'
}

/**
 * Run `fn` with `dir` in force for the components mounted beneath it.
 *
 * Exported for the provider and for tests; components read `getDirection()`.
 */
export function withDirection<T>(dir: Direction, fn: () => T): T {
  const previous = ambient
  ambient = dir
  try {
    return fn()
  } finally {
    ambient = previous
  }
}

/**
 * The keys that move forward and backward along an axis, in the active
 * direction.
 *
 * One function because the mapping has to be identical wherever it is used: a
 * component that mirrored on its own would be a place for the rule to drift,
 * and the four callers (roving focus, tabs, radio group, slider) would drift
 * differently.
 */
export function arrowKeys(orientation: 'horizontal' | 'vertical'): {
  /** Forward along the axis. */
  next: string
  /** Backward along the axis. */
  prev: string
} {
  if (orientation === 'vertical') {
    // The block axis does not mirror: up is up in every direction.
    return { next: 'ArrowDown', prev: 'ArrowUp' }
  }
  return isRtl()
    ? { next: 'ArrowLeft', prev: 'ArrowRight' }
    : { next: 'ArrowRight', prev: 'ArrowLeft' }
}

export interface DirectionProviderProps {
  /** Default `'ltr'`. */
  dir?: Direction
  /** May return one or several mountables; the provider renders no element. */
  children?: () => Mountable<HTMLElement> | Mountable<HTMLElement>[]
}

/**
 * Create the Direction Provider: the direction for the components beneath it.
 *
 * Renders **no element**. It is a scope, not a wrapper: a `<div>` here would
 * change the layout of the whole application, and direction is not a layout
 * container.
 *
 * ```ts
 * directionProvider({ dir: 'rtl', children: () => app() })(document.body)
 * ```
 */
export function createDirectionProvider(): (
  props?: DirectionProviderProps
) => Mountable<HTMLElement> {
  const component = (props?: DirectionProviderProps) => {
    const dir = props?.dir ?? 'ltr'

    return (host: HTMLElement, hooks: HostHooks<HTMLElement> | undefined) => {
      // The children callback runs *inside* the scope: invoking it is what runs
      // the components' bodies, so anything evaluated earlier would read no
      // direction at all - and the components would silently use 'ltr', which
      // looks like the provider working.
      const unmounts = withDirection(dir, () => {
        const children = toMountables(props?.children?.()) ?? []
        return children.map((child) => child(host, hooks))
      })
      return () => {
        for (const unmount of unmounts) unmount?.()
      }
    }
  }
  return com(component)
}

export const directionProvider = createDirectionProvider()
