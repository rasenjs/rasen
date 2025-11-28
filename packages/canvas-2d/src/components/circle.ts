import { getReactiveRuntime } from '@rasenjs/core'
import type { SyncComponent } from '@rasenjs/core'
import type { ReadonlyRef, Ref } from '@rasenjs/core'
import { unref } from '../utils'

/**
 * circle 组件 - 绘制圆形
 */
export const circle: SyncComponent<
  CanvasRenderingContext2D,
  {
    x: number | Ref<number> | ReadonlyRef<number>
    y: number | Ref<number> | ReadonlyRef<number>
    radius: number | Ref<number> | ReadonlyRef<number>
    fill?: string | Ref<string> | ReadonlyRef<string>
    stroke?: string | Ref<string> | ReadonlyRef<string>
    lineWidth?: number | Ref<number> | ReadonlyRef<number>
  }
> = (props) => {
  return (ctx) => {
    const draw = () => {
      const x = unref(props.x)
      const y = unref(props.y)
      const radius = unref(props.radius)
      const fill = props.fill ? unref(props.fill) : undefined
      const stroke = props.stroke ? unref(props.stroke) : undefined
      const lineWidth = props.lineWidth ? unref(props.lineWidth) : 1

      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)

      if (fill) {
        ctx.fillStyle = fill
        ctx.fill()
      }

      if (stroke) {
        ctx.strokeStyle = stroke
        ctx.lineWidth = lineWidth
        ctx.stroke()
      }
    }

    getReactiveRuntime().watch(
      () => [
        unref(props.x),
        unref(props.y),
        unref(props.radius),
        props.fill ? unref(props.fill) : undefined,
        props.stroke ? unref(props.stroke) : undefined,
        props.lineWidth ? unref(props.lineWidth) : undefined
      ],
      draw,
      { immediate: true }
    )

    return undefined
  }
}
