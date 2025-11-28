/**
 * View 组件
 *
 * React Native 中最基础的容器组件
 * 直接调用 Fabric UIManager 创建原生 View
 */

import { getReactiveRuntime } from '@rasenjs/core'
import type { RNSyncComponent, ViewProps } from '../types'
import { RNRenderContext } from '../render-context'
import { unref, resolveStyle, watchProp, normalizeChildren } from '../utils'

/**
 * View 组件 - 基础容器
 */
export const view: RNSyncComponent<ViewProps> = (props) => {
  return (hostContext) => {
    const context = hostContext as unknown as RNRenderContext
    const stops: Array<() => void> = []
    const childUnmounts: Array<(() => void) | undefined> = []

    // 收集初始属性
    const initialProps: Record<string, unknown> = {
      ...resolveStyle(props.style),
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
    if (props.onLayout) {
      initialProps.onLayout = props.onLayout
    }

    // 创建原生 View
    const handle = context.createView('RCTView', initialProps)

    // 追加到父节点
    context.appendChild(handle)

    // 监听样式变化
    if (props.style) {
      const styleKeys = Object.keys(props.style)
      if (styleKeys.length > 0) {
        stops.push(
          watchProp(
            () => resolveStyle(props.style),
            (newStyle) => {
              context.updateProps(handle, newStyle)
            }
          )
        )
      }
    }

    // 监听其他属性变化
    const watchableProps = [
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
      const mountChildren = (children: NonNullable<typeof props.children>) => {
        // 清理旧的子组件
        childUnmounts.forEach((unmount) => unmount?.())
        childUnmounts.length = 0

        // 规范化 children
        const childList = normalizeChildren(children)

        // 挂载新的子组件
        for (const childMount of childList) {
          if (childMount) {
            const unmount = childMount(childContext as unknown as import('../types').RNHostContext)
            childUnmounts.push(unmount)
          }
        }
      }

      // 如果 children 是函数，需要响应式追踪
      if (typeof props.children === 'function') {
        stops.push(
          watchProp(
            () => (props.children as () => unknown)(),
            () => mountChildren(props.children!)
          )
        )
      }

      mountChildren(props.children)
    }

    // 返回 unmount 函数
    return () => {
      // 停止所有 watch
      stops.forEach((stop) => stop())

      // 卸载所有子组件
      childUnmounts.forEach((unmount) => unmount?.())

      // 从父节点移除
      context.removeChild(handle)
    }
  }
}

export default view
