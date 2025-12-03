import type { Mountable } from '@rasenjs/core'
import type { Ref, ReadonlyRef } from '../types'
import {
  unref,
  type CommonDrawProps,
  type LineStyleProps,
  withDrawProps,
  collectDrawPropsDependencies,
  svgPathToPoints
} from '../utils'
import { element } from './element'

/**
 * 路径点 - 类似设计工具(Figma/Sketch)的路径点
 * 每个点包含位置和两个控制手柄(可选)
 */
export interface PathPoint {
  // 点的位置
  x: number | Ref<number> | ReadonlyRef<number>
  y: number | Ref<number> | ReadonlyRef<number>
  // 入手柄(相对于点的偏移)
  handleIn?:
    | { x: number; y: number }
    | Ref<{ x: number; y: number }>
    | ReadonlyRef<{ x: number; y: number }>
  // 出手柄(相对于点的偏移)
  handleOut?:
    | { x: number; y: number }
    | Ref<{ x: number; y: number }>
    | ReadonlyRef<{ x: number; y: number }>
}

export interface PathProps
  extends Partial<CommonDrawProps>, Partial<LineStyleProps> {
  // 方式1: 直接传入points数组(响应式数据)
  points?: PathPoint[] | Ref<PathPoint[]> | ReadonlyRef<PathPoint[]>
  // 方式2: 使用SVG路径数据(会被转换成points)
  data?: string | Ref<string> | ReadonlyRef<string>
  // 方式3: 使用子组件(point组件,会收集成points数组)
  children?: Array<Mountable<CanvasRenderingContext2D>>
  stroke?: string | Ref<string> | ReadonlyRef<string>
  fill?: string | Ref<string> | ReadonlyRef<string>
  lineWidth?: number | Ref<number> | ReadonlyRef<number>
  closed?: boolean | Ref<boolean> | ReadonlyRef<boolean>
}

/**
 * Point组件的上下文 - 用于收集子point
 */
interface PathContext {
  points: PathPoint[]
}

let currentPathContext: PathContext | null = null

/**
 * point 组件 - 定义路径中的一个点
 */
export const point = (
  props: PathPoint
): Mountable<CanvasRenderingContext2D> => {
  return () => {
    // 将point添加到当前path上下文
    if (currentPathContext) {
      currentPathContext.points.push(props)
    }
    return undefined
  }
}

/**
 * 渲染points到canvas
 */
function renderPoints(
  ctx: CanvasRenderingContext2D,
  points: PathPoint[],
  closed: boolean
) {
  if (points.length === 0) return

  const firstSeg = points[0]
  const firstX = typeof firstSeg.x === 'number' ? firstSeg.x : unref(firstSeg.x)
  const firstY = typeof firstSeg.y === 'number' ? firstSeg.y : unref(firstSeg.y)

  ctx.moveTo(firstX, firstY)

  // 绘制路径
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i] as PathPoint & { curveType?: 'quadratic' }

    const prevX = typeof prev.x === 'number' ? prev.x : unref(prev.x)
    const prevY = typeof prev.y === 'number' ? prev.y : unref(prev.y)
    const currX = typeof curr.x === 'number' ? curr.x : unref(curr.x)
    const currY = typeof curr.y === 'number' ? curr.y : unref(curr.y)

    const prevHandleOut = prev.handleOut ? unref(prev.handleOut) : null
    const currHandleIn = curr.handleIn ? unref(curr.handleIn) : null

    // 检查是否为二次贝塞尔曲线(从SVG Q命令转换来的)
    if (curr.curveType === 'quadratic' && prevHandleOut) {
      // 二次贝塞尔曲线: 控制点在前一个点的handleOut中
      const cpx = prevX + prevHandleOut.x
      const cpy = prevY + prevHandleOut.y
      ctx.quadraticCurveTo(cpx, cpy, currX, currY)
    }
    // 如果前一个点有出手柄或当前点有入手柄,使用三次贝塞尔曲线
    else if (prevHandleOut || currHandleIn) {
      const cp1x = prevX + (prevHandleOut?.x || 0)
      const cp1y = prevY + (prevHandleOut?.y || 0)
      const cp2x = currX + (currHandleIn?.x || 0)
      const cp2y = currY + (currHandleIn?.y || 0)

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, currX, currY)
    } else {
      // 否则使用直线
      ctx.lineTo(currX, currY)
    }
  }

  // 如果是闭合路径,连接最后一个点到第一个点
  if (closed && points.length > 1) {
    const last = points[points.length - 1]
    const first = points[0]

    const lastX = typeof last.x === 'number' ? last.x : unref(last.x)
    const lastY = typeof last.y === 'number' ? last.y : unref(last.y)

    const lastHandleOut = last.handleOut ? unref(last.handleOut) : null
    const firstHandleIn = first.handleIn ? unref(first.handleIn) : null

    if (lastHandleOut || firstHandleIn) {
      const cp1x = lastX + (lastHandleOut?.x || 0)
      const cp1y = lastY + (lastHandleOut?.y || 0)
      const cp2x = firstX + (firstHandleIn?.x || 0)
      const cp2y = firstY + (firstHandleIn?.y || 0)

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, firstX, firstY)
    }

    ctx.closePath()
  }
}

