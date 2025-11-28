/**
 * ScrollView 组件
 *
 * React Native 滚动容器组件
 * 直接调用 Fabric UIManager 创建原生 ScrollView
 */

import { getReactiveRuntime } from '@rasenjs/core'
import type { RNSyncComponent, ScrollViewProps } from '../types'
import { RNRenderContext } from '../render-context'
import { unref, resolveStyle, watchProp, normalizeChildren } from '../utils'

/**
 * ScrollView 组件 - 滚动容器
 */
export const scrollView: RNSyncComponent<ScrollViewProps> = (props) => {
  return (hostContext) => {
    const context = hostContext as unknown as RNRenderContext
    const stops: Array<() => void> = []
    const childUnmounts: Array<(() => void) | undefined> = []

    // 收集初始属性
    const initialProps: Record<string, unknown> = {
      ...resolveStyle(props.style),
      ...(props.horizontal !== undefined && { horizontal: unref(props.horizontal) }),
      ...(props.showsHorizontalScrollIndicator !== undefined && {
        showsHorizontalScrollIndicator: unref(props.showsHorizontalScrollIndicator)
      }),
      ...(props.showsVerticalScrollIndicator !== undefined && {
        showsVerticalScrollIndicator: unref(props.showsVerticalScrollIndicator)
      }),
      ...(props.pagingEnabled !== undefined && {
        pagingEnabled: unref(props.pagingEnabled)
      }),
      ...(props.scrollEnabled !== undefined && {
        scrollEnabled: unref(props.scrollEnabled)
      }),
      ...(props.bounces !== undefined && { bounces: unref(props.bounces) }),
      ...(props.contentContainerStyle !== undefined && {
        contentContainerStyle: resolveStyle(props.contentContainerStyle)
      }),
      ...(props.testID !== undefined && { testID: unref(props.testID) }),
      ...(props.accessible !== undefined && { accessible: unref(props.accessible) }),
      ...(props.accessibilityLabel !== undefined && {
        accessibilityLabel: unref(props.accessibilityLabel)
      })
    }

    // 添加事件处理器
    if (props.onScroll) {
      initialProps.onScroll = props.onScroll
    }
    if (props.onScrollBeginDrag) {
      initialProps.onScrollBeginDrag = props.onScrollBeginDrag
    }
    if (props.onScrollEndDrag) {
      initialProps.onScrollEndDrag = props.onScrollEndDrag
    }
    if (props.onMomentumScrollBegin) {
      initialProps.onMomentumScrollBegin = props.onMomentumScrollBegin
    }
    if (props.onMomentumScrollEnd) {
      initialProps.onMomentumScrollEnd = props.onMomentumScrollEnd
    }
    if (props.onLayout) {
      initialProps.onLayout = props.onLayout
    }

    // 创建原生 ScrollView
    const handle = context.createView('RCTScrollView', initialProps)

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

    // 监听 contentContainerStyle 变化
    if (props.contentContainerStyle) {
      stops.push(
        watchProp(
          () => resolveStyle(props.contentContainerStyle),
          (newStyle) => {
            context.updateProps(handle, { contentContainerStyle: newStyle })
          }
        )
      )
    }

    // 监听其他属性变化
    const watchableProps = [
      'horizontal',
      'showsHorizontalScrollIndicator',
      'showsVerticalScrollIndicator',
      'pagingEnabled',
      'scrollEnabled',
      'bounces',
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

export default scrollView
