import type { PropValue, Mountable } from '@rasenjs/core'
import type { StringHost } from '../types'
import { element } from './element'

// ============================================================================
// Type definitions
// ============================================================================

interface BaseProps {
  id?: PropValue<string>
  class?: PropValue<string>
  className?: PropValue<string>
  style?: PropValue<Record<string, string | number>>
  attrs?: PropValue<Record<string, string | number | boolean>>
  /** Text content or child mount functions */
  children?: PropValue<string> | Array<string | (() => string | number) | Mountable<StringHost>>
  // SSR does not support events - removed on, onClick, onInput, etc.
}

/** Child type - 响应式文本函数优先匹配 */
type Child = string | (() => string | number) | Mountable<StringHost>

/**
 * Factory function to create HTML element components
 * Supports: el(), el('text'), el(child), el(props), el(props, ...children)
 */
function createElement(tag: string) {
  return (
    propsOrChild?: BaseProps | Child,
    ...restChildren: Child[]
  ): Mountable<StringHost> => {
    // No arguments
    if (propsOrChild === undefined) {
      return element({ tag })
    }

    // First argument is string or function (Mountable or reactive text), treat as child
    if (
      typeof propsOrChild === 'string' ||
      typeof propsOrChild === 'function'
    ) {
      const children = [propsOrChild, ...restChildren]
      return element({ tag, children })
    }
    
    // First argument is props object
    const props = propsOrChild as BaseProps
    
    // Normalize props: convert `class` to `className` for element()
    const { class: cls, className, ...restProps } = props as any
    const normalizedProps = {
      ...restProps,
      className: className || cls
    }
    
    if (restChildren.length > 0) {
      // Merge children
      const existingChildren = props.children
      const children = Array.isArray(existingChildren)
        ? [...existingChildren, ...restChildren]
        : existingChildren !== undefined
          ? [existingChildren, ...restChildren]
          : restChildren
      
      return element({ tag, ...normalizedProps, children })
    }

    return element({ tag, ...normalizedProps })
  }
}

// ============================================================================
// Common elements
// ============================================================================

export const div = createElement('div')
export const span = createElement('span')
export const button = createElement('button')
export const a = createElement('a')
export const p = createElement('p')

// Headings
export const h1 = createElement('h1')
export const h2 = createElement('h2')
export const h3 = createElement('h3')
export const h4 = createElement('h4')
export const h5 = createElement('h5')
export const h6 = createElement('h6')

// Lists
export const ul = createElement('ul')
export const ol = createElement('ol')
export const li = createElement('li')

// Forms
export const form = createElement('form')
export const label = createElement('label')
export const select = createElement('select')

// Tables
export const table = createElement('table')
export const thead = createElement('thead')
export const tbody = createElement('tbody')
export const tfoot = createElement('tfoot')
export const tr = createElement('tr')
export const th = createElement('th')
export const td = createElement('td')

// Semantic layout
export const section = createElement('section')
export const article = createElement('article')
export const header = createElement('header')
export const footer = createElement('footer')
export const nav = createElement('nav')
export const main = createElement('main')
export const aside = createElement('aside')

// Other common elements
export const pre = createElement('pre')
export const code = createElement('code')
export const blockquote = createElement('blockquote')
export const strong = createElement('strong')
export const em = createElement('em')
export const small = createElement('small')
export const mark = createElement('mark')
export const del = createElement('del')
export const ins = createElement('ins')
export const sub = createElement('sub')
export const sup = createElement('sup')
export const svg = createElement('svg')

// Self-closing elements
export const br = () => element({ tag: 'br' })
export const hr = () => element({ tag: 'hr' })

// ============================================================================
// Special elements with extended props
// ============================================================================

/**
 * input component
 */
export const input = (
  props: BaseProps & {
    type?: PropValue<string>
    value?: PropValue<string | any>
    placeholder?: PropValue<string>
    disabled?: PropValue<boolean>
  }
): Mountable<StringHost> => {
  const { type, value, placeholder, disabled, attrs, ...restProps } = props as any

  const newAttrs = {
    ...(attrs || {}),
    ...(type !== undefined ? { type } : {}),
    ...(placeholder !== undefined ? { placeholder } : {}),
    ...(disabled !== undefined ? { disabled } : {})
  }

  return element({
    tag: 'input',
    ...restProps,
    attrs: newAttrs as any,
    ...(value !== undefined ? { value } : {})
  })
}

/**
 * img component
 */
export const img = (props: BaseProps & {
  src?: PropValue<string>
  alt?: PropValue<string>
  width?: PropValue<string | number>
  height?: PropValue<string | number>
}): Mountable<StringHost> => {
  return element({ tag: 'img', ...props })
}

/**
 * textarea component
 */
