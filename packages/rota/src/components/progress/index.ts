/**
 * Progress - task completion indicator.
 *
 * Determinate and indeterminate states. Composed on @rasenjs/dom element
 * factories; the context is resolved once at mount (static value contract,
 * same as before the element-factory migration).
 */
import type { Mountable } from '@rasenjs/core'
import { div } from '@rasenjs/dom'

export type ProgressState = 'indeterminate' | 'loading' | 'complete'

export interface ProgressRootProps {
  value?: number | null
  max?: number
  getValueLabel?: (value: number, max: number) => string
  class?: string
  style?: Record<string, string | number> | string
  children?: (
    getContext: () => ProgressContext | undefined
  ) => Mountable<HTMLElement>
}

export interface ProgressIndicatorProps {
  class?: string
  style?: Record<string, string | number> | string
}

export interface ProgressContext {
  value: number | null
  max: number
  percentage: number | null
  state: ProgressState
}

/**
 * Create the Progress Root component.
 */
export function createProgressRoot(): (
  props?: ProgressRootProps
) => Mountable<HTMLElement> {
  return (props?: ProgressRootProps) => {
    const max = props?.max ?? 100
    const value = props?.value ?? null

    const percentage =
      value === null ? null : Math.min(Math.max((value / max) * 100, 0), 100)

    const state: ProgressState =
      value === null ? 'indeterminate' : value >= max ? 'complete' : 'loading'

    const valueLabel = props?.getValueLabel
      ? props.getValueLabel(value ?? 0, max)
      : value === null
        ? 'loading'
        : `${Math.round(percentage ?? 0)}%`

    const context: ProgressContext = { value, max, percentage, state }
    const getContext = (): ProgressContext => context

    return div({
      role: 'progressbar',
      'aria-valuemin': 0,
      'aria-valuemax': max,
      'aria-valuenow': value !== null ? value : undefined,
      'aria-valuetext': valueLabel,
      dataState: state,
      dataMax: max,
      dataValue: value !== null ? value : undefined,
      class: props?.class,
      style: props?.style,
      children: props?.children
        ? [(el) => props.children!(getContext)(el)]
        : undefined
    })
  }
}

/**
 * Create the Progress Indicator component.
 */
export function createProgressIndicator(): (
  props?: ProgressIndicatorProps,
  getContext?: () => ProgressContext | undefined
) => Mountable<HTMLElement> {
  return (
    props?: ProgressIndicatorProps,
    getContext?: () => ProgressContext | undefined
  ) => {
    const ctx = getContext?.()

    return div({
      dataState: ctx?.state,
      dataValue: ctx?.value !== null && ctx?.value !== undefined ? ctx.value : undefined,
      dataMax: ctx?.max,
      class: props?.class,
      style: {
        width: '100%',
        height: '100%',
        ...(ctx?.percentage !== null && ctx?.percentage !== undefined
          ? { transform: `translateX(-${100 - ctx.percentage}%)` }
          : {}),
        ...(typeof props?.style === 'object' ? props.style : {})
      }
    })
  }
}

/**
 * Progress preset: root + indicator wired to one context.
 */
export function createProgress(): (
  props?: ProgressRootProps & {
    indicatorClass?: string
    indicatorStyle?: Record<string, string | number> | string
  }
) => Mountable<HTMLElement> {
  const Root = createProgressRoot()
  const Indicator = createProgressIndicator()

  return (props) =>
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
}

export const progress = createProgress()
