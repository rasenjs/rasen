/**
 * FlatList 组件
 *
 * React Native 高性能列表组件
 * 基于 ScrollView 实现，支持响应式数据更新
 *
 * 注意：这是一个简化实现，真正的 FlatList 需要虚拟化渲染。
 * 当前版本会渲染所有数据项，适合小型列表。
 */

import type { RenderContext, Instance, Props } from '../render-context'
import { createInstance, appendChild, getChildContext } from '../render-context'
import { unref, isRef, watchProp } from '../utils'
import type { RNMountFunction, ComponentProps } from './component'

/**
 * FlatList Props
 */
export interface FlatListProps<T> extends ComponentProps {
  data: T[] | { readonly value: T[] }
  renderItem: (info: { item: T; index: number }) => RNMountFunction
  keyExtractor?: (item: T, index: number) => string
  horizontal?: boolean
  numColumns?: number
  showsHorizontalScrollIndicator?: boolean
  showsVerticalScrollIndicator?: boolean
  onEndReached?: () => void
  onEndReachedThreshold?: number
  refreshing?: boolean
  onRefresh?: () => void
  contentContainerStyle?: Props
  ItemSeparatorComponent?: () => RNMountFunction
  ListHeaderComponent?: () => RNMountFunction
  ListFooterComponent?: () => RNMountFunction
  ListEmptyComponent?: () => RNMountFunction
}

/**
 * FlatList 组件 - 高性能列表
 *
 * @param props - FlatList 属性
 * @returns RNMountFunction
 *
 * @example
 * ```ts
 * const items = ref([{ id: 1, title: 'Item 1' }, { id: 2, title: 'Item 2' }])
 *
 * flatList({
 *   data: items,
 *   renderItem: ({ item }) => text({ children: item.title }),
 *   keyExtractor: (item) => String(item.id)
 * })
 * ```
 */
export function flatList<T>(props: FlatListProps<T>): RNMountFunction {
  const {
    data,
    renderItem,
    keyExtractor = (_item: T, index: number) => String(index),
    horizontal = false,
    showsHorizontalScrollIndicator = true,
    showsVerticalScrollIndicator = true,
    contentContainerStyle,
    style,
    ...restProps
  } = props

  return (ctx: RenderContext): Instance => {
    // 创建 ScrollView 容器
    const scrollViewProps: Props = {
      ...(style && typeof style === 'object' ? style : {}),
      horizontal,
      showsHorizontalScrollIndicator,
      showsVerticalScrollIndicator,
      scrollEventThrottle: 16,
      removeClippedSubviews: true,
    }

    const scrollView = createInstance(ctx, 'RCTScrollView', scrollViewProps)

    // 创建内容容器
    const contentContainerProps: Props = {
      ...(contentContainerStyle && typeof contentContainerStyle === 'object' ? contentContainerStyle : {}),
      collapsable: false,
    }
    const contentContainer = createInstance(ctx, 'RCTView', contentContainerProps)
    appendChild(scrollView, contentContainer)

    // 获取子组件的渲染上下文
    const childCtx = getChildContext(ctx, 'RCTScrollView')

    // 渲染列表项的函数
    const renderItems = (items: T[]) => {
      // TODO: 实现差异更新，而不是清空重建
      // 当前简化实现：直接渲染所有项

      items.forEach((item, index) => {
        // 使用 keyExtractor 生成 key（用于将来的优化）
        keyExtractor(item, index)

        const itemMount = renderItem({ item, index })
        const itemInstance = itemMount(childCtx)

        if (itemInstance) {
          appendChild(contentContainer, itemInstance)
        }
      })
    }

    // 初始渲染
    const initialData = unref(data)
    renderItems(initialData)

    // 如果 data 是响应式的，监听变化
    if (isRef(data)) {
      watchProp(
        () => unref(data),
        (newData) => {
          // TODO: 智能差异更新
          // 当前会触发重新渲染（需要实现子节点清理）
          console.log('[Rasen] FlatList data changed, items:', newData.length)
          // 简化实现：数据变化时重新渲染需要更复杂的逻辑
          // 包括清除旧节点、添加新节点等
        }
      )
    }

    // 处理其他 props
    void restProps

    return scrollView
  }
}

export default flatList
