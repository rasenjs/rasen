/**
 * Rasen DOM - DOM 渲染适配器
 */

export * from './components'
export { watchProp } from './utils'
export { hostHooks, type HostHooks } from './host-hooks'

import type { Mountable } from '@rasenjs/core'
import { getReactiveRuntime } from '@rasenjs/core'
import {
  createHydrationContext,
  setHydrationContext,
  getHydrationContext,
  isHydrating
} from './hydration-context'

// 导出 hydration 相关
export { getHydrationContext, isHydrating }

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

/**
 * 挂载组件到 DOM 元素
 *
 * @param mountable - Mountable 函数
 * @param container - 目标容器元素
 * @returns unmount 函数
 */
export function mount<T extends Element>(
  mountable: Mountable<T>,
  container: T
): (() => void) | undefined {
  const runtime = getReactiveRuntime()
  const scope = runtime.effectScope()
  
  const unmount = scope.run(() => mountable(container))
  
  return () => {
    unmount?.()
    scope.stop()
  }
}

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

    // 检查是否有未消费的节点并清理它们
    if (ctx.currentNode) {
      console.warn(
        '[Rasen Hydration] Extra nodes found in container after hydration, removing them'
      )
      // 移除所有剩余未被claim的节点
      let node: Node | null = ctx.currentNode
      while (node) {
        const next: Node | null = node.nextSibling
        node.parentNode?.removeChild(node)
        node = next
      }
      ctx.currentNode = null
    }

    return unmount
  } finally {
    // 清理上下文
    setHydrationContext(null)
  }
}
