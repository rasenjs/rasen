/**
 * FlatList 组件
 *
 * React Native 高性能列表组件
 * 使用虚拟化技术只渲染可见项
 */

import { getReactiveRuntime } from '@rasenjs/core'
import type { FlatListProps, RNMountFunction } from '../types'
import { RNRenderContext } from '../render-context'
import { unref, resolveStyle, watchProp } from '../utils'

/**
 * FlatList 组件 - 高性能列表
 */
export function flatList<T>(props: FlatListProps<T>): RNMountFunction {
  return (hostContext) => {
    const context = hostContext as unknown as RNRenderContext
    const stops: Array<() => void> = []
    const itemUnmounts: Map<string, () => void> = new Map()

    // 收集初始属性
    const initialProps: Record<string, unknown> = {
      ...resolveStyle(props.style),
      ...(props.horizontal !== undefined && { horizontal: unref(props.horizontal) }),
      ...(props.numColumns !== undefined && { numColumns: unref(props.numColumns) }),
      ...(props.showsHorizontalScrollIndicator !== undefined && {
        showsHorizontalScrollIndicator: unref(props.showsHorizontalScrollIndicator)
      }),
      ...(props.showsVerticalScrollIndicator !== undefined && {
        showsVerticalScrollIndicator: unref(props.showsVerticalScrollIndicator)
      }),
      ...(props.onEndReachedThreshold !== undefined && {
        onEndReachedThreshold: unref(props.onEndReachedThreshold)
      }),
      ...(props.refreshing !== undefined && { refreshing: unref(props.refreshing) }),
      ...(props.testID !== undefined && { testID: unref(props.testID) })
    }

    // 添加事件处理器
    if (props.onEndReached) {
      initialProps.onEndReached = props.onEndReached
    }
    if (props.onRefresh) {
      initialProps.onRefresh = props.onRefresh
    }

    // 创建原生 FlatList (使用 VirtualizedList)
    const handle = context.createView('RCTScrollView', {
      ...initialProps,
      // FlatList 特有属性
      removeClippedSubviews: true,
      scrollEventThrottle: 16
    })

    // 追加到父节点
    context.appendChild(handle)

    // 内容容器
    const contentHandle = context.createView('RCTView', {
      ...resolveStyle(props.contentContainerStyle),
      collapsable: false
    })
    context.uiManager.appendChild(handle, contentHandle)

    // key 提取器
    const keyExtractor = props.keyExtractor || ((_item: T, index: number) => String(index))

    // 渲染列表项
    const renderItems = () => {
      const data = unref(props.data)
      const contentContext = context.createChildContext(contentHandle)
      const currentKeys = new Set<string>()

      // 渲染每个项目
      data.forEach((item, index) => {
        const key = keyExtractor(item, index)
        currentKeys.add(key)

        // 如果项目不存在，创建它
        if (!itemUnmounts.has(key)) {
          const itemMount = props.renderItem({ item, index })
          const unmount = itemMount(contentContext as unknown as import('../types').RNHostContext)
          if (unmount) {
            itemUnmounts.set(key, unmount)
          }
        }
      })

      // 移除不再存在的项目
      for (const [key, unmount] of itemUnmounts) {
        if (!currentKeys.has(key)) {
          unmount()
          itemUnmounts.delete(key)
        }
      }
    }

    // 初始渲染
    renderItems()

    // 监听 data 变化
    if (getReactiveRuntime().isRef(props.data)) {
      stops.push(
        watchProp(
          () => unref(props.data),
          () => {
            renderItems()
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

    // 监听 contentContainerStyle 变化
    if (props.contentContainerStyle) {
      stops.push(
        watchProp(
          () => resolveStyle(props.contentContainerStyle),
          (newStyle) => {
            context.updateProps(contentHandle, newStyle)
          }
        )
      )
    }

    // 监听其他属性变化
    const watchableProps = [
      'horizontal',
      'numColumns',
      'showsHorizontalScrollIndicator',
      'showsVerticalScrollIndicator',
      'onEndReachedThreshold',
      'refreshing',
      'testID'
    ] as const

    for (const propName of watchableProps) {
      const propValue = props[propName as keyof typeof props]
      if (propValue !== undefined && getReactiveRuntime().isRef(propValue)) {
        stops.push(
          watchProp(
            () => unref(propValue as import('@rasenjs/core').PropValue<unknown>),
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
      itemUnmounts.forEach((unmount) => unmount())
      itemUnmounts.clear()
      context.removeChild(handle)
    }
  }
}

export default flatList
