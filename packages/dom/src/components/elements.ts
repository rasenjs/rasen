import type { SyncComponent, PropValue, Mountable, Ref } from '@rasenjs/core'
import { mountable } from '@rasenjs/core'
import { element } from './element'

console.log('🔥 elements.ts loaded - SOURCE CODE VERSION with event fix')

interface BaseProps {
  id?: PropValue<string>
  class?: PropValue<string>
  className?: PropValue<string>
  style?: PropValue<Record<string, string | number>>
  attrs?: PropValue<Record<string, string | number | boolean>>
  /** Text content or child mount functions */
  children?: PropValue<string> | Array<Mountable<HTMLElement>>
  on?: Record<string, (e: Event) => void>
  onClick?: (e: Event) => void
  onInput?: (e: Event) => void
  onKeyPress?: (e: Event) => void
  /** Element reference */
  ref?: Ref<HTMLElement | null>
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
    // 如果是字符串，作为 children (text content)
    if (typeof first === 'string') {
      return { children: first }
    }
    // 如果是函数，当作 child mount 函数
    // （对于需要响应式 children 的情况，应该用 { children: () => ... } 的形式）
    if (typeof first === 'function') {
      return { children: [first] }
    }
    // 否则当作 props 对象，继续处理
    // 注意：不能直接返回，需要继续处理 class 别名和事件简写
  }

  // 多个参数或单个对象参数：提取 props 和 children
  const props = typeof first === 'object' && first !== null ? { ...first } : {}
  const children: Mountable<HTMLElement>[] = []

  // 处理后续参数作为 children（仅多个参数时）
  if (args.length > 1) {
    for (let i = 1; i < args.length; i++) {
      const child = args[i]
      if (child === null || child === undefined) continue

      if (typeof child === 'function') {
        children.push(child)
      } else if (typeof child === 'string') {
        // 字符串 child 转换为 text node 的 mount 函数
        children.push(mountable((host: HTMLElement) => {
          const textNode = document.createTextNode(child)
          host.appendChild(textNode)
          return () => textNode.remove()
        }))
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

  // 处理事件简写
  const on = props.on || {}
  if (props.onClick) {
    on.click = props.onClick
    delete props.onClick
  }
  if (props.onInput) {
    on.input = props.onInput
    delete props.onInput
  }
  if (props.onKeyPress) {
    on.keypress = props.onKeyPress
    delete props.onKeyPress
  }
  if (Object.keys(on).length > 0) {
    props.on = on
  }

  return props
}

/**
 * div 组件
 */
export function div(...args: any[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'div', ...props })
}

/**
 * span 组件
 */
export function span(...args: any[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'span', ...props })
}

/**
 * button 组件
 */
export function button(...args: any[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'button', ...props })
}

/**
 * input 组件
 */
export function input(props: BaseProps & {
  type?: PropValue<string>
  value?: PropValue<string | any>
  placeholder?: PropValue<string>
  disabled?: PropValue<boolean>
  /** checkbox/radio 的选中状态 */
  checked?: PropValue<boolean>
  /** change 事件处理器 */
  onChange?: (e: Event) => void
}): Mountable<HTMLElement> {
  const { type, value, placeholder, disabled, checked, attrs, ...restProps } = props as any
  
  // 提取所有 on* 事件处理器
  const on: Record<string, (e: Event) => void> = {}
  const cleanProps: any = {}
  
  for (const key in restProps) {
    if (key.startsWith('on') && typeof restProps[key] === 'function') {
      // onClick -> click, onInput -> input, onChange -> change
      const eventName = key.slice(2).toLowerCase()
      on[eventName] = restProps[key]
    } else {
      cleanProps[key] = restProps[key]
    }
  }
  
  const newAttrs = {
    ...(attrs || {}),
    ...(type !== undefined ? { type } : {}),
    ...(placeholder !== undefined ? { placeholder } : {}),
    ...(disabled !== undefined ? { disabled } : {})
  }
  
  return element({ 
    tag: 'input', 
    ...cleanProps,
    attrs: newAttrs as any,
    ...(value !== undefined ? { value } : {}),
    ...(checked !== undefined ? { checked } : {}),
    ...(Object.keys(on).length > 0 ? { on } : {})
  })
}

/**
 * a 组件 (链接)
 */
export const a: SyncComponent<
  HTMLElement,
  BaseProps & {
    href?: PropValue<string>
    target?: PropValue<string>
  }
> = (props) => {
  return element({ tag: 'a', ...props })
}

/**
 * img 组件
 */
