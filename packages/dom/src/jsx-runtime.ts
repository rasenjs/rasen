/**
 * JSX Runtime integration for @rasenjs/dom (SPA/Client-side)
 * 
 * Auto-configures jsx-runtime with DOM primitives and tags.
 */

import { setTextPrimitive, setFragmentPrimitive, configureTags, type TextPrimitive, type FragmentPrimitive } from '@rasenjs/jsx-runtime'
import {
  text,
  fragment,
  // Text elements
  div,
  span,
  p,
  a,
  // Headings
  h1,
  h2,
  h3,
  h4,
  h5,
  h6,
  // Form elements
  button,
  input,
  textarea,
  select,
  option,
  label,
  form,
  // Lists
  ul,
  ol,
  li,
  // Media
  img,
  canvas,
  // Semantic HTML5
  section,
  article,
  header,
  footer,
  nav,
  main,
  aside,
  // Formatting
  code,
  pre,
  strong,
  em,
  small,
  br,
  hr,
} from './index'

// Configure primitives
setTextPrimitive(text as TextPrimitive)
setFragmentPrimitive(fragment as FragmentPrimitive)

// Configure all DOM tags
configureTags({
  '': {
    div,
    span,
    p,
    a,
    h1,
    h2,
    h3,
    h4,
    h5,
    h6,
    button,
    input,
    textarea,
    select,
    option,
    label,
    form,
    ul,
    ol,
    li,
    img,
    canvas,
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
    hr,
  }
})

// Re-export jsx-runtime
export * from '@rasenjs/jsx-runtime'
