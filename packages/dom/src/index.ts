/**
 * Rasen DOM - DOM 渲染适配器
 */

export * from './components'
export { watchProp } from './utils'

// 事件修饰器
export {
  // 底层函数
  modifier,
  // 链式入口
  mod,
  prevent,
  stop,
  capture,
  once,
  self,
  // 按键修饰器入口
  key,
  enter,
  esc,
  tab,
  space,
  del,
  up,
  down,
  left,
  right,
  // 插件导出（供自定义扩展）
  preventPlugin,
  stopPlugin,
  capturePlugin,
  oncePlugin,
  selfPlugin,
  eventPlugins,
  keyPlugins,
  enterPlugin,
  escPlugin,
  tabPlugin,
  spacePlugin,
  deletePlugin,
  upPlugin,
  downPlugin,
  leftPlugin,
  rightPlugin,
  // 类型
  type ModifierOptions,
  type ModifiedHandler,
  type EventModifierPlugin
} from './utils/index'

import type { MountFunction } from '@rasenjs/core'

/**
 * 挂载组件到 DOM 元素
 */
export function mount(
  component: MountFunction<HTMLElement>,
  container: HTMLElement | null
) {
  if (!container) {
    throw new Error('Container element is null')
  }
  return component(container)
}
