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
 * wedge 组件属性
 */
export interface WedgeProps
  extends CommonDrawProps, LineStyleProps, TransformProps {
  x: number | Ref<number> | ReadonlyRef<number>
  y: number | Ref<number> | ReadonlyRef<number>
  radius: number | Ref<number> | ReadonlyRef<number>
  angle: number | Ref<number> | ReadonlyRef<number> // 角度（度数）
  rotation?: number | Ref<number> | ReadonlyRef<number> // 旋转角度（弧度）
  fill?: string | Ref<string> | ReadonlyRef<string>
  stroke?: string | Ref<string> | ReadonlyRef<string>
  lineWidth?: number | Ref<number> | ReadonlyRef<number>
}

/**
 * wedge 组件 - 绘制楔形（扇形）
 * 类似于 arc，但从中心点开始绘制完整的扇形
 */
export const wedge: SyncComponent<CanvasRenderingContext2D, WedgeProps> = (
  props: WedgeProps
) => {
  return element({
    getBounds: () => {
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

    draw: (ctx) => {
      const x = unref(props.x) as number
      const y = unref(props.y) as number
      const radius = unref(props.radius) as number
      const angleDegrees = unref(props.angle) as number
      const fill = props.fill ? (unref(props.fill) as string) : undefined
      const stroke = props.stroke ? (unref(props.stroke) as string) : undefined
      const lineWidth = props.lineWidth ? (unref(props.lineWidth) as number) : 1

      // 将角度从度数转换为弧度
      const angleRadians = (angleDegrees * Math.PI) / 180

      withDrawProps(
        ctx,
        props,
        () => {
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.arc(x, y, radius, 0, angleRadians, false)
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
          transformCenter: { x, y }
        }
      )
    },

    deps: () => [
      unref(props.x),
      unref(props.y),
      unref(props.radius),
      unref(props.angle),
      props.fill ? unref(props.fill) : undefined,
      props.stroke ? unref(props.stroke) : undefined,
      props.lineWidth ? unref(props.lineWidth) : undefined,
      ...collectDrawPropsDependencies(props)
    ]
  })
}
