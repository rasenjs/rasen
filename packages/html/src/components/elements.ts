import type { SyncComponent, PropValue } from '@rasenjs/core'
import type { StringHost, StringMountFunction } from '../types'
import { element } from './element'
import { escapeHtml } from '../utils'

interface BaseProps {
  id?: PropValue<string>
  class?: PropValue<string>
  className?: PropValue<string>
  style?: PropValue<Record<string, string | number>>
  attrs?: PropValue<Record<string, string | number | boolean>>
  textContent?: PropValue<string>
  // SSR 不需要事件，但保持 API 兼容
  on?: Record<string, (e: Event) => void>
  onClick?: (e: Event) => void
  onInput?: (e: Event) => void
  onKeyPress?: (e: Event) => void
  children?: Array<StringMountFunction>
}

/**
 * 规范化参数为标准 props 对象
 */
function normalizeArgs(...args: any[]): BaseProps {
  // 没有参数
  if (args.length === 0) {
    return {}
  }

  const first = args[0]

  // 单个参数
  if (args.length === 1) {
    // 如果是字符串，作为 textContent
    if (typeof first === 'string') {
      return { textContent: first }
    }
    // 如果是函数，当作 child mount 函数
    if (typeof first === 'function') {
      return { children: [first] }
    }
  }

  // 多个参数或单个对象参数：提取 props 和 children
  const props = typeof first === 'object' && first !== null ? { ...first } : {}
  const children: StringMountFunction[] = []

  // 处理后续参数作为 children（仅多个参数时）
  if (args.length > 1) {
    for (let i = 1; i < args.length; i++) {
      const child = args[i]
      if (child === null || child === undefined) continue

      if (typeof child === 'function') {
        children.push(child)
      } else if (typeof child === 'string') {
        // 字符串 child 转换为 textContent 的 mount 函数
        children.push((host: StringHost) => {
          host.append(escapeHtml(child))
          return undefined
        })
      }
    }

    // 合并 children
    if (children.length > 0) {
      props.children = [...(props.children || []), ...children]
    }
  }

  // 处理 class 别名
  if (props.class && !props.className) {
    props.className = props.class
    delete props.class
  }

  return props
}

/**
 * div 组件
 */
export function div(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'div', ...props })
}

/**
 * span 组件
 */
export function span(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'span', ...props })
}

/**
 * button 组件
 */
export function button(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'button', ...props })
}

/**
 * input 组件
 */
export function input(
  props: BaseProps & {
    type?: PropValue<string>
    value?: PropValue<string | any>
    placeholder?: PropValue<string>
    disabled?: PropValue<boolean>
  }
): StringMountFunction {
  const { type, value, placeholder, disabled, attrs, ...restProps } = props as any

  const newAttrs = {
    ...(attrs || {}),
    ...(type !== undefined ? { type } : {}),
    ...(placeholder !== undefined ? { placeholder } : {}),
    ...(disabled !== undefined ? { disabled } : {})
  }

  return element({
    tag: 'input',
    ...restProps,
    attrs: newAttrs as any,
    ...(value !== undefined ? { value } : {})
  })
}

/**
 * a 组件 (链接)
 */
export const a: SyncComponent<
  StringHost,
  BaseProps & {
    href?: PropValue<string>
    target?: PropValue<string>
    textContent?: PropValue<string>
  }
> = (props) => {
  return element({ tag: 'a', ...props })
}

/**
 * img 组件
 */
export const img: SyncComponent<
  StringHost,
  BaseProps & {
    src?: PropValue<string>
    alt?: PropValue<string>
    width?: PropValue<string | number>
    height?: PropValue<string | number>
  }
> = (props) => {
  return element({ tag: 'img', ...props })
}

/**
 * p 组件 (段落)
 */
export function p(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'p', ...props })
}

/**
 * 标题组件
 */
export function h1(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'h1', ...props })
}

export function h2(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'h2', ...props })
}

export function h3(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'h3', ...props })
}

export function h4(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'h4', ...props })
}

export function h5(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'h5', ...props })
}

export function h6(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'h6', ...props })
}

/**
 * 列表组件
 */
export function ul(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'ul', ...props })
}

export function ol(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'ol', ...props })
}

export function li(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'li', ...props })
}

/**
 * 表单组件
 */
export function form(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'form', ...props })
}

export function label(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'label', ...props })
}

export function textarea(
  props: BaseProps & {
    value?: PropValue<string>
    placeholder?: PropValue<string>
    disabled?: PropValue<boolean>
    rows?: PropValue<number>
    cols?: PropValue<number>
  }
): StringMountFunction {
  const { value, placeholder, disabled, rows, cols, attrs, ...restProps } = props as any

  const newAttrs = {
    ...(attrs || {}),
    ...(placeholder !== undefined ? { placeholder } : {}),
    ...(disabled !== undefined ? { disabled } : {}),
    ...(rows !== undefined ? { rows } : {}),
    ...(cols !== undefined ? { cols } : {})
  }

  // textarea 的 value 应该作为 textContent
  return element({
    tag: 'textarea',
    ...restProps,
    attrs: newAttrs as any,
    ...(value !== undefined ? { textContent: String(value) } : {})
  })
}

export function select(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'select', ...props })
}

