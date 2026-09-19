import type { PropValue, Mountable } from '@rasenjs/core'
import {
  toValue,
  getAttrName,
  attrValue,
  isEventProp,
  stringifyStyleInline
} from '@rasenjs/core'
import type { StringHost } from '../types'
import type { StyleRecord, Child } from './elements'
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
  /** Text content or child mountables; single or array, normalized either way. */
  children?: Child | Child[]
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

    // Children are collected into a per-element buffer and appended once.
    //
    // Mounting them straight into the caller's buffer instead looks like the
    // obvious win — one append per chunk, no intermediate string — and it does
    // win on wide, shallow trees (measured 1.54x on a 5.4k-node tree). But on
    // deep chains it *loses* (0.74x on a 29k-node tree): every element's three
    // chunks land in the same array, so the buffer grows to tens of thousands
    // of entries and is joined once, while one small array per element lets V8
    // concatenate with ropes and join trivial buffers. Shape-dependent, no
    // reliable win — so this stays as it was, and the only change here is that
    // children are normalized in one place (which also fixed a single
    // non-array child being dropped silently).
    const parts: string[] = []
    const buffer: StringHost = {
      fragments: parts,
      append(s: string) {
        parts.push(s)
      },
      toString() {
        return parts.join('')
      }
    }
    mountChildren(props.children, buffer)
    host.append(html + buffer.toString() + `</${tag}>`)

    // SSR 不需要 unmount
    return undefined
  }
}

/**
 * Append children in order, accepting everything the factories accept: text,
 * numbers, refs, reactive text getters (a function that returns the text) and
 * mountables (a function that receives the host and appends itself).
 *
 * A single non-array child is normalized, so `children: part` renders the same
 * as `children: [part]` — it used to be dropped silently.
 */
function mountChildren(
  children: Child | Child[] | undefined,
  host: StringHost
): void {
  if (children === undefined || children === null) return
  const list = Array.isArray(children) ? children : [children]

  for (const child of list) {
    if (child === null || child === undefined) continue
    if (typeof child === 'string') {
      host.append(escapeHtml(child))
      continue
    }
    if (typeof child === 'number') {
      host.append(String(child))
      continue
    }
    if (typeof child === 'function') {
      const result = (child as (h: StringHost) => unknown)(host)
      // A mountable has already appended itself; a reactive text getter
      // ignored the host and returned the text to emit.
      if (typeof result === 'string') host.append(escapeHtml(result))
      else if (typeof result === 'number') host.append(String(result))
      continue
    }
    if (typeof child === 'object' && 'value' in child) {
      host.append(escapeHtml(String(toValue(child as PropValue<string>))))
    }
  }
}
