/**
 * JSX Runtime integration for @rasenjs/web (Browser/DOM)
 * 
 * Auto-configures jsx-runtime with DOM primitives and tags.
 * This version is used in browser/client-side environments.
 */

import { setTextPrimitive, setFragmentPrimitive, configureTags, type TextPrimitive, type FragmentPrimitive } from '@rasenjs/jsx-runtime'
import * as webComponents from './dom'

// Configure primitives
setTextPrimitive(webComponents.text as TextPrimitive)
setFragmentPrimitive(webComponents.fragment as FragmentPrimitive)

// Configure all web tags
configureTags({
  '': {
    // Text elements
    div: webComponents.div,
    span: webComponents.span,
    p: webComponents.p,
    a: webComponents.a,
    
    // Headings
    h1: webComponents.h1,
    h2: webComponents.h2,
    h3: webComponents.h3,
    h4: webComponents.h4,
    h5: webComponents.h5,
    h6: webComponents.h6,
    
    // Form elements
    button: webComponents.button,
    input: webComponents.input,
    textarea: webComponents.textarea,
    select: webComponents.select,
    option: webComponents.option,
    label: webComponents.label,
    form: webComponents.form,
    
    // Lists
    ul: webComponents.ul,
    ol: webComponents.ol,
    li: webComponents.li,
    
    // Media
    img: webComponents.img,
    canvas: webComponents.canvas,
    
    // Semantic HTML5
    section: webComponents.section,
    article: webComponents.article,
    header: webComponents.header,
    footer: webComponents.footer,
    nav: webComponents.nav,
    main: webComponents.main,
    aside: webComponents.aside,
    
    // Formatting
    code: webComponents.code,
    pre: webComponents.pre,
    strong: webComponents.strong,
    em: webComponents.em,
    small: webComponents.small,
    br: webComponents.br,
    hr: webComponents.hr,
  }
})

// Re-export jsx-runtime
export * from '@rasenjs/jsx-runtime'
