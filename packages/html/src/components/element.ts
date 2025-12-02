import type { PropValue, Mountable } from '@rasenjs/core'
import { unrefValue, mountable, mount } from '@rasenjs/core'
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
  /** Text content or child mount functions */
  children?: PropValue<string> | Array<Mountable<StringHost>>
  value?: PropValue<string | number>
  // SSR 不需要事件处理，但保持 API 兼容
  on?: Record<string, (e: Event) => void>
}): Mountable<StringHost> => {
  return mountable((host: StringHost) => {
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

    // attrs
    const attrs = unrefValue(props.attrs)
    if (attrs) {
      for (const [key, val] of Object.entries(attrs)) {
        // 跳过无效的属性名（数字开头或纯数字）
        if (/^\d/.test(key)) continue
        html += stringifyAttr(key, val)
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
        // Mountable children - 创建子宿主收集子元素内容
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
          mount(child, childHost)
        }

        html += childHost.toString()
      }
    }

    // 结束标签
    html += `</${tag}>`

    host.append(html)

    // SSR 不需要 unmount
    return undefined
  })
}
