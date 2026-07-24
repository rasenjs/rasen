/**
 * PinInput - PIN/验证码输入组件
 *
 * 一次性密码输入组件，常用于验证码输入。
 * 支持键盘导航、粘贴、OTP 自动填充。
 */
import type { Mountable } from '@rasenjs/core'

export type PinInputType = 'numeric' | 'alphanumeric' | 'text'

export interface PinInputContext {
  value: string
  length: number
  type: PinInputType
  disabled: boolean
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
 * 验证字符是否符合类型要求
 */
function isValidChar(char: string, type: PinInputType): boolean {
  if (type === 'numeric') return /^\d$/.test(char)
  if (type === 'alphanumeric') return /^[a-zA-Z0-9]$/.test(char)
  return true // text 允许任何单字符
}

/**
 * 创建 PinInput Root 组件
 */
export function createPinInputRoot(): (
  props?: PinInputRootProps
) => Mountable<HTMLElement> {
  return (props?: PinInputRootProps) => {
    return (host: HTMLElement) => {
      const root = document.createElement('div')
      root.role = 'group'

      const length = props?.length ?? 4
      const type = props?.type ?? 'numeric'
      const disabled = props?.disabled ?? false
      const placeholder = props?.placeholder ?? ''

      // 状态管理
      const isControlled = props?.value !== undefined
      let internalValue = props?.value ?? props?.defaultValue ?? ''
      let internalFocusedIndex = 0

      // 确保 value 长度正确
      const normalizeValue = (val: string): string => {
        return val.slice(0, length).padEnd(length, '')
      }

      // 更新值
      const setValue = (newValue: string) => {
        const normalized = normalizeValue(newValue)

        if (!isControlled) {
          internalValue = normalized
        }

        props?.onValueChange?.(normalized)

        // 检查是否完成
        if (normalized.length === length && !normalized.includes('')) {
          props?.onComplete?.(normalized)
        }
      }

      // 设置焦点索引
      const setFocusedIndex = (index: number) => {
        internalFocusedIndex = Math.max(0, Math.min(length - 1, index))
      }

      // Context
      const context: PinInputContext = {
        get value() {
          return isControlled ? (props?.value ?? '') : internalValue
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
        get focusedIndex() {
          return internalFocusedIndex
        },
        setValue,
        setFocusedIndex
      }

      const getContext = (): PinInputContext | undefined => context

      // 应用样式
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
 * 创建 PinInput Input 组件
 */
export function createPinInputInput(): (
  props?: PinInputInputProps,
  getContext?: () => PinInputContext | undefined
) => Mountable<HTMLInputElement> {
  return (
    props?: PinInputInputProps,
    getContext?: () => PinInputContext | undefined
  ) => {
    return (host: HTMLInputElement) => {
      const input = document.createElement('input')
      input.type = 'text'
      input.maxLength = 1
      input.inputMode = getContext?.()?.type === 'numeric' ? 'numeric' : 'text'

      const index = props?.index ?? 0
      const ctx = getContext?.()

      // 设置初始值
      if (ctx) {
        const value = ctx.value
        if (value[index]) {
          input.value = value[index]
        }
      }

      // 设置占位符
      if (ctx?.type === 'numeric') {
        input.placeholder = '•'
      } else {
        input.placeholder = '_'
      }

      // 设置 aria-label
      input.setAttribute('aria-label', `Digit ${index + 1}`)

      // OTP 支持
      if (ctx?.otp && index === 0) {
        input.setAttribute('autocomplete', 'one-time-code')
      }

      // 应用样式
      if (props?.class) input.className = props.class
      if (props?.style) {
        if (typeof props.style === 'object') {
          Object.assign(input.style, props.style)
        }
      }

      // 禁用状态
      if (ctx?.disabled) {
        input.disabled = true
        input.setAttribute('data-disabled', '')
      }

      // 输入处理
      const handleInput = (e: Event) => {
        const target = e.target as HTMLInputElement
        const ctx = getContext?.()
        if (!ctx) return

        const char = target.value
        if (!char) return

        // 验证字符
        if (!isValidChar(char, ctx.type)) {
          target.value = ''
          return
        }

        // 更新值
        const currentValue = ctx.value
        const newValue =
          currentValue.slice(0, index) + char + currentValue.slice(index + 1)
        ctx.setValue(newValue)

        // 移到下一个输入框
        if (index < ctx.length - 1) {
          ctx.setFocusedIndex(index + 1)
          const nextInput = host.parentElement?.querySelectorAll('input')[
            index + 1
          ] as HTMLInputElement
          nextInput?.focus()
        }
      }

      // 键盘处理
      const handleKeyDown = (e: KeyboardEvent) => {
        const ctx = getContext?.()
        if (!ctx) return

        switch (e.key) {
          case 'Backspace':
            e.preventDefault()
            const currentValue = ctx.value
            if (currentValue[index]) {
              // 删除当前字符
              const newValue =
                currentValue.slice(0, index) + currentValue.slice(index + 1)
              ctx.setValue(newValue)
            } else if (index > 0) {
              // 移到上一个并删除
              ctx.setFocusedIndex(index - 1)
              const prevInput = host.parentElement?.querySelectorAll('input')[
                index - 1
              ] as HTMLInputElement
              prevInput?.focus()

              const newValue =
                currentValue.slice(0, index - 1) + currentValue.slice(index)
              ctx.setValue(newValue)
            }
            break

          case 'Delete':
            e.preventDefault()
            if (ctx.value[index]) {
              const newValue =
                ctx.value.slice(0, index) + ctx.value.slice(index + 1)
              ctx.setValue(newValue)
            }
            break

          case 'ArrowLeft':
            e.preventDefault()
            if (index > 0) {
              ctx.setFocusedIndex(index - 1)
              const prevInput = host.parentElement?.querySelectorAll('input')[
                index - 1
              ] as HTMLInputElement
              prevInput?.focus()
            }
            break

          case 'ArrowRight':
            e.preventDefault()
            if (index < ctx.length - 1) {
              ctx.setFocusedIndex(index + 1)
              const nextInput = host.parentElement?.querySelectorAll('input')[
                index + 1
              ] as HTMLInputElement
              nextInput?.focus()
            }
            break

          case 'Tab':
            // 允许默认 Tab 行为
            break

          default:
            // 其他字符由 input 事件处理
            break
        }
      }

      // 粘贴处理
      const handlePaste = (e: ClipboardEvent) => {
        e.preventDefault()
        const ctx = getContext?.()
        if (!ctx) return

        const pastedData = e.clipboardData?.getData('text') ?? ''
        const chars = pastedData
          .split('')
          .filter((c) => isValidChar(c, ctx.type))

        if (chars.length === 0) return

        // 从当前索引开始填充
        const currentValue = ctx.value
        let newValue = currentValue.slice(0, index)

        for (let i = 0; i < chars.length && index + i < ctx.length; i++) {
          newValue += chars[i]
        }

        // 填充剩余部分
        newValue = newValue.padEnd(ctx.length, '')
        ctx.setValue(newValue)

        // 焦点移到最后一个填充的位置
        const lastIndex = Math.min(index + chars.length - 1, ctx.length - 1)
        ctx.setFocusedIndex(lastIndex)
        const lastInput = host.parentElement?.querySelectorAll('input')[
          lastIndex
        ] as HTMLInputElement
        lastInput?.focus()
      }

      // 焦点处理
      const handleFocus = () => {
        const ctx = getContext?.()
        if (ctx) {
          ctx.setFocusedIndex(index)
        }
      }

      // 选择文本
      const handleSelect = () => {
        input.select()
      }

      input.addEventListener('input', handleInput)
      input.addEventListener('keydown', handleKeyDown)
      input.addEventListener('paste', handlePaste)
      input.addEventListener('focus', handleFocus)
      input.addEventListener('click', handleSelect)

      host.appendChild(input)

      return () => {
        input.removeEventListener('input', handleInput)
        input.removeEventListener('keydown', handleKeyDown)
        input.removeEventListener('paste', handlePaste)
        input.removeEventListener('focus', handleFocus)
        input.removeEventListener('click', handleSelect)
        input.remove()
      }
    }
  }
}

/**
 * PinInput 组合组件
 */
export function createPinInput(): (
  props?: PinInputRootProps & {
    inputClass?: string
    inputStyle?: Record<string, string | number> | string
  }
) => Mountable<HTMLElement> {
  const Root = createPinInputRoot()
  const Input = createPinInputInput()

  return (
    props?: PinInputRootProps & {
      inputClass?: string
      inputStyle?: Record<string, string | number> | string
    }
  ) => {
    return (host: HTMLElement) => {
      const length = props?.length ?? 4

      return Root({
        value: props?.value,
        defaultValue: props?.defaultValue,
        length: length,
        type: props?.type,
        otp: props?.otp,
        disabled: props?.disabled,
        placeholder: props?.placeholder,
        onValueChange: props?.onValueChange,
        onComplete: props?.onComplete,
        class: props?.class,
        style: props?.style,
        children: (getContext) => (host: HTMLElement) => {
          const inputs: (() => void)[] = []

          for (let i = 0; i < length; i++) {
            const inputHost = document.createElement('div')
            const unmount = Input(
              {
                index: i,
                class: props?.inputClass,
                style: props?.inputStyle
              },
              getContext
            )(inputHost)
            inputs.push(unmount)
            host.appendChild(inputHost)
          }

          return () => {
            inputs.forEach((unmount) => unmount())
          }
        }
      })(host)
    }
  }
}

export const pinInput = createPinInput()
