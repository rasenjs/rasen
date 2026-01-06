/**
 * DOM 组件
 */

export { domContext } from './dom-context'
export { element } from './element'
export type { ElementProps, HTMLTagName } from './element'
export { html } from './html'
export { each, repeat } from './each'
export { when } from './when'
export { switchCase } from './switch'
export { show } from './show'
export { canvas, contextGetters } from './canvas'
export type { ContextGetter } from './canvas'
export { lazy, createLazy } from './lazy'
export type { LazyConfig, CreateLazy } from './lazy'
export {
  // 结构性元素
  div,
  span,
  p,
  br,
  hr,
  // 标题
  h1,
  h2,
  h3,
  h4,
  h5,
  h6,
  // 文本格式
  strong,
  em,
  small,
  code,
  pre,
  mark,
  del,
  ins,
  sub,
  sup,
  b,
  i,
  u,
  // 列表
  ul,
  ol,
  li,
  dl,
  dt,
  dd,
  // 链接和媒体
  a,
  img,
  picture,
  source,
  audio,
  video,
  track,
  // 表单
  form,
  label,
  input,
  button,
  textarea,
  select,
  option,
  optgroup,
  fieldset,
  legend,
  datalist,
  output,
  // 表格
  table,
  thead,
  tbody,
  tfoot,
  tr,
  td,
  th,
  caption,
  colgroup,
  col,
  // 语义化元素
  section,
  article,
  header,
  footer,
  nav,
  main,
  aside,
  details,
  summary,
  dialog,
  // 其他元素
  blockquote,
  figure,
  figcaption,
  address,
  time
} from './elements'
