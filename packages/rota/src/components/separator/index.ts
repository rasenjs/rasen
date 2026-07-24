/**
 * Separator - 分隔符组件
 *
 * 用于分隔内容区域，支持水平和垂直方向。
 * 可配置为装饰性（无语义）或语义性（有 ARIA 属性）。
 */
import type { Mountable } from '@rasenjs/core'
import { primitive } from '../../primitives'

export interface SeparatorProps {
  orientation?: 'horizontal' | 'vertical'
  decorative?: boolean
  class?: string
  style?: Record<string, string | number> | string
}

/**
 * 创建 Separator 组件
 */
export function createSeparator(): (
  props?: SeparatorProps
) => Mountable<HTMLElement> {
  return (props?: SeparatorProps) => {
    const orientation = props?.orientation ?? 'horizontal'
    const decorative = props?.decorative ?? false

    return primitive('hr')({
      role: decorative ? undefined : 'separator',
      'aria-orientation': decorative ? undefined : orientation,
      'data-orientation': orientation,
      class: props?.class,
      style: {
        ...(typeof props?.style === 'object' ? props.style : {}),
        // 默认样式
        border: 'none',
        margin: orientation === 'vertical' ? '0 8px' : '8px 0',
        flexShrink: 0,
        // 根据方向设置尺寸
        ...(orientation === 'vertical'
          ? { width: '1px', height: 'auto' }
          : { width: 'auto', height: '1px' })
      }
    })
  }
}

/**
 * Separator 组件预设
 */
export const separator = createSeparator()

/**
 * 水平分隔符
 */
export const hseparator = (props?: Omit<SeparatorProps, 'orientation'>) =>
  separator({ ...props, orientation: 'horizontal' })

/**
 * 垂直分隔符
 */
export const vseparator = (props?: Omit<SeparatorProps, 'orientation'>) =>
  separator({ ...props, orientation: 'vertical' })
