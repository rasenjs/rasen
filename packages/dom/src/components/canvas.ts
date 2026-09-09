import type { PropValue, Mountable } from '@rasenjs/core'
import { getReactiveRuntime, toValue } from '@rasenjs/core'
import type {
  CanvasNode,
  RenderContextOptions as Canvas2DRenderOptions
} from '@rasenjs/canvas-2d'
import type { GlNode, GlContext, CameraConfig } from '@rasenjs/webgl'
import { createRoot as createCanvas2DRoot } from '@rasenjs/canvas-2d'
import { createRoot as createGlRoot, getRenderContext } from '@rasenjs/webgl'

/**
 * contextType → 渲染器节点与配置的类型映射。
 *
 * 仅类型层引用（运行时直接调用各渲染器包导出的 createRoot），
 * 用户写 `contextType: 'webgl'` 即自动获得 `Mountable<GlNode>` 的
 * children 约束与强类型的 renderOptions —— 无字符串口袋、无 cast。
 */
interface HostTypes {
  '2d': { node: CanvasNode; rc: Canvas2DRenderOptions }
  webgl: { node: GlNode; rc: import('@rasenjs/webgl').RenderContextOptions }
  webgl2: { node: GlNode; rc: import('@rasenjs/webgl').RenderContextOptions }
}

export interface CanvasProps<T extends keyof HostTypes = '2d'> {
  width: PropValue<number>
  height: PropValue<number>
  /** 渲染上下文类型；缺省 '2d'。决定 children 与 renderOptions 的类型 */
  contextType?: T
  /** WebGL 上下文属性（preserveDrawingBuffer 等）；'2d' 不接受 */
  contextOptions?: T extends '2d' ? never : WebGLContextAttributes
  /** 渲染器配置（clearColor/continuousRender 等），强类型，直通 createRoot */
  renderOptions?: HostTypes[T]['rc']
  /**
   * Camera configuration (WebGL family only — the 2D renderer has no
   * renderer-level camera; pan/zoom there is a `group` in the scene tree).
   * Accepts any PropValue form (plain object, reactive ref, or getter).
   *
   * - 3D perspective: `{ x, y, z, target, fov, ... }`
   * - 3D orthographic: `{ x, y, z, target }` (no fov)
   *
   * Merged into `renderOptions.camera` (top-level prop wins) and pushed
   * into the WebGL RenderContext reactively.
   */
  camera?: T extends '2d' ? never : PropValue<CameraConfig>
  dpr?: number
  className?: PropValue<string>
  style?: PropValue<Record<string, string | number>>
  children: Array<Mountable<HostTypes[T]['node']>>
}

/**
 * canvas - Canvas 元素组件
 *
 * 创建 `<canvas>` 元素并桥接到指定渲染上下文。子组件挂载在渲染器包
 * `createRoot` 物化的真实渲染根下 —— node 就是 node，没有中间造型。
 *
 * @example
 * ```typescript
 * import { canvas } from '@rasenjs/dom'
 * import { rect } from '@rasenjs/canvas-2d'
 * import { mesh } from '@rasenjs/webgl'
 *
 * // 2D（缺省）
 * canvas({ width: 400, height: 400, children: [rect({ ... })] })
 *
 * // WebGL —— children 自动收窄为 Mountable<GlNode>[]
 * canvas({
 *   width: 800,
 *   height: 600,
 *   contextType: 'webgl',
 *   renderOptions: { clearColor: '#87CEEB', continuousRender: true },
 *   children: [mesh({ ... })]
 * })
 * ```
 */
