/**
 * Text 组件
 *
 * React Native 文本显示组件
 * 直接调用 Fabric UIManager 创建原生 Text
 */

import { getReactiveRuntime } from '@rasenjs/core'
import type { RNSyncComponent, TextProps } from '../types'
import { RNRenderContext } from '../render-context'
import { unref, resolveStyle, watchProp } from '../utils'

/**
 * Text 组件 - 文本显示
 */
export const text: RNSyncComponent<TextProps> = (props) => {
  return (hostContext) => {
    const context = hostContext as unknown as RNRenderContext
    const stops: Array<() => void> = []
    const childUnmounts: Array<(() => void) | undefined> = []

    // 处理文本内容
    let textContent = ''
    if (props.children !== undefined) {
      if (typeof props.children === 'string') {
        textContent = props.children
      } else if (
        typeof props.children === 'object' &&
        'value' in (props.children as object)
      ) {
        textContent = unref(props.children as import('@rasenjs/core').PropValue<string>)
      }
    }

    // 收集初始属性
    const initialProps: Record<string, unknown> = {
      ...resolveStyle(props.style),
      ...(textContent && { text: textContent }),
      ...(props.numberOfLines !== undefined && {
        numberOfLines: unref(props.numberOfLines)
      }),
      ...(props.ellipsizeMode !== undefined && {
        ellipsizeMode: unref(props.ellipsizeMode)
      }),
      ...(props.selectable !== undefined && { selectable: unref(props.selectable) }),
      ...(props.testID !== undefined && { testID: unref(props.testID) }),
      ...(props.accessible !== undefined && { accessible: unref(props.accessible) }),
      ...(props.accessibilityLabel !== undefined && {
        accessibilityLabel: unref(props.accessibilityLabel)
      })
    }

    // 添加事件处理器
    if (props.onPress) {
      initialProps.onPress = props.onPress
    }
    if (props.onLongPress) {
      initialProps.onLongPress = props.onLongPress
    }

    // 创建原生 Text
    const handle = context.createView('RCTText', initialProps)

    // 追加到父节点
    context.appendChild(handle)

    // 监听文本内容变化
    if (
      props.children !== undefined &&
      typeof props.children === 'object' &&
      'value' in (props.children as object)
    ) {
      stops.push(
        watchProp(
          () => unref(props.children as import('@rasenjs/core').PropValue<string>),
          (newText) => {
            context.updateProps(handle, { text: newText })
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
      'numberOfLines',
      'ellipsizeMode',
      'selectable',
      'testID',
      'accessible',
      'accessibilityLabel'
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

    // 处理子组件（嵌套 Text）
    if (Array.isArray(props.children)) {
      const childContext = context.createChildContext(handle)
      for (const childMount of props.children) {
        if (typeof childMount === 'function') {
          const unmount = childMount(childContext as unknown as import('../types').RNHostContext)
          childUnmounts.push(unmount)
        }
      }
    }

    // 返回 unmount 函数
    return () => {
      stops.forEach((stop) => stop())
      childUnmounts.forEach((unmount) => unmount?.())
      context.removeChild(handle)
    }
  }
}

export default text
