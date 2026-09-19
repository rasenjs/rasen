import type { PropValue, Mountable } from '@rasenjs/core'
import {
  toValue,
  getAttrName,
  attrValue,
  isEventProp,
  stringifyStyleInline
} from '@rasenjs/core'
import type { StringHost } from '../types'
import type { StyleRecord } from './elements'
import type { SSRNode } from '../host-hooks'
import { stringifyAttr, escapeHtml, isVoidElement } from '../utils'

/**
 * element 组件 - 通用 HTML 元素组件（字符串版本）
 *
 * SSR 场景下不需要响应式更新，直接取值渲染
 */
export const element = (props: {
  tag: string
  id?: PropValue<string>
  className?: PropValue<string>
  style?: PropValue<string | StyleRecord>
  attrs?: PropValue<Record<string, string | number | boolean>>
  /** Text content or child mount functions (including reactive text functions) */
  children?: PropValue<string> | Array<string | (() => string | number) | Mountable<SSRNode>>
  value?: PropValue<string | number>
  /** Other attributes pass through; see `BaseProps` in elements.ts. */
  [key: string]: unknown
  // SSR does not need events - events are skipped if present
}): Mountable<SSRNode> => {
  return (node: SSRNode) => {
    const host = node as StringHost
    const tag = props.tag
    const isVoid = isVoidElement(tag)

    // 构建开始标签
    let html = `<${tag}`

    /** Append one attribute, applying the shared presence/value rule.
     *  A flag attribute is written bare (`disabled`), which is the markup a
     *  browser ends up with after the DOM renderer's `setAttribute(name, '')`.
     *  `data-*` carries the value itself, so it stays `data-state="true"`. */
    const emitAttr = (key: string, resolved: unknown): void => {
      const name = getAttrName(key)
      if (typeof resolved === 'boolean') {
        const serialized = attrValue(name, resolved)
        if (serialized === null) return
        html += name.startsWith('data-')
          ? stringifyAttr(name, serialized)
          : ` ${name}`
        return
      }
      if (typeof resolved === 'string' || typeof resolved === 'number') {
        const serialized = attrValue(name, resolved)
        if (serialized !== null) html += stringifyAttr(name, serialized)
      }
    }

    // id
    const id = toValue(props.id)
    if (id) {
      html += stringifyAttr('id', id)
    }

    // class / className — the same attribute, spelled both ways in source.
    // `elements.ts` normalizes `class` to `className`; callers that use the
    // generic factory can pass either.
    const rawProps = props as Record<string, unknown>
    const className = toValue(props.className ?? (rawProps.class as PropValue<string>))
    if (className) {
      html += stringifyAttr('class', className)
    }

    // style — one shared serializer with the DOM renderer, so a style object
    // that holds a ref or a getter per declaration resolves here too. A string
    // is already a css declaration list (the DOM renderer assigns it to
    // cssText), so it is emitted as-is.
    const style = toValue(props.style)
    if (typeof style === 'string') {
      if (style) html += stringifyAttr('style', style)
    } else if (style && Object.keys(style).length > 0) {
      const css = stringifyStyleInline(style as Record<string, unknown>)
      if (css) html += stringifyAttr('style', css)
    }

    // value (for input, textarea, select)
    const value = toValue(props.value)
    if (value !== undefined) {
      html += stringifyAttr('value', String(value))
    }

    // attrs (other attributes)
    const attrs = toValue(props.attrs)
    if (attrs) {
      for (const [key, val] of Object.entries(attrs)) {
        // 跳过无效的属性名（数字开头或纯数字）
        if (/^\d/.test(key)) continue
        emitAttr(key, toValue(val))
      }
    }

    // 处理其他props（除了特殊props和已处理的）
    const specialProps = new Set([
      'tag',
      'id',
      'class',
      'className',
      'style',
      'value',
      'attrs',
      'children',
      // `ref` is a client-side concern: the DOM renderer writes the element
      // into the holder, and there is no element here. Invoking it (which the
      // old generic loop did, via toValue) would call a ref callback with no
      // node — a side effect on nothing.
      'ref'
    ])
    for (const [key, val] of Object.entries(props)) {
      if (specialProps.has(key)) continue
      // Events are skipped: the server renders no listeners. `isEventProp`
      // (shared with the DOM renderer) requires an uppercase third character,
      // so an ordinary attribute like `once` is not mistaken for a handler.
      if (isEventProp(key)) continue
      if (val === undefined || val === null) continue

      const resolved = toValue(val as PropValue<unknown>)
      if (resolved === undefined || resolved === null) continue
      emitAttr(key, resolved)
    }

    html += '>'

    // 自闭合标签不需要内容和结束标签
    if (isVoid) {
      host.append(html)
      return undefined
    }

    // children (text content or mount functions)
    const children = props.children
    if (children !== undefined) {
      if (typeof children === 'string' || (typeof children === 'object' && 'value' in (children as any))) {
        // String content (or ref to string)
        html += escapeHtml(String(toValue(children as PropValue<string>)))
      } else if (Array.isArray(children) && children.length > 0) {
        // Array of children - 创建子宿主收集子元素内容
        const childHost: StringHost = {
          fragments: [],
          append(s: string) {
            this.fragments.push(s)
          },
          toString() {
            return this.fragments.join('')
          }
        }

        for (const child of children) {
          if (child === null || child === undefined) continue
          
          if (typeof child === 'string') {
            // String child
            childHost.append(escapeHtml(child))
          } else if (typeof child === 'function') {
            // Function - could be Mountable or reactive text function
            // Call it with childHost and check the return value type
            const result = (child as any)(childHost)
            
            // If it returns string/number, it's a reactive text function that ignored our parameter
            if (typeof result === 'string' || typeof result === 'number') {
              childHost.append(escapeHtml(String(result)))
            }
            // Otherwise it's a Mountable, already executed correctly
          }
        }

        html += childHost.toString()
      }
    }

    // 结束标签
    html += `</${tag}>`

    host.append(html)

    // SSR 不需要 unmount
    return undefined
  }
}
