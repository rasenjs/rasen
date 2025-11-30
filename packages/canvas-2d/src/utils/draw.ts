import type { Ref, ReadonlyRef } from '../types'
import { unref } from './ref'

/**
 * 通用绘图属性
 */
export interface CommonDrawProps {
  // 阴影属性
  shadowColor?: string | Ref<string> | ReadonlyRef<string>
  shadowBlur?: number | Ref<number> | ReadonlyRef<number>
  shadowOffsetX?: number | Ref<number> | ReadonlyRef<number>
  shadowOffsetY?: number | Ref<number> | ReadonlyRef<number>
  // 透明度
  opacity?: number | Ref<number> | ReadonlyRef<number>
  // 合成模式
  globalCompositeOperation?: string | Ref<string> | ReadonlyRef<string>
}

/**
 * 线条样式属性
 */
export interface LineStyleProps {
  // 虚线
  lineDash?: number[] | Ref<number[]> | ReadonlyRef<number[]>
  lineDashOffset?: number | Ref<number> | ReadonlyRef<number>
  // 线帽样式
  lineCap?: CanvasLineCap | Ref<CanvasLineCap> | ReadonlyRef<CanvasLineCap>
  // 线连接样式
  lineJoin?: CanvasLineJoin | Ref<CanvasLineJoin> | ReadonlyRef<CanvasLineJoin>
  miterLimit?: number | Ref<number> | ReadonlyRef<number>
}

/**
 * 变换属性
 */
export interface TransformProps {
  // 旋转（弧度）
  rotation?: number | Ref<number> | ReadonlyRef<number>
  // 缩放
  scaleX?: number | Ref<number> | ReadonlyRef<number>
  scaleY?: number | Ref<number> | ReadonlyRef<number>
  // 倾斜（弧度）
  skewX?: number | Ref<number> | ReadonlyRef<number>
  skewY?: number | Ref<number> | ReadonlyRef<number>
  // 平移（在旋转/缩放之前应用）
  translateX?: number | Ref<number> | ReadonlyRef<number>
  translateY?: number | Ref<number> | ReadonlyRef<number>
  // 变换原点偏移（相对于形状中心）
  offsetX?: number | Ref<number> | ReadonlyRef<number>
  offsetY?: number | Ref<number> | ReadonlyRef<number>
}

/**
 * 应用通用绘图属性到 Canvas 上下文
 *
 * @param ctx Canvas 上下文
 * @param props 属性对象
 * @returns 是否应用了任何属性（需要 save/restore）
 */
export function applyCommonDrawProps(
  ctx: CanvasRenderingContext2D,
  props: CommonDrawProps
): boolean {
  let applied = false

  // 应用阴影
  if (props.shadowColor !== undefined) {
    ctx.shadowColor = unref(props.shadowColor)
    ctx.shadowBlur =
      props.shadowBlur !== undefined ? unref(props.shadowBlur) : 0
    ctx.shadowOffsetX =
      props.shadowOffsetX !== undefined ? unref(props.shadowOffsetX) : 0
    ctx.shadowOffsetY =
      props.shadowOffsetY !== undefined ? unref(props.shadowOffsetY) : 0
    applied = true
  }

  // 应用透明度
  if (props.opacity !== undefined) {
    ctx.globalAlpha = unref(props.opacity)
    applied = true
  }

  // 应用合成模式
  if (props.globalCompositeOperation !== undefined) {
    ctx.globalCompositeOperation = unref(
      props.globalCompositeOperation
    ) as GlobalCompositeOperation
    applied = true
  }

  return applied
}

/**
 * 应用线条样式属性到 Canvas 上下文
 *
 * @param ctx Canvas 上下文
 * @param props 属性对象
 * @returns 是否应用了任何属性（需要 save/restore）
 */
export function applyLineStyleProps(
  ctx: CanvasRenderingContext2D,
  props: LineStyleProps
): boolean {
  let applied = false

  // 应用虚线
  if (props.lineDash !== undefined) {
    ctx.setLineDash(unref(props.lineDash))
    applied = true
  }

  if (props.lineDashOffset !== undefined) {
    ctx.lineDashOffset = unref(props.lineDashOffset)
    applied = true
  }

  // 应用线帽样式
  if (props.lineCap !== undefined) {
    ctx.lineCap = unref(props.lineCap)
    applied = true
  }

  // 应用线连接样式
  if (props.lineJoin !== undefined) {
    ctx.lineJoin = unref(props.lineJoin)
    applied = true
  }

  if (props.miterLimit !== undefined) {
    ctx.miterLimit = unref(props.miterLimit)
    applied = true
  }

  return applied
}

/**
 * 应用变换属性到 Canvas 上下文
 *
 * @param ctx Canvas 上下文
 * @param props 属性对象
 * @param centerX 变换中心点 X（用于旋转和缩放）
 * @param centerY 变换中心点 Y（用于旋转和缩放）
 * @returns 是否应用了任何变换（需要 save/restore）
 */
