/**
 * primitive - 基础组件包装器
 *
 * 用于包装基础 HTML 元素或自定义组件，
 * 提供统一的接口和响应式能力。
 */
import type { Mountable } from '@rasenjs/core'

export interface PrimitiveProps {
  as?: string
  children?: unknown
  class?: string
  style?: Record<string, string | number> | string
  [key: string]: unknown
}

/**
 * 创建一个基础组件
 */
export function primitive<T extends HTMLElement = HTMLElement>(
  tag: string
): (props: PrimitiveProps) => Mountable<HTMLElement, T> {
  return (props: PrimitiveProps) => {
    return (host: HTMLElement) => {
      const el = document.createElement(tag)

      // 处理 children
      if (props.children !== undefined) {
        if (typeof props.children === 'string') {
          el.textContent = props.children
        } else if (typeof props.children === 'function') {
          const childResult = (props.children as () => unknown)()
          if (typeof childResult === 'string') {
            el.textContent = childResult
          }
        }
      }

      // 处理 class
      if (props.class) {
        el.className = props.class
      }

      // 处理 style
      if (props.style) {
        if (typeof props.style === 'string') {
          el.style.cssText = props.style
        } else {
          Object.assign(el.style, props.style)
        }
      }

      // 处理其他属性
      for (const [key, value] of Object.entries(props)) {
        if (
          key === 'as' ||
          key === 'children' ||
          key === 'class' ||
          key === 'style'
        ) {
          continue
        }
        if (key.startsWith('on') && typeof value === 'function') {
          const eventName = key.slice(2).toLowerCase()
          el.addEventListener(eventName, value as EventListener)
        } else if (value !== undefined && value !== null) {
          el.setAttribute(key, String(value))
        }
      }

      host.appendChild(el)

      return () => el.remove()
    }
  }
}
