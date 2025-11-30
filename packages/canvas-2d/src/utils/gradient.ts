import type { Ref, ReadonlyRef } from '../types'
import { unref } from './ref'

/**
 * 颜色色标
 */
export interface ColorStop {
  offset: number
  color: string
}

/**
 * 线性渐变选项
 */
export interface LinearGradientOptions {
  type: 'linear'
  x0: number | Ref<number> | ReadonlyRef<number>
  y0: number | Ref<number> | ReadonlyRef<number>
  x1: number | Ref<number> | ReadonlyRef<number>
  y1: number | Ref<number> | ReadonlyRef<number>
  colorStops: ColorStop[] | Ref<ColorStop[]> | ReadonlyRef<ColorStop[]>
}

/**
 * 径向渐变选项
 */
export interface RadialGradientOptions {
  type: 'radial'
  x0: number | Ref<number> | ReadonlyRef<number>
  y0: number | Ref<number> | ReadonlyRef<number>
  r0: number | Ref<number> | ReadonlyRef<number>
  x1: number | Ref<number> | ReadonlyRef<number>
  y1: number | Ref<number> | ReadonlyRef<number>
  r1: number | Ref<number> | ReadonlyRef<number>
  colorStops: ColorStop[] | Ref<ColorStop[]> | ReadonlyRef<ColorStop[]>
}

/**
 * 渐变选项联合类型
 */
export type GradientOptions = LinearGradientOptions | RadialGradientOptions

/**
 * 创建线性渐变
 *
 * @param ctx Canvas 上下文
 * @param options 线性渐变选项
 * @returns CanvasGradient 对象
 */
export function createLinearGradient(
  ctx: CanvasRenderingContext2D,
  options: LinearGradientOptions
): CanvasGradient {
  const x0 = unref(options.x0) as number
  const y0 = unref(options.y0) as number
  const x1 = unref(options.x1) as number
  const y1 = unref(options.y1) as number

  const gradient = ctx.createLinearGradient(x0, y0, x1, y1)

  const colorStops = unref(options.colorStops) as ColorStop[]
  colorStops.forEach((stop) => {
    gradient.addColorStop(stop.offset, stop.color)
  })

  return gradient
}

/**
 * 创建径向渐变
 *
 * @param ctx Canvas 上下文
 * @param options 径向渐变选项
 * @returns CanvasGradient 对象
 */
export function createRadialGradient(
  ctx: CanvasRenderingContext2D,
  options: RadialGradientOptions
): CanvasGradient {
  const x0 = unref(options.x0) as number
  const y0 = unref(options.y0) as number
  const r0 = unref(options.r0) as number
  const x1 = unref(options.x1) as number
  const y1 = unref(options.y1) as number
  const r1 = unref(options.r1) as number

  const gradient = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1)

  const colorStops = unref(options.colorStops) as ColorStop[]
  colorStops.forEach((stop) => {
    gradient.addColorStop(stop.offset, stop.color)
  })

  return gradient
}

/**
 * 创建渐变（自动选择线性或径向）
 *
 * @param ctx Canvas 上下文
 * @param options 渐变选项
 * @returns CanvasGradient 对象
 */
export function createGradient(
  ctx: CanvasRenderingContext2D,
  options: GradientOptions
): CanvasGradient {
  if (options.type === 'linear') {
    return createLinearGradient(ctx, options)
  } else {
    return createRadialGradient(ctx, options)
  }
}

/**
 * 图案重复模式
 */
export type PatternRepeat = 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat'

/**
 * 图案选项
 */
export interface PatternOptions {
  image:
    | CanvasImageSource
    | Ref<CanvasImageSource>
    | ReadonlyRef<CanvasImageSource>
  repeat?: PatternRepeat | Ref<PatternRepeat> | ReadonlyRef<PatternRepeat>
}

/**
 * 创建图案填充
 *
 * @param ctx Canvas 上下文
 * @param options 图案选项
 * @returns CanvasPattern 对象或 null
 */
export function createPattern(
  ctx: CanvasRenderingContext2D,
  options: PatternOptions
): CanvasPattern | null {
  const image = unref(options.image) as CanvasImageSource
  const repeat =
    options.repeat !== undefined
      ? (unref(options.repeat) as PatternRepeat)
      : 'repeat'

  return ctx.createPattern(image, repeat)
}
