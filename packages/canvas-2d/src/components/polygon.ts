import type { SyncComponent } from '@rasenjs/core'
import type { Ref, ReadonlyRef } from '../types'
import {
  unref,
  type CommonDrawProps,
  type LineStyleProps,
  type TransformProps,
  withDrawProps,
  collectDrawPropsDependencies
} from '../utils'
import { element } from './element'

/**
 * polygon 组件属性
 */
export interface PolygonProps
  extends CommonDrawProps, LineStyleProps, TransformProps {
  // 自定义多边形: 点数组 [x1, y1, x2, y2, ...]
  points?: number[] | Ref<number[]> | ReadonlyRef<number[]>
  // 正多边形: 中心点、边数和半径
  x?: number | Ref<number> | ReadonlyRef<number>
  y?: number | Ref<number> | ReadonlyRef<number>
  sides?: number | Ref<number> | ReadonlyRef<number>
  radius?: number | Ref<number> | ReadonlyRef<number>
  // 通用属性
  fill?: string | Ref<string> | ReadonlyRef<string>
  stroke?: string | Ref<string> | ReadonlyRef<string>
  lineWidth?: number | Ref<number> | ReadonlyRef<number>
  closed?: boolean | Ref<boolean> | ReadonlyRef<boolean> // 是否闭合
  cornerRadius?: number | Ref<number> | ReadonlyRef<number> // 圆角半径
}

/**
 * 计算多边形的点数组
 */
function calculatePoints(props: PolygonProps): {
  points: number[]
  centerX: number
  centerY: number
} {
  let centerX = 0
  let centerY = 0
  let points: number[] = []

  if (props.sides !== undefined && props.radius !== undefined) {
    const x = (unref(props.x) as number) || 0
    const y = (unref(props.y) as number) || 0
    const sides = unref(props.sides) as number
    const radius = unref(props.radius) as number

    centerX = x
    centerY = y

    points = []
    for (let i = 0; i < sides; i++) {
      const angle = (i * 2 * Math.PI) / sides - Math.PI / 2
      points.push(x + radius * Math.cos(angle))
      points.push(y + radius * Math.sin(angle))
    }
  } else if (props.points) {
    points = unref(props.points) as number[]
    if (points.length >= 2) {
      let sumX = 0
      let sumY = 0
      const numPoints = points.length / 2
      for (let i = 0; i < points.length; i += 2) {
        sumX += points[i]
        sumY += points[i + 1]
      }
      centerX = sumX / numPoints
      centerY = sumY / numPoints
    }
  }

  return { points, centerX, centerY }
}

/**
 * polygon 组件 - 绘制多边形
 * 支持自定义多边形（通过points）和正多边形（通过sides和radius）
 */
export const polygon: SyncComponent<CanvasRenderingContext2D, PolygonProps> = (
  props: PolygonProps
) => {
  return element({
    getBounds: () => {
      const { points } = calculatePoints(props)
      const lineWidth = props.lineWidth ? (unref(props.lineWidth) as number) : 1
      const halfLine = lineWidth / 2

      if (points.length < 4) {
        return { x: 0, y: 0, width: 0, height: 0 }
      }

      let minX = points[0],
        maxX = points[0]
      let minY = points[1],
        maxY = points[1]
      for (let i = 2; i < points.length; i += 2) {
        minX = Math.min(minX, points[i])
        maxX = Math.max(maxX, points[i])
        minY = Math.min(minY, points[i + 1])
        maxY = Math.max(maxY, points[i + 1])
      }

      return {
        x: minX - halfLine,
        y: minY - halfLine,
        width: maxX - minX + lineWidth,
        height: maxY - minY + lineWidth
      }
    },

    draw: (ctx) => {
      const fill = props.fill ? (unref(props.fill) as string) : undefined
      const stroke = props.stroke ? (unref(props.stroke) as string) : undefined
      const lineWidth = props.lineWidth ? (unref(props.lineWidth) as number) : 1
      const closed = props.closed !== undefined ? unref(props.closed) : true
      const cornerRadius = props.cornerRadius
        ? (unref(props.cornerRadius) as number)
        : 0

      const { points, centerX, centerY } = calculatePoints(props)

      if (points.length < 4) return

      withDrawProps(
        ctx,
        props,
        () => {
          ctx.beginPath()

          if (cornerRadius > 0 && closed) {
            const numPoints = points.length / 2

            for (let i = 0; i < numPoints; i++) {
              const x0 =
                i === 0 ? points[(numPoints - 1) * 2] : points[(i - 1) * 2]
              const y0 =
                i === 0
                  ? points[(numPoints - 1) * 2 + 1]
                  : points[(i - 1) * 2 + 1]
              const x1 = points[i * 2]
              const y1 = points[i * 2 + 1]
              const x2 = points[((i + 1) % numPoints) * 2]
              const y2 = points[((i + 1) % numPoints) * 2 + 1]

              const dx1 = x1 - x0
              const dy1 = y1 - y0
              const dx2 = x2 - x1
              const dy2 = y2 - y1

              const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1)
              const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2)

              const offset1 = Math.min(cornerRadius, len1 / 2)
              const offset2 = Math.min(cornerRadius, len2 / 2)

              const sx = x1 - (dx1 / len1) * offset1
              const sy = y1 - (dy1 / len1) * offset1
              const ex = x1 + (dx2 / len2) * offset2
              const ey = y1 + (dy2 / len2) * offset2

              if (i === 0) {
                ctx.moveTo(sx, sy)
              } else {
                ctx.lineTo(sx, sy)
              }

              ctx.arcTo(x1, y1, ex, ey, cornerRadius)
            }

            ctx.closePath()
          } else {
            ctx.moveTo(points[0], points[1])

            for (let i = 2; i < points.length; i += 2) {
              ctx.lineTo(points[i], points[i + 1])
            }

            if (closed) {
              ctx.closePath()
            }
          }

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
          transformCenter: { x: centerX, y: centerY }
        }
      )
    },

    deps: () => [
      props.points ? unref(props.points) : undefined,
      props.x ? unref(props.x) : undefined,
      props.y ? unref(props.y) : undefined,
      props.sides ? unref(props.sides) : undefined,
      props.radius ? unref(props.radius) : undefined,
      props.fill ? unref(props.fill) : undefined,
      props.stroke ? unref(props.stroke) : undefined,
      props.lineWidth ? unref(props.lineWidth) : undefined,
      props.closed !== undefined ? unref(props.closed) : undefined,
      props.cornerRadius ? unref(props.cornerRadius) : undefined,
      ...collectDrawPropsDependencies(props)
    ]
  })
}
