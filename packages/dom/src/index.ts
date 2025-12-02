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
  // 事件委托
  delegated,
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

import { mount, type Mountable } from '@rasenjs/core'
import {
  createHydrationContext,
  setHydrationContext,
  getHydrationContext,
  isHydrating
} from './hydration-context'

// 导出 hydration 相关
export { getHydrationContext, isHydrating }

// 直接导出 core 的 mount
export { mount } from '@rasenjs/core'

/**
 * 水合组件到已有 DOM 元素
 *
 * 复用服务端渲染的 HTML，而非重新创建 DOM
 *
 * @example
 * // 服务端已渲染: <div id="app"><button>Count: 0</button></div>
 * hydrate(App(), document.getElementById('app'))
 */
export function hydrate(
  component: Mountable<HTMLElement>,
  container: HTMLElement | null
) {
  if (!container) {
    throw new Error('Container element is null')
  }

  // 创建 hydration 上下文
  const ctx = createHydrationContext(container)
  setHydrationContext(ctx)

  try {
    // 执行组件（会复用已有 DOM）
    const unmount = mount(component, container)

    // 检查是否有未消费的节点
    if (ctx.currentNode) {
      console.warn(
        '[Rasen Hydration] Extra nodes found in container after hydration'
      )
    }

    return unmount
  } finally {
    // 清理上下文
    setHydrationContext(null)
  }
}