export const img: SyncComponent<
  HTMLElement,
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
export const p: SyncComponent<
  HTMLElement,
  BaseProps
> = (props) => {
  return element({ tag: 'p', ...props })
}

/**
 * h1 组件
 */
export function h1(...args: any[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'h1', ...props })
}

/**
 * h2 组件
 */
export function h2(...args: any[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'h2', ...props })
}

/**
 * h3 组件
 */
export function h3(...args: any[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'h3', ...props })
}

/**
 * h4 组件
 */
export function h4(...args: any[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'h4', ...props })
}

/**
 * h5 组件
 */
export function h5(...args: any[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'h5', ...props })
}

/**
 * h6 组件
 */
export function h6(...args: any[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'h6', ...props })
}

/**
 * ul 组件 (无序列表)
 */
export function ul(...args: any[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'ul', ...props })
}

/**
 * ol 组件 (有序列表)
 */
export function ol(...args: any[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'ol', ...props })
}

/**
 * li 组件 (列表项)
 */
export function li(...args: any[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'li', ...props })
}

/**
 * form 组件
 */
export const form: SyncComponent<HTMLElement, BaseProps> = (props) => {
  return element({ tag: 'form', ...props })
}

/**
 * label 组件
 */
export const label: SyncComponent<
  HTMLElement,
  BaseProps & {
    htmlFor?: PropValue<string>
  }
> = (props) => {
  return element({ tag: 'label', ...props })
}

/**
 * textarea 组件
 */
export const textarea: SyncComponent<
  HTMLElement,
  BaseProps & {
    value?: PropValue<string>
    placeholder?: PropValue<string>
    rows?: PropValue<number>
    cols?: PropValue<number>
  }
> = (props) => {
  return element({ tag: 'textarea', ...props })
}

/**
 * select 组件
 */
export const select: SyncComponent<HTMLElement, BaseProps> = (props) => {
  return element({ tag: 'select', ...props })
}

/**
 * option 组件
 */
export const option: SyncComponent<
  HTMLElement,
  BaseProps & {
    value?: PropValue<string>
    selected?: PropValue<boolean>
  }
> = (props) => {
  return element({ tag: 'option', ...props })
}

/**
 * canvas 组件
 */
export const canvas: SyncComponent<
  HTMLElement,
  BaseProps & {
    width?: PropValue<number>
    height?: PropValue<number>
  }
> = (props) => {
  return element({ tag: 'canvas', ...props })
}

/**
 * svg 组件
 */
export const svg: SyncComponent<HTMLElement, BaseProps> = (props) => {
  return element({ tag: 'svg', ...props })
}

/**
 * section 组件
 */
export const section: SyncComponent<HTMLElement, BaseProps> = (props) => {
  return element({ tag: 'section', ...props })
}

/**
 * article 组件
 */
export const article: SyncComponent<HTMLElement, BaseProps> = (props) => {
  return element({ tag: 'article', ...props })
}

/**
 * header 组件
 */
export const header: SyncComponent<HTMLElement, BaseProps> = (props) => {
  return element({ tag: 'header', ...props })
}

/**
 * footer 组件
 */
export const footer: SyncComponent<HTMLElement, BaseProps> = (props) => {
  return element({ tag: 'footer', ...props })
}

/**
 * nav 组件
 */
export const nav: SyncComponent<HTMLElement, BaseProps> = (props) => {
  return element({ tag: 'nav', ...props })
}

/**
 * main 组件
 */
export const main: SyncComponent<HTMLElement, BaseProps> = (props) => {
  return element({ tag: 'main', ...props })
}

/**
 * aside 组件
 */
export const aside: SyncComponent<HTMLElement, BaseProps> = (props) => {
  return element({ tag: 'aside', ...props })
}

/**
 * code 组件 (代码)
 */
export function code(...args: any[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'code', ...props })
}

/**
 * pre 组件 (预格式化文本)
 */
export function pre(...args: any[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'pre', ...props })
}

/**
 * strong 组件 (强调)
 */
export function strong(...args: any[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'strong', ...props })
}

/**
 * em 组件 (斜体强调)
 */
export function em(...args: any[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'em', ...props })
}

/**
 * small 组件
 */
export function small(...args: any[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'small', ...props })
}

/**
 * br 组件 (换行)
 */
export const br: SyncComponent<HTMLElement, BaseProps> = (props = {}) => {
  return element({ tag: 'br', ...props })
}

/**
 * hr 组件 (分隔线)
 */
export const hr: SyncComponent<HTMLElement, BaseProps> = (props = {}) => {
  return element({ tag: 'hr', ...props })
}
