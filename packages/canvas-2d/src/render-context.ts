/**
 * 渲染上下文 —— 持有渲染根节点，统一调度重绘
 *
 * v1 简化：任何标脏都触发全画布重绘（清屏 + 前序遍历渲染根的子树）。
 * per-node/区域脏区优化留作后续迭代（节点已携带 bounds 钩子位）。
 */

import type { Context2D } from './node'
import type { CanvasNode } from './node'
import type { CanvasSurface } from './node'
import type { CanvasEventHandlers } from './events'

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
  /**
   * Device pixel ratio of the backing store (default 1). When >1, every
   * frame starts from a scaled base transform so drawing code keeps using
   * CSS pixel coordinates while rasterizing at device resolution. The HOST
   * owns sizing the backing store: canvas.width = cssWidth * resolution.
   */
  resolution?: number
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
  private readonly resolution: number
  private eventListenersAttached = false

  private static readonly EVENT_TYPES = [
    'click',
    'pointerdown',
    'pointerup',
    'pointermove'
  ] as const

  constructor(
    private ctx: Context2D,
    options: RenderContextOptions = {}
  ) {
    this.options = options
    this.resolution = options.resolution ?? 1
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
    const res = this.resolution
    // Base device-pixel transform; all drawing keeps CSS-pixel coordinates.
    // Per-shape/group transforms compose relatively (save/translate/restore),
    // so this base survives them.
    if (res !== 1) {
      this.ctx.setTransform(res, 0, 0, res, 0, 0)
    }
    this.ctx.clearRect(0, 0, canvas.width / res, canvas.height / res)

    for (const root of this.roots) {
      root.draw(this.ctx)
    }

  }

  /**
   * Topmost node whose shape contains the point (canvas CSS coordinates),
   * or null.
   *
   * Traversal is reverse draw order so the visually topmost shape wins.
   * Nodes with an exact `hit` closure use it; everything else falls back to
   * its bounds AABB. v1 contract: geometric tests assume untransformed
   * scenes — group/per-shape transforms are not inverted (component bounds
   * are already computed in world coordinates).
   */
  hitTest(x: number, y: number): CanvasNode | null {
    for (let i = this.roots.length - 1; i >= 0; i--) {
      const found = this.hitTestNode(this.roots[i], x, y)
      if (found) return found
    }
    return null
  }

  private hitTestNode(node: CanvasNode, x: number, y: number): CanvasNode | null {
    // Children paint after their parent → walk them topmost-first.
    for (let i = node.children.length - 1; i >= 0; i--) {
      const found = this.hitTestNode(node.children[i], x, y)
      if (found) return found
    }

    // Exact test is authoritative AND cheapest when present — computing
    // bounds first (full effect bounds incl. trig) would cost more than the
    // arithmetic hit itself, so only fall back to the AABB when no hit
    // closure exists.
    if (node.hit) return node.hit(x, y) ? node : null

    const bounds = node.bounds?.() ?? null
    if (!bounds) return null
    if (
      x < bounds.x ||
      x > bounds.x + bounds.width ||
      y < bounds.y ||
      y > bounds.y + bounds.height
    ) {
      return null
    }
    return node
  }

  /**
   * Attach delegated listeners on the canvas surface. Called lazily by
   * createNode when the first node registers pointer handlers; a no-op on
   * hosts whose surface has no event support (tests, SSR).
   */
  ensureEventListeners(): void {
    if (this.eventListenersAttached) return
    const surface = this.ctx.canvas as CanvasSurface & {
      addEventListener?: (type: string, h: (e: unknown) => void) => void
    }
    if (typeof surface.addEventListener !== 'function') return
    for (const type of RenderContext.EVENT_TYPES) {
      surface.addEventListener(type, (native) =>
        this.dispatch(type, native)
      )
    }
    this.eventListenersAttached = true
  }

  /**
   * Hit-test the point and bubble the event from the target up the ancestor
   * chain, firing the first handler found for this type.
   */
  private dispatch(type: keyof CanvasEventHandlers, native: unknown): void {
    const pt = this.eventPoint(native)
    if (!pt) return
    const target = this.hitTest(pt.x, pt.y)
    if (!target) return
    let node: CanvasNode | null = target
    while (node) {
      const handler = node.on?.[type]
      if (handler) {
        handler({ x: pt.x, y: pt.y, node: target, nativeEvent: native })
        return
      }
      node = node.parent
    }
  }

  /** Canvas-local CSS coordinates from a host event. */
  private eventPoint(native: unknown): { x: number; y: number } | null {
    const e = native as { offsetX?: unknown; offsetY?: unknown }
    if (typeof e.offsetX === 'number' && typeof e.offsetY === 'number') {
      return { x: e.offsetX, y: e.offsetY }
    }
    // Fallback: clientX/Y minus the canvas rect (DOM hosts without offsetX).
    const ce = native as { clientX?: unknown; clientY?: unknown }
    const surface = this.ctx.canvas as CanvasSurface & {
      getBoundingClientRect?: () => { left: number; top: number }
    }
    if (
      typeof ce.clientX === 'number' &&
      typeof ce.clientY === 'number' &&
      typeof surface.getBoundingClientRect === 'function'
    ) {
      const r = surface.getBoundingClientRect()
      return { x: ce.clientX - r.left, y: ce.clientY - r.top }
    }
    return null
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
