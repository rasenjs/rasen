import type { Component2D } from '../node'
import type { Ref, ReadonlyRef } from '../types'
import {
  unref,
  type CommonDrawProps,
  type LineStyleProps,
  type TransformProps,
  withDrawProps,
  collectDrawPropsDependencies,
  pointerHandlersFrom,
} from '../utils'
import { createNode, type CanvasNode, type Context2D } from '../node'

export interface ArcProps
  extends
    Partial<CommonDrawProps>,
    Partial<LineStyleProps>,
    Partial<TransformProps> {
  x: number | Ref<number> | ReadonlyRef<number>
  y: number | Ref<number> | ReadonlyRef<number>
  radius: number | Ref<number> | ReadonlyRef<number>
  startAngle: number | Ref<number> | ReadonlyRef<number>
  endAngle: number | Ref<number> | ReadonlyRef<number>
  anticlockwise?: boolean | Ref<boolean> | ReadonlyRef<boolean>
  fill?: string | Ref<string> | ReadonlyRef<string>
  stroke?: string | Ref<string> | ReadonlyRef<string>
  lineWidth?: number | Ref<number> | ReadonlyRef<number>
}

/**
 * arc 组件 - 绘制圆弧段
 * 与 circle 不同，arc 只绘制圆弧部分，不会自动闭合路径
 */
export const arc: Component2D<ArcProps> = (
  props: ArcProps
) => {
  return (node: CanvasNode) => {
    const n = createNode(node, {
    bounds: () => {
      const x = unref(props.x) as number
      const y = unref(props.y) as number
      const radius = unref(props.radius) as number
      const lineWidth = props.lineWidth ? (unref(props.lineWidth) as number) : 1
      const halfLine = lineWidth / 2
      return {
        x: x - radius - halfLine,
        y: y - radius - halfLine,
        width: radius * 2 + lineWidth,
        height: radius * 2 + lineWidth
      }
    },

    draw: (ctx: Context2D) => {
      withDrawProps(
        ctx,
        props,
        () => {
          const x = unref(props.x) as number
          const y = unref(props.y) as number
          const radius = unref(props.radius) as number
          const startAngle = unref(props.startAngle) as number
          const endAngle = unref(props.endAngle) as number
          const anticlockwise = props.anticlockwise
            ? (unref(props.anticlockwise) as boolean)
            : false
          const fill = props.fill ? (unref(props.fill) as string) : undefined
          const stroke = props.stroke
            ? (unref(props.stroke) as string)
            : undefined
          const lineWidth = props.lineWidth
            ? (unref(props.lineWidth) as number)
            : 1

          ctx.beginPath()
          ctx.arc(x, y, radius, startAngle, endAngle, anticlockwise)

          if (fill) {
            ctx.lineTo(x, y)
            ctx.closePath()
            ctx.fillStyle = fill
            ctx.fill()
          }

          if (stroke) {
            ctx.strokeStyle = stroke
            ctx.lineWidth = lineWidth
            ctx.stroke()
          }
        },
        {
          transformCenter: {
            x: unref(props.x) as number,
            y: unref(props.y) as number
          }
        }
      )
    },

    on: pointerHandlersFrom(props),

    deps: () => [
      unref(props.x),
      unref(props.y),
      unref(props.radius),
      unref(props.startAngle),
      unref(props.endAngle),
      props.anticlockwise ? unref(props.anticlockwise) : undefined,
      props.fill ? unref(props.fill) : undefined,
      props.stroke ? unref(props.stroke) : undefined,
      props.lineWidth ? unref(props.lineWidth) : undefined,
      ...collectDrawPropsDependencies(props)
    ]
    })
    return () => n.remove()
  }
}
