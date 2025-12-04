/**
 * Text 组件
 */

import { component, type TextProps, type RNMountable } from './component'

/**
 * Text 组件 - 文本显示
 *
 * @example
 * ```ts
 * text({
 *   style: { fontSize: 16, color: '#333' },
 *   children: 'Hello World'
 * })
 * ```
 */
export function text(props: TextProps = {}): RNMountable {
  return component('Text', props)
}

export type { TextProps }
export default text
