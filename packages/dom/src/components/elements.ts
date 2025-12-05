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

// 结构性元素
export const div = createElement('div')
export const span = createElement('span')
export const p = createElement('p')
export const br = createElement('br')
export const hr = createElement('hr')

// 标题
export const h1 = createElement('h1')
export const h2 = createElement('h2')
export const h3 = createElement('h3')
export const h4 = createElement('h4')
export const h5 = createElement('h5')
export const h6 = createElement('h6')

// 文本格式
export const strong = createElement('strong')
export const em = createElement('em')
export const small = createElement('small')
export const code = createElement('code')
export const pre = createElement('pre')
export const mark = createElement('mark')
export const del = createElement('del')
export const ins = createElement('ins')
export const sub = createElement('sub')
export const sup = createElement('sup')
export const b = createElement('b')
export const i = createElement('i')
export const u = createElement('u')

// 列表
export const ul = createElement('ul')
export const ol = createElement('ol')
export const li = createElement('li')
export const dl = createElement('dl')
export const dt = createElement('dt')
export const dd = createElement('dd')

// 链接和媒体
export const a = createElement('a')
export const img = createElement('img')
export const picture = createElement('picture')
export const source = createElement('source')
export const audio = createElement('audio')
export const video = createElement('video')
export const track = createElement('track')

// 表单
export const form = createElement('form')
export const input = createElement('input') as (
  propsOrChild?: Props<'input'> | Child,
  ...children: Child[]
) => Mountable<HTMLElement>
export const label = createElement('label')
export const button = createElement('button')
export const textarea = createElement('textarea')
export const select = createElement('select')
export const option = createElement('option')
export const optgroup = createElement('optgroup')
export const fieldset = createElement('fieldset')
export const legend = createElement('legend')
export const datalist = createElement('datalist')
export const output = createElement('output')

// 表格
export const table = createElement('table')
export const thead = createElement('thead')
export const tbody = createElement('tbody')
export const tfoot = createElement('tfoot')
export const tr = createElement('tr')
export const td = createElement('td')
export const th = createElement('th')
export const caption = createElement('caption')
export const colgroup = createElement('colgroup')
export const col = createElement('col')

// 语义化元素
export const section = createElement('section')
export const article = createElement('article')
export const header = createElement('header')
export const footer = createElement('footer')
export const nav = createElement('nav')
export const main = createElement('main')
export const aside = createElement('aside')
export const details = createElement('details')
export const summary = createElement('summary')
export const dialog = createElement('dialog')

// 其他元素
export const blockquote = createElement('blockquote')
export const figure = createElement('figure')
export const figcaption = createElement('figcaption')
export const address = createElement('address')
export const time = createElement('time')
