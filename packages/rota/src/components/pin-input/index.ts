/**
 * PinInput - one-time-code / PIN input.
 *
 * Keyboard navigation, paste distribution and OTP autofill. Composed on
 * @rasenjs/dom element factories: value and focus index are runtime refs
 * exposed through getter-backed context properties, so each cell's value and
 * selection update reactively.
 */
import type { Mountable } from '@rasenjs/core'
import { com, getReactiveRuntime } from '@rasenjs/core'
import { div, input as inputEl } from '@rasenjs/dom'

export type PinInputType = 'numeric' | 'alphanumeric' | 'text'

export interface PinInputContext {
  value: string
  length: number
  type: PinInputType
  disabled: boolean
  otp?: boolean
  focusedIndex: number
  setValue: (value: string) => void
  setFocusedIndex: (index: number) => void
}

export interface PinInputRootProps {
  value?: string
  defaultValue?: string
  length?: number
  type?: PinInputType
  otp?: boolean
  disabled?: boolean
  placeholder?: string
  onValueChange?: (value: string) => void
  onComplete?: (value: string) => void
  class?: string
  style?: Record<string, string | number> | string
  children?: (
    getContext: () => PinInputContext | undefined
  ) => Mountable<HTMLElement>
}

export interface PinInputInputProps {
  index: number
  class?: string
  style?: Record<string, string | number> | string
}

/**
 * Check whether a character is allowed for the given input type.
 */
function isValidChar(char: string, type: PinInputType): boolean {
  if (type === 'numeric') return /^\d$/.test(char)
  if (type === 'alphanumeric') return /^[a-zA-Z0-9]$/.test(char)
  return true
}

/**
 * Create the PinInput Root component.
 */
