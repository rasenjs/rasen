import { setValue, type PropValue, type Ref, type Mountable } from '@rasenjs/core'
import { unref } from '../utils'
import { warnInvalidEventCase } from '../utils/dev-warnings'
import { getHydrationContext, claimElement } from '../hydration-context'
import {
  bindClass,
  bindStyle,
  bindText,
  bindKey,
  on,
  isEventProp,
  getEventName,
} from '../bindings'

/**
 * 特殊 props 列表（框架层面处理）
 */
const SPECIAL_PROPS = new Set(['ref', 'children', 'tag', 'class', 'style'])
import type {
  HTMLTagName,
  HTMLTagAttributes,
  ClassAttributes
} from '../types/dom'


// ============================================================================
// 类型定义 - 使用 Preact-style DOM 类型
// ============================================================================

/**
 * 根据标签名获取元素类型
 */
type TagToElement<T extends HTMLTagName> = HTMLElementTagNameMap[T]

/**
 * 基础 Props（所有元素共享）
 */
interface BaseElementProps {
  ref?: unknown
  children?: PropValue<string> | Array<string | (() => string | number) | Mountable<HTMLElement>>
}

/**
 * 完整的元素 Props 类型
 * 使用 Preact 的 DOM 类型定义，提供完整的自动补全支持
 */
type ElementProps<T extends HTMLTagName> = {
  tag: T
} & BaseElementProps &
  HTMLTagAttributes<T> &
  ClassAttributes<TagToElement<T>>

/**
 * 兼容旧版的非泛型 Props（内部使用）
 */
type AnyElementProps = {
  tag: string
  ref?: Ref<HTMLElement | null>
  children?: PropValue<string> | Array<string | (() => string | number) | Mountable<HTMLElement>>
  class?: PropValue<string>
  style?: PropValue<string | Record<string, string | number>>
  [key: string]: unknown
}

// ============================================================================
// element 函数实现
// ============================================================================

/**
 * element 组件 - 类型安全的 HTML 元素组件
 *
 * 特性：
 * - tag: 必须是有效的 HTML 标签名
 * - 属性: 根据标签自动推断可用属性
 * - 事件: on* 开头，自动转换为事件监听
 * - data-* / aria-*: 自动转换为 kebab-case
 *
 * @example
 * element({ tag: 'input', type: 'text', value: signal('hello'), onInput: (e) => {} })
 * element({ tag: 'button', onClick: () => {}, children: 'Click me' })
 * element({ tag: 'div', class: 'box', children: [child1, child2] })
 */
export function element<T extends HTMLTagName>(
  props: ElementProps<T>
): Mountable<HTMLElement>

// 重载：支持字符串标签（用于动态标签或自定义元素）
export function element(props: AnyElementProps): Mountable<HTMLElement>

