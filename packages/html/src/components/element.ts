import type { SyncComponent, PropValue } from '@rasenjs/core'
import type { StringHost, StringMountFunction } from '../types'
import {
  unref,
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
export const element: SyncComponent<
  StringHost,
  {
    tag: string
    id?: PropValue<string>
    className?: PropValue<string>
    style?: PropValue<Record<string, string | number>>
    attrs?: PropValue<Record<string, string | number | boolean>>
    textContent?: PropValue<string>
    innerHTML?: PropValue<string>
    value?: PropValue<string | number>
    // SSR 不需要事件处理，但保持 API 兼容
    on?: Record<string, (e: Event) => void>
    children?: Array<StringMountFunction>
  }
> = (props) => {
  return (host) => {
    const tag = props.tag
    const isVoid = isVoidElement(tag)

    // 构建开始标签
    let html = `<${tag}`

    // id
    const id = unref(props.id)
    if (id) {
      html += stringifyAttr('id', id)
    }

    // className
    const className = unref(props.className)
    if (className) {
      html += stringifyAttr('class', className)
    }

    // style
    const style = unref(props.style)
    if (style && Object.keys(style).length > 0) {
      html += stringifyAttr('style', stringifyStyle(style))
    }

    // value (for input, textarea, select)
    const value = unref(props.value)
    if (value !== undefined) {
      html += stringifyAttr('value', String(value))
    }

    // attrs
    const attrs = unref(props.attrs)
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

    // innerHTML（优先级最高）
    const innerHTML = unref(props.innerHTML)
    if (innerHTML !== undefined) {
      html += innerHTML
    } else {
      // textContent
      const textContent = unref(props.textContent)
      if (textContent !== undefined) {
        html += escapeHtml(String(textContent))
      }

      // children
      if (props.children && props.children.length > 0) {
        // 创建子宿主收集子元素内容
        const childHost: StringHost = {
          fragments: [],
          append(s: string) {
            this.fragments.push(s)
          },
          toString() {
            return this.fragments.join('')
          }
        }

        for (const childMount of props.children) {
          childMount(childHost)
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
