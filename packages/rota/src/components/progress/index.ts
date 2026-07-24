/**
 * Progress - 进度条组件
 *
 * 显示任务完成进度的指示器，支持确定和不确定状态。
 */
import type { Mountable } from '@rasenjs/core'

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
 * 创建 Progress Root 组件
 */
export function createProgressRoot(): (
  props?: ProgressRootProps
) => Mountable<HTMLElement> {
  return (props?: ProgressRootProps) => {
    return (host: HTMLElement) => {
      const root = document.createElement('div')
      root.style.position = 'relative'
      root.style.overflow = 'hidden'

      if (props?.class) root.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(root.style, props.style)
        }
      }

      const max = props?.max ?? 100
      const value = props?.value ?? null

      const percentage =
        value === null ? null : Math.min(Math.max((value / max) * 100, 0), 100)

      const state: ProgressState =
        value === null ? 'indeterminate' : value >= max ? 'complete' : 'loading'

      const valueLabel = props?.getValueLabel
        ? props.getValueLabel(value ?? 0, max)
        : value === null
          ? '加载中'
          : `${Math.round(percentage ?? 0)}%`

      root.setAttribute('role', 'progressbar')
      root.setAttribute('aria-valuemin', '0')
      root.setAttribute('aria-valuemax', String(max))
      root.setAttribute('data-state', state)
      root.setAttribute('data-max', String(max))

      if (value !== null) {
        root.setAttribute('aria-valuenow', String(value))
        root.setAttribute('data-value', String(value))
      }
      root.setAttribute('aria-valuetext', valueLabel)

      const context: ProgressContext = { value, max, percentage, state }
      const getContext = (): ProgressContext => context

      // 渲染 children
      let childUnmount: (() => void) | undefined
      if (props?.children) {
        childUnmount = props.children(getContext)(root)
      }

      host.appendChild(root)

      return () => {
        childUnmount?.()
        root.remove()
      }
    }
  }
}

/**
 * 创建 Progress Indicator 组件
 */
export function createProgressIndicator(): (
  props?: ProgressIndicatorProps,
  getContext?: () => ProgressContext | undefined
) => Mountable<HTMLElement> {
  return (
    props?: ProgressIndicatorProps,
    getContext?: () => ProgressContext | undefined
  ) => {
    return (host: HTMLElement) => {
      const indicator = document.createElement('div')
      indicator.style.width = '100%'
      indicator.style.height = '100%'
      indicator.style.transition = 'transform 0.3s ease'

      if (props?.class) indicator.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(indicator.style, props.style)
        }
      }

      const ctx = getContext?.()
      if (ctx) {
        indicator.setAttribute('data-state', ctx.state)
        if (ctx.value !== null) {
          indicator.setAttribute('data-value', String(ctx.value))
        }
        indicator.setAttribute('data-max', String(ctx.max))

        if (ctx.percentage !== null) {
          indicator.style.transform = `translateX(-${100 - ctx.percentage}%)`
        }
      }

      host.appendChild(indicator)
      return () => indicator.remove()
    }
  }
}

/**
 * Progress 组合组件
 */
export function createProgress(): (
  props?: ProgressRootProps & {
    indicatorClass?: string
    indicatorStyle?: Record<string, string | number> | string
  }
) => Mountable<HTMLElement> {
  const Root = createProgressRoot()
  const Indicator = createProgressIndicator()

  return (
    props?: ProgressRootProps & {
      indicatorClass?: string
      indicatorStyle?: Record<string, string | number> | string
    }
  ) => {
    return (host: HTMLElement) => {
      return Root({
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
      })(host)
    }
  }
}

export const progress = createProgress()
