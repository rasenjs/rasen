/**
 * DOM 组件
 */

export { domContext } from './dom-context'
export { element } from './element'
export { html } from './html'
export { each } from './each'
export { when } from './when'
export { show } from './show'
export { canvas, contextGetters } from './canvas'
export type { ContextGetter } from './canvas'
export {
  div,
  span,
  button,
  input,
  a,
  img,
  p,
  h1,
  h2,
  h3,
  ul,
  ol,
  li,
  form,
  label,
  textarea,
  select,
  option,
  // canvas, // 使用 canvas-bridge 的 canvas 组件
  svg,
  section,
  article,
  header,
  footer,
  nav,
  main,
  aside
} from './elements'
