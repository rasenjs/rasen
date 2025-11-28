import { RenderContext, setRenderContext } from '../render-context'

/**
 * context 组件 - 提供 Canvas 2D 渲染上下文增强功能
 *
 * 职责：
 * 1. 创建并提供 RenderContext（自动批量绘制、脏检查等）
 * 2. 应用 DPR 缩放
 * 3. 管理子组件的生命周期
 *
 * 注意：不再负责 canvas DOM 元素的创建和管理，这由 canvas 组件负责
 */
type MountFunction = (
  host: CanvasRenderingContext2D
) => (() => void) | undefined

export function context(props: {
  dpr?: number
  children: Array<MountFunction>
}): MountFunction {
  return (ctx: CanvasRenderingContext2D) => {
    // 应用 DPR 缩放到绘图上下文
    const dpr =
      props.dpr ??
      (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
    ctx.save()
    ctx.scale(dpr, dpr)

    // 创建渲染上下文
    const renderContext = new RenderContext(ctx)
    setRenderContext(ctx, renderContext)

    // 挂载所有子组件
    const unmounts = props.children.map((mountFn) => mountFn(ctx))

    // 返回 unmount 函数
    return () => {
      // 先卸载所有子组件
      unmounts.forEach((unmount) => unmount?.())

      // 再销毁渲染上下文
      renderContext.destroy()

      // 恢复上下文状态
      ctx.restore()
    }
  }
}
