import { getReactiveRuntime } from '@rasenjs/core'
import type { SyncComponent } from '@rasenjs/core'
import type { ReadonlyRef, Ref } from '@rasenjs/core'
import { unref } from '../utils'

/**
 * line 组件 - 绘制线条
 */
export const line: SyncComponent<
  CanvasRenderingContext2D,
  {
    x1: number | Ref<number> | ReadonlyRef<number>
    y1: number | Ref<number> | ReadonlyRef<number>
    x2: number | Ref<number> | ReadonlyRef<number>
    y2: number | Ref<number> | ReadonlyRef<number>
    stroke?: string | Ref<string> | ReadonlyRef<string>
    lineWidth?: number | Ref<number> | ReadonlyRef<number>
  }
> = (props) => {
  return (ctx) => {
    const draw = () => {
      const x1 = unref(props.x1)
      const y1 = unref(props.y1)
      const x2 = unref(props.x2)
      const y2 = unref(props.y2)
      const stroke = props.stroke ? unref(props.stroke) : '#000000'
      const lineWidth = props.lineWidth ? unref(props.lineWidth) : 1

      ctx.strokeStyle = stroke
      ctx.lineWidth = lineWidth
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }

    getReactiveRuntime().watch(
      () => [
        unref(props.x1),
        unref(props.y1),
        unref(props.x2),
        unref(props.y2),
        props.stroke ? unref(props.stroke) : undefined,
        props.lineWidth ? unref(props.lineWidth) : undefined
      ],
      draw,
      { immediate: true }
    )

    return undefined
  }
}
