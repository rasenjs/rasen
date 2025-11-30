/**
 * element 组件 - 通用 Canvas 2D 元素
 *
 * 这是一个底层组件，处理所有 Canvas 元素的公共逻辑：
 * 1. 注册组件到 RenderContext（或添加到 group）
 * 2. 监听响应式依赖变化
 * 3. 标记脏区域触发重绘
 * 4. 返回 cleanup 函数
 *
 * 其他图形组件（circle, rect 等）可以基于此组件构建
 */

import { getReactiveRuntime } from '@rasenjs/core'
import type { SyncComponent } from '@rasenjs/core'
import {
  RenderContext,
  getRenderContext,
  hasRenderContext,
  getCurrentGroupContext,
  type Bounds
} from '../render-context'

export interface ElementProps {
  /** 计算组件边界（可选接收 ctx 用于 measureText 等操作） */
  getBounds: (ctx: CanvasRenderingContext2D) => Bounds
  /** 绘制函数 */
  draw: (ctx: CanvasRenderingContext2D) => void
  /** 收集响应式依赖 */
  deps: () => unknown[]
}

/**
 * element 组件 - 通用 Canvas 元素
 *
 * @example
 * ```ts
 * // 在 circle 组件中使用
 * export const circle = (props: CircleProps) => {
 *   return element({
 *     getBounds: () => {
 *       const x = unref(props.x)
 *       const radius = unref(props.radius)
 *       return { x: x - radius, y: y - radius, width: radius * 2, height: radius * 2 }
 *     },
 *     draw: (ctx) => {
 *       ctx.beginPath()
 *       ctx.arc(unref(props.x), unref(props.y), unref(props.radius), 0, Math.PI * 2)
 *       ctx.fill()
 *     },
 *     deps: () => [unref(props.x), unref(props.y), unref(props.radius), unref(props.fill)]
 *   })
 * }
 * ```
 */
export const element: SyncComponent<CanvasRenderingContext2D, ElementProps> = (
  props: ElementProps
) => {
  // setup 周期：props 已经确定，可以解构
  const { getBounds, draw, deps } = props

  // mounted 周期
  return (ctx: CanvasRenderingContext2D) => {
    // 自动创建 RenderContext（如果不存在）
    if (!hasRenderContext(ctx)) {
      new RenderContext(ctx)
    }

    let currentBounds: Bounds | null = null
    let componentId: symbol | undefined

    const drawFn = () => draw(ctx)

    const update = () => {
      const newBounds = getBounds(ctx)
      const renderContext = getRenderContext(ctx)

      if (currentBounds) {
        renderContext.markDirty(currentBounds)
      }
      renderContext.markDirty(newBounds)
      currentBounds = newBounds
    }

    // 注册到 RenderContext 或 group
    const groupContext = getCurrentGroupContext(ctx)

    if (groupContext) {
      // 在 group 上下文中，将 draw 函数添加到 group
      groupContext.childDrawFunctions.push(drawFn)
    } else {
      // 不在 group 中，直接注册到 RenderContext
      const renderContext = getRenderContext(ctx)
      componentId = renderContext.register({
        bounds: () => currentBounds,
        draw: drawFn
      })
    }

    // 监听响应式依赖
    const stop = getReactiveRuntime().watch(deps, update, { immediate: true })

    // unmount 周期
    return () => {
      stop()
      if (componentId) {
        const renderContext = getRenderContext(ctx)
        if (currentBounds) {
          renderContext.markDirty(currentBounds)
        }
        renderContext.unregister(componentId)
      }
    }
  }
}