export const textarea = (
  props: BaseProps & {
    value?: PropValue<string>
    placeholder?: PropValue<string>
    disabled?: PropValue<boolean>
    rows?: PropValue<number>
    cols?: PropValue<number>
  }
): Mountable<StringHost> => {
  const { value, placeholder, disabled, rows, cols, attrs, ...restProps } = props as any

  const newAttrs = {
    ...(attrs || {}),
    ...(placeholder !== undefined ? { placeholder } : {}),
    ...(disabled !== undefined ? { disabled } : {}),
    ...(rows !== undefined ? { rows } : {}),
    ...(cols !== undefined ? { cols } : {})
  }

  // textarea value should be children (text content)
  return element({
    tag: 'textarea',
    ...restProps,
    attrs: newAttrs as any,
    ...(value !== undefined ? { children: String(value) } : {})
  })
}

/**
 * option component
 */
export const option = (
  props: BaseProps & {
    value?: PropValue<string | number>
    selected?: PropValue<boolean>
  }
): Mountable<StringHost> => {
  const { value, selected, attrs, ...restProps } = props as any

  const newAttrs = {
    ...(attrs || {}),
    ...(value !== undefined ? { value } : {}),
    ...(selected ? { selected: true } : {})
  }

  return element({
    tag: 'option',
    ...restProps,
    attrs: newAttrs as any
  })
}

/**
 * video component
 */
export const video = (
  props: BaseProps & {
    src?: PropValue<string>
    poster?: PropValue<string>
    controls?: PropValue<boolean>
    autoplay?: PropValue<boolean>
    loop?: PropValue<boolean>
    muted?: PropValue<boolean>
  }
): Mountable<StringHost> => {
  const { src, poster, controls, autoplay, loop, muted, attrs, ...restProps } = props as any

  const newAttrs = {
    ...(attrs || {}),
    ...(src !== undefined ? { src } : {}),
    ...(poster !== undefined ? { poster } : {}),
    ...(controls ? { controls: true } : {}),
    ...(autoplay ? { autoplay: true } : {}),
    ...(loop ? { loop: true } : {}),
    ...(muted ? { muted: true } : {})
  }

  return element({
    tag: 'video',
    ...restProps,
    attrs: newAttrs as any
  })
}

/**
 * audio component
 */
export const audio = (
  props: BaseProps & {
    src?: PropValue<string>
    controls?: PropValue<boolean>
    autoplay?: PropValue<boolean>
    loop?: PropValue<boolean>
    muted?: PropValue<boolean>
  }
): Mountable<StringHost> => {
  const { src, controls, autoplay, loop, muted, attrs, ...restProps } = props as any

  const newAttrs = {
    ...(attrs || {}),
    ...(src !== undefined ? { src } : {}),
    ...(controls ? { controls: true } : {}),
    ...(autoplay ? { autoplay: true } : {}),
    ...(loop ? { loop: true } : {}),
    ...(muted ? { muted: true } : {})
  }

  return element({
    tag: 'audio',
    ...restProps,
    attrs: newAttrs as any
  })
}

/**
 * source component
 */
export const source = (
  props: BaseProps & {
    src?: PropValue<string>
    type?: PropValue<string>
  }
): Mountable<StringHost> => {
  const { src, type, attrs, ...restProps } = props as any

  const newAttrs = {
    ...(attrs || {}),
    ...(src !== undefined ? { src } : {}),
    ...(type !== undefined ? { type } : {})
  }

  return element({
    tag: 'source',
    ...restProps,
    attrs: newAttrs as any
  })
}

/**
 * iframe component
 */
export const iframe = (
  props: BaseProps & {
    src?: PropValue<string>
    width?: PropValue<string | number>
    height?: PropValue<string | number>
    frameborder?: PropValue<string | number>
    allowfullscreen?: PropValue<boolean>
  }
): Mountable<StringHost> => {
  const { src, width, height, frameborder, allowfullscreen, attrs, ...restProps } = props as any

  const newAttrs = {
    ...(attrs || {}),
    ...(src !== undefined ? { src } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(frameborder !== undefined ? { frameborder } : {}),
    ...(allowfullscreen ? { allowfullscreen: true } : {})
  }

  return element({
    tag: 'iframe',
    ...restProps,
    attrs: newAttrs as any
  })
}

/**
 * canvas component (SSR only renders empty canvas tag)
 */
export const canvas = (
  props: BaseProps & {
    width?: PropValue<string | number>
    height?: PropValue<string | number>
  }
): Mountable<StringHost> => {
  const { width, height, attrs, ...restProps } = props as any

  const newAttrs = {
    ...(attrs || {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {})
  }

  return element({
    tag: 'canvas',
    ...restProps,
    attrs: newAttrs as any
  })
}
