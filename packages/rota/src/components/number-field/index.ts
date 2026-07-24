/**
 * NumberField - 数字字段组件
 *
 * 数字输入字段，支持步进器、格式化和范围限制。
 * 采用 Root + Input + Increment + Decrement 组合模式，与 Reka/Radix API 一致。
 */
import type { Mountable } from '@rasenjs/core'

export interface NumberFieldContext {
  value: number | null
  min: number
  max: number
  step: number
  disabled: boolean
  updateValue: (value: number | null) => void
}

export interface NumberFieldRootProps {
  value?: number
  defaultValue?: number
  min?: number
  max?: number
  step?: number
  formatOptions?: Intl.NumberFormatOptions
  locale?: string
  disabled?: boolean
  required?: boolean
  name?: string
  onValueChange?: (value: number | null) => void
  class?: string
  style?: Record<string, string | number> | string
  children?: (
    getContext: () => NumberFieldContext | undefined
  ) => Mountable<HTMLElement>
}

export interface NumberFieldInputProps {
  class?: string
  style?: Record<string, string | number> | string
}

export interface NumberFieldIncrementProps {
  class?: string
  style?: Record<string, string | number> | string
  children?: string
}

export interface NumberFieldDecrementProps {
  class?: string
  style?: Record<string, string | number> | string
  children?: string
}

/**
 * 创建 NumberField Root 组件
 */
export function createNumberFieldRoot(): (
  props?: NumberFieldRootProps
) => Mountable<HTMLElement> {
  return (props?: NumberFieldRootProps) => {
    return (host: HTMLElement) => {
      const root = document.createElement('div')
      root.role = 'group'

      // Default values
      const min = props?.min ?? 0
      const max = props?.max ?? 100
      const step = props?.step ?? 1
      const disabled = props?.disabled ?? false
      const required = props?.required ?? false

      // Set up initial value
      const isControlled = props?.value !== undefined
      let internalValue: number | null =
        props?.value ?? props?.defaultValue ?? 0

      // Update value function
      const updateValue = (newValue: number | null) => {
        if (!isControlled) {
          internalValue = newValue
        }
        props?.onValueChange?.(newValue)
      }

      // Context to share state with child components
      const context: NumberFieldContext = {
        get value() {
          return isControlled ? (props?.value ?? null) : internalValue
        },
        get min() {
          return min
        },
        get max() {
          return max
        },
        get step() {
          return step
        },
        get disabled() {
          return disabled
        },
        updateValue
      }

      const getContext = (): NumberFieldContext | undefined => context

      // Apply classes and styles
      if (props?.class) root.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(root.style, props.style)
        }
      }

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
 * 创建 NumberField Input 组件
 */
export function createNumberFieldInput(): (
  props?: NumberFieldInputProps,
  getContext?: () => NumberFieldContext | undefined
) => Mountable<HTMLInputElement> {
  return (
    props?: NumberFieldInputProps,
    getContext?: () => NumberFieldContext | undefined
  ) => {
    return (host: HTMLInputElement) => {
      const input = document.createElement('input')
      input.type = 'text' // Use text to support formatting
      input.inputMode = 'decimal' // Better mobile keyboard for decimals

      const ctx = getContext?.()
      if (ctx) {
        // Initialize with current value from context
        const currentValue = ctx.value
        input.value = currentValue !== null ? currentValue.toString() : ''
      }

      // Apply classes and styles
      if (props?.class) input.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(input.style, props.style)
        }
      }

      // Handle input change
      const handleInput = (e: Event) => {
        const target = e.target as HTMLInputElement
        const ctx = getContext?.()
        if (!ctx) return

        if (target.value === '') {
          ctx.updateValue(null)
          return
        }

        const parsedValue = parseFloat(target.value)
        if (!isNaN(parsedValue)) {
          // Clamp to range
          const clampedValue = Math.min(ctx.max, Math.max(ctx.min, parsedValue))
          ctx.updateValue(clampedValue)
        }
      }

      input.addEventListener('input', handleInput)

      // Handle blur to format the value
      const handleBlur = () => {
        const ctx = getContext?.()
        if (!ctx) return

        const formattedValue = ctx.value !== null ? ctx.value.toString() : ''
        input.value = formattedValue
      }

      input.addEventListener('blur', handleBlur)

      // Disable if context is disabled
      if (ctx?.disabled) {
        input.disabled = true
        input.setAttribute('data-disabled', '')
      }

      host.appendChild(input)

      return () => {
        input.removeEventListener('input', handleInput)
        input.removeEventListener('blur', handleBlur)
        input.remove()
      }
    }
  }
}

/**
 * 创建 NumberField Increment 组件
 */
