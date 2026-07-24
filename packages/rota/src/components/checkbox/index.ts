/**
 * Checkbox - 复选框组件
 *
 * 允许用户在选中和未选中状态之间切换的控件，支持不确定状态。
 * 采用 Root + Indicator 组合模式，与 Reka/Radix API 一致。
 */
import type { Mountable } from '@rasenjs/core'

export type CheckboxCheckedState = boolean | 'indeterminate'

export interface CheckboxContext {
  isChecked: boolean
  isIndeterminate: boolean
}

export interface CheckboxRootProps {
  checked?: CheckboxCheckedState
  defaultChecked?: CheckboxCheckedState
  disabled?: boolean
  required?: boolean
  name?: string
  value?: string
  onCheckedChange?: (checked: CheckboxCheckedState) => void
  class?: string
  style?: Record<string, string | number> | string
  children?: (
    getContext: () => CheckboxContext | undefined
  ) => Mountable<HTMLElement>
}

export interface CheckboxIndicatorProps {
  forceMount?: boolean
  class?: string
  style?: Record<string, string | number> | string
}

function getCheckedState(state: CheckboxCheckedState): {
  isChecked: boolean
  isIndeterminate: boolean
  dataState: 'checked' | 'unchecked' | 'indeterminate'
  ariaChecked: 'true' | 'false' | 'mixed'
} {
  const isChecked = state === true
  const isIndeterminate = state === 'indeterminate'
  const dataState = isChecked
    ? 'checked'
    : isIndeterminate
      ? 'indeterminate'
      : 'unchecked'
  const ariaChecked = isChecked ? 'true' : isIndeterminate ? 'mixed' : 'false'
  return { isChecked, isIndeterminate, dataState, ariaChecked }
}

/**
 * 创建 Checkbox Root 组件
 */
export function createCheckboxRoot(): (
  props?: CheckboxRootProps
) => Mountable<HTMLElement> {
  return (props?: CheckboxRootProps) => {
    return (host: HTMLElement) => {
      const disabled = props?.disabled ?? false
      const required = props?.required ?? false

      const btn = document.createElement('div')
      btn.setAttribute('role', 'checkbox')
      btn.setAttribute('tabindex', disabled ? '-1' : '0')

      if (props?.class) btn.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(btn.style, props.style)
        }
      }

      if (disabled) {
        btn.setAttribute('aria-disabled', 'true')
        btn.setAttribute('data-disabled', '')
      }

      if (required) {
        btn.setAttribute('aria-required', 'true')
      }

      const isControlled = props?.checked !== undefined
      let currentValue: CheckboxCheckedState =
        props?.checked ?? props?.defaultChecked ?? false

      const updateState = (): void => {
        const state = getCheckedState(currentValue)
        btn.setAttribute('aria-checked', state.ariaChecked)
        btn.setAttribute('data-state', state.dataState)
      }

      updateState()

      const toggle = (): void => {
        if (disabled) return

        let newValue: CheckboxCheckedState
        if (currentValue === false) {
          newValue = true
        } else if (currentValue === true) {
          newValue = 'indeterminate'
        } else {
          newValue = false
        }

        if (!isControlled) {
          currentValue = newValue
          updateState()
        }
        props?.onCheckedChange?.(newValue)
      }

      btn.addEventListener('click', toggle)

      btn.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          toggle()
        }
      })

      const context: CheckboxContext = {
        get isChecked() {
          const state = getCheckedState(
            isControlled ? (props?.checked ?? false) : currentValue
          )
          return state.isChecked
        },
        get isIndeterminate() {
          const state = getCheckedState(
            isControlled ? (props?.checked ?? false) : currentValue
          )
          return state.isIndeterminate
        }
      }

      const getContext = (): CheckboxContext | undefined => context

      let childUnmount: (() => void) | undefined
      if (props?.children) {
        childUnmount = props.children(getContext)(btn)
      }

      host.appendChild(btn)

      return () => {
        childUnmount?.()
        btn.remove()
      }
    }
  }
}

/**
 * 创建 Checkbox Indicator 组件
 */
export function createCheckboxIndicator(): (
  props?: CheckboxIndicatorProps,
  getContext?: () => CheckboxContext | undefined
) => Mountable<HTMLElement> {
  return (
    props?: CheckboxIndicatorProps,
    getContext?: () => CheckboxContext | undefined
  ) => {
    return (host: HTMLElement) => {
      const forceMount = props?.forceMount ?? false
      const ctx = getContext?.()

      const shouldRender = forceMount || ctx?.isChecked || ctx?.isIndeterminate

      if (!shouldRender) {
        return () => {}
      }

      const indicator = document.createElement('span')

      if (props?.class) indicator.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(indicator.style, props.style)
        }
      }

      if (ctx) {
        const dataState = ctx.isIndeterminate
          ? 'indeterminate'
          : ctx.isChecked
            ? 'checked'
            : 'unchecked'
        indicator.setAttribute('data-state', dataState)
      } else {
        indicator.setAttribute('data-state', 'unchecked')
      }

      host.appendChild(indicator)
      return () => indicator.remove()
    }
  }
}

/**
 * Checkbox 组合组件
 */
export function createCheckbox(): (
  props?: CheckboxRootProps & {
    indicatorClass?: string
    indicatorStyle?: Record<string, string | number> | string
    forceMount?: boolean
  }
) => Mountable<HTMLElement> {
  const Root = createCheckboxRoot()
  const Indicator = createCheckboxIndicator()

  return (
    props?: CheckboxRootProps & {
      indicatorClass?: string
      indicatorStyle?: Record<string, string | number> | string
      forceMount?: boolean
    }
  ) => {
    return (host: HTMLElement) => {
      return Root({
        checked: props?.checked,
        defaultChecked: props?.defaultChecked,
        disabled: props?.disabled,
        required: props?.required,
        name: props?.name,
        value: props?.value,
        onCheckedChange: props?.onCheckedChange,
        class: props?.class,
        style: props?.style,
        children: (getContext) => (btn: HTMLElement) => {
          return Indicator(
            {
              class: props?.indicatorClass,
              style: props?.indicatorStyle,
              forceMount: props?.forceMount
            },
            getContext
          )(btn)
        }
      })(host)
    }
  }
}

export const checkbox = createCheckbox()
