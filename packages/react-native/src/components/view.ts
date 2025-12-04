/**
 * View 组件
 */

import { component, type ViewProps, type RNMountable } from './component'

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
 * mount(hostConfig, rootTag, App)
 * ```
 */
export function view(props: ViewProps = {}): RNMountable {
  return component('View', props)
}

export type { ViewProps }
export default view
