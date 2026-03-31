/**
 * Text 组件
 */

import 'react-native/Libraries/Text/TextNativeComponent'

import type { Mountable } from '@rasenjs/core'
import { component, type TextProps, type Host } from './component'

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
export function text(props: TextProps = {}): Mountable<Host> {
  return component('Text', props)
}

export type { TextProps }
export default text
