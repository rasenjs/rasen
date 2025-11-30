import type { SyncComponent } from '@rasenjs/core'
import type { Ref, ReadonlyRef } from '../types'
import {
  unref,
  type CommonDrawProps,
  type LineStyleProps,
  withDrawProps,
  collectDrawPropsDependencies
} from '../utils'
import { element } from './element'

export interface LineProps
  extends Partial<CommonDrawProps>, Partial<LineStyleProps> {
  x1?: number | Ref<number> | ReadonlyRef<number>
  y1?: number | Ref<number> | ReadonlyRef<number>
  x2?: number | Ref<number> | ReadonlyRef<number>
  y2?: number | Ref<number> | ReadonlyRef<number>
  points?: number[] | Ref<number[]> | ReadonlyRef<number[]>
  closed?: boolean | Ref<boolean> | ReadonlyRef<boolean>
  tension?: number | Ref<number> | ReadonlyRef<number>
  stroke?: string | Ref<string> | ReadonlyRef<string>
  lineWidth?: number | Ref<number> | ReadonlyRef<number>
}

/**
 * line 组件 - 绘制线条
 */
export const line: SyncComponent<CanvasRenderingContext2D, LineProps> = (
  props: LineProps
) => {
  return element({
    getBounds: () => {
      const lineWidth = props.lineWidth ? (unref(props.lineWidth) as number) : 1
      const halfLine = lineWidth / 2
      const points = props.points
        ? (unref(props.points) as number[])
        : undefined

      if (points && points.length >= 4) {
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
      } else {
        const x1 = unref(props.x1) as number
        const y1 = unref(props.y1) as number
        const x2 = unref(props.x2) as number
        const y2 = unref(props.y2) as number
        return {
          x: Math.min(x1, x2) - halfLine,
          y: Math.min(y1, y2) - halfLine,
          width: Math.abs(x2 - x1) + lineWidth,
          height: Math.abs(y2 - y1) + lineWidth
        }
      }
    },

    draw: (ctx) => {
      withDrawProps(ctx, props, () => {
        const stroke = props.stroke
          ? (unref(props.stroke) as string)
          : '#000000'
        const lineWidth = props.lineWidth
          ? (unref(props.lineWidth) as number)
          : 1
        const points = props.points
          ? (unref(props.points) as number[])
          : undefined
        const closed = props.closed ? (unref(props.closed) as boolean) : false
        const tension =
          props.tension !== undefined ? (unref(props.tension) as number) : 0

        ctx.strokeStyle = stroke
        ctx.lineWidth = lineWidth
        ctx.beginPath()

        if (points && points.length >= 4) {
          ctx.moveTo(points[0], points[1])

          if (tension > 0 && points.length >= 6) {
            for (let i = 2; i < points.length - 2; i += 2) {
              const x0 = i === 2 ? points[0] : points[i - 2]
              const y0 = i === 2 ? points[1] : points[i - 1]
              const x1 = points[i]
              const y1 = points[i + 1]
              const x2 = points[i + 2]
              const y2 = points[i + 3]
              const x3 = i + 4 < points.length ? points[i + 4] : points[i + 2]
              const y3 = i + 4 < points.length ? points[i + 5] : points[i + 3]

              const cp1x = x1 + ((x2 - x0) / 6) * tension
              const cp1y = y1 + ((y2 - y0) / 6) * tension
              const cp2x = x2 - ((x3 - x1) / 6) * tension
              const cp2y = y2 - ((y3 - y1) / 6) * tension

              ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2)
            }
          } else {
            for (let i = 2; i < points.length; i += 2) {
              ctx.lineTo(points[i], points[i + 1])
            }
          }

          if (closed) {
            ctx.closePath()
          }
        } else {
          const x1 = unref(props.x1) as number
          const y1 = unref(props.y1) as number
          const x2 = unref(props.x2) as number
          const y2 = unref(props.y2) as number
          ctx.moveTo(x1, y1)
          ctx.lineTo(x2, y2)
        }

        ctx.stroke()
      })
    },

    deps: () => [
      props.x1 !== undefined ? unref(props.x1) : undefined,
      props.y1 !== undefined ? unref(props.y1) : undefined,
      props.x2 !== undefined ? unref(props.x2) : undefined,
      props.y2 !== undefined ? unref(props.y2) : undefined,
      props.points ? unref(props.points) : undefined,
      props.closed ? unref(props.closed) : undefined,
      props.tension ? unref(props.tension) : undefined,
      props.stroke ? unref(props.stroke) : undefined,
      props.lineWidth ? unref(props.lineWidth) : undefined,
      ...collectDrawPropsDependencies(props)
    ]
  })
}
