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
  previousBounds?: Bounds | null  // Track previous bounds for dirty region optimization
}

/**
 * Render context options
 */
export interface RenderContextOptions {
  /**
   * Enable dirty region tracking (default: true)
   * Only redraws changed regions
   */
  dirtyTracking?: boolean
}

/**
 * Canvas 2D Render Context
 */
export class RenderContext {
  private components = new Map<symbol, ComponentInstance>()
  private dirtyRegions: Bounds[] = []
  private rafId: number | null = null
  private needsFullRedraw: boolean = true
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
   * Register component
   */
  register(instance: ComponentInstance): symbol {
    const id = Symbol('component')
    // Only initialize previousBounds if dirty tracking is enabled
    if (this.options.dirtyTracking) {
      instance.previousBounds = instance.bounds()
    }
    this.components.set(id, instance)
    return id
  }

  /**
   * Unregister component
   */
  unregister(id: symbol) {
    this.components.delete(id)
  }

  /**
   * Mark dirty region
   */
  markDirty(bounds?: Bounds) {
    if (this.options.dirtyTracking && bounds) {
      // Limit dirty regions to avoid excessive array operations
      // When too many regions are dirty, just do full redraw
      if (this.dirtyRegions.length < 50) {
        this.dirtyRegions.push(bounds)
      } else {
        this.needsFullRedraw = true
      }
    } else {
      this.needsFullRedraw = true
    }
    this.scheduleDraw()
  }

  /**
   * 调度绘制（使用 requestAnimationFrame 批量处理）
   */
  private scheduleDraw() {
    if (this.rafId !== null) return

    // Use requestAnimationFrame in browser, queueMicrotask in test environment
    if (typeof requestAnimationFrame !== 'undefined') {
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
   * Execute draw
   */
  private draw() {
    const canvas = this.ctx.canvas

    if (this.needsFullRedraw) {
      // Full redraw mode - no bounds tracking needed
      this.ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Just draw, skip bounds calculation
      for (const comp of this.components.values()) {
        comp.draw()
      }

      this.needsFullRedraw = false
    } else if (this.dirtyRegions.length > 0) {
      // Dirty region rendering
      const dirtyBounds = this.mergeDirtyRegions()
      
      if (dirtyBounds) {
        // Clear and redraw dirty region
        this.ctx.save()
        this.ctx.beginPath()
        this.ctx.rect(
          dirtyBounds.x,
          dirtyBounds.y,
          dirtyBounds.width,
          dirtyBounds.height
        )
        this.ctx.clip()
        
        // Clear entire dirty region
        this.ctx.clearRect(
          dirtyBounds.x,
          dirtyBounds.y,
          dirtyBounds.width,
          dirtyBounds.height
        )

        // Redraw components that intersect with dirty region
        for (const comp of this.components.values()) {
          const compBounds = comp.bounds()
          const prevBounds = comp.previousBounds
          
          let shouldDraw = false
          // Check current bounds
          if (compBounds && this.boundsIntersect(compBounds, dirtyBounds)) {
            shouldDraw = true
          }
          // Check last drawn bounds (might have moved away from there)
          if (!shouldDraw && prevBounds && this.boundsIntersect(prevBounds, dirtyBounds)) {
            shouldDraw = true
          }
          
          if (shouldDraw) {
            comp.draw()
          }
          
          // Update previousBounds for next frame dirty tracking
          comp.previousBounds = compBounds ? { ...compBounds } : null
        }

        this.ctx.restore()
      }
    }
    
    this.dirtyRegions = []
  }

  /**
   * Manually trigger full redraw (bypasses watch system)
   * Use this for batch updates in animation loops or testing
   */
  flushSync() {
    // Cancel any scheduled draw
    if (this.rafId !== null) {
      this.rafId = null
    }

    // Force full redraw
    const canvas = this.ctx.canvas
    this.ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw all components
    this.components.forEach((comp) => {
      comp.draw()
    })

    // Clear dirty regions
    this.dirtyRegions = []
  }

  /**
   * Cleanup
   */
  destroy() {
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
