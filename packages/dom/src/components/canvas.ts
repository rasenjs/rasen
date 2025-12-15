import type { PropValue, Mountable } from '@rasenjs/core'
import { unrefValue } from '@rasenjs/core'

/**
 * 获取 Canvas 渲染上下文的函数类型
 */
export type ContextGetter<Ctx> = (canvas: HTMLCanvasElement) => Ctx | null

/**
 * 预定义的上下文获取器
 */
export const contextGetters = {
  '2d': (canvas: HTMLCanvasElement) => canvas.getContext('2d'),
  webgl: (canvas: HTMLCanvasElement) => canvas.getContext('webgl'),
  webgl2: (canvas: HTMLCanvasElement) => canvas.getContext('webgl2'),
  webgpu: async (canvas: HTMLCanvasElement) => {
    if (!(navigator as any).gpu) return null
    const adapter = await (navigator as any).gpu.requestAdapter()
    if (!adapter) return null
    await adapter.requestDevice()
    return canvas.getContext('webgpu') as any
  }
} as const

/**
 * canvas - Canvas 元素组件
 *
 * 在 DOM 中创建 canvas 元素，并将子组件桥接到指定的渲染上下文
 * 支持 2D、WebGL、WebGL2、WebGPU 等多种上下文
 *
 * @example
 * ```typescript
 * import { div, canvas, contextGetters } from '~/app/utils/rasen'
 * import { rect, text } from '~/app/utils/rasen'
 *
 * const MyComponent = () => {
 *   return div({
 *     children: [
 *       // Canvas 2D
 *       canvas({
 *         width: 400,
 *         height: 400,
 *         contextType: '2d',
 *         children: [
 *           rect({ x: 0, y: 0, width: 100, height: 100, fill: 'red' }),
 *           text({ text: 'Hello Canvas', x: 50, y: 50 })
 *         ]
 *       }),
 *
 *       // WebGL
 *       canvas({
 *         width: 400,
 *         height: 400,
 *         contextType: 'webgl',
 *         children: [
 *           webglComponent({ ... })
 *         ]
 *       }),
 *
 *       // 自定义上下文获取器
 *       canvas({
 *         width: 400,
 *         height: 400,
 *         getContext: (canvas) => canvas.getContext('bitmaprenderer'),
 *         children: [...]
 *       })
 *     ]
 *   })
 * }
 * ```
 */
// 函数重载：根据 contextType 推断 Ctx 类型
export function canvas(props: {
  width: PropValue<number>
  height: PropValue<number>
  contextType?: '2d'
  dpr?: number
  className?: PropValue<string>
  style?: PropValue<Record<string, string | number>>
  children: Array<Mountable<CanvasRenderingContext2D>>
}): Mountable<HTMLElement>

export function canvas(props: {
  width: PropValue<number>
  height: PropValue<number>
  contextType: 'webgl'
  dpr?: number
  className?: PropValue<string>
  style?: PropValue<Record<string, string | number>>
  children: Array<Mountable<WebGLRenderingContext>>
}): Mountable<HTMLElement>

export function canvas(props: {
  width: PropValue<number>
  height: PropValue<number>
  contextType: 'webgl2'
  dpr?: number
  className?: PropValue<string>
  style?: PropValue<Record<string, string | number>>
  children: Array<Mountable<WebGL2RenderingContext>>
}): Mountable<HTMLElement>

export function canvas<Ctx>(props: {
  width: PropValue<number>
  height: PropValue<number>
  getContext: ContextGetter<Ctx>
  dpr?: number
  className?: PropValue<string>
  style?: PropValue<Record<string, string | number>>
  children: Array<Mountable<Ctx>>
}): Mountable<HTMLElement>

// 实现
export function canvas<Ctx>(props: {
  width: PropValue<number>
  height: PropValue<number>
  contextType?: '2d' | 'webgl' | 'webgl2' | 'webgpu'
  getContext?: ContextGetter<Ctx>
  dpr?: number
  className?: PropValue<string>
  style?: PropValue<Record<string, string | number>>
  children: Array<Mountable<Ctx>>
}): Mountable<HTMLElement> {
  return (domHost: HTMLElement) => {
    // 创建 canvas 元素
    const canvasEl = document.createElement('canvas')

    // 设置尺寸（逻辑像素）
    const width = unrefValue(props.width)
    const height = unrefValue(props.height)

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
    
    // Store logical dimensions for WebGL projection matrix
    canvasEl.dataset.logicalWidth = String(width)
    canvasEl.dataset.logicalHeight = String(height)

    // 设置样式
    if (props.className) {
      const className = unrefValue(props.className)
      if (className) canvasEl.className = className
    }

    if (props.style) {
      const style = unrefValue(props.style)
      if (style) {
        Object.entries(style).forEach(([key, value]) => {
          canvasEl.style.setProperty(key, String(value))
        })
      }
    }

    // 挂载到 DOM
    domHost.appendChild(canvasEl)

    // 获取渲染上下文
    let ctx: Ctx | null
    if (props.getContext) {
      // 使用自定义上下文获取器
      ctx = props.getContext(canvasEl)
    } else {
      // 使用预定义的上下文类型
      const contextType = props.contextType || '2d'
      const getter = contextGetters[contextType]
      ctx = getter(canvasEl) as Ctx
    }

    if (!ctx) {
      throw new Error(
        `Failed to get canvas context: ${props.contextType || 'custom'}`
      )
    }

    // 对 2D context 应用 DPR 缩放
    const contextType = props.contextType || '2d'
    if (contextType === '2d' && !props.getContext) {
      const ctx2d = ctx as unknown as CanvasRenderingContext2D
      ctx2d.scale(dpr, dpr)
    }

    // 挂载子组件到渲染上下文
    const childUnmounts = props.children.map((child) => child(ctx))

    // 返回 unmount 函数
    return () => {
      childUnmounts.forEach((unmount) => unmount?.())
      canvasEl.remove()
    }
  }
}
