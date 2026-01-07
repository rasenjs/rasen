/**
 * Default configuration - auto-configure web tags
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
  // svg, // SVG requires separate handling
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
} from '@rasenjs/web'

// Auto-configure default web tags
// Use empty string as prefix to indicate these are unprefixed tags
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
