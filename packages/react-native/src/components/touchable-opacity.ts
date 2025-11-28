/**
 * TouchableOpacity 组件
 *
 * React Native 可点击透明度反馈组件
 * 直接调用 Fabric UIManager 创建原生 TouchableOpacity
 */

import { getReactiveRuntime } from '@rasenjs/core'
import type { RNSyncComponent, TouchableOpacityProps } from '../types'
import { RNRenderContext } from '../render-context'
import { unref, resolveStyle, watchProp, normalizeChildren } from '../utils'

/**
 * TouchableOpacity 组件 - 可点击透明度反馈
 */
export const touchableOpacity: RNSyncComponent<TouchableOpacityProps> = (props) => {
  return (hostContext) => {
    const context = hostContext as unknown as RNRenderContext
    const stops: Array<() => void> = []
    const childUnmounts: Array<(() => void) | undefined> = []

    // 收集初始属性
    const initialProps: Record<string, unknown> = {
      ...resolveStyle(props.style),
      ...(props.activeOpacity !== undefined && {
        activeOpacity: unref(props.activeOpacity)
      }),
      ...(props.disabled !== undefined && { disabled: unref(props.disabled) }),
      ...(props.delayLongPress !== undefined && {
        delayLongPress: unref(props.delayLongPress)
      }),
      ...(props.delayPressIn !== undefined && {
        delayPressIn: unref(props.delayPressIn)
      }),
      ...(props.delayPressOut !== undefined && {
        delayPressOut: unref(props.delayPressOut)
      }),
      ...(props.testID !== undefined && { testID: unref(props.testID) }),
      ...(props.accessible !== undefined && { accessible: unref(props.accessible) }),
      ...(props.accessibilityLabel !== undefined && {
        accessibilityLabel: unref(props.accessibilityLabel)
      }),
      ...(props.accessibilityHint !== undefined && {
        accessibilityHint: unref(props.accessibilityHint)
      }),
      ...(props.accessibilityRole !== undefined && {
        accessibilityRole: unref(props.accessibilityRole)
      }),
      ...(props.pointerEvents !== undefined && {
        pointerEvents: unref(props.pointerEvents)
      }),
      ...(props.hitSlop !== undefined && { hitSlop: unref(props.hitSlop) })
    }

    // 添加事件处理器
    if (props.onPress) {
      initialProps.onPress = props.onPress
    }
    if (props.onLongPress) {
      initialProps.onLongPress = props.onLongPress
    }
    if (props.onPressIn) {
      initialProps.onPressIn = props.onPressIn
    }
    if (props.onPressOut) {
      initialProps.onPressOut = props.onPressOut
    }
    if (props.onLayout) {
      initialProps.onLayout = props.onLayout
    }

    // 创建原生 TouchableOpacity
    // 在 Fabric 中，TouchableOpacity 是通过 Pressable 实现的
    const handle = context.createView('RCTView', {
      ...initialProps,
      // 添加触摸反馈相关属性
      accessible: true,
      accessibilityRole: 'button'
    })

    // 追加到父节点
    context.appendChild(handle)

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
      'activeOpacity',
      'disabled',
      'delayLongPress',
      'delayPressIn',
      'delayPressOut',
      'testID',
      'accessible',
      'accessibilityLabel',
      'accessibilityHint',
      'accessibilityRole',
      'pointerEvents',
      'hitSlop'
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

    // 挂载子组件
    if (props.children) {
      const childContext = context.createChildContext(handle)
      const childList = normalizeChildren(props.children)
      for (const childMount of childList) {
        if (childMount) {
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

export default touchableOpacity
