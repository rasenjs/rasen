/**
 * Progress - task completion indicator.
 *
 * Determinate and indeterminate states. Composed on @rasenjs/dom element
 * factories, and fully reactive: a progress bar is the component most likely
 * to be driven by a value that keeps changing, so `value` and `max` are
 * `PropValue`s and the indicator's position is a binding — not a snapshot
 * taken at mount.
 */
import type { Mountable, PropValue } from '@rasenjs/core'
import { com } from '@rasenjs/core'
import { div } from '@rasenjs/web/elements'
import { readProp } from '../../internal/props'

export type ProgressState = 'indeterminate' | 'loading' | 'complete'

export interface ProgressRootProps {
  /** `null` (or omitted) is the indeterminate state. */
  value?: PropValue<number | null>
  max?: PropValue<number>
  getValueLabel?: (value: number, max: number) => string
  class?: PropValue<string>
  style?: PropValue<string | Record<string, string | number>>
  children?: (
    getContext: () => ProgressContext | undefined
  ) => Mountable<HTMLElement>
}

export interface ProgressIndicatorProps {
  class?: PropValue<string>
  style?: PropValue<string | Record<string, string | number>>
}

export interface ProgressContext {
  /** Reactive reads: bindings call these, so they track the source. */
  value: () => number | null
  max: () => number
  percentage: () => number | null
  state: () => ProgressState
}

/**
 * Create the Progress Root component.
 */
export function createProgressRoot(): (
  props?: ProgressRootProps
) => Mountable<HTMLElement> {
  const component = (props?: ProgressRootProps) => {
    const max = (): number => readProp(props?.max, 100)
    const value = (): number | null => readProp(props?.value, null)

    const percentage = (): number | null => {
      const current = value()
      if (current === null) return null
      const maximum = max()
      if (maximum === 0) return 0
      return Math.min(Math.max((current / maximum) * 100, 0), 100)
    }

    const state = (): ProgressState => {
      const current = value()
      if (current === null) return 'indeterminate'
      return current >= max() ? 'complete' : 'loading'
    }

    const valueLabel = (): string => {
      const current = value()
      const maximum = max()
      if (props?.getValueLabel) {
        return props.getValueLabel(current ?? 0, maximum)
      }
      if (current === null) return 'loading'
      return `${Math.round(percentage() ?? 0)}%`
    }

    const context: ProgressContext = { value, max, percentage, state }
    const getContext = (): ProgressContext => context

    return div({
      role: 'progressbar',
      'aria-valuemin': 0,
      'aria-valuemax': () => max(),
      'aria-valuenow': () => value() ?? undefined,
      'aria-valuetext': () => valueLabel(),
      'data-state': () => state(),
      'data-max': () => max(),
      'data-value': () => value() ?? undefined,
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children(getContext)] : undefined
    })
  }
  return com(component)
}

/**
 * Create the Progress Indicator component.
 *
 * The filled part: its offset is derived from the current percentage on every
 * change, and the indeterminate state is left for CSS (the `data-state`
 * attribute is the hook).
 */
export function createProgressIndicator(): (
  props?: ProgressIndicatorProps,
  getContext?: () => ProgressContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: ProgressIndicatorProps,
    getContext?: () => ProgressContext | undefined
  ) => {
    const percentage = (): number | null => getContext?.()?.percentage() ?? null

    return div({
      'data-state': () => getContext?.()?.state() ?? 'indeterminate',
      'data-value': () => getContext?.()?.value() ?? undefined,
      'data-max': () => getContext?.()?.max() ?? undefined,
      class: props?.class,
      style: {
        width: '100%',
        height: '100%',
        // Functional: the fill position *is* this transform.
        transform: () => {
          const current = percentage()
          return current === null
            ? 'translateX(-100%)'
            : `translateX(-${100 - current}%)`
        },
        ...(typeof props?.style === 'object' ? props.style : {})
      }
    })
  }
  return com(component)
}

/** Progress preset props: root props plus the indicator's styling hooks. */
export type ProgressProps = ProgressRootProps & {
  indicatorClass?: PropValue<string>
  indicatorStyle?: PropValue<string | Record<string, string | number>>
}

/**
 * Progress preset: root + indicator wired to one context.
 */
export function createProgress(): (
  props?: ProgressProps
) => Mountable<HTMLElement> {
  const Root = createProgressRoot()
  const Indicator = createProgressIndicator()

  const component = (props?: ProgressProps) =>
    Root({
      value: props?.value,
      max: props?.max,
      getValueLabel: props?.getValueLabel,
      class: props?.class,
      style: props?.style,
      children: (getContext) =>
        Indicator(
          {
            class: props?.indicatorClass,
            style: props?.indicatorStyle
          },
          getContext
        )
    })

  return com(component)
}

export const progress = createProgress()