export function canvas<T extends keyof HostTypes = '2d'>(
  props: CanvasProps<T>
): Mountable<HTMLElement> {
  return (domHost: HTMLElement) => {
    // 创建 canvas 元素
    const canvasEl = document.createElement('canvas')

    // 设置尺寸（逻辑像素）
    const width = toValue(props.width)
    const height = toValue(props.height)

    // 获取 DPR
    const dpr =
      props.dpr ??
      (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)

    // 物理像素 = 逻辑像素 × DPR
    canvasEl.width = width * dpr
    canvasEl.height = height * dpr

    // CSS 样式使用逻辑像素
    canvasEl.style.width = `${width}px`
    canvasEl.style.height = `${height}px`

    // 设置样式
    if (props.className) {
      const className = toValue(props.className)
      if (className) canvasEl.className = className
    }

    if (props.style) {
      const style = toValue(props.style)
      if (style) {
        Object.entries(style).forEach(([key, value]) => {
          canvasEl.style.setProperty(key, String(value))
        })
      }
    }

    // 挂载到 DOM
    domHost.appendChild(canvasEl)

    // 获取渲染上下文（原生获取内联；不对外暴露 getter）
    const contextType = props.contextType ?? ('2d' as T)
    let ctx: unknown
    if (contextType === '2d') {
      ctx = canvasEl.getContext('2d')
    } else {
      ctx = canvasEl.getContext(
        contextType,
        props.contextOptions as WebGLContextAttributes | undefined
      )
    }

    if (!ctx) {
      throw new Error(`Failed to get canvas context: ${String(contextType)}`)
    }

    // 对 2D context 应用 DPR 缩放
    if (contextType === '2d') {
      ;(ctx as CanvasRenderingContext2D).scale(dpr, dpr)
    }

    // React to size changes: keep drawingBuffer + logical size in sync so the
    // visible area grows with the window instead of stretching.
    const runtime = getReactiveRuntime()

    // 具象化真实渲染根：由对应渲染器包的官方入口完成。
    // 此后子组件挂在这棵真实的场景树下 —— node 就是 node。
    // 帧调度注入：宿主提供 rAF（渲染器不再触达全局 BOM）。
    const schedule = (cb: () => void): (() => void) => {
      const id = requestAnimationFrame(cb)
      return () => cancelAnimationFrame(id)
    }
    const glOptions = {
      logicalWidth: width,
      logicalHeight: height,
      schedule,
      ...(props.renderOptions ?? {}),
      // camera prop merges into renderOptions.camera (top-level prop wins)
      // Resolve reactive ref to plain object before passing to RenderContext
      camera:
        toValue(props.camera) ??
        (props.renderOptions as import('@rasenjs/webgl').RenderContextOptions | undefined)?.camera,
    }
    const root =
      contextType === '2d'
        ? createCanvas2DRoot(ctx as Parameters<typeof createCanvas2DRoot>[0], {
            schedule,
          })
        : createGlRoot(ctx as GlContext, glOptions)
    // 两个渲染包的 createRoot 都返回带 requestRedraw 的根节点
    const requestRedraw = root.requestRedraw.bind(root)

    // WebGL: capture the RenderContext once for reactive camera updates.
    const glRc =
      contextType === '2d' ? null : getRenderContext(ctx as GlContext)

    // 指针事件绑定（两个渲染器都有纯 dispatchPointer 入口）：DOM 适配器的
    // 职责——监听原生事件、换算画布本地坐标，再喂给渲染器的纯入口。
    // 渲染器自身不认识 addEventListener / PointerEvent。webgl 侧只有
    // click/pointerdown 消费者，多余事件类型无 handler 时自然忽略。
    const unbindPointer = bindCanvasPointerEvents(
      canvasEl,
      contextType === '2d'
        ? (root as unknown as Parameters<typeof bindCanvasPointerEvents>[1])
        : (glRc as unknown as Parameters<typeof bindCanvasPointerEvents>[1]),
    )

    const stopSizeWatch = runtime.subscribe(
      () => [toValue(props.width), toValue(props.height), dpr] as const,
      ([w, h]) => {
        canvasEl.width = w * dpr
        canvasEl.height = h * dpr
        canvasEl.style.width = `${w}px`
        canvasEl.style.height = `${h}px`
        if (contextType === '2d') {
          // canvas.width reset clears the transform — re-apply DPR scale.
          ;(ctx as CanvasRenderingContext2D).setTransform(dpr, 0, 0, dpr, 0, 0)
        } else {
          // The WebGL projection aspect derives from the logical size, which
          // was captured at mount (before the first ResizeObserver callback —
          // usually a placeholder). Keep it in sync with the resized viewport,
          // otherwise the scene is drawn stretched after a resize.
          glRc?.setLogicalSize(w, h)
        }
        // Drawing buffer was cleared by the resize — ask the renderer to
        // repaint (direct call; replaces the old 'rasen:resize' event).
        requestRedraw()
      },
    )

    // 挂载子组件到渲染根：canvas 子树无 marker 节点操作需求，
    // 显式传空 hooks（全降级）——hooks 即上下文，显式传递。
    const childUnmounts = props.children.map((child) =>
      (child as Mountable<unknown>)(root, undefined)
    )

    // Watch for camera prop changes and push them into the WebGL
    // RenderContext (the 2D renderer has no renderer-level camera).
    // The getter re-evaluates the camera ref; a new config object each change
    // defeats Object.is equality → setCamera fires → projection recomputed.
    let stopCameraWatch: (() => void) | null = null
    if (glRc) {
      stopCameraWatch = runtime.subscribe(
        () => toValue(props.camera),
        (cam) => {
          if (cam) glRc.setCamera(cam as CameraConfig)
        },
      )
    }

    // 返回 unmount 函数
    return () => {
      stopCameraWatch?.()
      stopSizeWatch()
      unbindPointer?.()
      childUnmounts.forEach((unmount) => unmount?.())
      root.remove()
      canvasEl.remove()
    }
  }
}

/**
 * Bind delegated pointer listeners on the canvas element and feed the
 * renderer's pure dispatchPointer entry. Lives here (not in the renderer)
 * because addEventListener / coordinate translation are DOM knowledge.
 */
function bindCanvasPointerEvents(
  canvasEl: HTMLCanvasElement,
  root: { dispatchPointer(type: string, x: number, y: number): void; needsPointerEvents?: boolean },
): () => void {
  const toLocal = (e: PointerEvent & { offsetX?: number; offsetY?: number }): { x: number; y: number } | null => {
    if (typeof e.offsetX === 'number' && typeof e.offsetY === 'number') {
      return { x: e.offsetX, y: e.offsetY }
    }
    if (typeof e.clientX === 'number' && typeof e.clientY === 'number') {
      const r = canvasEl.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    return null
  }

  const types = ['click', 'pointerdown', 'pointerup', 'pointermove'] as const
  const handlers = types.map((type) => {
    const fn = (native: Event) => {
      const pt = toLocal(native as PointerEvent)
      if (pt && typeof root.dispatchPointer === 'function') {
        root.dispatchPointer(type, pt.x, pt.y)
      }
    }
    canvasEl.addEventListener(type, fn)
    return { type, fn }
  })
  return () => {
    for (const { type, fn } of handlers) {
      canvasEl.removeEventListener(type, fn)
    }
  }
}
