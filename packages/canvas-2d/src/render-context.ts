/**
 * 渲染上下文 - 管理组件注册和统一重绘
 */

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface ComponentInstance {
  bounds: () => Bounds | null
  draw: () => void
}

/**
 * 渲染上下文
 */
export class RenderContext {
  private components = new Map<symbol, ComponentInstance>()
  private dirtyRegions: Bounds[] = []
  private rafId: number | null = null

  constructor(private ctx: CanvasRenderingContext2D) {}

  /**
   * 注册组件
   */
  register(instance: ComponentInstance): symbol {
    const id = Symbol()
    this.components.set(id, instance)
    return id
  }

  /**
   * 注销组件
   */
  unregister(id: symbol) {
    this.components.delete(id)
  }

  /**
   * 标记脏区域
   */
  markDirty(bounds: Bounds) {
    this.dirtyRegions.push(bounds)
    this.scheduleDraw()
  }

  /**
   * 调度绘制（使用 requestAnimationFrame 批量处理）
   */
  private scheduleDraw() {
    if (this.rafId !== null) return

    this.rafId = requestAnimationFrame(() => {
      this.rafId = null
      this.flush()
    })
  }

  /**
   * 执行绘制
   */
  private flush() {
    if (this.dirtyRegions.length === 0) return

    // 清空脏区域
    this.dirtyRegions = []

    // 清空整个 canvas 并重绘所有组件
    const canvas = this.ctx.canvas
    const width = canvas.width / (window.devicePixelRatio || 1)
    const height = canvas.height / (window.devicePixelRatio || 1)
    this.ctx.clearRect(0, 0, width, height)

    // 重绘所有组件
    this.components.forEach((comp) => {
      comp.draw()
    })
  }

  /**
   * 销毁上下文
   */
  destroy() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.components.clear()
    this.dirtyRegions = []
  }
}

// 用于存储上下文的 WeakMap
const contextMap = new WeakMap<CanvasRenderingContext2D, RenderContext>()

/**
 * 设置渲染上下文
 */
export function setRenderContext(
  ctx: CanvasRenderingContext2D,
  renderContext: RenderContext
) {
  contextMap.set(ctx, renderContext)
}

/**
 * 获取渲染上下文
 */
export function getRenderContext(ctx: CanvasRenderingContext2D): RenderContext {
  const context = contextMap.get(ctx)
  if (!context) {
    throw new Error(
      'RenderContext not found. Did you forget to use canvas2DContext?'
    )
  }
  return context
}

/**
 * 检查是否有渲染上下文
 */
export function hasRenderContext(ctx: CanvasRenderingContext2D): boolean {
  return contextMap.has(ctx)
}