export function createPinInputRoot(): (
  props?: PinInputRootProps
) => Mountable<HTMLElement> {
  const component = (props?: PinInputRootProps) => {
    const rt = getReactiveRuntime()

    const length = props?.length ?? 4
    const type = props?.type ?? 'numeric'
    const disabled = props?.disabled ?? false

    const isControlled = props?.value !== undefined
    const internalValue = rt.ref(props?.value ?? props?.defaultValue ?? '')
    const focused = rt.ref(0)

    const normalizeValue = (val: string): string => val.slice(0, length)

    const currentValue = (): string =>
      normalizeValue(isControlled ? (props?.value ?? '') : rt.unref(internalValue))

    const setValue = (newValue: string): void => {
      const normalized = normalizeValue(newValue)
      if (!isControlled) {
        rt.setValue(internalValue, normalized)
      }
      props?.onValueChange?.(normalized)
      if (normalized.length === length) {
        props?.onComplete?.(normalized)
      }
    }

    const context: PinInputContext = {
      get value() {
        return currentValue()
      },
      get length() {
        return length
      },
      get type() {
        return type
      },
      get disabled() {
        return disabled
      },
      get otp() {
        return props?.otp
      },
      get focusedIndex() {
        return rt.unref(focused)
      },
      setValue,
      setFocusedIndex: (index) =>
        rt.setValue(focused, Math.max(0, Math.min(length - 1, index)))
    }
    const getContext = (): PinInputContext => context

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
 * Create the PinInput Input component (one cell).
 */
export function createPinInputInput(): (
  props?: PinInputInputProps,
  getContext?: () => PinInputContext | undefined
) => Mountable<HTMLElement> {
  const component = (
    props?: PinInputInputProps,
    getContext?: () => PinInputContext | undefined
  ) => {
    const index = props?.index ?? 0
    const ctx = getContext?.()

    /**
     * Cells are siblings of the root, so navigation resolves the cell list
     * from the enclosing group at event time.
     */
    const cellAt = (el: HTMLElement, at: number): HTMLInputElement | null => {
      const root = el.closest('[role="group"]') ?? el.parentElement
      return (
        (root?.querySelectorAll('input')[at] as HTMLInputElement | undefined) ??
        null
      )
    }

    const handleInput = (e: Event) => {
      const target = e.target as HTMLInputElement
      const current = getContext?.()
      if (!current) return

      const char = target.value
      if (!char) return
      if (!isValidChar(char, current.type)) {
        target.value = ''
        return
      }

      const value = current.value
      const next =
        value.slice(0, index) + char + value.slice(index + 1)
      current.setValue(next)

      if (index < current.length - 1) {
        current.setFocusedIndex(index + 1)
        cellAt(target, index + 1)?.focus()
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const current = getContext?.()
      if (!current) return
      const target = e.target as HTMLInputElement
      const value = current.value

      switch (e.key) {
        case 'Backspace': {
          e.preventDefault()
          if (value[index]) {
            current.setValue(
              value.slice(0, index) + value.slice(index + 1)
            )
          } else if (index > 0) {
            current.setFocusedIndex(index - 1)
            cellAt(target, index - 1)?.focus()
            current.setValue(
              value.slice(0, index - 1) + value.slice(index)
            )
          }
          break
        }

        case 'Delete':
          e.preventDefault()
          if (value[index]) {
            current.setValue(
              value.slice(0, index) + value.slice(index + 1)
            )
          }
          break

        case 'ArrowLeft':
          e.preventDefault()
          if (index > 0) {
            current.setFocusedIndex(index - 1)
            cellAt(target, index - 1)?.focus()
          }
          break

        case 'ArrowRight':
          e.preventDefault()
          if (index < current.length - 1) {
            current.setFocusedIndex(index + 1)
            cellAt(target, index + 1)?.focus()
          }
          break

        default:
          break
      }
    }

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault()
      const current = getContext?.()
      if (!current) return

      const pasted = e.clipboardData?.getData('text') ?? ''
      const chars = pasted.split('').filter((c) => isValidChar(c, current.type))
      if (chars.length === 0) return

      const value = current.value
      let next = value.slice(0, index)
      for (let i = 0; i < chars.length && index + i < current.length; i++) {
        next += chars[i]
      }
      next = next.slice(0, current.length)

      current.setValue(next)

      const lastIndex = Math.min(index + chars.length - 1, current.length - 1)
      current.setFocusedIndex(lastIndex)
      cellAt(e.target as HTMLElement, lastIndex)?.focus()
    }

    return inputEl({
      type: 'text',
      maxLength: 1,
      inputMode: ctx?.type === 'numeric' ? 'numeric' : 'text',
      placeholder: ctx?.type === 'numeric' ? '•' : '_',
      value: () => {
        const value = getContext?.()?.value ?? ''
        return value[index] ?? ''
      },
      disabled: () => getContext?.()?.disabled ?? false,
      'data-disabled': () => (getContext?.()?.disabled ? '' : undefined),
      class: props?.class,
      style: props?.style,
      onInput: handleInput,
      onKeyDown: handleKeyDown,
      onPaste: handlePaste,
      onFocus: () => getContext?.()?.setFocusedIndex(index),
      onClick: (e: Event) => (e.target as HTMLInputElement).select()
    })
  }
  return com(component)
}

/**
 * PinInput preset: root + one cell per position.
 */
export function createPinInput(): (
  props?: PinInputRootProps & {
    inputClass?: string
    inputStyle?: Record<string, string | number> | string
  }
) => Mountable<HTMLElement> {
  const Root = createPinInputRoot()
  const Input = createPinInputInput()

  const component = (
    props?: PinInputRootProps & {
      inputClass?: string
      inputStyle?: Record<string, string | number> | string
    }
  ) => {
    const length = props?.length ?? 4

    return Root({
      value: props?.value,
      defaultValue: props?.defaultValue,
      length,
      type: props?.type,
      otp: props?.otp,
      disabled: props?.disabled,
      placeholder: props?.placeholder,
      onValueChange: props?.onValueChange,
      onComplete: props?.onComplete,
      class: props?.class,
      style: props?.style,
      children: (getContext) =>
        div({
          style: { display: 'flex' },
          children: Array.from({ length }, (_, i) =>
            Input(
              {
                index: i,
                class: props?.inputClass,
                style: props?.inputStyle
              },
              getContext
            )
          )
        })
    })
  }
  return com(component)
}

export const pinInput = createPinInput()
