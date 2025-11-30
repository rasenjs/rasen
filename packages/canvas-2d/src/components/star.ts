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

export interface StarProps
  extends
    Partial<CommonDrawProps>,
    Partial<LineStyleProps>,
    Partial<TransformProps> {
  x: number | Ref<number> | ReadonlyRef<number>
  y: number | Ref<number> | ReadonlyRef<number>
  numPoints: number | Ref<number> | ReadonlyRef<number>
  innerRadius: number | Ref<number> | ReadonlyRef<number>
  outerRadius: number | Ref<number> | ReadonlyRef<number>
  fill?: string | Ref<string> | ReadonlyRef<string>
  stroke?: string | Ref<string> | ReadonlyRef<string>
  lineWidth?: number | Ref<number> | ReadonlyRef<number>
}

/**
 * star 组件 - 绘制星形
 * 根据角数、内外半径生成星形路径
 */
export const star: SyncComponent<CanvasRenderingContext2D, StarProps> = (
  props: StarProps
) => {
  return element({
    getBounds: () => {
      const x = unref(props.x) as number
      const y = unref(props.y) as number
      const outerRadius = unref(props.outerRadius) as number
      const lineWidth = props.lineWidth ? (unref(props.lineWidth) as number) : 1
      const halfLine = lineWidth / 2
      return {
        x: x - outerRadius - halfLine,
        y: y - outerRadius - halfLine,
        width: outerRadius * 2 + lineWidth,
        height: outerRadius * 2 + lineWidth
      }
    },

    draw: (ctx) => {
      withDrawProps(
        ctx,
        props,
        () => {
          const x = unref(props.x) as number
          const y = unref(props.y) as number
          const numPoints = unref(props.numPoints) as number
          const innerRadius = unref(props.innerRadius) as number
          const outerRadius = unref(props.outerRadius) as number
          const fill = props.fill ? (unref(props.fill) as string) : undefined
          const stroke = props.stroke
            ? (unref(props.stroke) as string)
            : undefined
          const lineWidth = props.lineWidth
            ? (unref(props.lineWidth) as number)
            : 1

          ctx.beginPath()

          const step = Math.PI / numPoints
          let angle = -Math.PI / 2

          ctx.moveTo(
            x + outerRadius * Math.cos(angle),
            y + outerRadius * Math.sin(angle)
          )

          for (let i = 0; i < numPoints * 2; i++) {
            angle += step
            const radius = i % 2 === 0 ? innerRadius : outerRadius
            ctx.lineTo(
              x + radius * Math.cos(angle),
              y + radius * Math.sin(angle)
            )
          }

          ctx.closePath()

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

    deps: () => [
      unref(props.x),
      unref(props.y),
      unref(props.numPoints),
      unref(props.innerRadius),
      unref(props.outerRadius),
      props.fill ? unref(props.fill) : undefined,
      props.stroke ? unref(props.stroke) : undefined,
      props.lineWidth ? unref(props.lineWidth) : undefined,
      ...collectDrawPropsDependencies(props)
    ]
  })
}
