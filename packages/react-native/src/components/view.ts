/**
 * View 组件
 */

import 'react-native/Libraries/Components/View/ViewNativeComponent'

import type { Mountable } from '@rasenjs/core'
import { component, type ViewProps, type Host } from './component'

/**
 * View 组件 - 基础容器
 * 
 * @example
 * ```ts
 * // 定义组件
 * const App = view({
 *   style: { flex: 1, padding: 16 },
 *   children: [
 *     text({ children: 'Hello' })
 *   ]
 * })
 * 
 * // 挂载
 * mount(reactNativePrivateInterface, rootTag, App)
 * ```
 */
export function view(props: ViewProps = {}): Mountable<Host> {
  return component('View', props)
}

export type { ViewProps }
export default view
