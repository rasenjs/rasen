/**
 * NumberField - numeric input with steppers, formatting and range limits.
 *
 * Root + Input + Increment + Decrement composition, Reka/Radix-style API.
 * Composed on @rasenjs/dom element factories: the value is a runtime ref and
 * the input/steppers bind to it reactively.
 */
import type { Mountable } from '@rasenjs/core'
import { com, getReactiveRuntime } from '@rasenjs/core'
import { div, button, input as inputEl } from '@rasenjs/dom'

export interface NumberFieldContext {
  /** Reactive value snapshot. */
  value: () => number | null
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
 * Create the NumberField Root component.
 */
export function createNumberFieldRoot(): (
  props?: NumberFieldRootProps
) => Mountable<HTMLElement> {
  const component = (props?: NumberFieldRootProps) => {
    const rt = getReactiveRuntime()

    const min = props?.min ?? 0
    const max = props?.max ?? 100
    const step = props?.step ?? 1
    const disabled = props?.disabled ?? false

    const isControlled = props?.value !== undefined
    const internal = rt.ref<number | null>(
      props?.value ?? props?.defaultValue ?? 0
    )
    const current = (): number | null =>
      isControlled ? (props?.value ?? null) : rt.unref(internal)

    const updateValue = (newValue: number | null): void => {
      if (!isControlled) {
        rt.setValue(internal, newValue)
      }
      props?.onValueChange?.(newValue)
    }

    const context: NumberFieldContext = {
      value: current,
      min,
      max,
      step,
      disabled,
      updateValue
    }
    const getContext = (): NumberFieldContext => context

    return div({
      role: 'group',
      'data-disabled': disabled ? '' : undefined,
      class: props?.class,
      style: props?.style,
      children: props?.children ? [props.children(getContext)] : undefined
    })
  }
  return com(component)
}

/**
 * Create the NumberField Input component.
 */
export function createNumberFieldInput(): (
  props?: NumberFieldInputProps,
  getContext?: () => NumberFieldContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: NumberFieldInputProps,
    getContext?: () => NumberFieldContext | undefined
  ) => {
    const ctx = getContext?.()

    const handleInput = (e: Event) => {
      const target = e.target as HTMLInputElement
      const current = getContext?.()
      if (!current) return

      if (target.value === '') {
        current.updateValue(null)
        return
      }

      const parsed = parseFloat(target.value)
      if (!Number.isNaN(parsed)) {
        const clamped = Math.min(current.max, Math.max(current.min, parsed))
        current.updateValue(clamped)
      }
    }

    const handleBlur = (e: Event) => {
      const target = e.target as HTMLInputElement
      const current = getContext?.()
      if (!current) return
      const value = current.value()
      target.value = value !== null ? value.toString() : ''
    }

    return inputEl({
      type: 'text',
      inputMode: 'decimal',
      // `value` is a DOM property on inputs (see the binding layer's
      // property/attribute classification), so this stays in sync without
      // clobbering what the user is typing between updates.
      value: () => {
        const value = ctx?.value() ?? null
        return value !== null ? value.toString() : ''
      },
      'data-disabled': () => (ctx?.disabled ? '' : undefined),
      disabled: () => ctx?.disabled ?? false,
      class: props?.class,
      style: props?.style,
      onInput: handleInput,
      onBlur: handleBlur
    })
  }
  return com(component)
}

/**
 * Create the NumberField Increment component.
 */
export function createNumberFieldIncrement(): (
  props?: NumberFieldIncrementProps,
  getContext?: () => NumberFieldContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: NumberFieldIncrementProps,
    getContext?: () => NumberFieldContext | undefined
  ) => {
    const ctx = getContext?.()

    return button({
      type: 'button',
      'data-disabled': () => (ctx?.disabled ? '' : undefined),
      'aria-disabled': () => String(ctx?.disabled ?? false),
      class: props?.class,
      style: props?.style,
      children: [
        (el: HTMLElement) => {
          el.textContent = props?.children ?? '+'
          return undefined
        }
      ],
      onClick: () => {
        const current = getContext?.()
        if (!current || current.disabled) return
        const value = current.value()
        const next = value === null ? current.min : value + current.step
        current.updateValue(Math.min(current.max, next))
      }
    })
  }
  return com(component)
}

/**
 * Create the NumberField Decrement component.
 */
export function createNumberFieldDecrement(): (
  props?: NumberFieldDecrementProps,
  getContext?: () => NumberFieldContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: NumberFieldDecrementProps,
    getContext?: () => NumberFieldContext | undefined
  ) => {
    const ctx = getContext?.()

    return button({
      type: 'button',
      'data-disabled': () => (ctx?.disabled ? '' : undefined),
      'aria-disabled': () => String(ctx?.disabled ?? false),
      class: props?.class,
      style: props?.style,
      children: [
        (el: HTMLElement) => {
          el.textContent = props?.children ?? '-'
          return undefined
        }
      ],
      onClick: () => {
        const current = getContext?.()
        if (!current || current.disabled) return
        const value = current.value()
        const next = value === null ? current.min : value - current.step
        current.updateValue(Math.max(current.min, next))
      }
    })
  }
  return com(component)
}

/**
 * NumberField preset props: root props plus per-part class hooks.
 */
export type NumberFieldProps = NumberFieldRootProps & {
  inputClass?: string
  inputStyle?: Record<string, string | number> | string
  incrementClass?: string
  incrementStyle?: Record<string, string | number> | string
  decrementClass?: string
  decrementStyle?: Record<string, string | number> | string
  incrementChildren?: string
  decrementChildren?: string
}

/**
 * NumberField preset: root + input + steppers wired to one context.
 */
export function createNumberField(): (
  props?: NumberFieldProps
) => Mountable<HTMLElement> {
  const Root = createNumberFieldRoot()
  const Input = createNumberFieldInput()
  const Increment = createNumberFieldIncrement()
  const Decrement = createNumberFieldDecrement()

  const component = (props?: NumberFieldProps) =>
    Root({
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
      children: (getContext) =>
        div({
          style: { display: 'flex' },
          children: [
            Input(
              { class: props?.inputClass, style: props?.inputStyle },
              getContext
            ),
            Decrement(
              {
                class: props?.decrementClass,
                style: props?.decrementStyle,
                children: props?.decrementChildren
              },
              getContext
            ),
            Increment(
              {
                class: props?.incrementClass,
                style: props?.incrementStyle,
                children: props?.incrementChildren
              },
              getContext
            )
          ]
        })
    })

  return com(component)
}

export const numberField = createNumberField()
