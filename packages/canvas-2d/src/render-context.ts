/**
 * 渲染上下文 —— 持有渲染根节点，统一调度重绘
 *
 * v1 简化：任何标脏都触发全画布重绘（清屏 + 前序遍历渲染根的子树）。
 * per-node/区域脏区优化留作后续迭代（节点已携带 bounds 钩子位）。
 */

import type { Context2D } from './node'
import type { CanvasNode } from './node'

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface RenderContextOptions {
  /**
   * 绘制调度注入（domlike 环境适配点）。缺省时使用
   * requestAnimationFrame，环境缺失（测试/SSR）退化为 queueMicrotask。
   */
  schedule?: (cb: () => void) => unknown
  cancel?: (handle: unknown) => void
}

const contextMap = new WeakMap<Context2D, RenderContext>()

export function hasRenderContext(ctx: Context2D): boolean {
  return contextMap.has(ctx)
}

export function getRenderContext(ctx: Context2D): RenderContext {
  const rc = contextMap.get(ctx)
  if (!rc) throw new Error('[Rasen Canvas] RenderContext not initialized')
  return rc
}

/**
 * Canvas 2D Render Context
 */
export class RenderContext {
  private roots: CanvasNode[] = []
  private rafId: number | null = null
  private options: RenderContextOptions

  constructor(
    private ctx: Context2D,
    options: RenderContextOptions = {}
  ) {
    this.options = options
    contextMap.set(ctx, this)
  }

  /** 已初始化时取实例（node.ts 工厂使用） */
  static for(ctx: Context2D): RenderContext {
    const rc = contextMap.get(ctx)
    if (!rc) throw new Error('[Rasen Canvas] RenderContext not initialized')
    return rc
  }

  /** 顶层组件挂载时注册为渲染根 */
  addRoot(node: CanvasNode): void {
    this.roots.push(node)
    this.markDirty()
  }

  removeRoot(node: CanvasNode): void {
    const i = this.roots.indexOf(node)
    if (i >= 0) this.roots.splice(i, 1)
    this.markDirty()
  }

  /** 标脏：v1 一律全画布重绘 */
  markDirty(): void {
    this.scheduleDraw()
  }

  private scheduleDraw() {
    if (this.rafId !== null) return

    // 注入的调度器优先；缺省 rAF，环境缺失（测试/SSR）退化 queueMicrotask
    if (this.options.schedule) {
      this.rafId = this.options.schedule(() => {
        this.rafId = null
        this.draw()
      }) as unknown as number
    } else if (typeof requestAnimationFrame !== 'undefined') {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null
        this.draw()
      })
    } else {
      // Test environment
      this.rafId = 1 as unknown as number
      queueMicrotask(() => {
        this.rafId = null
        this.draw()
      })
    }
  }

  /** 清屏 + 前序遍历渲染根 */
  draw() {
    const canvas = this.ctx.canvas
    this.ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (const root of this.roots) {
      root.draw(this.ctx)
    }

  }

  /**
   * Manually trigger full redraw (bypasses watch system)
   */
  flushSync() {
    if (this.rafId !== null) {
      this.rafId = null
    }
    this.draw()
  }

  /**
   * Cleanup
   */
  destroy() {
    this.rafId = null
    this.roots = []
    contextMap.delete(this.ctx)
  }
}
