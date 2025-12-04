/**
 * TextInput 组件
 *
 * React Native 文本输入组件
 * 使用 component() 工厂函数创建，支持响应式更新
 */

import { component, type TextInputProps, type RNMountable } from './component'

/**
 * TextInput 组件 - 文本输入
 *
 * @param props - TextInput 属性
 * @returns RNMountable
 *
 * @example
 * ```ts
 * const inputValue = ref('')
 *
 * textInput({
 *   style: { borderWidth: 1, padding: 10 },
 *   placeholder: 'Enter text...',
 *   value: inputValue,
 *   onChangeText: (text) => { inputValue.value = text }
 * })
 * ```
 */
export function textInput(props: TextInputProps = {}): RNMountable {
  const { value, ...restProps } = props

  // TextInput 使用 'text' 属性而不是 'value'
  const textInputProps: Record<string, unknown> = {
    ...restProps,
    ...(value !== undefined && { text: value })
  }

  return component('TextInput', textInputProps)
}

export type { TextInputProps }
export default textInput
