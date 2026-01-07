/**
 * JSX Runtime for Rasen
 * 
 * Converts JSX syntax to Rasen component calls
 * 
 * Features:
 * 1. Flexible tag registration mechanism
 * 2. Supports multiple render targets (DOM, SSR, custom)
 * 3. Reactive children support
 * 4. Automatic dependency tracking
 */

import type { Mountable } from '@rasenjs/core'
import { getReactiveRuntime, fragment } from '@rasenjs/core'
import { text } from '@rasenjs/web'
import { findTag } from './tag-config'

// Auto-configure default DOM tags
import './auto-config'

// Export configuration functions and types for users
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
 * Process children, converting to Mountable array
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
      // Static text node - use text() from @rasenjs/web
      result.push(text({ content: child }) as Mountable<unknown>)
    } else if (getReactiveRuntime().isRef(child)) {
      // Reactive ref - create reactive text node
      const refChild = child as unknown as { value: unknown }
      result.push(text({ content: () => String(refChild.value) }) as Mountable<unknown>)
    } else if (typeof child === 'function') {
      // Function type - all functions are now Mountable
      // Distinction: with parameters it's a getter, without parameters and returning unmount it's Mountable
      // But we can't distinguish at runtime, so by JSX semantics:
      // - If it's a function returned by a component (Mountable), use it directly
      // - If it's a () => value getter, treat as dynamic text
      // 
      // Simplified strategy here: treat directly as Mountable
      // If user wants to use getter, should use {() => expr} form, which will be parsed as JSX expression
      result.push(child as Mountable<unknown>)
    } else if (isJSXElement(child)) {
      // Nested JSX element, process recursively
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
  const { children, className, ...restProps } = props

  // 处理子元素
  const childMounts = processChildren(children)

  // 转换 className -> class（JSX 风格到 HTML 风格）
  const normalizedProps: Record<string, unknown> = { ...restProps }
  if (className !== undefined) {
    normalizedProps.class = className
  }

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
      ...normalizedProps,
      children: childMounts.length > 0 ? childMounts : undefined,
    })
  } else {
    // 直接传入的组件函数
    const component = type as TagComponent
    return component({
      ...normalizedProps,
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
