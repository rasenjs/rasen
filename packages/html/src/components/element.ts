import type { PropValue, Mountable } from '@rasenjs/core'
import { unrefValue } from '@rasenjs/core'
import type { StringHost } from '../types'
import {
  stringifyAttr,
  stringifyStyle,
  escapeHtml,
  isVoidElement
} from '../utils'

/**
 * element 组件 - 通用 HTML 元素组件（字符串版本）
 *
 * SSR 场景下不需要响应式更新，直接取值渲染
 */
export const element = (props: {
  tag: string
  id?: PropValue<string>
  className?: PropValue<string>
  style?: PropValue<Record<string, string | number>>
  attrs?: PropValue<Record<string, string | number | boolean>>
  /** Text content or child mount functions (including reactive text functions) */
  children?: PropValue<string> | Array<string | (() => string | number) | Mountable<StringHost>>
  value?: PropValue<string | number>
  // SSR does not need events - removed for consistency
}): Mountable<StringHost> => {
  return (host: StringHost) => {
    const tag = props.tag
    const isVoid = isVoidElement(tag)

    // 构建开始标签
    let html = `<${tag}`

    // id
    const id = unrefValue(props.id)
    if (id) {
      html += stringifyAttr('id', id)
    }

    // className
    const className = unrefValue(props.className)
    if (className) {
      html += stringifyAttr('class', className)
    }

    // style
    const style = unrefValue(props.style)
    if (style && Object.keys(style).length > 0) {
      html += stringifyAttr('style', stringifyStyle(style))
    }

    // value (for input, textarea, select)
    const value = unrefValue(props.value)
    if (value !== undefined) {
      html += stringifyAttr('value', String(value))
    }

    // attrs (other attributes)
    const attrs = unrefValue(props.attrs)
    if (attrs) {
      for (const [key, val] of Object.entries(attrs)) {
        // 跳过无效的属性名（数字开头或纯数字）
        if (/^\d/.test(key)) continue
        html += stringifyAttr(key, val)
      }
    }
    
    // 处理其他props（除了特殊props和已处理的）
    const specialProps = new Set(['tag', 'id', 'className', 'style', 'value', 'attrs', 'children', 'on'])
    for (const [key, val] of Object.entries(props)) {
      if (specialProps.has(key)) continue
      if (key.startsWith('on')) continue // 跳过事件处理器（SSR不需要）
      if (val === undefined || val === null) continue
      
      const attrValue = unrefValue(val as PropValue<unknown>)
      if (attrValue !== undefined && attrValue !== null) {
        // 只处理基本类型（string, number, boolean）
        if (typeof attrValue === 'string' || typeof attrValue === 'number' || typeof attrValue === 'boolean') {
          html += stringifyAttr(key, attrValue)
        }
      }
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
        html += escapeHtml(String(unrefValue(children as PropValue<string>)))
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
