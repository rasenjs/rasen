import {
  com,
  getReactiveRuntime,
  type Mountable,
  type Unmount
} from '@rasenjs/core'
import type { Ref, ReadonlyRef } from '../types'
import {
  unref,
  type CommonDrawProps,
  type TransformProps,
  withDrawProps,
  collectDrawPropsDependencies
} from '../utils'
import {
  RenderContext,
  getRenderContext,
  hasRenderContext,
  enterGroupContext,
  exitGroupContext,
  type GroupContext
} from '../render-context'

export interface GroupProps
  extends Partial<CommonDrawProps>, Partial<TransformProps> {
  // 子组件
  children: Array<Mountable<CanvasRenderingContext2D>>
  // 位置偏移
  x?: number | Ref<number> | ReadonlyRef<number>
  y?: number | Ref<number> | ReadonlyRef<number>
  // 裁剪区域(可选)
  clip?:
    | {
        x: number
        y: number
        width: number
        height: number
      }
    | Ref<{ x: number; y: number; width: number; height: number }>
}

/**
 * group 组件 - Canvas 2D 专属的组合组件
 *
 * 相比 fragment,group 支持:
 * - 共享变换(rotation, scale, translate等)
 * - 共享透明度
 * - 裁剪区域
 * - 共享阴影效果
 *
 * 所有子组件会在同一个变换上下文中绘制
 */
export const group = com(
  (props: GroupProps): Mountable<CanvasRenderingContext2D> => {
    return (ctx: CanvasRenderingContext2D) => {
      // 子组件的 unmount 函数列表
      const childUnmounts: (Unmount | undefined)[] = []
      let componentId: symbol | null = null
      let groupContext: GroupContext | null = null

      // group 的绘制函数 - 应用变换上下文并绘制子组件
      const drawGroup = () => {
        ctx.save()

        // 应用位置偏移
        const x = props.x ? unref(props.x) : 0
        const y = props.y ? unref(props.y) : 0
        if (x !== 0 || y !== 0) {
          ctx.translate(x, y)
        }

        // 应用通用绘图属性(变换、透明度、阴影等)
        withDrawProps(ctx, props, () => {
          // 应用裁剪区域
          if (props.clip) {
            const clip = unref(props.clip)
            ctx.beginPath()
            ctx.rect(clip.x, clip.y, clip.width, clip.height)
            ctx.clip()
          }

          // 在 group 的变换上下文中绘制所有子组件
          if (groupContext) {
            for (const childDraw of groupContext.childDrawFunctions) {
              childDraw()
            }
          }
        })

        ctx.restore()
      }

      // 自动创建 RenderContext（如果不存在）
      if (!hasRenderContext(ctx)) {
        new RenderContext(ctx)
      }

      const renderContext = getRenderContext(ctx)
      const canvas = ctx.canvas

      // 进入 group 上下文，收集子组件
      groupContext = enterGroupContext(ctx)

      // 注册 group 组件
      componentId = renderContext.register({
        bounds: () => ({
          x: 0,
          y: 0,
          width: canvas.width,
          height: canvas.height
        }),
        draw: drawGroup
      })

      // mount 所有子组件（在 group 上下文中）
      for (const child of props.children) {
        const unmount = child(ctx)
        childUnmounts.push(unmount)
      }

      // 退出 group 上下文
      exitGroupContext(ctx)

      // 初始标记脏区域以触发首次渲染
      renderContext.markDirty({
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height
      })

      // 监听 group 属性变化
      const stop = getReactiveRuntime().watch(
        () => {
          const deps = [
            props.rotation ? unref(props.rotation) : undefined,
            props.x ? unref(props.x) : undefined,
            props.y ? unref(props.y) : undefined,
            props.clip ? unref(props.clip) : undefined,
            ...collectDrawPropsDependencies(props)
          ]
          return deps
        },
        () => {
          // group 属性变化时，标记整个 canvas 为脏区域触发重绘
          renderContext.markDirty({
            x: 0,
            y: 0,
            width: canvas.width,
            height: canvas.height
          })
        },
        { immediate: false }
      )

      // 返回 cleanup 函数
      return () => {
        // 停止监听
        stop?.()
        // unmount 所有子组件
        childUnmounts.forEach((unmount) => unmount?.())
        // 注销 group 组件
        if (componentId && hasRenderContext(ctx)) {
          getRenderContext(ctx).unregister(componentId)
        }
      }
    }
  }
)
