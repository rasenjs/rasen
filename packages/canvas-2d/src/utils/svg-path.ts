import { unref } from './ref'
import type { PathPoint } from '../components/path'

/**
 * SVG路径点类型,用于内部处理
 * 扩展PathPoint,增加曲线类型标识
 */
interface SVGPathPoint extends PathPoint {
  curveType?: 'quadratic' // 二次贝塞尔曲线标记
}

/**
 * 解析 SVG 路径命令
 */
function parseSVGPath(data: string): Array<{ cmd: string; args: number[] }> {
  const commands: Array<{ cmd: string; args: number[] }> = []
  const regex = /([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(data)) !== null) {
    const cmd = match[1]
    const argsStr = match[2].trim()
    const args: number[] = []

    if (argsStr) {
      const numRegex = /-?\d+\.?\d*(?:e[+-]?\d+)?/g
      let numMatch: RegExpExecArray | null
      while ((numMatch = numRegex.exec(argsStr)) !== null) {
        args.push(parseFloat(numMatch[0]))
      }
    }

    commands.push({ cmd, args })
  }

  return commands
}

/**
 * 将SVG路径数据转换为PathPoint数组
 *
 * @param data SVG路径字符串,如 "M 10 10 L 50 50 C 70 70 90 90 100 100 Z"
 * @returns 包含points和closed标志的对象
 *
 * @example
 * ```ts
 * const { points, closed } = svgPathToPoints('M 10 10 L 50 50 Q 70 30 90 50 Z')
 * path({ points, closed, fill: 'blue' })
 * ```
 */
export function svgPathToPoints(data: string): {
  points: SVGPathPoint[]
  closed: boolean
} {
  const commands = parseSVGPath(data)
  const points: SVGPathPoint[] = []
  let closed = false

  let currentX = 0
  let currentY = 0

  for (const { cmd, args } of commands) {
    switch (cmd) {
      case 'M': // moveTo (absolute)
      case 'm': {
        // moveTo (relative)
        const x = cmd === 'M' ? args[0] : currentX + args[0]
        const y = cmd === 'M' ? args[1] : currentY + args[1]
        points.push({ x, y })
        currentX = x
        currentY = y
        break
      }
      case 'L': // lineTo (absolute)
      case 'l': {
        // lineTo (relative)
        const x = cmd === 'L' ? args[0] : currentX + args[0]
        const y = cmd === 'L' ? args[1] : currentY + args[1]
        points.push({ x, y })
        currentX = x
        currentY = y
        break
      }
      case 'C': // cubic Bezier (absolute)
      case 'c': {
        // cubic Bezier (relative)
        const cp1x = cmd === 'C' ? args[0] : currentX + args[0]
        const cp1y = cmd === 'C' ? args[1] : currentY + args[1]
        const cp2x = cmd === 'C' ? args[2] : currentX + args[2]
        const cp2y = cmd === 'C' ? args[3] : currentY + args[3]
        const x = cmd === 'C' ? args[4] : currentX + args[4]
        const y = cmd === 'C' ? args[5] : currentY + args[5]

        // 设置前一个点的出手柄
        if (points.length > 0) {
          const prevSeg = points[points.length - 1]
          const px =
            typeof prevSeg.x === 'number' ? prevSeg.x : unref(prevSeg.x)
          const py =
            typeof prevSeg.y === 'number' ? prevSeg.y : unref(prevSeg.y)
          prevSeg.handleOut = { x: cp1x - px, y: cp1y - py }
        }

        // 添加新点,带入手柄
        points.push({
          x,
          y,
          handleIn: { x: cp2x - x, y: cp2y - y }
        })

        currentX = x
        currentY = y
        break
      }
      case 'Q': // quadratic Bezier (absolute)
      case 'q': {
        // quadratic Bezier (relative)
        const cpx = cmd === 'Q' ? args[0] : currentX + args[0]
        const cpy = cmd === 'Q' ? args[1] : currentY + args[1]
        const x = cmd === 'Q' ? args[2] : currentX + args[2]
        const y = cmd === 'Q' ? args[3] : currentY + args[3]

        // 保留二次贝塞尔曲线信息
        if (points.length > 0) {
          const prevSeg = points[points.length - 1]
          const px =
            typeof prevSeg.x === 'number' ? prevSeg.x : unref(prevSeg.x)
          const py =
            typeof prevSeg.y === 'number' ? prevSeg.y : unref(prevSeg.y)
          prevSeg.handleOut = {
            x: cpx - px,
            y: cpy - py
          }
        }

        // 二次贝塞尔曲线只有一个控制点，不需要设置 handleIn
        points.push({
          x,
          y,
          curveType: 'quadratic' // 标记为二次贝塞尔
        })

        currentX = x
        currentY = y
        break
      }
      case 'S': // smooth cubic Bezier (absolute)
      case 's': {
        // smooth cubic Bezier (relative)
        // S命令的第一个控制点是前一个点的控制点关于当前点的镜像
        let cp1x = currentX
        let cp1y = currentY
        
        // 如果前一个点有handleOut，计算镜像点
        if (points.length > 0) {
          const prevSeg = points[points.length - 1]
          if (prevSeg.handleOut) {
            const prevHandleOut = typeof prevSeg.handleOut === 'object' && 'x' in prevSeg.handleOut
              ? prevSeg.handleOut
              : unref(prevSeg.handleOut)
            // 镜像：cp1 = current - (handleOut)
            cp1x = currentX - prevHandleOut.x
            cp1y = currentY - prevHandleOut.y
          }
        }
        
        const cp2x = cmd === 'S' ? args[0] : currentX + args[0]
        const cp2y = cmd === 'S' ? args[1] : currentY + args[1]
        const x = cmd === 'S' ? args[2] : currentX + args[2]
        const y = cmd === 'S' ? args[3] : currentY + args[3]

        // 设置前一个点的出手柄
        if (points.length > 0) {
          const prevSeg = points[points.length - 1]
          const px = typeof prevSeg.x === 'number' ? prevSeg.x : unref(prevSeg.x)
          const py = typeof prevSeg.y === 'number' ? prevSeg.y : unref(prevSeg.y)
          prevSeg.handleOut = { x: cp1x - px, y: cp1y - py }
        }

        // 添加新点，带入手柄
        points.push({
          x,
          y,
          handleIn: { x: cp2x - x, y: cp2y - y }
        })

        currentX = x
        currentY = y
        break
      }
      case 'Z': // closePath
      case 'z': {
        closed = true
        break
      }
    }
  }

  return { points, closed }
}
