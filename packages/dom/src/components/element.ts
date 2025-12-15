import type { PropValue, Ref, Mountable } from '@rasenjs/core'
import { unref, setAttribute, setStyle, watchProp } from '../utils'
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
 */
function isDOMProperty(tag: string, key: string): boolean {
  // 先检查按标签划分的
  const tagProps = TAG_SPECIFIC_PROPERTIES[tag.toLowerCase()]
  if (tagProps?.has(key)) {
    return true
  }
  // 再检查通用的
  return COMMON_DOM_PROPERTIES.has(key)
}

/**
 * 判断是否是事件处理器
 * onClick, onMouseEnter 等
 */
function isEventProp(key: string): boolean {
  return (
    key.startsWith('on') && key.length > 2 && key[2] === key[2].toUpperCase()
  )
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
  ref?: Ref<HTMLElement | null> | ((el: HTMLElement | null) => void)
  children?: PropValue<string> | Array<Mountable<HTMLElement> | string>
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
  children?: PropValue<string> | Array<Mountable<HTMLElement> | string>
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
          el = document.createElement(props.tag)
        }
      } else {
        if (existing) {
          console.warn(
            `[Rasen Hydration] Expected element <${props.tag}>, got ${existing.nodeType === Node.TEXT_NODE ? 'text node' : 'other node'}`
          )
        }
        el = document.createElement(props.tag)
      }
    } else {
      el = document.createElement(props.tag)
    }

    const stops: Array<() => void> = []
    const childUnmounts: Array<(() => void) | undefined> = []
    const eventListeners: Array<{
      event: string
      handler: (e: Event) => void
    }> = []

    // 处理 class
    if (props.class !== undefined) {
      // 优化：缓存当前 class 值，减少不必要的 DOM 操作
      let currentClass = ''
      
      stops.push(
        watchProp(
          () => unref(props.class),
          (classValue) => {
            const newClass = String(classValue || '')
            // 只有 class 真正改变时才更新 DOM
            if (currentClass !== newClass) {
              el.className = newClass
              currentClass = newClass
            }
          },
          hydrated
        )
      )
    }

    // 处理 style
    if (props.style !== undefined) {
      stops.push(
        watchProp(
          () => unref(props.style),
          (styleValue) => {
            if (typeof styleValue === 'string') {
              el.style.cssText = styleValue
            } else if (styleValue) {
              setStyle(el, styleValue as Record<string, string | number>)
            }
          },
          hydrated
        )
      )
    }

    // 处理 children
    if (props.children !== undefined) {
      const children = props.children
      if (
        typeof children === 'string' ||
        (typeof children === 'object' &&
          children !== null &&
          'value' in children)
      ) {
        // String content (or ref to string)
        stops.push(
          watchProp(
            () => {
              const v = unref(children as PropValue<string>)
              return String(v)
            },
            (v) => {
              el.textContent = v || ''
            },
            hydrated
          )
        )
      } else if (Array.isArray(children)) {
        // Mount functions (支持 string 和 Mountable 混合)
        if (ctx?.isHydrating) {
          ctx.enterChildren(el)
        }
        for (const child of children) {
          if (typeof child === 'string') {
            // 字符串直接创建 text node
            const textNode = document.createTextNode(child)
            el.appendChild(textNode)
            childUnmounts.push(() => textNode.remove())
          } else if (typeof child === 'function') {
            childUnmounts.push((child as Mountable<HTMLElement>)(el))
          }
        }
        if (ctx?.isHydrating) {
          ctx.exitChildren()
        }
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

      // 事件处理器
      if (isEventProp(key)) {
        if (typeof value === 'function') {
          const eventName = getEventName(key)
          const handler = value as (e: Event) => void
          el.addEventListener(eventName, handler)
          eventListeners.push({ event: eventName, handler })
        }
        continue
      }

      // DOM property（需要直接设置 el[name] = value）
      if (isDOMProperty(props.tag, key)) {
        stops.push(
          watchProp(
            () => unref(value as PropValue<string | number | boolean>),
            (propValue) => {
              ;(el as unknown as Record<string, unknown>)[key] = propValue
            },
            hydrated
          )
        )
        continue
      }

      // 其他 HTML 属性
      const attrName = getDOMAttrName(key)
      stops.push(
        watchProp(
          () => unref(value as PropValue<string | number | boolean>),
          (attrValue) => {
            setAttribute(el, attrName, attrValue)
          },
          hydrated
        )
      )
    }

    // ref - 设置元素引用
    if (props.ref) {
      props.ref.value = el
    }

    // 只有非 hydration 模式才需要 appendChild
    if (!hydrated) {
      host.appendChild(el)
    }

    // 创建带 node 属性的 unmount 函数
    const unmount = () => {
      // 清理 ref
      if (props.ref) {
        props.ref.value = null
      }
      stops.forEach((stop) => stop())
      childUnmounts.forEach((u) => u?.())
      // 移除事件监听器
      for (const { event, handler } of eventListeners) {
        el.removeEventListener(event, handler)
      }
      el.remove()
    }

    // 附加 node 引用，供 each 组件进行节点移动
    ;(unmount as { node?: Node }).node = el

    return unmount
  }
}

// ============================================================================
// 导出类型
// ============================================================================

export type { HTMLTagName, ElementProps, BaseElementProps }