export function applyTransformProps(
  ctx: CanvasRenderingContext2D,
  props: TransformProps,
  centerX = 0,
  centerY = 0
): boolean {
  let applied = false

  // 计算实际变换中心点（考虑offset）
  const offsetX =
    props.offsetX !== undefined ? (unref(props.offsetX) as number) : 0
  const offsetY =
    props.offsetY !== undefined ? (unref(props.offsetY) as number) : 0
  const actualCenterX = centerX + offsetX
  const actualCenterY = centerY + offsetY

  // 应用平移
  if (props.translateX !== undefined || props.translateY !== undefined) {
    const tx =
      props.translateX !== undefined ? (unref(props.translateX) as number) : 0
    const ty =
      props.translateY !== undefined ? (unref(props.translateY) as number) : 0
    ctx.translate(tx, ty)
    applied = true
  }

  // 应用旋转、缩放和倾斜（需要先移动到中心点）
  if (
    props.rotation !== undefined ||
    props.scaleX !== undefined ||
    props.scaleY !== undefined ||
    props.skewX !== undefined ||
    props.skewY !== undefined
  ) {
    ctx.translate(actualCenterX, actualCenterY)

    // 应用缩放
    if (props.scaleX !== undefined || props.scaleY !== undefined) {
      const sx =
        props.scaleX !== undefined ? (unref(props.scaleX) as number) : 1
      const sy =
        props.scaleY !== undefined ? (unref(props.scaleY) as number) : 1
      ctx.scale(sx, sy)
    }

    // 应用倾斜
    if (props.skewX !== undefined || props.skewY !== undefined) {
      const skx = props.skewX !== undefined ? (unref(props.skewX) as number) : 0
      const sky = props.skewY !== undefined ? (unref(props.skewY) as number) : 0
      // 使用 transform 实现倾斜: transform(1, tan(sky), tan(skx), 1, 0, 0)
      ctx.transform(1, Math.tan(sky), Math.tan(skx), 1, 0, 0)
    }

    // 应用旋转
    if (props.rotation !== undefined) {
      ctx.rotate(unref(props.rotation) as number)
    }

    ctx.translate(-actualCenterX, -actualCenterY)
    applied = true
  }

  return applied
}

/**
 * 使用绘图属性包装绘制函数
 * 自动处理 save/restore
 *
 * @param ctx Canvas 上下文
 * @param props 包含所有属性的对象
 * @param drawFn 实际绘制函数
 * @param options 额外选项
 */
export function withDrawProps<
  T extends CommonDrawProps & LineStyleProps & TransformProps
>(
  ctx: CanvasRenderingContext2D,
  props: T,
  drawFn: () => void,
  options?: {
    transformCenter?: { x: number; y: number }
  }
) {
  // 检查是否需要 save/restore
  const needsSave =
    props.shadowColor !== undefined ||
    props.opacity !== undefined ||
    props.globalCompositeOperation !== undefined ||
    props.lineDash !== undefined ||
    props.lineDashOffset !== undefined ||
    props.lineCap !== undefined ||
    props.lineJoin !== undefined ||
    props.miterLimit !== undefined ||
    props.rotation !== undefined ||
    props.scaleX !== undefined ||
    props.scaleY !== undefined ||
    props.translateX !== undefined ||
    props.translateY !== undefined

  if (needsSave) {
    ctx.save()
  }

  // 应用变换（必须在其他属性之前）
  if (options?.transformCenter) {
    applyTransformProps(
      ctx,
      props,
      options.transformCenter.x,
      options.transformCenter.y
    )
  } else {
    applyTransformProps(ctx, props)
  }

  // 应用通用属性
  applyCommonDrawProps(ctx, props)

  // 应用线条样式
  applyLineStyleProps(ctx, props)

  // 执行绘制
  drawFn()

  if (needsSave) {
    ctx.restore()
  }
}

/**
 * 收集所有绘图属性的依赖项（用于响应式监听）
 */
export function collectDrawPropsDependencies<
  T extends CommonDrawProps & LineStyleProps & TransformProps
>(props: T): unknown[] {
  return [
    props.shadowColor !== undefined ? unref(props.shadowColor) : undefined,
    props.shadowBlur !== undefined ? unref(props.shadowBlur) : undefined,
    props.shadowOffsetX !== undefined ? unref(props.shadowOffsetX) : undefined,
    props.shadowOffsetY !== undefined ? unref(props.shadowOffsetY) : undefined,
    props.opacity !== undefined ? unref(props.opacity) : undefined,
    props.globalCompositeOperation !== undefined
      ? unref(props.globalCompositeOperation)
      : undefined,
    props.lineDash !== undefined ? unref(props.lineDash) : undefined,
    props.lineDashOffset !== undefined
      ? unref(props.lineDashOffset)
      : undefined,
    props.lineCap !== undefined ? unref(props.lineCap) : undefined,
    props.lineJoin !== undefined ? unref(props.lineJoin) : undefined,
    props.miterLimit !== undefined ? unref(props.miterLimit) : undefined,
    props.rotation !== undefined ? unref(props.rotation) : undefined,
    props.scaleX !== undefined ? unref(props.scaleX) : undefined,
    props.scaleY !== undefined ? unref(props.scaleY) : undefined,
    props.skewX !== undefined ? unref(props.skewX) : undefined,
    props.skewY !== undefined ? unref(props.skewY) : undefined,
    props.translateX !== undefined ? unref(props.translateX) : undefined,
    props.translateY !== undefined ? unref(props.translateY) : undefined,
    props.offsetX !== undefined ? unref(props.offsetX) : undefined,
    props.offsetY !== undefined ? unref(props.offsetY) : undefined
  ]
}
