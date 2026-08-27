import type { Component2D } from '../node'
import type { PropValue } from '../types'
import {
  unref,
  type CommonDrawProps,
  type LineStyleProps,
  type TransformProps,
  withDrawProps,
  collectDrawPropsDependencies,
  calculateFullBounds,
  pointerHandlersFrom,
} from '../utils'
import { createNode, type CanvasNode, type Context2D } from '../node'

/**
 * rect 组件属性
 */
export interface RectProps
  extends CommonDrawProps, LineStyleProps, TransformProps {
  x: PropValue<number>
  y: PropValue<number>
  width: PropValue<number>
  height: PropValue<number>
  fill?: PropValue<string>
  stroke?: PropValue<string>
  lineWidth?: PropValue<number>
  cornerRadius?:
 | PropValue<number | number[]>
}

/**
 * 绘制圆角矩形路径
 */
function drawRoundedRect(
  ctx: Context2D,
  x: number,
  y: number,
  width: number,
  height: number,
  cornerRadius: number | number[]
) {
  const radii = Array.isArray(cornerRadius)
    ? cornerRadius
    : [cornerRadius, cornerRadius, cornerRadius, cornerRadius]

  // 确保半径不超过矩形尺寸的一半
  const maxRadius = Math.min(width, height) / 2
  const [topLeft, topRight, bottomRight, bottomLeft] = radii.map((r) =>
    Math.min(Math.max(0, r), maxRadius)
  )

  ctx.beginPath()
  ctx.moveTo(x + topLeft, y)

  // 上边 + 右上角
  ctx.lineTo(x + width - topRight, y)
  if (topRight > 0) {
    ctx.arcTo(x + width, y, x + width, y + topRight, topRight)
  }

  // 右边 + 右下角
  ctx.lineTo(x + width, y + height - bottomRight)
  if (bottomRight > 0) {
    ctx.arcTo(
      x + width,
      y + height,
      x + width - bottomRight,
      y + height,
      bottomRight
    )
  }

  // 下边 + 左下角
  ctx.lineTo(x + bottomLeft, y + height)
  if (bottomLeft > 0) {
    ctx.arcTo(x, y + height, x, y + height - bottomLeft, bottomLeft)
  }

  // 左边 + 左上角
  ctx.lineTo(x, y + topLeft)
  if (topLeft > 0) {
    ctx.arcTo(x, y, x + topLeft, y, topLeft)
  }

  ctx.closePath()
}

/**
 * rect 组件 - 绘制矩形
 */
export const rect: Component2D<RectProps> = (
  props: RectProps
) => {
  return (node: CanvasNode) => {
    const n = createNode(node, {
    bounds: () => {
      const x = unref(props.x) as number
      const y = unref(props.y) as number
      const width = unref(props.width) as number
      const height = unref(props.height) as number
      const lineWidth = props.stroke
        ? (unref(props.lineWidth) as number) || 1
        : 0
      const halfLineWidth = lineWidth / 2

      // 基础边界（包含描边）
      const baseBounds = {
        x: x - halfLineWidth,
        y: y - halfLineWidth,
        width: width + lineWidth,
        height: height + lineWidth
      }

      // 计算包含所有效果的完整边界（阴影、旋转、缩放等）
      return calculateFullBounds(
        baseBounds,
        props,
        { x: x + width / 2, y: y + height / 2 } // 变换中心点
      )
    },

    draw: (ctx: Context2D) => {
      const x = unref(props.x) as number
      const y = unref(props.y) as number
      const width = unref(props.width) as number
      const height = unref(props.height) as number
      const fill = props.fill ? (unref(props.fill) as string) : undefined
      const stroke = props.stroke ? (unref(props.stroke) as string) : undefined
      const lineWidth = props.lineWidth ? (unref(props.lineWidth) as number) : 1
      const cornerRadius = props.cornerRadius
        ? (unref(props.cornerRadius) as number | number[])
        : undefined

      // 使用 withDrawProps 包装绘制逻辑，自动应用所有样式
      withDrawProps(
        ctx,
        props,
        () => {
          // 如果有圆角，使用路径绘制
          if (cornerRadius !== undefined && cornerRadius !== 0) {
            drawRoundedRect(ctx, x, y, width, height, cornerRadius)

            if (fill) {
              ctx.fillStyle = fill
              ctx.fill()
            }

            if (stroke) {
              ctx.strokeStyle = stroke
              ctx.lineWidth = lineWidth
              ctx.stroke()
            }
          } else {
            // 无圆角，使用原来的fillRect/strokeRect方法
            if (fill) {
              ctx.fillStyle = fill
              ctx.fillRect(x, y, width, height)
            }

            if (stroke) {
              ctx.strokeStyle = stroke
              ctx.lineWidth = lineWidth
              ctx.strokeRect(x, y, width, height)
            }
          }
        },
        {
          transformCenter: { x: x + width / 2, y: y + height / 2 }
        }
      )
    },

    hit: (px: number, py: number) => {
      const x = unref(props.x) as number
      const y = unref(props.y) as number
      const width = unref(props.width) as number
      const height = unref(props.height) as number
      return px >= x && px <= x + width && py >= y && py <= y + height
    },

    on: pointerHandlersFrom(props),

    deps: () => [
      unref(props.x),
      unref(props.y),
      unref(props.width),
      unref(props.height),
      props.fill ? unref(props.fill) : undefined,
      props.stroke ? unref(props.stroke) : undefined,
      props.lineWidth ? unref(props.lineWidth) : undefined,
      props.cornerRadius ? unref(props.cornerRadius) : undefined,
      ...collectDrawPropsDependencies(props)
    ]
    })
    return () => n.remove()
  }
}
