import type { Mountable } from '@rasenjs/core'
import { element, type ElementProps, type HTMLTagName } from './element'

// ============================================================================
// 类型工具
// ============================================================================

/** 元素组件的 Props 类型（不含 tag） */
type Props<T extends HTMLTagName> = Omit<ElementProps<T>, 'tag'>

/** Child 类型 */
type Child = Mountable<HTMLElement> | string

/**
 * 创建元素组件的工厂函数
 * 支持: el(), el('text'), el(child), el(props), el(props, ...children)
 * 最终统一转成 element({ tag, children, ... }) 的形式
 */
function createElement<T extends HTMLTagName>(tag: T) {
  return (
    propsOrChild?: Props<T> | Child,
    ...restChildren: Child[]
  ): Mountable<HTMLElement> => {
    // 没有参数
    if (propsOrChild === undefined) {
      return element({ tag } as unknown as ElementProps<T>)
    }

    // 第一个参数是 string 或 function (Mountable)，当作 child
    if (
      typeof propsOrChild === 'string' ||
      typeof propsOrChild === 'function'
    ) {
      const children = [propsOrChild, ...restChildren]
      return element({ tag, children } as unknown as ElementProps<T>)
    }

    // 第一个参数是 props 对象
    const props = propsOrChild as Props<T>
    if (restChildren.length > 0) {
      // 合并 children
      const existingChildren = props.children
      const children = Array.isArray(existingChildren)
        ? [...existingChildren, ...restChildren]
        : existingChildren !== undefined
          ? [existingChildren as Child, ...restChildren]
          : restChildren
      return element({ tag, ...props, children } as unknown as ElementProps<T>)
    }

    return element({ tag, ...props } as unknown as ElementProps<T>)
  }
}

// ============================================================================
// 通用元素组件
// ============================================================================

export const div = createElement('div')
export const span = createElement('span')
export const button = createElement('button')
export const a = createElement('a')
export const p = createElement('p')
export const h1 = createElement('h1')
export const h2 = createElement('h2')
export const h3 = createElement('h3')
export const h4 = createElement('h4')
export const h5 = createElement('h5')
export const h6 = createElement('h6')
export const ul = createElement('ul')
export const ol = createElement('ol')
export const li = createElement('li')
export const code = createElement('code')
export const pre = createElement('pre')
export const strong = createElement('strong')
export const em = createElement('em')
export const small = createElement('small')
export const nav = createElement('nav')
export const section = createElement('section')
export const article = createElement('article')
export const header = createElement('header')
export const footer = createElement('footer')
export const main = createElement('main')
export const aside = createElement('aside')
export const form = createElement('form')
export const input = createElement('input') as (
  propsOrChild?: Props<'input'> | Child,
  ...children: Child[]
) => Mountable<HTMLElement>
export const img = createElement('img')
export const label = createElement('label')
export const textarea = createElement('textarea')
export const select = createElement('select')
export const option = createElement('option')
export const br = createElement('br')
export const hr = createElement('hr')
