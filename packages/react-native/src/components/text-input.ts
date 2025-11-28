/**
 * TextInput 组件
 *
 * React Native 文本输入组件
 * 直接调用 Fabric UIManager 创建原生 TextInput
 */

import { getReactiveRuntime } from '@rasenjs/core'
import type { RNSyncComponent, TextInputProps } from '../types'
import { RNRenderContext } from '../render-context'
import { unref, resolveStyle, watchProp } from '../utils'

/**
 * TextInput 组件 - 文本输入
 */
export const textInput: RNSyncComponent<TextInputProps> = (props) => {
  return (hostContext) => {
    const context = hostContext as unknown as RNRenderContext
    const stops: Array<() => void> = []

    // 收集初始属性
    const initialProps: Record<string, unknown> = {
      ...resolveStyle(props.style),
      ...(props.value !== undefined && { text: unref(props.value) }),
      ...(props.defaultValue !== undefined && {
        defaultValue: unref(props.defaultValue)
      }),
      ...(props.placeholder !== undefined && {
        placeholder: unref(props.placeholder)
      }),
      ...(props.placeholderTextColor !== undefined && {
        placeholderTextColor: unref(props.placeholderTextColor)
      }),
      ...(props.multiline !== undefined && { multiline: unref(props.multiline) }),
      ...(props.numberOfLines !== undefined && {
        numberOfLines: unref(props.numberOfLines)
      }),
      ...(props.maxLength !== undefined && { maxLength: unref(props.maxLength) }),
      ...(props.editable !== undefined && { editable: unref(props.editable) }),
      ...(props.autoFocus !== undefined && { autoFocus: unref(props.autoFocus) }),
      ...(props.autoCapitalize !== undefined && {
        autoCapitalize: unref(props.autoCapitalize)
      }),
      ...(props.autoCorrect !== undefined && {
        autoCorrect: unref(props.autoCorrect)
      }),
      ...(props.secureTextEntry !== undefined && {
        secureTextEntry: unref(props.secureTextEntry)
      }),
      ...(props.keyboardType !== undefined && {
        keyboardType: unref(props.keyboardType)
      }),
      ...(props.returnKeyType !== undefined && {
        returnKeyType: unref(props.returnKeyType)
      }),
      ...(props.testID !== undefined && { testID: unref(props.testID) })
    }

    // 添加事件处理器
    if (props.onChangeText) {
      initialProps.onChangeText = (event: { nativeEvent: { text: string } }) => {
        props.onChangeText?.(event.nativeEvent.text)
      }
    }
    if (props.onSubmitEditing) {
      initialProps.onSubmitEditing = props.onSubmitEditing
    }
    if (props.onFocus) {
      initialProps.onFocus = props.onFocus
    }
    if (props.onBlur) {
      initialProps.onBlur = props.onBlur
    }

    // 创建原生 TextInput
    const handle = context.createView('RCTSinglelineTextInputView', initialProps)

    // 追加到父节点
    context.appendChild(handle)

    // 监听 value 变化（受控组件）
    if (props.value !== undefined && getReactiveRuntime().isRef(props.value)) {
      stops.push(
        watchProp(
          () => unref(props.value),
          (newValue) => {
            context.updateProps(handle, { text: newValue })
          }
        )
      )
    }

    // 监听样式变化
    if (props.style) {
      stops.push(
        watchProp(
          () => resolveStyle(props.style),
          (newStyle) => {
            context.updateProps(handle, newStyle)
          }
        )
      )
    }

    // 监听其他属性变化
    const watchableProps = [
      'placeholder',
      'placeholderTextColor',
      'multiline',
      'numberOfLines',
      'maxLength',
      'editable',
      'autoFocus',
      'autoCapitalize',
      'autoCorrect',
      'secureTextEntry',
      'keyboardType',
      'returnKeyType',
      'testID'
    ] as const

    for (const propName of watchableProps) {
      const propValue = props[propName]
      if (propValue !== undefined && getReactiveRuntime().isRef(propValue)) {
        stops.push(
          watchProp(
            () => unref(propValue),
            (value) => {
              context.updateProps(handle, { [propName]: value })
            }
          )
        )
      }
    }

    // 返回 unmount 函数
    return () => {
      stops.forEach((stop) => stop())
      context.removeChild(handle)
    }
  }
}

export default textInput
