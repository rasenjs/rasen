/**
 * ScrollView 组件
 *
 * React Native 滚动容器组件
 * 使用 component() 工厂函数创建，支持响应式更新
 *
 * 注意：ScrollView 需要一个内容容器（contentContainer），
 * 但在简化版本中，我们直接使用 ScrollView 作为容器。
 * 完整的 ScrollView 实现需要额外处理 contentContainerStyle。
 */

import { component, type ScrollViewProps, type RNMountFunction } from './component'

/**
 * ScrollView 组件 - 滚动容器
 *
 * @param props - ScrollView 属性
 * @returns RNMountFunction
 *
 * @example
 * ```ts
 * scrollView({
 *   style: { flex: 1 },
 *   showsVerticalScrollIndicator: false,
 *   children: [
 *     view({ style: { height: 500 } }),
 *     view({ style: { height: 500 } }),
 *   ]
 * })
 * ```
 */
export function scrollView(props: ScrollViewProps = {}): RNMountFunction {
  // 提取 contentContainerStyle，其他属性传递给 ScrollView
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { contentContainerStyle, ...restProps } = props

  // TODO: 完整实现需要创建内部 contentContainer View
  // 并将 contentContainerStyle 应用到它上面
  // 当前简化实现直接使用 ScrollView 作为容器

  return component('ScrollView', {
    ...restProps,
    // ScrollView 默认属性
    scrollEventThrottle: 16,
  })
}

export type { ScrollViewProps }
export default scrollView