export function option(
  props: BaseProps & {
    value?: PropValue<string | number>
    selected?: PropValue<boolean>
  }
): StringMountFunction {
  const { value, selected, attrs, ...restProps } = props as any

  const newAttrs = {
    ...(attrs || {}),
    ...(value !== undefined ? { value } : {}),
    ...(selected ? { selected: true } : {})
  }

  return element({
    tag: 'option',
    ...restProps,
    attrs: newAttrs as any
  })
}

/**
 * 表格组件
 */
export function table(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'table', ...props })
}

export function thead(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'thead', ...props })
}

export function tbody(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'tbody', ...props })
}

export function tfoot(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'tfoot', ...props })
}

export function tr(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'tr', ...props })
}

export function th(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'th', ...props })
}

export function td(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'td', ...props })
}

/**
 * 语义化布局组件
 */
export function section(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'section', ...props })
}

export function article(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'article', ...props })
}

export function header(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'header', ...props })
}

export function footer(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'footer', ...props })
}

export function nav(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'nav', ...props })
}

export function main(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'main', ...props })
}

export function aside(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'aside', ...props })
}

/**
 * 其他常用元素
 */
export function br(): StringMountFunction {
  return element({ tag: 'br' })
}

export function hr(): StringMountFunction {
  return element({ tag: 'hr' })
}

export function pre(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'pre', ...props })
}

export function code(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'code', ...props })
}

export function blockquote(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'blockquote', ...props })
}

export function strong(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'strong', ...props })
}

export function em(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'em', ...props })
}

export function small(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'small', ...props })
}

export function mark(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'mark', ...props })
}

export function del(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'del', ...props })
}

export function ins(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'ins', ...props })
}

export function sub(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'sub', ...props })
}

export function sup(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'sup', ...props })
}

/**
 * 媒体元素
 */
export function video(
  props: BaseProps & {
    src?: PropValue<string>
    poster?: PropValue<string>
    controls?: PropValue<boolean>
    autoplay?: PropValue<boolean>
    loop?: PropValue<boolean>
    muted?: PropValue<boolean>
  }
): StringMountFunction {
  const { src, poster, controls, autoplay, loop, muted, attrs, ...restProps } = props as any

  const newAttrs = {
    ...(attrs || {}),
    ...(src !== undefined ? { src } : {}),
    ...(poster !== undefined ? { poster } : {}),
    ...(controls ? { controls: true } : {}),
    ...(autoplay ? { autoplay: true } : {}),
    ...(loop ? { loop: true } : {}),
    ...(muted ? { muted: true } : {})
  }

  return element({
    tag: 'video',
    ...restProps,
    attrs: newAttrs as any
  })
}

export function audio(
  props: BaseProps & {
    src?: PropValue<string>
    controls?: PropValue<boolean>
    autoplay?: PropValue<boolean>
    loop?: PropValue<boolean>
    muted?: PropValue<boolean>
  }
): StringMountFunction {
  const { src, controls, autoplay, loop, muted, attrs, ...restProps } = props as any

  const newAttrs = {
    ...(attrs || {}),
    ...(src !== undefined ? { src } : {}),
    ...(controls ? { controls: true } : {}),
    ...(autoplay ? { autoplay: true } : {}),
    ...(loop ? { loop: true } : {}),
    ...(muted ? { muted: true } : {})
  }

  return element({
    tag: 'audio',
    ...restProps,
    attrs: newAttrs as any
  })
}

export function source(
  props: BaseProps & {
    src?: PropValue<string>
    type?: PropValue<string>
  }
): StringMountFunction {
  const { src, type, attrs, ...restProps } = props as any

  const newAttrs = {
    ...(attrs || {}),
    ...(src !== undefined ? { src } : {}),
    ...(type !== undefined ? { type } : {})
  }

  return element({
    tag: 'source',
    ...restProps,
    attrs: newAttrs as any
  })
}

/**
 * iframe
 */
export function iframe(
  props: BaseProps & {
    src?: PropValue<string>
    width?: PropValue<string | number>
    height?: PropValue<string | number>
    frameborder?: PropValue<string | number>
    allowfullscreen?: PropValue<boolean>
  }
): StringMountFunction {
  const { src, width, height, frameborder, allowfullscreen, attrs, ...restProps } = props as any

  const newAttrs = {
    ...(attrs || {}),
    ...(src !== undefined ? { src } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(frameborder !== undefined ? { frameborder } : {}),
    ...(allowfullscreen ? { allowfullscreen: true } : {})
  }

  return element({
    tag: 'iframe',
    ...restProps,
    attrs: newAttrs as any
  })
}

/**
 * svg (简单支持，复杂 SVG 建议用 innerHTML)
 */
export function svg(...args: any[]): StringMountFunction {
  const props = normalizeArgs(...args)
  return element({ tag: 'svg', ...props })
}

/**
 * canvas (SSR 场景下只渲染空 canvas 标签)
 */
export function canvas(
  props: BaseProps & {
    width?: PropValue<string | number>
    height?: PropValue<string | number>
  }
): StringMountFunction {
  const { width, height, attrs, ...restProps } = props as any

  const newAttrs = {
    ...(attrs || {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {})
  }

  return element({
    tag: 'canvas',
    ...restProps,
    attrs: newAttrs as any
  })
}