// 实现
export function element(props: AnyElementProps): Mountable<HTMLElement> {
  return (host: HTMLElement) => {
    const ctx = getHydrationContext()

    // 节点获取：水合时认领服务端元素（共享逻辑见 hydration-context），
    // 否则新建。认领失败（标签/类型不匹配）时残留节点已被移除并回退新建。
    const claimed = claimElement(props.tag)
    const hydrated = claimed !== null
    const el = claimed ?? (host.ownerDocument || document).createElement(props.tag)

    let stops: Array<() => void> | null = null
    let childUnmounts: Array<(() => void) | undefined> | null = null

    // class / style — 写入语义（静态一次性 / 响应式监听 / 水合跳过首帧）
    // 全部在共享绑定层内部分派，工厂只负责传入原始值
    if (props.class !== undefined) {
      ;(stops ??= []).push(bindClass(el, props.class as PropValue<string>))
    }
    if (props.style !== undefined) {
      ;(stops ??= []).push(
        bindStyle(el, props.style as PropValue<string | Record<string, string | number>>)
      )
    }

    // 处理 children
    if (props.children !== undefined) {
      // 1. Normalize children to array
      const childrenArray = Array.isArray(props.children)
        ? props.children
        : [props.children]

      if (ctx?.isHydrating) {
        ctx.enterChildren(el)
      }

      // Fast path: a single static string child -> assign textContent directly.
      // Avoids allocating a separate Text node + appendChild (2 DOM calls -> 1).
      // Only safe when there are no other children to preserve.
      if (
        !ctx?.isHydrating &&
        childrenArray.length === 1 &&
        typeof childrenArray[0] === 'string'
      ) {
        el.textContent = childrenArray[0]
      } else {
      // 2. Process each child
      for (const child of childrenArray) {
        if (typeof child === 'string') {
          // 字符串 - 创建或复用文本节点
          let textNode: Text
          if (ctx?.isHydrating) {
            const claimed = ctx.claim()
            if (claimed?.nodeType === Node.TEXT_NODE) {
              textNode = claimed as Text
            } else {
              // Mismatch: remove claimed node and create new one
              if (claimed) claimed.parentNode?.removeChild(claimed)
              textNode = (host.ownerDocument || document).createTextNode(child)
              el.appendChild(textNode)
            }
          } else {
            textNode = (host.ownerDocument || document).createTextNode(child)
            el.appendChild(textNode)
          }
          ;(childUnmounts ??= []).push(() => textNode.remove())
        } else if (
          typeof child === 'object' &&
          child !== null &&
          'value' in child
        ) {
          // Ref 对象 - 创建或复用响应式文本节点；写入语义统一走共享绑定层
          // 的 bindText（ref → 响应式监听；水合时跳过首帧写入）
          let textNode: Text
          if (ctx?.isHydrating) {
            const claimed = ctx.claim()
            if (claimed?.nodeType === Node.TEXT_NODE) {
              textNode = claimed as Text
            } else {
              // Mismatch: remove claimed node and create new one
              if (claimed) claimed.parentNode?.removeChild(claimed)
              textNode = (host.ownerDocument || document).createTextNode(String(unref(child)))
              el.appendChild(textNode)
            }
          } else {
            textNode = (host.ownerDocument || document).createTextNode('')
            el.appendChild(textNode)
          }
          ;(stops ??= []).push(bindText(textNode, () => child))
          ;(childUnmounts ??= []).push(() => textNode.remove())
        } else if (typeof child === 'function') {
          type ChildFn = (host: HTMLElement) => unknown
          const result = (child as ChildFn)(el)
          if (typeof result === 'string' || typeof result === 'number') {
            const textNode = (host.ownerDocument || document).createTextNode(String(result))
            el.appendChild(textNode)
            ;(childUnmounts ??= []).push(() => textNode.remove())
          } else {
            ;(childUnmounts ??= []).push(result as (() => void) | undefined)
          }
        }
      }
      }

      if (ctx?.isHydrating) {
        ctx.exitChildren()
      }
    }

    // 遍历其他 props（事件和 HTML 属性）
    for (const key of Object.keys(props)) {
      // 跳过特殊 props
      if (SPECIAL_PROPS.has(key)) continue

      const value = props[key]
      if (value === undefined) continue

      // 开发环境下检查事件大小写错误
      warnInvalidEventCase(key, value)

      // 事件处理器 - 在 hydration 模式下也要设置（服务器端不渲染事件）
      if (isEventProp(key)) {
        if (typeof value === 'function') {
          ;(stops ??= []).push(
            on(el, getEventName(key), value as (e: Event) => void)
          )
        }
        continue
      }

      // 属性 / attribute — 分类、静态/响应式分派、水合规则全部在绑定层内
      ;(stops ??= []).push(bindKey(el, props.tag, key, value as PropValue<unknown>))
    }

    // ref - 设置元素引用
    if (props.ref) {
      setValue(props.ref, el)
    }

    // 只有非 hydration 模式才需要 appendChild
    if (!hydrated) {
      host.appendChild(el)
    }

    // 创建带 node 属性的 unmount 函数
    const unmount = () => {
      // 清理 ref
      if (props.ref) {
        setValue(props.ref, null)
      }
      stops?.forEach((stop) => stop())
      childUnmounts?.forEach((u, index) => {
        if (typeof u === 'function') {
          u()
        } else if (u !== undefined) {
          console.error(`[Rasen] Invalid unmount function at index ${index}:`, u, typeof u)
        }
      })
      el.remove()
    }

    // 附加 node 引用，供 each 组件进行节点移动
    ;(unmount as { node?: Node }).node = el

    return unmount
  }
}

// ============================================================================
// tag 工厂 — 创建预绑定标签的快捷函数
// ============================================================================

/** 元素组件的 Props 类型（不含 tag） */
type TagProps<T extends HTMLTagName> = Omit<ElementProps<T>, 'tag'>

/** Child 类型 - 支持字符串、响应式函数、响应式值、Mountable 组件 */
type TagChild = string | (() => string | number) | { value: unknown } | Mountable<HTMLElement>

/**
 * Tag factory — create a typed element function for any HTML tag.
 *
 * The returned function supports 4 call forms:
 *   - el()               → empty element
 *   - el(child)          → single child
 *   - el(props)          → with props
 *   - el(props, ...kids) → props + extra children
 *
 * Export so consumers can create custom tags:
 *   const myEl = tag('my-component')
 *
 * For built-in HTML tags, use the named exports (div, span, button, …).
 */
export function tag<T extends HTMLTagName>(name: T) {
  function el(): Mountable<HTMLElement>
  function el(child: TagChild): Mountable<HTMLElement>
  function el(props: TagProps<T>): Mountable<HTMLElement>
  function el(props: TagProps<T>, ...children: TagChild[]): Mountable<HTMLElement>

  function el(
    propsOrChild?: TagProps<T> | TagChild,
    ...restChildren: TagChild[]
  ): Mountable<HTMLElement> {
    if (propsOrChild === undefined) {
      return element({ tag: name } as unknown as ElementProps<T>)
    }

    if (
      typeof propsOrChild === 'string' ||
      typeof propsOrChild === 'function'
    ) {
      const children = [propsOrChild, ...restChildren]
      return element({ tag: name, children } as unknown as ElementProps<T>)
    }

    const props = propsOrChild as TagProps<T>
    if (restChildren.length > 0) {
      const existingChildren = props.children
      const children = Array.isArray(existingChildren)
        ? [...existingChildren, ...restChildren]
        : existingChildren !== undefined
          ? [existingChildren as TagChild, ...restChildren]
          : restChildren
      return element({ tag: name, ...props, children } as unknown as ElementProps<T>)
    }

    return element({ tag: name, ...props } as unknown as ElementProps<T>)
  }

  return el
}

// ============================================================================
// 导出类型
// ============================================================================

// hyperscript alias
export { element as h }

export type { HTMLTagName, ElementProps, BaseElementProps }
