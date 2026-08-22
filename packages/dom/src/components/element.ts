import { setValue, type PropValue, type Ref, type Mountable } from '@rasenjs/core'
import { unref, setAttribute, setStyle, watchProp, watchObjectProps } from '../utils'
import { warnInvalidEventCase } from '../utils/dev-warnings'
import { getHydrationContext } from '../hydration-context'
import type {
  HTMLTagName,
  HTMLTagAttributes,
  ClassAttributes
} from '../types/dom'

/**
 * 将 camelCase 转换为 kebab-case
 * dataUserId -> data-user-id
 * ariaLabel -> aria-label
 */
function camelToKebab(str: string): string {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase()
}

/**
 * 特殊 props 列表（框架层面处理）
 */
const SPECIAL_PROPS = new Set(['ref', 'children', 'tag', 'class', 'style'])

/**
 * 按标签划分的 DOM property（必须作为 property 设置，否则响应式更新无效）
 * 这些属性的 attribute 和 property 行为不同
 */
const TAG_SPECIFIC_PROPERTIES: Record<string, Set<string>> = {
  input: new Set(['value', 'checked', 'indeterminate']),
  textarea: new Set(['value']),
  select: new Set(['value', 'selectedIndex']),
  option: new Set(['selected'])
}

/**
 * 通用 DOM property（所有元素都可以用 property 设置）
 * 这些属性用 property 或 attribute 效果一致，但 property 更直接
 */
const COMMON_DOM_PROPERTIES = new Set([
  'disabled', // 禁用状态
  'readOnly', // 只读状态
  'multiple', // select 多选
  'hidden' // 隐藏
])

/**
 * 判断是否应该作为 DOM property 设置
 * tag 的小写形式按 tag 缓存：避免每元素×每key 重复 toLowerCase 分配字符串
 */
const lowerTagCache = new Map<string, string>()

function isDOMProperty(tag: string, key: string): boolean {
  let lowerTag = lowerTagCache.get(tag)
  if (lowerTag === undefined) {
    lowerTag = tag.toLowerCase()
    lowerTagCache.set(tag, lowerTag)
  }
  // 先检查按标签划分的
  const tagProps = TAG_SPECIFIC_PROPERTIES[lowerTag]
  if (tagProps?.has(key)) {
    return true
  }
  // 再检查通用的
  return COMMON_DOM_PROPERTIES.has(key)
}

/**
 * 判断是否是事件处理器
 * onClick, onMouseEnter 等
 * 用 charCode 判断大写，避免每次 key[2].toUpperCase() 分配字符串
 */
function isEventProp(key: string): boolean {
  if (!key.startsWith('on') || key.length < 3) return false
  const c = key.charCodeAt(2)
  return c >= 65 && c <= 90 // 'A' - 'Z'
}

/**
 * 获取事件名称
 * onClick -> click
 * onMouseEnter -> mouseenter
 */
function getEventName(key: string): string {
  return key.slice(2).toLowerCase()
}

/**
 * 判断是否需要转换为 kebab-case 的属性
 * data*, aria* 开头的属性需要转换
 */
function needsKebabConversion(key: string): boolean {
  return key.startsWith('data') || key.startsWith('aria')
}

/**
 * 获取 DOM 属性名
 */
