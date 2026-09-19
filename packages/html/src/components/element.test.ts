/**
 * String renderer element semantics.
 *
 * Each block here covers a rule the string renderer must share with the DOM
 * renderer. They are the rules that were wrong (or missing) before: markup
 * emitted on the server has to match what the client writes onto the element,
 * or the page changes the moment it hydrates.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import { span, button, div, img, h3 } from './elements'
import { renderToString } from './string-context'

describe('@rasenjs/html - element', () => {
  it('should render a tag with attributes', () => {
    expect(renderToString(div({ id: 'x', title: 'hi' }))).toBe(
      '<div id="x" title="hi"></div>'
    )
  })

  it('should render a void element without a closing tag', () => {
    expect(renderToString(img({ src: 'a.png', alt: 'A' }))).toBe(
      '<img src="a.png" alt="A">'
    )
  })

  it('should escape text children', () => {
    expect(renderToString(div({ children: '<script>' }))).toBe(
      '<div>&lt;script&gt;</div>'
    )
  })

  describe('style', () => {
    it('should serialize a plain style object', () => {
      expect(renderToString(span({ style: { color: 'red', fontSize: 16 } }))).toBe(
        '<span style="color: red; font-size: 16"></span>'
      )
    })

    it('should resolve a reactive value per declaration', () => {
      // A component binds one CSS property at a time (`opacity` follows the
      // load status); stringifying the getter itself would emit its source.
      const visible = () => false
      const html = renderToString(
        span({
          style: { opacity: () => (visible() ? '1' : '0'), position: 'absolute' }
        })
      )
      expect(html).toBe('<span style="opacity: 0; position: absolute"></span>')
    })

    it('should skip nullish declarations', () => {
      const html = renderToString(
        span({ style: { color: 'red', backgroundColor: null, borderColor: undefined } })
      )
      expect(html).toBe('<span style="color: red"></span>')
    })

    it('should omit the attribute when nothing is left', () => {
      const html = renderToString(span({ style: { color: null } }))
      expect(html).toBe('<span></span>')
    })

    it('should emit a css string as-is', () => {
      // The DOM renderer assigns a string style to cssText.
      const html = renderToString(span({ style: 'color: red' }))
      expect(html).toBe('<span style="color: red"></span>')
    })
  })

  describe('attributes', () => {
    it('should kebab-case aria* and data* keys', () => {
      const html = renderToString(button({ ariaChecked: true, dataState: 'closed' }))
      expect(html).toBe('<button aria-checked data-state="closed"></button>')
    })

    it('should write a boolean on a non-data attribute as a flag', () => {
      expect(renderToString(button({ hidden: true }))).toBe('<button hidden></button>')
      expect(renderToString(button({ hidden: false }))).toBe('<button></button>')
    })

    it('should carry a boolean value on data-* attributes', () => {
      // Matches the DOM writer: data-* holds data, not a flag.
      expect(renderToString(button({ dataActive: true }))).toBe(
        '<button data-active="true"></button>'
      )
      expect(renderToString(button({ dataActive: false }))).toBe(
        '<button data-active="false"></button>'
      )
    })

    it('should omit null and undefined attributes', () => {
      expect(renderToString(div({ title: null, id: undefined }))).toBe('<div></div>')
    })

    it('should resolve a reactive attribute value', () => {
      const html = renderToString(button({ 'aria-expanded': () => 'true' }))
      expect(html).toBe('<button aria-expanded="true"></button>')
    })
  })

  describe('client-only props', () => {
    it('should not render event handlers', () => {
      const html = renderToString(button({ onClick: () => {} }))
      expect(html).toBe('<button></button>')
    })

    it('should not invoke a ref callback', () => {
      // The DOM renderer writes the element into the holder. There is no
      // element on the server, so the callback must not run at all.
      let called = 0
      const html = renderToString(
        button({
          ref: () => {
            called++
          }
        })
      )
      expect(called).toBe(0)
      expect(html).toBe('<button></button>')
    })
  })

  describe('children', () => {
    it('should render nested elements', () => {
      const html = renderToString(
        div({ children: [h3({ id: 'h', children: 'Title' })] })
      )
      expect(html).toBe('<div><h3 id="h">Title</h3></div>')
    })
  })

  describe('with a reactive runtime installed', () => {
    beforeEach(() => {
      setReactiveRuntime(createReactiveRuntime())
    })

    it('should unwrap a ref declaration in style', () => {
      const runtime = createReactiveRuntime()
      const opacity = runtime.ref('0.5')
      const html = renderToString(span({ style: { opacity } }))
      expect(html).toBe('<span style="opacity: 0.5"></span>')
    })

    it('should unwrap a ref attribute value', () => {
      const runtime = createReactiveRuntime()
      const expanded = runtime.ref('true')
      const html = renderToString(button({ 'aria-expanded': expanded }))
      expect(html).toBe('<button aria-expanded="true"></button>')
    })
  })
})
