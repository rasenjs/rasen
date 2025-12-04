/**
 * Touchable 组件
 */

import { component, type TouchableProps, type RNMountable } from './component'

/**
 * Touchable 组件 - 可点击的容器
 *
 * @example
 * ```ts
 * touchable({
 *   onPress: () => console.log('Pressed!'),
 *   style: { padding: 12 },
 *   children: [
 *     text({ children: 'Click me' })
 *   ]
 * })
 * ```
 */
export function touchable(props: TouchableProps = {}): RNMountable {
  const { onPress, disabled, ...restProps } = props

  return component('View', {
    ...restProps,
    accessible: true,
    accessibilityRole: 'button',
    // 将 onPress 转换为 onTouchEnd
    onTouchEnd: onPress && !disabled ? () => onPress() : undefined
  })
}

export type { TouchableProps }
export default touchable