function getDOMAttrName(key: string): string {
  if (needsKebabConversion(key)) {
    return camelToKebab(key)
  }
  return key
}

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
    let el: HTMLElement
    let hydrated = false

    if (ctx?.isHydrating) {
      // === Hydration 模式：复用已有 DOM ===
      const existing = ctx.claim()

      if (existing && existing.nodeType === Node.ELEMENT_NODE) {
        const existingEl = existing as HTMLElement
        if (existingEl.tagName.toLowerCase() === props.tag.toLowerCase()) {
          el = existingEl
          hydrated = true
        } else {
          console.warn(
            `[Rasen Hydration] Tag mismatch: expected <${props.tag}>, got <${existingEl.tagName.toLowerCase()}>`
          )
          el = (host.ownerDocument || document).createElement(props.tag)
        }
      } else {
        if (existing) {
          console.warn(
            `[Rasen Hydration] Expected element <${props.tag}>, got ${existing.nodeType === Node.TEXT_NODE ? 'text node' : 'other node'}`
          )
        }
        el = (host.ownerDocument || document).createElement(props.tag)
      }
    } else {
      el = (host.ownerDocument || document).createElement(props.tag)
    }

    let stops: Array<() => void> | null = null
    let childUnmounts: Array<(() => void) | undefined> | null = null
    let eventListeners: Array<{
      event: string
      handler: (e: Event) => void
    }> | null = null

    // 处理 class — 静态字面量直写，仅响应式才建 Watcher（公平对等 Vue patchFlag）
    if (props.class !== undefined) {
      const rawClass = props.class
      const isReactiveClass =
        typeof rawClass === 'function' ||
        (rawClass !== null && typeof rawClass === 'object' && 'value' in (rawClass as object))
      if (isReactiveClass) {
        let currentClass = ''
        ;(stops ??= []).push(
          watchProp(
            () => unref(rawClass as PropValue<string>),
            (classValue) => {
              const newClass = String(classValue || '')
              if (currentClass !== newClass) {
                el.className = newClass
                currentClass = newClass
              }
            },
            false
          )
        )
      } else {
        el.className = String(rawClass || '')
      }
    }

    // 处理 style
    if (props.style !== undefined) {
      // 检查 props.style 本身是否是响应式的
      const isReactiveStyle = typeof props.style === 'function' || 
                               (props.style && typeof props.style === 'object' && 'value' in props.style)
      
      if (isReactiveStyle) {
        // 响应式的 style - 监听整个 style 对象的变化
        ;(stops ??= []).push(
          watchProp(
            () => unref(props.style),
            (styleValue) => {
              if (typeof styleValue === 'string') {
                el.style.cssText = styleValue
              } else if (styleValue && typeof styleValue === 'object') {
                // 清空现有样式
                el.style.cssText = ''
                // 设置新样式
                setStyle(el, styleValue as Record<string, string | number>)
              }
            },
            hydrated
          )
        )
      } else {
        // 普通对象 style - 支持内部属性的响应式
        const styleValue = props.style
        
        if (typeof styleValue === 'string') {
          el.style.cssText = styleValue
        } else if (styleValue && typeof styleValue === 'object') {
          const stop = watchObjectProps(
            styleValue as Record<string, unknown>,
            (key, value) => {
              // setProperty only accepts kebab-case; convert camelCase keys
              const cssKey = key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
              if (value === null || value === undefined) {
                el.style.removeProperty(cssKey)
              } else {
                el.style.setProperty(cssKey, String(value))
              }
            },
            !hydrated
          )
          ;(stops ??= []).push(stop)
        }
      }
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
          // Ref 对象 - 创建或复用响应式文本节点
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
            textNode = (host.ownerDocument || document).createTextNode(String(unref(child)))
            el.appendChild(textNode)
          }
          const stop = watchProp(
            () => String(unref(child)),
            (v) => {
              textNode.textContent = v || ''
            },
            hydrated
          )
          ;(stops ??= []).push(stop)
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
          const eventName = getEventName(key)
          const handler = value as (e: Event) => void
          el.addEventListener(eventName, handler)
          ;(eventListeners ??= []).push({ event: eventName, handler })
        }
        continue
      }

      const isReactiveAttr =
        typeof value === 'function' ||
        (value !== null && typeof value === 'object' && 'value' in (value as object))
      if (isDOMProperty(props.tag, key)) {
        if (isReactiveAttr) {
          ;(stops ??= []).push(
            watchProp(
              () => unref(value as PropValue<string | number | boolean>),
              (propValue) => {
                ;(el as unknown as Record<string, unknown>)[key] = propValue
              },
              false
            )
          )
        } else {
          ;(el as unknown as Record<string, unknown>)[key] = value as string | number | boolean
        }
        continue
      }

      const attrName = getDOMAttrName(key)
      if (isReactiveAttr) {
        ;(stops ??= []).push(
          watchProp(
            () => unref(value as PropValue<string | number | boolean>),
            (attrValue) => {
              setAttribute(el, attrName, attrValue)
            },
            hydrated
          )
        )
      } else {
        if (!hydrated) setAttribute(el, attrName, value as string | number | boolean)
      }
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
      // 移除事件监听器
      if (eventListeners) {
        for (const { event, handler } of eventListeners) {
          el.removeEventListener(event, handler)
        }
      }
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
