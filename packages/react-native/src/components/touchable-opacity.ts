/**
 * TouchableOpacity 组件
 *
 * React Native 可点击透明度反馈组件
 * 使用 component() 工厂函数创建，支持响应式更新
 */

import {
  component,
  type TouchableOpacityProps,
  type RNMountable
} from './component'

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
 *   onPress: () => console.log('Pressed!'),
 *   children: text({ children: 'Click me' })
 * })
 * ```
 */
export function touchableOpacity(
  props: TouchableOpacityProps = {}
): RNMountable {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { activeOpacity = 0.8, ...restProps } = props

  return component('TouchableOpacity', {
    ...restProps,
    // TouchableOpacity 特有属性
    accessible: true,
    accessibilityRole: 'button'
    // activeOpacity 通过触摸事件处理实现
    // 这里暂时只设置基础属性，完整的触摸反馈需要事件系统支持
  })
}

export type { TouchableOpacityProps }
export default touchableOpacity
