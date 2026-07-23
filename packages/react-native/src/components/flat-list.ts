/**
 * FlatList 组件
 *
 * React Native 高性能列表组件
 * 基于 ScrollView 实现，支持响应式数据更新
 */

import 'react-native/Libraries/Components/ScrollView/ScrollViewNativeComponent'

import { component, type RNMountable, type ComponentProps } from './component'

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
  contentContainerStyle?: ComponentProps
  ItemSeparatorComponent?: () => RNMountable
  ListHeaderComponent?: () => RNMountable
  ListFooterComponent?: () => RNMountable
  ListEmptyComponent?: () => RNMountable
}

export function flatList<T>(props: FlatListProps<T>): RNMountable {
  const {
    data: _data,
    renderItem: _renderItem,
    keyExtractor: _keyExtractor = (_item: T, index: number) => String(index),
    horizontal = false,
    showsHorizontalScrollIndicator = true,
    showsVerticalScrollIndicator = true,
    style,
    ...restProps
  } = props

  return component('RCTScrollView', {
    ...restProps,
    ...(style && typeof style === 'object' ? style : {}),
    horizontal,
    showsHorizontalScrollIndicator,
    showsVerticalScrollIndicator,
    scrollEventThrottle: 16,
  }) as RNMountable
}

export default flatList
