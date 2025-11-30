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
 * 渲染上下文配置选项
 */
export interface RenderContextOptions {
  /**
   * 是否启用脏区域检测
   * 默认为 true（开启，只重绘脏区域）
   *
   * 开启时：只清除并重绘脏区域内的组件
   * 关闭时：每次变化都清空整个画布并重绘所有组件
   */
  dirtyTracking?: boolean
}

/**
 * 渲染上下文
 */
export class RenderContext {
  private components = new Map<symbol, ComponentInstance>()
  private dirtyRegions: Bounds[] = []
  private rafId: number | null = null
  private needsFullRedraw: boolean = false
  private options: Required<RenderContextOptions>

  constructor(
    private ctx: CanvasRenderingContext2D,
    options: RenderContextOptions = {}
  ) {
    this.options = {
      dirtyTracking: options.dirtyTracking ?? true
    }
    // 将此 RenderContext 关联到 canvas context
    setRenderContext(ctx, this)
  }

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
  markDirty(bounds?: Bounds) {
    if (this.options.dirtyTracking && bounds) {
      this.dirtyRegions.push(bounds)
    } else {
      // 不启用脏区域检测时，标记需要全量重绘
      this.needsFullRedraw = true
    }
    this.scheduleDraw()
  }

  /**
   * 调度绘制（使用 requestAnimationFrame 批量处理）
   */
  private scheduleDraw() {
    if (this.rafId !== null) return

    // 在浏览器环境使用 requestAnimationFrame，在测试环境使用 queueMicrotask
    if (typeof requestAnimationFrame !== 'undefined') {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null
        this.flush()
      })
    } else {
      // 测试环境：使用 queueMicrotask 立即执行
      this.rafId = 1 as unknown as number
      queueMicrotask(() => {
        this.rafId = null
        this.flush()
      })
    }
  }

  /**
   * 合并重叠的脏区域
   */
  private mergeDirtyRegions(): Bounds | null {
    if (this.dirtyRegions.length === 0) return null

    // 计算所有脏区域的包围盒
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const region of this.dirtyRegions) {
      minX = Math.min(minX, region.x)
      minY = Math.min(minY, region.y)
      maxX = Math.max(maxX, region.x + region.width)
      maxY = Math.max(maxY, region.y + region.height)
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    }
  }

  /**
   * 检查两个边界是否相交
   */
  private boundsIntersect(a: Bounds, b: Bounds): boolean {
    return !(
      a.x + a.width < b.x ||
      b.x + b.width < a.x ||
      a.y + a.height < b.y ||
      b.y + b.height < a.y
    )
  }

  /**
   * 执行绘制
   */
  private flush() {
    const canvas = this.ctx.canvas

    if (this.options.dirtyTracking) {
      // 脏区域检测模式
      if (this.dirtyRegions.length === 0) return

      const dirtyBounds = this.mergeDirtyRegions()
      this.dirtyRegions = []

      if (!dirtyBounds) return

      // 只清除脏区域
      this.ctx.save()
      this.ctx.beginPath()
      this.ctx.rect(
        dirtyBounds.x,
        dirtyBounds.y,
        dirtyBounds.width,
        dirtyBounds.height
      )
      this.ctx.clip()
      this.ctx.clearRect(
        dirtyBounds.x,
        dirtyBounds.y,
        dirtyBounds.width,
        dirtyBounds.height
      )

      // 只重绘与脏区域相交的组件
      this.components.forEach((comp) => {
        const compBounds = comp.bounds()
        if (compBounds && this.boundsIntersect(compBounds, dirtyBounds)) {
          comp.draw()
        }
      })

      this.ctx.restore()
    } else {
      // 全量重绘模式（默认）
      if (!this.needsFullRedraw) return
      this.needsFullRedraw = false

      // 清空整个 canvas 并重绘所有组件
      this.ctx.clearRect(0, 0, canvas.width, canvas.height)

      // 重绘所有组件
      this.components.forEach((comp) => {
        comp.draw()
      })
    }
  }

  /**
   * 同步刷新 - 供测试使用
   * 在测试环境中，queueMicrotask 可能不会立即执行
   * 这个方法可以强制立即执行渲染
   */
  flushSync() {
    // 取消已调度的渲染
    if (this.rafId !== null) {
      this.rafId = null
    }

    // 强制清屏并重绘所有组件（即使没有脏区域）
    const canvas = this.ctx.canvas
    this.ctx.clearRect(0, 0, canvas.width, canvas.height)

    // 重绘所有组件
    this.components.forEach((comp) => {
      comp.draw()
    })

    // 清空脏区域列表
    this.dirtyRegions = []
  }

  /**
   * 销毁上下文
   */
  destroy() {
    // 清空调度标记
    this.rafId = null
    this.components.clear()
    this.dirtyRegions = []
  }
}

// 用于存储上下文的 WeakMap
const contextMap = new WeakMap<CanvasRenderingContext2D, RenderContext>()

// 用于存储当前 group 上下文的栈（支持嵌套 group）
const groupContextStack = new WeakMap<
  CanvasRenderingContext2D,
  GroupContext[]
>()

/**
 * Group 上下文 - 用于收集子组件的绘制函数
 */
export interface GroupContext {
  /** 子组件的绘制函数列表 */
  childDrawFunctions: (() => void)[]
  /** 子组件的 ID 列表（用于清理） */
  childComponentIds: symbol[]
}

/**
 * 进入 group 上下文
 * 在此上下文中注册的组件会被收集到 group 中
 */
export function enterGroupContext(ctx: CanvasRenderingContext2D): GroupContext {
  const groupContext: GroupContext = {
    childDrawFunctions: [],
    childComponentIds: []
  }

  let stack = groupContextStack.get(ctx)
  if (!stack) {
    stack = []
    groupContextStack.set(ctx, stack)
  }
  stack.push(groupContext)

  return groupContext
}

/**
 * 退出 group 上下文
 */
export function exitGroupContext(ctx: CanvasRenderingContext2D): void {
  const stack = groupContextStack.get(ctx)
  if (stack && stack.length > 0) {
    stack.pop()
  }
}

/**
 * 获取当前 group 上下文（如果在 group 内部）
 */
export function getCurrentGroupContext(
  ctx: CanvasRenderingContext2D
): GroupContext | null {
  const stack = groupContextStack.get(ctx)
  if (stack && stack.length > 0) {
    return stack[stack.length - 1]
  }
  return null
}

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
