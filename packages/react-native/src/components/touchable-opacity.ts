/**
 * TouchableOpacity 组件
 *
 * React Native 可点击透明度反馈组件
 * 使用 component() 工厂函数创建，支持响应式更新
 */

import { component, type TouchableOpacityProps, type RNMountable } from './component'

/**
 * TouchableOpacity 组件 - 可点击透明度反馈
 *
 * @param props - TouchableOpacity 属性
 * @returns RNMountable
 *
 * @example
 * ```ts
 * touchableOpacity({
 *   style: { padding: 10, backgroundColor: '#007AFF' },
 *   activeOpacity: 0.7,
 *   onPress: () => {},
 *   children: text({ children: 'Click me' })
 * })
 * ```
 */
export function touchableOpacity(props: TouchableOpacityProps = {}): RNMountable {
  return component('View', {
    ...props,
    accessible: true,
    accessibilityRole: 'button',
  })
}

export type { TouchableOpacityProps }
export default touchableOpacity
