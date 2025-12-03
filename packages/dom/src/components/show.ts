import type { Mountable, PropValue } from '@rasenjs/core'
import { unref, watchProp } from '../utils'

/**
 * show 组件 - 基于 CSS display 的条件显示
 *
 * 元素始终存在于 DOM 中，通过 display: none 隐藏
 * 适用于频繁切换显示状态的场景（避免重新创建 DOM）
 *
 * @example
 * show({
 *   when: isVisible,
 *   children: div({ children: 'Content' })
 * })
 */
export function show(config: {
  when: PropValue<boolean>
  children: Mountable<HTMLElement>
}): Mountable<HTMLElement> {
  return (host: HTMLElement) => {
    // 创建一个包装容器来控制显示
    const wrapper = document.createElement('div')
    wrapper.style.display = 'contents' // 不影响布局

    // 挂载子组件
    const childUnmount = config.children(wrapper)

    // 获取实际的子元素（第一个元素子节点）
    const getTargetElement = (): HTMLElement | null => {
      for (let i = 0; i < wrapper.childNodes.length; i++) {
        const node = wrapper.childNodes[i]
        if (node instanceof HTMLElement) {
          return node
        }
      }
      return null
    }

    // 保存原始 display 值
    let originalDisplay: string | null = null
    let targetElement: HTMLElement | null = null

    // 监听条件变化
    const stopWatch = watchProp(
      () => unref(config.when),
      (visible) => {
        // 延迟获取目标元素（确保子组件已挂载）
        if (!targetElement) {
          targetElement = getTargetElement()
          if (targetElement) {
            originalDisplay = targetElement.style.display || ''
          }
        }

        if (targetElement) {
          if (visible) {
            targetElement.style.display = originalDisplay || ''
          } else {
            targetElement.style.display = 'none'
          }
        }
      }
    )

    host.appendChild(wrapper)

    return () => {
      stopWatch()
      childUnmount?.()
      wrapper.remove()
    }
  }
}

/**
 * showDirect 组件 - 直接控制元素显示（不使用包装器）
 *
 * 更轻量的实现，直接操作子元素的 display
 * 要求子组件必须返回单个元素
 */
export function showDirect(config: {
  when: PropValue<boolean>
  element: HTMLElement
}): Mountable<HTMLElement> {
  return (host: HTMLElement) => {
    const element = config.element
    const originalDisplay = element.style.display || ''

    const stopWatch = watchProp(
      () => unref(config.when),
      (visible) => {
        element.style.display = visible ? originalDisplay : 'none'
      }
    )

    host.appendChild(element)

    return () => {
      stopWatch()
      element.remove()
    }
  }
}
