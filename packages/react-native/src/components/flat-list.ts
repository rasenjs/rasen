/**
 * FlatList 组件
 *
 * React Native 高性能列表组件
 * 基于 ScrollView 实现，支持响应式数据更新
 *
 * 注意：这是一个简化实现，真正的 FlatList 需要虚拟化渲染。
 * 当前版本会渲染所有数据项，适合小型列表。
 */

import type { Mountable } from '@rasenjs/core'
import { com } from '@rasenjs/core'
import type { RenderContext, Props } from '../render-context'
import { createInstance, appendChild, getChildContext } from '../render-context'
import { unref, isRef, watchProp } from '../utils'
import type { RNMountable, ComponentProps } from './component'

/**
 * FlatList Props
 */
export interface FlatListProps<T> extends ComponentProps {
  data: T[] | { readonly value: T[] }
  renderItem: (info: { item: T; index: number }) => RNMountable
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
  ItemSeparatorComponent?: () => RNMountable
  ListHeaderComponent?: () => RNMountable
  ListFooterComponent?: () => RNMountable
  ListEmptyComponent?: () => RNMountable
}

/**
 * FlatList 组件 - 高性能列表
 *
 * @param props - FlatList 属性
 * @returns Mountable<RenderContext>
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
export const flatList = com(
  <T>(props: FlatListProps<T>): Mountable<RenderContext> => {
    // setup 阶段
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

    // mount 阶段
    return (ctx: RenderContext) => {
      // 收集子组件的 unmount
      const childUnmounts: Array<(() => void) | undefined> = []

      // 创建 ScrollView 容器
      const scrollViewProps: Props = {
        ...(style && typeof style === 'object' ? style : {}),
        horizontal,
        showsHorizontalScrollIndicator,
        showsVerticalScrollIndicator,
        scrollEventThrottle: 16,
        removeClippedSubviews: true
      }

      const scrollView = createInstance(ctx, 'RCTScrollView', scrollViewProps)

      // 创建内容容器
      const contentContainerProps: Props = {
        ...(contentContainerStyle && typeof contentContainerStyle === 'object'
          ? contentContainerStyle
          : {}),
        collapsable: false
      }
      const contentContainer = createInstance(
        ctx,
        'RCTView',
        contentContainerProps
      )
      appendChild(scrollView, contentContainer)

      // 获取子组件的渲染上下文
      const childCtx = getChildContext(ctx, 'RCTScrollView')

      // 当前渲染的 item unmounts
      let itemUnmounts: Array<(() => void) | undefined> = []

      // 渲染列表项的函数
      const renderItems = (items: T[]) => {
        // 清理旧的 items
        itemUnmounts.forEach((unmount) => unmount?.())
        itemUnmounts = []

        items.forEach((item, index) => {
          // 使用 keyExtractor 生成 key（用于将来的优化）
          keyExtractor(item, index)

          const itemMount = renderItem({ item, index })
          const unmount = itemMount(childCtx)
          itemUnmounts.push(unmount)
        })
      }

      // 初始渲染
      const initialData = unref(data)
      renderItems(initialData)

      // 如果 data 是响应式的，监听变化（由 com 自动清理）
      if (isRef(data)) {
        watchProp(
          () => unref(data),
          (newData) => {
            renderItems(newData)
          }
        )
      }

      // 处理其他 props
      void restProps

      // unmount 阶段
      return () => {
        itemUnmounts.forEach((unmount) => unmount?.())
        childUnmounts.forEach((unmount) => unmount?.())
        // TODO: remove scrollView from parent
      }
    }
  }
)

export default flatList
