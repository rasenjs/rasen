/**
 * JSX Runtime for Rasen
 * 
 * 将 JSX 语法转换为 Rasen 的组件调用
 * 
 * 特性:
 * 1. 灵活的标签注册机制
 * 2. 支持多个渲染目标 (DOM, Canvas, 自定义)
 * 3. 响应式子元素支持
 * 4. 自动依赖追踪
 */

import type { Mountable } from '@rasenjs/core'
import { getReactiveRuntime, fragment, isMountable, mountable } from '@rasenjs/core'
import { watchProp } from '@rasenjs/dom'
import { findTag } from './tag-config'

// 自动配置默认 DOM 标签
import './auto-config'

// 导出配置函数和类型供用户使用
export {
  registerTag,
  configureTags,
  clearTags,
  getRegisteredTags,
  type TagConfig,
  type TagComponent as TagComponentType
} from './tag-config'

/**
 * 标签组件类型
 */
type TagComponent = (props: Record<string, unknown>) => Mountable<unknown>

/**
 * JSX 元素类型
 */
type JSXElementType =
  | string // HTML 标签名
  | TagComponent // 自定义组件

/**
 * JSX props 类型
 */
interface JSXProps {
  children?: JSXChild | JSXChild[]
  [key: string]: unknown
}

/**
 * JSX 子元素类型
 */
type JSXChild =
  | string
  | number
  | boolean
  | null
  | undefined
  | Mountable
  | JSXElement

/**
 * JSX 元素类型（内部使用）
 */
interface JSXElement {
  type: JSXElementType
  props: JSXProps
}

/**
 * 处理子元素，转换为 Mountable 数组
 */
function processChildren(children: JSXChild | JSXChild[]): Mountable<unknown>[] {
  if (children === null || children === undefined) {
    return []
  }

  const childArray = Array.isArray(children) ? children : [children]
  const result: Mountable<unknown>[] = []

  for (const child of childArray) {
    if (child === null || child === undefined || typeof child === 'boolean') {
      continue
    }

    if (typeof child === 'string' || typeof child === 'number') {
      // 静态文本节点
      const text = String(child)
      result.push(mountable((host: unknown) => {
        if (host instanceof HTMLElement) {
          const textNode = document.createTextNode(text)
          host.appendChild(textNode)
          return () => {
            textNode.remove()
          }
        }
        return undefined
      }))
    } else if (getReactiveRuntime().isRef(child)) {
      // 响应式 ref - 创建响应式文本节点
      const refChild = child as unknown as { value: unknown }
      result.push(mountable((host: unknown) => {
        if (host instanceof HTMLElement) {
          const textNode = document.createTextNode(String(refChild.value))
          host.appendChild(textNode)
          
          // 监听 ref 变化
          const stop = watchProp(
            () => String(refChild.value),
            (newText: string) => {
              textNode.textContent = newText
            }
          )
          
          return () => {
            stop()
            textNode.remove()
          }
        }
        return undefined
      }))
    } else if (typeof child === 'function') {
      // 检查是否是已标记的 Mountable
      if (isMountable(child)) {
        result.push(child)
      } else {
        // 未标记的函数当作 getter 处理 - 创建响应式文本节点
        const getter = child as () => unknown
        result.push(mountable((host: unknown) => {
          if (host instanceof HTMLElement) {
            const textNode = document.createTextNode(String(getter()))
            host.appendChild(textNode)
            
            const stop = watchProp(
              () => String(getter()),
              (newText: string) => {
                textNode.textContent = newText
              }
            )
            
            return () => {
              stop()
              textNode.remove()
            }
          }
          return undefined
        }))
      }
    } else if (isJSXElement(child)) {
      // 嵌套的 JSX 元素，递归处理
      const mountFn = mountableFromJSX(child)
      result.push(mountFn)
    }
  }

  return result
}

/**
 * 判断是否为 JSX 元素
 */
function isJSXElement(value: unknown): value is JSXElement {
  return value !== null && typeof value === 'object' && 'type' in value && 'props' in value
}

/**
 * 从 JSX 元素创建 Mountable
 */
function mountableFromJSX(element: JSXElement): Mountable<unknown> {
  const { type, props } = element
  const { children, ...restProps } = props

  // 处理子元素
  const childMounts = processChildren(children)

  if (typeof type === 'string') {
    // HTML 标签或配置的自定义标签
    const tagComponent = findTag(type)
    
    if (!tagComponent) {
      throw new Error(
        `Unknown tag: ${type}. Please configure it using configureTags().`
      )
    }

    // 调用组件 - 返回 Mountable
    return tagComponent({
      ...restProps,
      children: childMounts.length > 0 ? childMounts : undefined,
    })
  } else {
    // 直接传入的组件函数
    const component = type as TagComponent
    return component({
      ...restProps,
      children: childMounts.length > 0 ? childMounts : undefined,
    })
  }
}

/**
 * jsx 函数 - React 17+ 自动导入的 JSX 转换
 */
export function jsx(
  type: JSXElementType,
  props: JSXProps,
  key?: string
): Mountable<unknown> {
  // 创建内部 JSX 元素表示
  const element: JSXElement = { type, props: { ...props, key } }
  return mountableFromJSX(element)
}

/**
 * jsxs 函数 - 用于多个子元素的情况
 */
export function jsxs(
  type: JSXElementType,
  props: JSXProps,
  key?: string
): Mountable<unknown> {
  return jsx(type, props, key)
}

/**
 * Fragment 组件 - 用于 JSX
 * 
 * JSX 用法: <>hello {count} world</>
 * 
 * 内部复用 @rasenjs/core 的 fragment 实现
 */
export function Fragment(props: { children?: JSXChild | JSXChild[] }): Mountable<unknown> {
  // 先将 JSX 子元素转换为 Mountable[]
  const childMounts = processChildren(props.children)
  // 复用 core 的 fragment
  return fragment({ children: childMounts })
}
