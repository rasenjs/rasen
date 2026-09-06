/**
 * 渲染上下文 —— 持有渲染根节点，统一调度重绘
 *
 * v1 简化：任何标脏都触发全画布重绘（清屏 + 前序遍历渲染根的子树）。
 * per-node/区域脏区优化留作后续迭代（节点已携带 bounds 钩子位）。
 */

import type { Context2D } from './node'
import type { CanvasNode } from './node'
import type { CanvasPointerEventType } from './events'
import type { CanvasCameraConfig } from './types'

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface RenderContextOptions {
  /**
   * 绘制调度注入（domlike 环境适配点）。返回值即取消函数——
   * 调度与取消一体。缺省：环境有 requestAnimationFrame 用之；
   * 测试/SSR 环境退化为 queueMicrotask。
   */
  schedule?: (cb: () => void) => () => void
  /**
   * Device pixel ratio of the backing store (default 1). When >1, every
   * frame starts from a scaled base transform so drawing code keeps using
   * CSS pixel coordinates while rasterizing at device resolution. The HOST
   * owns sizing the backing store: canvas.width = cssWidth * resolution.
   */
  resolution?: number
  /**
   * Camera configuration — intrinsic to the canvas, not a child component
   * (same model as the WebGL RenderContext). 2D is the degenerate form:
   * x/y = the world point that lands at the screen center, zoom = ortho
   * scale. Omitting the camera entirely defaults to `{ x:0, y:0, zoom:1 }`.
   *
   * Screen mapping: translate(W/2,H/2) ∘ scale(zoom,-zoom) ∘ translate(-x,-y)
   * — Y flips because the canvas is Y-down while the world is Y-up.
   */
  camera?: CanvasCameraConfig
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
  /** 已调度但未执行的绘制取消函数（null = 无待执行绘制） */
  private cancelScheduled: (() => void) | null = null
  private readonly resolution: number
  /** 解析后的帧调度器（构造期确定，不依赖全局探测时序） */
  private readonly scheduleFrame: (cb: () => void) => () => void
  /** 画布级相机配置（构造期给定，setCamera 可更新） */
  private cameraConfig: CanvasCameraConfig | undefined

  constructor(
    private ctx: Context2D,
    options: RenderContextOptions = {}
  ) {
    this.resolution = options.resolution ?? 1
    this.cameraConfig = options.camera
    // 帧调度：注入优先；缺省 rAF，环境缺失（测试/SSR）退化 queueMicrotask
    this.scheduleFrame =
      options.schedule ??
      (typeof requestAnimationFrame !== 'undefined'
        ? (cb) => {
            const id = requestAnimationFrame(cb)
            return () => cancelAnimationFrame(id)
          }
        : (cb) => {
            queueMicrotask(cb)
            return () => {}
          })
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

  /** 场景中实际挂载的组件节点数（不含 createRoot 的裸根容器） */
  get nodeCount(): number {
    let n = 0
    const walk = (node: CanvasNode): void => {
      for (const c of node.children) {
        n++
        walk(c)
      }
    }
    for (const r of this.roots) walk(r)
    return n
  }

  /** Update the camera from a config object (marks dirty for the next frame). */
  setCamera(config: CanvasCameraConfig): void {
    this.cameraConfig = config
    this.markDirty()
  }

  /** Get the current camera configuration (undefined if default). */
  get camera(): CanvasCameraConfig | undefined {
    return this.cameraConfig
  }

  /** 标脏：v1 一律全画布重绘 */
  markDirty(): void {
    this.scheduleDraw()
  }

  /**
   * Signal that the scene now contains nodes with pointer handlers.
   * The host adapter polls this (or subscribes via its own bookkeeping) to
   * decide when to bind native listeners; the renderer stays event-free.
   */
  markNeedsPointerBinding(): void {
    this.needsPointerBinding = true
  }

  /** Whether any mounted node declared pointer handlers (host adapter reads). */
  get needsPointerEvents(): boolean {
    return this.needsPointerBinding
  }

  private needsPointerBinding = false

  /**
   * 宿主显式请求重绘（如 dom <canvas> 改了绘图缓冲尺寸后调用）。
   * 当前与 markDirty 等价；保留独立入口以承载未来的尺寸相关处理。
   */
  requestRedraw(): void {
    this.scheduleDraw()
  }

  private scheduleDraw() {
    if (this.cancelScheduled !== null) return

    const cancel = this.scheduleFrame(() => {
      this.cancelScheduled = null
      this.draw()
    })
    // Wrap: external cancel must also reset the pending state, otherwise
    // subsequent markDirty calls would be dead-locked.
    this.cancelScheduled = () => {
      cancel()
      this.cancelScheduled = null
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

    // Canvas-level camera config is stored on the RenderContext but NOT
    // applied here globally: regular 2D shapes draw in screen coordinates
    // (pan/zoom would break every existing component), while Y-up world-space
    // content (Spine) reads the config and applies the full mapping itself —
    // mirroring how the WebGL camera feeds the projection matrix. This keeps
    // the config surface identical across renderers without changing the
    // meaning of existing 2D scenes.
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
    // Coordinates are in the scene's world space (camera pan/zoom are baked
    // into node bounds by the same transform the draw path applies — the
    // camera here uses plain pan/zoom without any axis flip, matching draw).
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
   * Hit-test the point and bubble the event from the target up the ancestor
   * chain, firing the first handler found for this type.
   *
   * PUBLIC entry for host adapters: the adapter owns native event listeners
   * and coordinate translation, then calls this with canvas-local CSS
   * coordinates. The renderer never sees native event objects.
   */
  dispatchPointer(type: CanvasPointerEventType, x: number, y: number): void {
    const target = this.hitTest(x, y)
    if (!target) return
    let node: CanvasNode | null = target
    while (node) {
      const handler = node.on?.[type]
      if (handler) {
        handler({ x, y, node: target, nativeEvent: undefined })
        return
      }
      node = node.parent
    }
  }

  /**
   * Manually trigger full redraw (bypasses watch system)
   */
  flushSync() {
    if (this.cancelScheduled !== null) {
      this.cancelScheduled()
      this.cancelScheduled = null
    }
    this.draw()
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.cancelScheduled !== null) {
      this.cancelScheduled()
      this.cancelScheduled = null
    }
    this.roots = []
    contextMap.delete(this.ctx)
  }
}
