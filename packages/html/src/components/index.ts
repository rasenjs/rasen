/**
 * HTML 组件导出
 */

export { stringContext, renderToString, renderToStringMultiple } from './string-context'
export { element } from './element'
export { html } from './html'
export { text } from './text'
export type { TextProps } from './text'
export { fragment, f } from './fragment'
export {
  // 基础元素
  div,
  span,
  button,
  input,
  a,
  img,
  p,
  // 标题
  h1,
  h2,
  h3,
  h4,
  h5,
  h6,
  // 列表
  ul,
  ol,
  li,
  // 表单
  form,
  label,
  textarea,
  select,
  option,
  // 表格
  table,
  thead,
  tbody,
  tfoot,
  tr,
  th,
  td,
  // 语义化布局
  section,
  article,
  header,
  footer,
  nav,
  main,
  aside,
  // 其他
  br,
  hr,
  pre,
  code,
  blockquote,
  strong,
  em,
  small,
  mark,
  del,
  ins,
  sub,
  sup,
  // 媒体
  video,
  audio,
  source,
  iframe,
  svg,
  canvas
} from './elements'
