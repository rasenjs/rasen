/**
 * 默认配置 - 自动配置 DOM 标签
 */

import { configureTags } from './tag-config'
import {
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
  h4,
  h5,
  h6,
  ul,
  ol,
  li,
  form,
  label,
  textarea,
  select,
  option,
  canvas,
  // svg, // SVG 需要单独处理
  section,
  article,
  header,
  footer,
  nav,
  main,
  aside,
  code,
  pre,
  strong,
  em,
  small,
  br,
  hr
} from '@rasenjs/dom'

// 自动配置默认 DOM 标签
// 使用空字符串作为前缀，表示这些是无前缀的标签
configureTags({
  '': {
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
    h4,
    h5,
    h6,
    ul,
    ol,
    li,
    form,
    label,
    textarea,
    select,
    option,
    canvas,
    // svg,
    section,
    article,
    header,
    footer,
    nav,
    main,
    aside,
    code,
    pre,
    strong,
    em,
    small,
    br,
    hr
  }
})
