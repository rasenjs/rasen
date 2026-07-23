/**
 * ScrollView 组件
 *
 * React Native 滚动容器组件
 * 使用 component() 工厂函数创建，支持响应式更新
 */

import 'react-native/Libraries/Components/ScrollView/ScrollViewNativeComponent'

import { component, type ScrollViewProps, type RNMountable } from './component'

/**
 * ScrollView 组件 - 滚动容器
 *
 * @param props - ScrollView 属性
 * @returns RNMountable
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
export function scrollView(props: ScrollViewProps = {}): RNMountable {
  return component('ScrollView', {
    ...props,
    scrollEventThrottle: 16,
  })
}

export type { ScrollViewProps }
export default scrollView
