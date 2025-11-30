import { unref as unrefUtil } from './ref'
import type { CommonDrawProps, TransformProps } from './draw'

/**
 * 计算包含变换和效果的完整边界框
 *
 * @param baseBounds 基础边界（未经变换的边界）
 * @param props 绘图属性
 * @param transformCenter 变换中心点
 * @returns 完整边界框（包含阴影、旋转、缩放等效果）
 */
export function calculateFullBounds(
  baseBounds: {
    x: number
    y: number
    width: number
    height: number
  },
  props: Partial<CommonDrawProps & TransformProps>,
  transformCenter?: { x: number; y: number }
): {
  x: number
  y: number
  width: number
  height: number
} {
  let { x, y, width, height } = baseBounds

  // 1. 考虑变换（rotation, scale）
  if (props.rotation || props.scaleX || props.scaleY) {
    const center = transformCenter || { x: x + width / 2, y: y + height / 2 }
    const rotation = props.rotation ? (unrefUtil(props.rotation) as number) : 0
    const scaleX = props.scaleX ? (unrefUtil(props.scaleX) as number) : 1
    const scaleY = props.scaleY ? (unrefUtil(props.scaleY) as number) : 1

    // 计算矩形的四个角相对于中心点的坐标
    const corners = [
      { x: x - center.x, y: y - center.y },
      { x: x + width - center.x, y: y - center.y },
      { x: x + width - center.x, y: y + height - center.y },
      { x: x - center.x, y: y + height - center.y }
    ]

    // 应用缩放和旋转
    const transformedCorners = corners.map((corner) => {
      // 先缩放
      const scaledX = corner.x * scaleX
      const scaledY = corner.y * scaleY

      // 再旋转
      const cos = Math.cos(rotation)
      const sin = Math.sin(rotation)
      const rotatedX = scaledX * cos - scaledY * sin
      const rotatedY = scaledX * sin + scaledY * cos

      // 转回全局坐标
      return {
        x: rotatedX + center.x,
        y: rotatedY + center.y
      }
    })

    // 找到变换后的边界框
    const xs = transformedCorners.map((c) => c.x)
    const ys = transformedCorners.map((c) => c.y)

    x = Math.min(...xs)
    y = Math.min(...ys)
    const maxX = Math.max(...xs)
    const maxY = Math.max(...ys)
    width = maxX - x
    height = maxY - y
  }

  // 2. 考虑平移
  if (props.translateX || props.translateY) {
    const tx = props.translateX ? (unrefUtil(props.translateX) as number) : 0
    const ty = props.translateY ? (unrefUtil(props.translateY) as number) : 0
    x += tx
    y += ty
  }

  // 3. 考虑阴影
  if (props.shadowBlur || props.shadowOffsetX || props.shadowOffsetY) {
    const shadowBlur = props.shadowBlur
      ? (unrefUtil(props.shadowBlur) as number)
      : 0
    const shadowOffsetX = props.shadowOffsetX
      ? (unrefUtil(props.shadowOffsetX) as number)
      : 0
    const shadowOffsetY = props.shadowOffsetY
      ? (unrefUtil(props.shadowOffsetY) as number)
      : 0

    // 阴影模糊会向四周扩展，大约是 blur * 2
    const shadowExpand = shadowBlur * 2

    // 计算阴影的边界
    const shadowX = x + shadowOffsetX - shadowExpand
    const shadowY = y + shadowOffsetY - shadowExpand
    const shadowMaxX = x + width + shadowOffsetX + shadowExpand
    const shadowMaxY = y + height + shadowOffsetY + shadowExpand

    // 合并原始边界和阴影边界
    const minX = Math.min(x, shadowX)
    const minY = Math.min(y, shadowY)
    const maxX = Math.max(x + width, shadowMaxX)
    const maxY = Math.max(y + height, shadowMaxY)

    x = minX
    y = minY
    width = maxX - minX
    height = maxY - minY
  }

  return { x, y, width, height }
}
