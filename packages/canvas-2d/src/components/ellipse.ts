import type { Component2D } from '../node'
import type { PropValue } from '../types'
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

export interface EllipseProps
  extends
    Partial<CommonDrawProps>,
    Partial<LineStyleProps>,
    Partial<TransformProps> {
  x: PropValue<number>
  y: PropValue<number>
  radiusX: PropValue<number>
  radiusY: PropValue<number>
  fill?: PropValue<string>
  stroke?: PropValue<string>
  lineWidth?: PropValue<number>
  startAngle?: PropValue<number>
  endAngle?: PropValue<number>
  anticlockwise?: PropValue<boolean>
}

/**
 * ellipse 组件 - 绘制椭圆
 */
export const ellipse: Component2D<EllipseProps> = (props: EllipseProps) => {
  return (node: CanvasNode) => {
    const n = createNode(node, {
    bounds: () => {
      const x = unref(props.x) as number
      const y = unref(props.y) as number
      const radiusX = unref(props.radiusX) as number
      const radiusY = unref(props.radiusY) as number
      const lineWidth = props.lineWidth ? (unref(props.lineWidth) as number) : 1
      const halfLine = lineWidth / 2
      return {
        x: x - radiusX - halfLine,
        y: y - radiusY - halfLine,
        width: radiusX * 2 + lineWidth,
        height: radiusY * 2 + lineWidth
      }
    },

    draw: (ctx: Context2D) => {
      withDrawProps(
        ctx,
        props,
        () => {
          const x = unref(props.x) as number
          const y = unref(props.y) as number
          const radiusX = unref(props.radiusX) as number
          const radiusY = unref(props.radiusY) as number
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
          ctx.ellipse(
            x,
            y,
            radiusX,
            radiusY,
            0,
            startAngle,
            endAngle,
            anticlockwise
          )

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

    on: pointerHandlersFrom(props),

    deps: () => [
      unref(props.x),
      unref(props.y),
      unref(props.radiusX),
      unref(props.radiusY),
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
