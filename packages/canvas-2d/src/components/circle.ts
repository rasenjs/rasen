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

export interface CircleProps
  extends
    Partial<CommonDrawProps>,
    Partial<LineStyleProps>,
    Partial<TransformProps> {
  x: number | Ref<number> | ReadonlyRef<number>
  y: number | Ref<number> | ReadonlyRef<number>
  radius: number | Ref<number> | ReadonlyRef<number>
  fill?: string | Ref<string> | ReadonlyRef<string>
  stroke?: string | Ref<string> | ReadonlyRef<string>
  lineWidth?: number | Ref<number> | ReadonlyRef<number>
  startAngle?: number | Ref<number> | ReadonlyRef<number>
  endAngle?: number | Ref<number> | ReadonlyRef<number>
  anticlockwise?: boolean | Ref<boolean> | ReadonlyRef<boolean>
}

/**
 * circle 组件 - 绘制圆形
 */
export const circle: Component2D<CircleProps> = (
  props: CircleProps
) => {
  // setup 周期：基于 element 组件构建
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
          const fill = props.fill ? (unref(props.fill) as string) : undefined
          const stroke = props.stroke
            ? (unref(props.stroke) as string)
            : undefined
          const lineWidth = props.lineWidth
            ? (unref(props.lineWidth) as number)
            : 1
          const startAngle = props.startAngle
            ? (unref(props.startAngle) as number)
            : 0
          const endAngle = props.endAngle
            ? (unref(props.endAngle) as number)
            : Math.PI * 2
          const anticlockwise = props.anticlockwise
            ? (unref(props.anticlockwise) as boolean)
            : false

          ctx.beginPath()
          ctx.arc(x, y, radius, startAngle, endAngle, anticlockwise)

          if (fill) {
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

    hit: (px: number, py: number) => {
      const cx = unref(props.x) as number
      const cy = unref(props.y) as number
      const r = unref(props.radius) as number
      const dx = px - cx
      const dy = py - cy
      return dx * dx + dy * dy <= r * r
    },

    on: pointerHandlersFrom(props),

    deps: () => [
      unref(props.x),
      unref(props.y),
      unref(props.radius),
      props.fill ? unref(props.fill) : undefined,
      props.stroke ? unref(props.stroke) : undefined,
      props.lineWidth ? unref(props.lineWidth) : undefined,
      props.startAngle ? unref(props.startAngle) : undefined,
      props.endAngle ? unref(props.endAngle) : undefined,
      props.anticlockwise ? unref(props.anticlockwise) : undefined,
      ...collectDrawPropsDependencies(props)
    ]
    })
    return () => n.remove()
  }
}
