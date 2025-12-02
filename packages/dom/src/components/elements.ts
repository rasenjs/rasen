import type { PropValue, Mountable, Ref, SyncComponent } from '@rasenjs/core'
import { mountable } from '@rasenjs/core'
import { element } from './element'

/**
 * 基础 Props 类型
 * 扁平化设计：
 * - ref, children: 框架特殊 props
 * - on* 开头: 事件处理器
 * - data*, aria* 开头: 自动转 kebab-case
 * - 其余: HTML 属性
 */
interface BaseProps {
  class?: PropValue<string>
  style?: PropValue<Record<string, string | number>>
  children?: PropValue<string> | Array<Mountable<HTMLElement>>
  ref?: Ref<HTMLElement | null>
  // 允许任意其他属性（HTML 属性 + 事件）
  [key: string]: unknown
}

/**
 * 规范化参数为标准 props 对象
 */
function normalizeArgs(...args: unknown[]): BaseProps {
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
    if (typeof first === 'function') {
      return { children: [first as unknown as Mountable<HTMLElement>] }
    }
    // 否则当作 props 对象
    if (typeof first === 'object' && first !== null) {
      return { ...first } as BaseProps
    }
    return {}
  }

  // 多个参数：第一个是 props，后续是 children
  const props: BaseProps = typeof first === 'object' && first !== null ? { ...first } as BaseProps : {}
  const children: Mountable<HTMLElement>[] = []

  for (let i = 1; i < args.length; i++) {
    const child = args[i]
    if (child === null || child === undefined) continue

    if (typeof child === 'function') {
      children.push(child as unknown as Mountable<HTMLElement>)
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
    const existingChildren = props.children
    if (Array.isArray(existingChildren)) {
      props.children = [...existingChildren, ...children]
    } else {
      props.children = children
    }
  }

  return props
}

/**
 * div 组件
 */
export function div(...args: unknown[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'div', ...props })
}

/**
 * span 组件
 */
export function span(...args: unknown[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'span', ...props })
}

/**
 * button 组件
 */
export function button(...args: unknown[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'button', ...props })
}

/**
 * input 组件
 * 
 * 特殊属性由 element 统一处理：
 * - value, checked, disabled 等作为 DOM property 设置
 */
export function input(props: BaseProps & {
  type?: PropValue<string>
  value?: PropValue<string | number>
  placeholder?: PropValue<string>
  disabled?: PropValue<boolean>
  name?: PropValue<string>
  readOnly?: PropValue<boolean>
  /** checkbox/radio 的选中状态 */
  checked?: PropValue<boolean>
  /** change 事件处理器 */
  onChange?: (e: Event) => void
  /** input 事件处理器 */
  onInput?: (e: Event) => void
}): Mountable<HTMLInputElement> {
  return element({ tag: 'input', ...props }) as Mountable<HTMLInputElement>
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
export function p(...args: unknown[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'p', ...props })
}

/**
 * h1 组件
 */
export function h1(...args: unknown[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'h1', ...props })
}

/**
 * h2 组件
 */
export function h2(...args: unknown[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'h2', ...props })
}

/**
 * h3 组件
 */
export function h3(...args: unknown[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'h3', ...props })
}

/**
 * h4 组件
 */
export function h4(...args: unknown[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'h4', ...props })
}

/**
 * h5 组件
 */
export function h5(...args: unknown[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'h5', ...props })
}

/**
 * h6 组件
 */
export function h6(...args: unknown[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'h6', ...props })
}

/**
 * ul 组件 (无序列表)
 */
export function ul(...args: unknown[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'ul', ...props })
}

/**
 * ol 组件 (有序列表)
 */
export function ol(...args: unknown[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'ol', ...props })
}

/**
 * li 组件 (列表项)
 */
export function li(...args: unknown[]): Mountable<HTMLElement> {
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
export function code(...args: unknown[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'code', ...props })
}

/**
 * pre 组件 (预格式化文本)
 */
export function pre(...args: unknown[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'pre', ...props })
}

/**
 * strong 组件 (强调)
 */
export function strong(...args: unknown[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'strong', ...props })
}

/**
 * em 组件 (斜体强调)
 */
export function em(...args: unknown[]): Mountable<HTMLElement> {
  const props = normalizeArgs(...args)
  return element({ tag: 'em', ...props })
}

/**
 * small 组件
 */
export function small(...args: unknown[]): Mountable<HTMLElement> {
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
