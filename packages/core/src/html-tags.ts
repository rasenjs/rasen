/**
 * The canonical HTML tag list — the single source of truth for "which tags are
 * host elements".
 *
 * Three consumers used to keep their own copy: `@rasenjs/dom` (the element
 * factories + `INTRINSIC_TAGS`), the compiler (`DEFAULT_INTRINSIC_TAGS`, which
 * decides whether a tag compiles to a `template()` or is treated as a
 * component), and the JSX runtimes. A tag that exists in one list and not the
 * other is a silent behaviour split — a `template()` in one host, a component
 * call in the next.
 *
 * Pure data, no imports: this module is loadable from any tool (the compiler
 * includes it in a test to keep its table honest), and `.`  re-exports nothing
 * from here, so a bundler can drop it entirely.
 */
export const HTML_TAGS = [
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

export type HtmlTag = (typeof HTML_TAGS)[number]
