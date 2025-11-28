/**
 * Rasen DOM - DOM 渲染适配器
 */

export * from './components'
export { watchProp } from './utils'

import type { MountFunction } from '@rasenjs/core'

/**
 * 挂载组件到 DOM 元素
 */
export function mount(component: MountFunction<HTMLElement>, container: HTMLElement | null) {
  if (!container) {
    throw new Error('Container element is null')
  }
  return component(container)
}