export function createNumberFieldIncrement(): (
  props?: NumberFieldIncrementProps,
  getContext?: () => NumberFieldContext | undefined
) => Mountable<HTMLButtonElement> {
  return (
    props?: NumberFieldIncrementProps,
    getContext?: () => NumberFieldContext | undefined
  ) => {
    return (host: HTMLButtonElement) => {
      const button = document.createElement('button')
      button.type = 'button'

      // Set default text content if not provided
      if (props?.children) {
        button.textContent = props.children
      } else {
        button.textContent = '+'
      }

      // Apply classes and styles
      if (props?.class) button.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(button.style, props.style)
        }
      }

      const handleClick = () => {
        const ctx = getContext?.()
        if (!ctx || ctx.disabled) return

        let currentValue = ctx.value
        if (currentValue === null) {
          currentValue = ctx.min
        } else {
          currentValue += ctx.step
        }

        // Clamp to max
        const newValue = Math.min(ctx.max, currentValue)
        ctx.updateValue(newValue)
      }

      button.addEventListener('click', handleClick)

      // Disable if context is disabled
      if (getContext?.()?.disabled) {
        button.disabled = true
        button.setAttribute('data-disabled', '')
      }

      host.appendChild(button)

      return () => {
        button.removeEventListener('click', handleClick)
        button.remove()
      }
    }
  }
}

/**
 * 创建 NumberField Decrement 组件
 */
export function createNumberFieldDecrement(): (
  props?: NumberFieldDecrementProps,
  getContext?: () => NumberFieldContext | undefined
) => Mountable<HTMLButtonElement> {
  return (
    props?: NumberFieldDecrementProps,
    getContext?: () => NumberFieldContext | undefined
  ) => {
    return (host: HTMLButtonElement) => {
      const button = document.createElement('button')
      button.type = 'button'

      // Set default text content if not provided
      if (props?.children) {
        button.textContent = props.children
      } else {
        button.textContent = '-'
      }

      // Apply classes and styles
      if (props?.class) button.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(button.style, props.style)
        }
      }

      const handleClick = () => {
        const ctx = getContext?.()
        if (!ctx || ctx.disabled) return

        let currentValue = ctx.value
        if (currentValue === null) {
          currentValue = ctx.min
        } else {
          currentValue -= ctx.step
        }

        // Clamp to min
        const newValue = Math.max(ctx.min, currentValue)
        ctx.updateValue(newValue)
      }

      button.addEventListener('click', handleClick)

      // Disable if context is disabled
      if (getContext?.()?.disabled) {
        button.disabled = true
        button.setAttribute('data-disabled', '')
      }

      host.appendChild(button)

      return () => {
        button.removeEventListener('click', handleClick)
        button.remove()
      }
    }
  }
}

/**
 * NumberField 组合组件
 */
export function createNumberField(): (
  props?: NumberFieldRootProps & {
    inputClass?: string
    inputStyle?: Record<string, string | number> | string
    incrementClass?: string
    incrementStyle?: Record<string, string | number> | string
    decrementClass?: string
    decrementStyle?: Record<string, string | number> | string
    incrementChildren?: string
    decrementChildren?: string
  }
) => Mountable<HTMLElement> {
  const Root = createNumberFieldRoot()
  const Input = createNumberFieldInput()
  const Increment = createNumberFieldIncrement()
  const Decrement = createNumberFieldDecrement()

  return (
    props?: NumberFieldRootProps & {
      inputClass?: string
      inputStyle?: Record<string, string | number> | string
      incrementClass?: string
      incrementStyle?: Record<string, string | number> | string
      decrementClass?: string
      decrementStyle?: Record<string, string | number> | string
      incrementChildren?: string
      decrementChildren?: string
    }
  ) => {
    return (host: HTMLElement) => {
      return Root({
        value: props?.value,
        defaultValue: props?.defaultValue,
        min: props?.min,
        max: props?.max,
        step: props?.step,
        formatOptions: props?.formatOptions,
        locale: props?.locale,
        disabled: props?.disabled,
        required: props?.required,
        name: props?.name,
        onValueChange: props?.onValueChange,
        class: props?.class,
        style: props?.style,
        children: (getContext) => (host: HTMLElement) => {
          // Create an input wrapper div to properly contain the input and buttons
          const wrapper = document.createElement('div')
          wrapper.style.display = 'flex'

          // Create input element
          const inputHost = document.createElement('div')
          const inputUnmount = Input(
            {
              class: props?.inputClass,
              style: props?.inputStyle
            },
            getContext
          )(inputHost)

          // Create decrement button
          const decrementHost = document.createElement('div')
          const decrementUnmount = Decrement(
            {
              class: props?.decrementClass,
              style: props?.decrementStyle,
              children: props?.decrementChildren
            },
            getContext
          )(decrementHost)

          // Create increment button
          const incrementHost = document.createElement('div')
          const incrementUnmount = Increment(
            {
              class: props?.incrementClass,
              style: props?.incrementStyle,
              children: props?.incrementChildren
            },
            getContext
          )(incrementHost)

          // Append all elements in the right order
          wrapper.appendChild(inputHost)
          wrapper.appendChild(decrementHost)
          wrapper.appendChild(incrementHost)

          host.appendChild(wrapper)

          return () => {
            inputUnmount()
            incrementUnmount()
            decrementUnmount()
            wrapper.remove()
          }
        }
      })(host)
    }
  }
}

export const numberField = createNumberField()
