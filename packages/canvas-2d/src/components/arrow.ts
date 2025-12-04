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
 * arrow 组件属性
 */
export interface ArrowProps
  extends CommonDrawProps, LineStyleProps, TransformProps {
  points: number[] | Ref<number[]> | ReadonlyRef<number[]> // [x1, y1, x2, y2, ...]
  pointerLength?: number | Ref<number> | ReadonlyRef<number> // 箭头长度
  pointerWidth?: number | Ref<number> | ReadonlyRef<number> // 箭头宽度
  pointerAtBeginning?: boolean | Ref<boolean> | ReadonlyRef<boolean> // 起点箭头
  pointerAtEnding?: boolean | Ref<boolean> | ReadonlyRef<boolean> // 终点箭头
  fill?: string | Ref<string> | ReadonlyRef<string>
  stroke?: string | Ref<string> | ReadonlyRef<string>
  lineWidth?: number | Ref<number> | ReadonlyRef<number>
}

/**
 * arrow 组件 - 绘制带箭头的线条
 */
export const arrow: SyncComponent<CanvasRenderingContext2D, [ArrowProps]> = (
  props: ArrowProps
) => {
  return element({
    getBounds: () => {
      const points = unref(props.points) as number[]
      const lineWidth = props.lineWidth ? (unref(props.lineWidth) as number) : 1
      const pointerLength = props.pointerLength
        ? (unref(props.pointerLength) as number)
        : 10
      const pointerWidth = props.pointerWidth
        ? (unref(props.pointerWidth) as number)
        : 10
      const extra = Math.max(lineWidth / 2, pointerLength, pointerWidth / 2)

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
        x: minX - extra,
        y: minY - extra,
        width: maxX - minX + extra * 2,
        height: maxY - minY + extra * 2
      }
    },

    draw: (ctx) => {
      const points = unref(props.points) as number[]
      const pointerLength = props.pointerLength
        ? (unref(props.pointerLength) as number)
        : 10
      const pointerWidth = props.pointerWidth
        ? (unref(props.pointerWidth) as number)
        : 10
      const pointerAtBeginning = props.pointerAtBeginning
        ? unref(props.pointerAtBeginning)
        : false
      const pointerAtEnding =
        props.pointerAtEnding !== undefined
          ? unref(props.pointerAtEnding)
          : true
      const fill = props.fill ? (unref(props.fill) as string) : undefined
      const stroke = props.stroke ? (unref(props.stroke) as string) : undefined
      const lineWidth = props.lineWidth ? (unref(props.lineWidth) as number) : 1

      if (points.length < 4) return

      // 计算中心点用于变换
      let sumX = 0
      let sumY = 0
      const numPoints = points.length / 2
      for (let i = 0; i < points.length; i += 2) {
        sumX += points[i]
        sumY += points[i + 1]
      }
      const centerX = sumX / numPoints
      const centerY = sumY / numPoints

      const drawArrowHead = (
        fromX: number,
        fromY: number,
        toX: number,
        toY: number
      ) => {
        const angle = Math.atan2(toY - fromY, toX - fromX)
        const tipX = toX
        const tipY = toY
        const baseX = toX - pointerLength * Math.cos(angle)
        const baseY = toY - pointerLength * Math.sin(angle)
        const leftBaseX = baseX - (pointerWidth / 2) * Math.sin(angle)
        const leftBaseY = baseY + (pointerWidth / 2) * Math.cos(angle)
        const rightBaseX = baseX + (pointerWidth / 2) * Math.sin(angle)
        const rightBaseY = baseY - (pointerWidth / 2) * Math.cos(angle)

        ctx.beginPath()
        ctx.moveTo(tipX, tipY)
        ctx.lineTo(leftBaseX, leftBaseY)
        ctx.lineTo(rightBaseX, rightBaseY)
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
      }

      withDrawProps(
        ctx,
        props,
        () => {
          ctx.beginPath()
          ctx.moveTo(points[0], points[1])

          for (let i = 2; i < points.length; i += 2) {
            ctx.lineTo(points[i], points[i + 1])
          }

          if (stroke) {
            ctx.strokeStyle = stroke
            ctx.lineWidth = lineWidth
            ctx.stroke()
          }

          if (pointerAtBeginning && points.length >= 4) {
            drawArrowHead(points[2], points[3], points[0], points[1])
          }

          if (pointerAtEnding && points.length >= 4) {
            const len = points.length
            drawArrowHead(
              points[len - 4],
              points[len - 3],
              points[len - 2],
              points[len - 1]
            )
          }
        },
        {
          transformCenter: { x: centerX, y: centerY }
        }
      )
    },

    deps: () => [
      unref(props.points),
      props.pointerLength ? unref(props.pointerLength) : undefined,
      props.pointerWidth ? unref(props.pointerWidth) : undefined,
      props.pointerAtBeginning ? unref(props.pointerAtBeginning) : undefined,
      props.pointerAtEnding ? unref(props.pointerAtEnding) : undefined,
      props.fill ? unref(props.fill) : undefined,
      props.stroke ? unref(props.stroke) : undefined,
      props.lineWidth ? unref(props.lineWidth) : undefined,
      ...collectDrawPropsDependencies(props)
    ]
  })
}
