/**
 * AspectRatio - 宽高比容器组件
 *
 * 用于保持子元素的固定宽高比。
 * 常用于图片、视频、卡片等需要保持特定比例的场景。
 */
import type { Mountable } from '@rasenjs/core'

export interface AspectRatioProps {
  ratio?: number
  class?: string
  style?: Record<string, string | number> | string
}

/**
 * 创建 AspectRatio 组件
 */
export function createAspectRatio(): (
  props?: AspectRatioProps,
  children?: () => Mountable<HTMLElement>
) => Mountable<HTMLElement> {
  return (
    props?: AspectRatioProps,
    children?: () => Mountable<HTMLElement>
  ) => {
    const ratio = props?.ratio ?? 1

    return (host: HTMLElement) => {
      // 外层容器
      const container = document.createElement('div')
      container.style.position = 'relative'
      container.style.width = '100%'
      container.style.overflow = 'hidden'

      // 使用 padding-bottom 实现宽高比
      container.style.paddingBottom = `${(1 / ratio) * 100}%`

      // 应用自定义样式
      if (props?.style) {
        if (typeof props?.style === 'object') {
          Object.assign(container.style, props?.style)
        }
      }

      // 应用自定义类名
      if (props?.class) {
        container.className = props.class
      }

      // 内容容器
      const content = document.createElement('div')
      content.style.position = 'absolute'
      content.style.top = '0'
      content.style.right = '0'
      content.style.bottom = '0'
      content.style.left = '0'

      container.appendChild(content)

      // 渲染子内容
      let unmount: (() => void) | undefined
      if (children) {
        unmount = children()(content)
      }

      host.appendChild(container)

      return () => {
        unmount?.()
        container.remove()
      }
    }
  }
}

/**
 * AspectRatio 组件预设
 */
export const aspectRatio = createAspectRatio()
