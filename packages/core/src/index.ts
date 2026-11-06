export * from './types'
export * from './frame'
export * from './reactive'
export * from './components'
export * from './marker-constants'
export * from './host-context'
export * from './image-adapter'
export { com } from './com'
export { mount } from './mount'
export { enterHmrModule, exitHmrModule } from './hmr'
// JSX has no runtime surface: jsx-runtime is a types-only entry
// (jsxImportSource resolves to its `.d.ts`), and Fragment is the structural
// core component hosts alias for their text-capable variant.
export { fragment as Fragment } from './components/fragment'
export type {
  JSXElement,
  JSXElementChildrenAttribute,
  JSXIntrinsicAttributes,
} from './jsx-runtime/jsx-namespace'

export {
  escapeHtml,
  escapeAttr,
  renderText,
  stringifyStyleInline,
} from './html-escape'
export {
  camelToKebab,
  getAttrName,
  isEventProp,
  getEventName,
  attrValue,
} from './html-attributes'
export { collectHtml } from './collect-html'