/**
 * 计算路径的边界
 */
function calculatePathBounds(points: PathPoint[]): {
  x: number
  y: number
  width: number
  height: number
} {
  if (points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  const firstX =
    typeof points[0].x === 'number' ? points[0].x : unref(points[0].x)
  const firstY =
    typeof points[0].y === 'number' ? points[0].y : unref(points[0].y)

  let minX = firstX,
    maxX = firstX
  let minY = firstY,
    maxY = firstY

  for (let i = 1; i < points.length; i++) {
    const px =
      typeof points[i].x === 'number' ? points[i].x : unref(points[i].x)
    const py =
      typeof points[i].y === 'number' ? points[i].y : unref(points[i].y)
    minX = Math.min(minX, px as number)
    maxX = Math.max(maxX, px as number)
    minY = Math.min(minY, py as number)
    maxY = Math.max(maxY, py as number)
  }

  return {
    x: minX as number,
    y: minY as number,
    width: (maxX as number) - (minX as number),
    height: (maxY as number) - (minY as number)
  }
}

/**
 * path 组件 - 绘制路径
 * 支持三种方式:
 * 1. segments数组(响应式数据)
 * 2. SVG路径字符串(转换成segments)
 * 3. 子segment组件(收集成segments)
 */
export const path = (
  props: PathProps
): Mountable<CanvasRenderingContext2D> => {
  // 在 setup 阶段预先收集 children 的数据
  let collectedChildPoints: PathPoint[] | null = null
  if (props.children) {
    const pathContext: PathContext = { points: [] }
    currentPathContext = pathContext
    // 模拟 mount 阶段收集点
    // 注意：这里需要一个临时的 ctx，但 point 组件只是收集数据，不需要真正的 ctx
    for (const child of props.children) {
      // point 组件的 setup 返回 mount，mount 执行时收集点
      child(null as unknown as CanvasRenderingContext2D)
    }
    collectedChildPoints = pathContext.points
    currentPathContext = null
  }

  return element({
    getBounds: () => {
      const lineWidth = props.lineWidth ? (unref(props.lineWidth) as number) : 1
      const halfLine = lineWidth / 2

      let points: PathPoint[] = []
      if (props.points) {
        points = unref(props.points) as PathPoint[]
      } else if (collectedChildPoints) {
        points = collectedChildPoints
      } else if (props.data) {
        const data = unref(props.data) as string
        const result = svgPathToPoints(data)
        points = result.points as PathPoint[]
      }

      const bounds = calculatePathBounds(points)
      return {
        x: bounds.x - halfLine,
        y: bounds.y - halfLine,
        width: bounds.width + lineWidth,
        height: bounds.height + lineWidth
      }
    },

    draw: (ctx) => {
      withDrawProps(ctx, props, () => {
        const stroke = props.stroke
          ? (unref(props.stroke) as string)
          : undefined
        const fill = props.fill ? (unref(props.fill) as string) : undefined
        const lineWidth = props.lineWidth
          ? (unref(props.lineWidth) as number)
          : 1
        const closed = props.closed !== undefined ? unref(props.closed) : false

        ctx.beginPath()

        let points: PathPoint[] = []
        let shouldClose = closed

        if (props.points) {
          points = unref(props.points) as PathPoint[]
        } else if (collectedChildPoints) {
          points = collectedChildPoints
        } else if (props.data) {
          const data = unref(props.data) as string
          const result = svgPathToPoints(data)
          points = result.points as PathPoint[]
          shouldClose = result.closed
        }

        renderPoints(ctx, points, shouldClose)

        if (fill) {
          ctx.fillStyle = fill
          ctx.fill()
        }

        if (stroke) {
          ctx.strokeStyle = stroke
          ctx.lineWidth = lineWidth
          ctx.stroke()
        }
      })
    },

    deps: () => [
      props.points ? unref(props.points) : undefined,
      props.data ? unref(props.data) : undefined,
      props.stroke ? unref(props.stroke) : undefined,
      props.fill ? unref(props.fill) : undefined,
      props.lineWidth ? unref(props.lineWidth) : undefined,
      props.closed ? unref(props.closed) : undefined,
      ...collectDrawPropsDependencies(props)
    ]
  })
}
