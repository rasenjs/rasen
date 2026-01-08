import { describe, it, expect, beforeEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import {
  renderToString,
  div,
  span,
  p,
  h1,
  a,
  input,
  ul,
  li,
  escapeHtml,
  stringifyStyle
} from './index'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'

beforeEach(() => {
  useReactiveRuntime()
})

describe('@rasenjs/html', () => {
  describe('renderToString', () => {
    it('should render simple div', () => {
      const html = renderToString(div({ class: 'container' }))
      expect(html).toBe('<div class="container"></div>')
    })

    it('should render div with text content', () => {
      const html = renderToString(div('Hello, World!'))
      expect(html).toBe('<div>Hello, World!</div>')
    })

    it('should render div with props and text', () => {
      const html = renderToString(div({ class: 'greeting' }, 'Hello'))
      expect(html).toBe('<div class="greeting">Hello</div>')
    })

    it('should render nested elements', () => {
      const html = renderToString(
        div(
          { class: 'container' },
          p({ class: 'title' }, 'Title'),
          span('Content')
        )
      )
      expect(html).toBe(
        '<div class="container"><p class="title">Title</p><span>Content</span></div>'
      )
    })

    it('should escape HTML in text content', () => {
      const html = renderToString(div('<script>alert("xss")</script>'))
      expect(html).toBe('<div>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</div>')
    })

    it('should render self-closing tags', () => {
      const html = renderToString(input({ type: 'text', placeholder: 'Enter name' }))
      expect(html).toBe('<input type="text" placeholder="Enter name">')
    })

    it('should render with style object', () => {
      const html = renderToString(
        div({ style: { color: 'red', fontSize: '16px' } }, 'Styled')
      )
      expect(html).toBe('<div style="color: red; font-size: 16px">Styled</div>')
    })

    it('should render list', () => {
      const html = renderToString(
        ul(
          { class: 'list' },
          li('Item 1'),
          li('Item 2'),
          li('Item 3')
        )
      )
      expect(html).toBe(
        '<ul class="list"><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>'
      )
    })

    it('should render link with href', () => {
      const html = renderToString(
        a({ attrs: { href: 'https://example.com', target: '_blank' }, children: 'Link' })
      )
      expect(html).toBe('<a href="https://example.com" target="_blank">Link</a>')
    })

    it('should render heading', () => {
      const html = renderToString(h1('Hello'))
      expect(html).toBe('<h1>Hello</h1>')
    })

    it('should handle boolean attributes', () => {
      const html = renderToString(input({ attrs: { disabled: true, readonly: false } }))
      expect(html).toBe('<input disabled>')
    })
  })

  describe('escapeHtml', () => {
    it('should escape special characters', () => {
      expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;')
    })

    it('should return unchanged string without special chars', () => {
      expect(escapeHtml('Hello World')).toBe('Hello World')
    })
  })

  describe('stringifyStyle', () => {
    it('should convert style object to string', () => {
      const style = stringifyStyle({
        color: 'red',
        backgroundColor: 'blue',
        fontSize: 16
      })
      expect(style).toBe('color: red; background-color: blue; font-size: 16')
    })

    it('should skip null and undefined values', () => {
      const style = stringifyStyle({
        color: 'red',
        backgroundColor: null,
        fontSize: undefined
      })
      expect(style).toBe('color: red')
    })
  })
})
