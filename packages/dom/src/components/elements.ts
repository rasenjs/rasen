import { tag } from './element'

// ============================================================================
// 通用元素组件
// ============================================================================

// 结构性元素
export const div = tag('div')
export const span = tag('span')
export const p = tag('p')
export const br = tag('br')
export const hr = tag('hr')

// 标题
export const h1 = tag('h1')
export const h2 = tag('h2')
export const h3 = tag('h3')
export const h4 = tag('h4')
export const h5 = tag('h5')
export const h6 = tag('h6')

// 文本格式
export const strong = tag('strong')
export const em = tag('em')
export const small = tag('small')
export const code = tag('code')
export const pre = tag('pre')
export const mark = tag('mark')
export const del = tag('del')
export const ins = tag('ins')
export const sub = tag('sub')
export const sup = tag('sup')
export const b = tag('b')
export const i = tag('i')
export const u = tag('u')

// 列表
export const ul = tag('ul')
export const ol = tag('ol')
export const li = tag('li')
export const dl = tag('dl')
export const dt = tag('dt')
export const dd = tag('dd')

// 链接和媒体
export const a = tag('a')
export const img = tag('img')
export const picture = tag('picture')
export const source = tag('source')
export const audio = tag('audio')
export const video = tag('video')
export const track = tag('track')

// 表单
export const form = tag('form')
export const input = tag('input')
export const label = tag('label')
export const button = tag('button')
export const textarea = tag('textarea')
export const select = tag('select')
export const option = tag('option')
export const optgroup = tag('optgroup')
export const fieldset = tag('fieldset')
export const legend = tag('legend')
export const datalist = tag('datalist')
export const output = tag('output')

// 表格
export const table = tag('table')
export const thead = tag('thead')
export const tbody = tag('tbody')
export const tfoot = tag('tfoot')
export const tr = tag('tr')
export const td = tag('td')
export const th = tag('th')
export const caption = tag('caption')
export const colgroup = tag('colgroup')
export const col = tag('col')

// 语义化元素
export const section = tag('section')
export const article = tag('article')
export const header = tag('header')
export const footer = tag('footer')
export const nav = tag('nav')
export const main = tag('main')
export const aside = tag('aside')
export const details = tag('details')
export const summary = tag('summary')
export const dialog = tag('dialog')

// 其他元素
export const blockquote = tag('blockquote')
export const figure = tag('figure')
export const figcaption = tag('figcaption')
export const address = tag('address')
export const time = tag('time')

// ============================================================================
// 可静态提升的内置标签清单
//
// 编译器（@rasenjs/compiler）据此判断一个 JSX 标签能否做静态提升：
// 标签名 ∈ INTRINSIC_TAGS → 宿主内置标签 → 可提升为 template；
// 否则 → 组件（div/rect/自定义元素都走组件路径，不靠大小写区分）。
// ============================================================================
export const INTRINSIC_TAGS = [
  // 结构性元素
  'div', 'span', 'p', 'br', 'hr',
  // 标题
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  // 文本格式
  'strong', 'em', 'small', 'code', 'pre', 'mark', 'del', 'ins', 'sub', 'sup', 'b', 'i', 'u',
  // 列表
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  // 链接和媒体
  'a', 'img', 'picture', 'source', 'audio', 'video', 'track',
  // 表单
  'form', 'input', 'label', 'button', 'textarea', 'select', 'option', 'optgroup',
  'fieldset', 'legend', 'datalist', 'output',
  // 表格
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
  // 语义化元素
  'section', 'article', 'header', 'footer', 'nav', 'main', 'aside', 'details', 'summary', 'dialog',
  // 其他元素
  'blockquote', 'figure', 'figcaption', 'address', 'time',
] as const

export type IntrinsicTag = (typeof INTRINSIC_TAGS)[number]
