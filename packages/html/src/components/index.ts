/**
 * HTML 组件导出
 */

export { stringContext, renderToString, renderToStringMultiple } from './string-context'
export { element } from './element'
export { html } from './html'
export { text } from './text'
export type { TextProps } from './text'
export { fragment, f } from './fragment'
export { when } from './when'
export { each, repeat } from './each'
export { match } from './match'
export { transition, fade, slide, scale } from './transition'
export type { TransitionConfig } from './transition'
// The prop shape every element factory accepts — re-exported so the host's
// `jsx-runtime.d.ts` can type `IntrinsicElements` without reaching into
// `@rasenjs/dom` (a dev-only dependency of this package).
export type { BaseProps, StyleRecord, Child } from './elements'
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
  dl,
  dt,
  dd,
  // 表单
  form,
  label,
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
  th,
  td,
  caption,
  colgroup,
  col,
  // 语义化布局
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
  figure,
  figcaption,
  address,
  time,
  // 文本格式
  b,
  i,
  u,
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
  track,
  picture,
  iframe,
  svg,
  canvas
} from './elements'
