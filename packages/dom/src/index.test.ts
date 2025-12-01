/**
 * @rasenjs/dom 测试套件
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { createVueRuntime } from '@rasenjs/reactive-vue'
import { ref, computed } from 'vue'
import {
  mount,
  element,
  html,
  div,
  span,
  button,
  input,
  textarea,
  select,
  option,
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
  section,
  article,
  header,
  footer,
  nav,
  main,
  aside,
  when,
  show,
  // Event modifiers
  modifier,
  mod,
  key,
  prevent,
  stop,
  capture,
  once,
  self,
  enter,
  esc
} from './index'

// Setup
let container: HTMLElement

beforeEach(() => {
  setReactiveRuntime(createVueRuntime())
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  container.remove()
})

describe('@rasenjs/dom', () => {
  describe('element', () => {
    it('should create element with specified tag', () => {
      const unmount = element({ tag: 'article' })(container)
      expect(container.querySelector('article')).not.toBeNull()
      unmount?.()
    })

    it('should remove element on unmount', () => {
      const unmount = element({ tag: 'div' })(container)
      expect(container.children.length).toBe(1)
      unmount?.()
      expect(container.children.length).toBe(0)
    })

    it('should set id attribute', () => {
      const unmount = div({ id: 'my-div' })(container)
      expect(container.querySelector('#my-div')).not.toBeNull()
      unmount?.()
    })

    it('should update id reactively', async () => {
      const id = ref('id-1')
      const unmount = div({ id })(container)
      expect(container.querySelector('#id-1')).not.toBeNull()

      id.value = 'id-2'
      await Promise.resolve()

      expect(container.querySelector('#id-1')).toBeNull()
      expect(container.querySelector('#id-2')).not.toBeNull()
      unmount?.()
    })

    it('should set className', () => {
      const unmount = div({ className: 'container' })(container)
      expect(container.querySelector('.container')).not.toBeNull()
      unmount?.()
    })

    it('should support class alias', () => {
      const unmount = div({ class: 'wrapper' })(container)
      expect(container.querySelector('.wrapper')).not.toBeNull()
      unmount?.()
    })

    it('should update className reactively', async () => {
      const cls = ref('active')
      const unmount = div({ className: cls })(container)
      expect(container.querySelector('.active')).not.toBeNull()

      cls.value = 'inactive'
      await Promise.resolve()

      expect(container.querySelector('.active')).toBeNull()
      expect(container.querySelector('.inactive')).not.toBeNull()
      unmount?.()
    })

    it('should set style object', () => {
      const unmount = div({ style: { color: 'red', 'font-size': '16px' } })(
        container
      )
      const el = container.firstElementChild as HTMLElement
      expect(el.style.color).toBe('red')
      expect(el.style.fontSize).toBe('16px')
      unmount?.()
    })

    it('should update style reactively', async () => {
      const color = ref('red')
      const unmount = div({ style: computed(() => ({ color: color.value })) })(
        container
      )
      const el = container.firstElementChild as HTMLElement
      expect(el.style.color).toBe('red')

      color.value = 'blue'
      await Promise.resolve()

      expect(el.style.color).toBe('blue')
      unmount?.()
    })

    it('should set arbitrary attributes', () => {
      const unmount = div({
        attrs: { 'data-id': '123', 'aria-label': 'test' }
      })(container)
      const el = container.firstElementChild as HTMLElement
      expect(el.getAttribute('data-id')).toBe('123')
      expect(el.getAttribute('aria-label')).toBe('test')
      unmount?.()
    })

    it('should handle boolean attribute true', () => {
      const unmount = input({ attrs: { disabled: true } })(container)
      const el = container.querySelector('input') as HTMLInputElement
      expect(el.hasAttribute('disabled')).toBe(true)
      unmount?.()
    })

    it('should handle boolean attribute false', () => {
      const unmount = input({ attrs: { disabled: false } })(container)
      const el = container.querySelector('input') as HTMLInputElement
      expect(el.hasAttribute('disabled')).toBe(false)
      unmount?.()
    })

    it('should set string children as text content', () => {
      const unmount = div({ children: 'Hello World' })(container)
      expect(container.firstElementChild?.textContent).toBe('Hello World')
      unmount?.()
    })

    it('should support shorthand text children', () => {
      const unmount = div('Hello')(container)
      expect(container.firstElementChild?.textContent).toBe('Hello')
      unmount?.()
    })

    it('should update text content reactively', async () => {
      const text = ref('Initial')
      const unmount = div({ children: text })(container)
      expect(container.firstElementChild?.textContent).toBe('Initial')

      text.value = 'Updated'
      await Promise.resolve()

      expect(container.firstElementChild?.textContent).toBe('Updated')
      unmount?.()
    })

    it('should mount child components array', () => {
      const unmount = div({
        children: [span({ children: 'First' }), span({ children: 'Second' })]
      })(container)

      const spans = container.querySelectorAll('span')
      expect(spans.length).toBe(2)
      expect(spans[0].textContent).toBe('First')
      expect(spans[1].textContent).toBe('Second')
      unmount?.()
    })

    it('should support nested components', () => {
      const unmount = div({
        className: 'outer',
        children: [
          div({
            className: 'inner',
            children: [span({ children: 'Nested' })]
          })
        ]
      })(container)

      expect(container.querySelector('.outer .inner span')?.textContent).toBe(
        'Nested'
      )
      unmount?.()
    })

    it('should unmount all children when parent unmounts', () => {
      const unmount = div({
        children: [span({}), span({})]
      })(container)

      expect(container.querySelectorAll('span').length).toBe(2)
      unmount?.()
      expect(container.querySelectorAll('span').length).toBe(0)
    })
  })

  describe('html', () => {
    it('should insert HTML content', () => {
      const unmount = html({ content: '<p>Paragraph</p>' })(container)
      expect(container.querySelector('p')?.textContent).toBe('Paragraph')
      unmount?.()
    })

    it('should support multiple root nodes', () => {
      const unmount = html({
        content: '<span>A</span><span>B</span><span>C</span>'
      })(container)
      const spans = container.querySelectorAll('span')
      expect(spans.length).toBe(3)
      unmount?.()
    })

    it('should remove all nodes on unmount', () => {
      const unmount = html({ content: '<span>A</span><span>B</span>' })(
        container
      )
      expect(container.querySelectorAll('span').length).toBe(2)
      unmount?.()
      expect(container.querySelectorAll('span').length).toBe(0)
    })

    it('should update HTML content reactively', async () => {
      const content = ref('<p>Original</p>')
      const unmount = html({ content })(container)
      expect(container.querySelector('p')?.textContent).toBe('Original')

      content.value = '<span>Replaced</span>'
      await Promise.resolve()

      expect(container.querySelector('p')).toBeNull()
      expect(container.querySelector('span')?.textContent).toBe('Replaced')
      unmount?.()
    })
  })

  describe('predefined elements', () => {
    const elements: Array<
      [string, (props: Record<string, unknown>) => ReturnType<typeof div>]
    > = [
      ['div', div],
      ['span', span],
      ['button', button],
      ['p', p],
      ['h1', h1],
      ['h2', h2],
      ['h3', h3],
      ['ul', ul],
      ['ol', ol],
      ['li', li],
      ['form', form],
      ['label', label],
      ['section', section],
      ['article', article],
      ['header', header],
      ['footer', footer],
      ['nav', nav],
      ['main', main],
      ['aside', aside]
    ]

    it.each(elements)('should create %s element', (tagName, component) => {
      const unmount = component({})(container)
      expect(container.querySelector(tagName)).not.toBeNull()
      unmount?.()
    })
  })

  describe('mount', () => {
    it('should mount component to container', () => {
      const App = () => div({ children: 'Hello' })
      const unmount = mount(App(), container)
      expect(container.textContent).toBe('Hello')
      unmount?.()
    })

    it('should return unmount function', () => {
      const App = () => div({})
      const unmount = mount(App(), container)
      expect(typeof unmount).toBe('function')
      unmount?.()
    })

    it('should throw when container is null', () => {
      const App = () => div({})
      expect(() => mount(App(), null)).toThrow()
    })
  })

  describe('events', () => {
    it('should bind click event via on object', () => {
      const handler = vi.fn()
      const unmount = button({ on: { click: handler } })(container)
      container.querySelector('button')?.click()
      expect(handler).toHaveBeenCalledTimes(1)
      unmount?.()
    })

    it('should bind input event via on object', () => {
      const handler = vi.fn()
      const unmount = input({ on: { input: handler } })(container)
      container.querySelector('input')?.dispatchEvent(new Event('input'))
      expect(handler).toHaveBeenCalledTimes(1)
      unmount?.()
    })

    it('should support onClick shorthand', () => {
      const handler = vi.fn()
      const unmount = button({ onClick: handler })(container)
      container.querySelector('button')?.click()
      expect(handler).toHaveBeenCalledTimes(1)
      unmount?.()
    })

    it('should support onInput shorthand', () => {
      const handler = vi.fn()
      const unmount = input({ onInput: handler })(container)
      container.querySelector('input')?.dispatchEvent(new Event('input'))
      expect(handler).toHaveBeenCalledTimes(1)
      unmount?.()
    })
  })

  describe('form elements', () => {
    it('should set input type', () => {
      const unmount = input({ type: 'password' })(container)
      expect(container.querySelector('input')?.type).toBe('password')
      unmount?.()
    })

    it('should set input value', () => {
      const unmount = input({ value: 'initial' })(container)
      expect(container.querySelector('input')?.value).toBe('initial')
      unmount?.()
    })

    it('should update input value reactively', async () => {
      const value = ref('initial')
      const unmount = input({ value })(container)
      const el = container.querySelector('input')!
      expect(el.value).toBe('initial')

      value.value = 'updated'
      await Promise.resolve()

      expect(el.value).toBe('updated')
      unmount?.()
    })

    it('should set input placeholder', () => {
      const unmount = input({ placeholder: 'Enter text...' })(container)
      expect(container.querySelector('input')?.placeholder).toBe(
        'Enter text...'
      )
      unmount?.()
    })

    it('should create textarea', () => {
      const unmount = textarea({})(container)
      expect(container.querySelector('textarea')).not.toBeNull()
      unmount?.()
    })

    it('should create select with options', () => {
      const unmount = select({
        children: [
          option({ attrs: { value: 'a' }, children: 'Option A' }),
          option({ attrs: { value: 'b' }, children: 'Option B' })
        ]
      })(container)

      const selectEl = container.querySelector('select')!
      expect(selectEl.options.length).toBe(2)
      expect(selectEl.options[0].value).toBe('a')
      unmount?.()
    })
  })

  describe('specific elements', () => {
    it('should set link href', () => {
      const unmount = a({
        attrs: { href: 'https://example.com' },
        children: 'Link'
      })(container)
      expect(container.querySelector('a')?.getAttribute('href')).toBe(
        'https://example.com'
      )
      unmount?.()
    })

    it('should set link target', () => {
      const unmount = a({ attrs: { href: '#', target: '_blank' } })(container)
      expect(container.querySelector('a')?.target).toBe('_blank')
      unmount?.()
    })

    it('should set img src and alt', () => {
      const unmount = img({ attrs: { src: 'image.png', alt: 'An image' } })(
        container
      )
      const el = container.querySelector('img')!
      expect(el.src).toContain('image.png')
      expect(el.alt).toBe('An image')
      unmount?.()
    })
  })

  describe('edge cases', () => {
    it('should handle undefined children', () => {
      const unmount = div({ children: undefined })(container)
      expect(container.firstElementChild).not.toBeNull()
      unmount?.()
    })

    it('should handle empty children array', () => {
      const unmount = div({ children: [] })(container)
      expect(container.firstElementChild?.children.length).toBe(0)
      unmount?.()
    })

    it('should escape text content (not parse as HTML)', () => {
      const unmount = div({ children: '<script>alert("xss")</script>' })(
        container
      )
      expect(container.querySelector('script')).toBeNull()
      expect(container.firstElementChild?.textContent).toBe(
        '<script>alert("xss")</script>'
      )
      unmount?.()
    })

    it('should support multiple mount/unmount cycles', () => {
      const Component = () => div({ children: 'Hello' })

      let unmount = Component()(container)
      expect(container.textContent).toBe('Hello')
      unmount?.()
      expect(container.children.length).toBe(0)

      unmount = Component()(container)
      expect(container.textContent).toBe('Hello')
      unmount?.()
      expect(container.children.length).toBe(0)
    })
  })

  describe('component composition', () => {
    it('should support custom components', () => {
      const Button = (props: { label: string }) =>
        button({ children: props.label })

      const unmount = Button({ label: 'Click me' })(container)
      expect(container.querySelector('button')?.textContent).toBe('Click me')
      unmount?.()
    })

    it('should support component nesting', () => {
      const Card = (props: { title: string; content: string }) =>
        div({
          className: 'card',
          children: [
            h1({ children: props.title }),
            p({ children: props.content })
          ]
        })

      const unmount = Card({ title: 'Title', content: 'Content' })(container)
      expect(container.querySelector('.card h1')?.textContent).toBe('Title')
      expect(container.querySelector('.card p')?.textContent).toBe('Content')
      unmount?.()
    })
  })

  describe('three-phase lifecycle', () => {
    it('should execute setup phase when component function is called', () => {
      const setupSpy = vi.fn()

      const Component = () => {
        setupSpy()
        return div({})
      }

      expect(setupSpy).not.toHaveBeenCalled()
      const mountFn = Component()
      expect(setupSpy).toHaveBeenCalledTimes(1)
      mountFn(container)?.()
    })

    it('should execute mount phase when mount function is called', () => {
      const mountSpy = vi.fn()

      const Component = () => {
        return (host: HTMLElement) => {
          mountSpy()
          const el = document.createElement('div')
          host.appendChild(el)
          return () => el.remove()
        }
      }

      const mountFn = Component()
      expect(mountSpy).not.toHaveBeenCalled()
      mountFn(container)
      expect(mountSpy).toHaveBeenCalledTimes(1)
    })

    it('should execute unmount phase when cleanup function is called', () => {
      const unmountSpy = vi.fn()

      const Component = () => {
        return (host: HTMLElement) => {
          const el = document.createElement('div')
          host.appendChild(el)
          return () => {
            unmountSpy()
            el.remove()
          }
        }
      }

      const unmount = Component()(container)
      expect(unmountSpy).not.toHaveBeenCalled()
      unmount?.()
      expect(unmountSpy).toHaveBeenCalledTimes(1)
    })
  })

  // ============================================================
  // TODO: Features to be implemented
  // ============================================================

  describe('show() - display-based conditional rendering', () => {
    it('should show element when condition is true', () => {
      const visible = ref(true)
      const unmount = show({
        when: visible,
        children: div({ children: 'Content' })
      })(container)

      const wrapper = container.firstElementChild as HTMLElement
      const content = wrapper.firstElementChild as HTMLElement
      expect(content.style.display).not.toBe('none')
      unmount?.()
    })

    it('should hide element when condition is false', async () => {
      const visible = ref(false)
      const unmount = show({
        when: visible,
        children: div({ children: 'Content' })
      })(container)

      await Promise.resolve()
      const wrapper = container.firstElementChild as HTMLElement
      const content = wrapper.firstElementChild as HTMLElement
      expect(content.style.display).toBe('none')
      unmount?.()
    })

    it('should toggle visibility reactively', async () => {
      const visible = ref(true)
      const unmount = show({
        when: visible,
        children: div({ children: 'Content' })
      })(container)

      const wrapper = container.firstElementChild as HTMLElement
      const content = wrapper.firstElementChild as HTMLElement
      expect(content.style.display).not.toBe('none')

      visible.value = false
      await Promise.resolve()
      expect(content.style.display).toBe('none')

      visible.value = true
      await Promise.resolve()
      expect(content.style.display).not.toBe('none')
      unmount?.()
    })

    it('should preserve element in DOM when hidden', async () => {
      const visible = ref(true)
      const unmount = show({
        when: visible,
        children: div({ id: 'target', children: 'Content' })
      })(container)

      expect(container.querySelector('#target')).not.toBeNull()

      visible.value = false
      await Promise.resolve()
      // Element should still exist, just hidden
      expect(container.querySelector('#target')).not.toBeNull()
      unmount?.()
    })
  })

  describe('when() - mount/unmount conditional rendering', () => {
    it('should mount then branch when condition is true', () => {
      const condition = ref(true)
      const unmount = when({
        condition,
        then: () => div({ children: 'Then' }),
        else: () => div({ children: 'Else' })
      })(container)

      expect(container.textContent).toContain('Then')
      expect(container.textContent).not.toContain('Else')
      unmount?.()
    })

    it('should mount else branch when condition is false', () => {
      const condition = ref(false)
      const unmount = when({
        condition,
        then: () => div({ children: 'Then' }),
        else: () => div({ children: 'Else' })
      })(container)

      expect(container.textContent).toContain('Else')
      expect(container.textContent).not.toContain('Then')
      unmount?.()
    })

    it('should switch branches reactively', async () => {
      const condition = ref(true)
      const unmount = when({
        condition,
        then: () => div({ children: 'Then' }),
        else: () => div({ children: 'Else' })
      })(container)

      expect(container.textContent).toContain('Then')

      condition.value = false
      await Promise.resolve()
      expect(container.textContent).toContain('Else')
      expect(container.textContent).not.toContain('Then')

      condition.value = true
      await Promise.resolve()
      expect(container.textContent).toContain('Then')
      expect(container.textContent).not.toContain('Else')
      unmount?.()
    })

    it('should work without else branch', async () => {
      const condition = ref(true)
      const unmount = when({
        condition,
        then: () => div({ children: 'Content' })
      })(container)

      expect(container.textContent).toContain('Content')

      condition.value = false
      await Promise.resolve()
      // Content should be removed (only comment marker remains)
      expect(container.textContent).not.toContain('Content')

      condition.value = true
      await Promise.resolve()
      expect(container.textContent).toContain('Content')
      unmount?.()
    })

    it('should unmount old branch before mounting new one', async () => {
      const unmountSpy = vi.fn()
      const condition = ref(true)

      const ThenComponent = () => {
        return (host: HTMLElement) => {
          const el = document.createElement('div')
          el.textContent = 'Then'
          host.appendChild(el)
          return () => {
            unmountSpy()
            el.remove()
          }
        }
      }

      const unmount = when({
        condition,
        then: ThenComponent,
        else: () => div({ children: 'Else' })
      })(container)

      expect(unmountSpy).not.toHaveBeenCalled()

      condition.value = false
      await Promise.resolve()
      expect(unmountSpy).toHaveBeenCalledTimes(1)
      unmount?.()
    })
  })

  describe('event modifiers (.prevent, .stop, .capture, .once)', () => {
    describe('modifier() - base function', () => {
      it('should call preventDefault when prevent is true', () => {
        const fn = vi.fn()
        const handler = modifier(fn, { prevent: true })

        const event = new Event('click')
        vi.spyOn(event, 'preventDefault')

        handler(event)

        expect(event.preventDefault).toHaveBeenCalled()
        expect(fn).toHaveBeenCalledWith(event)
      })

      it('should call stopPropagation when stop is true', () => {
        const fn = vi.fn()
        const handler = modifier(fn, { stop: true })

        const event = new Event('click')
        vi.spyOn(event, 'stopPropagation')

        handler(event)

        expect(event.stopPropagation).toHaveBeenCalled()
        expect(fn).toHaveBeenCalledWith(event)
      })

      it('should set capture property on handler', () => {
        const fn = vi.fn()
        const handler = modifier(fn, { capture: true })

        expect(handler.capture).toBe(true)
      })

      it('should set once property on handler', () => {
        const fn = vi.fn()
        const handler = modifier(fn, { once: true })

        expect(handler.once).toBe(true)
      })

      it('should combine multiple modifiers', () => {
        const fn = vi.fn()
        const handler = modifier(fn, {
          prevent: true,
          stop: true,
          capture: true,
          once: true
        })

        const event = new Event('click')
        vi.spyOn(event, 'preventDefault')
        vi.spyOn(event, 'stopPropagation')

        handler(event)

        expect(event.preventDefault).toHaveBeenCalled()
        expect(event.stopPropagation).toHaveBeenCalled()
        expect(handler.capture).toBe(true)
        expect(handler.once).toBe(true)
        expect(fn).toHaveBeenCalledWith(event)
      })

      it('should handle self modifier', () => {
        const fn = vi.fn()
        const handler = modifier(fn, { self: true })

        // 创建带有 target !== currentTarget 的事件
        const btn = document.createElement('button')
        const parent = document.createElement('div')
        parent.appendChild(btn)

        const event = new Event('click', { bubbles: true })
        Object.defineProperty(event, 'target', { value: btn })
        Object.defineProperty(event, 'currentTarget', { value: parent })

        handler(event)
        expect(fn).not.toHaveBeenCalled()

        // target === currentTarget
        const event2 = new Event('click')
        Object.defineProperty(event2, 'target', { value: btn })
        Object.defineProperty(event2, 'currentTarget', { value: btn })

        handler(event2)
        expect(fn).toHaveBeenCalledWith(event2)
      })
    })

    describe('chainable modifiers', () => {
      it('prevent() should create handler with preventDefault', () => {
        const fn = vi.fn()
        const handler = prevent(fn)

        const event = new Event('click')
        vi.spyOn(event, 'preventDefault')

        handler(event)

        expect(event.preventDefault).toHaveBeenCalled()
        expect(fn).toHaveBeenCalledWith(event)
      })

      it('stop() should create handler with stopPropagation', () => {
        const fn = vi.fn()
        const handler = stop(fn)

        const event = new Event('click')
        vi.spyOn(event, 'stopPropagation')

        handler(event)

        expect(event.stopPropagation).toHaveBeenCalled()
        expect(fn).toHaveBeenCalledWith(event)
      })

      it('prevent.stop() should combine modifiers', () => {
        const fn = vi.fn()
        const handler = prevent.stop(fn)

        const event = new Event('click')
        vi.spyOn(event, 'preventDefault')
        vi.spyOn(event, 'stopPropagation')

        handler(event)

        expect(event.preventDefault).toHaveBeenCalled()
        expect(event.stopPropagation).toHaveBeenCalled()
        expect(fn).toHaveBeenCalledWith(event)
      })

      it('stop.prevent() should combine modifiers in any order', () => {
        const fn = vi.fn()
        const handler = stop.prevent(fn)

        const event = new Event('click')
        vi.spyOn(event, 'preventDefault')
        vi.spyOn(event, 'stopPropagation')

        handler(event)

        expect(event.preventDefault).toHaveBeenCalled()
        expect(event.stopPropagation).toHaveBeenCalled()
      })

      it('capture() should set capture property', () => {
        const fn = vi.fn()
        const handler = capture(fn)

        expect(handler.capture).toBe(true)
      })

      it('once() should set once property', () => {
        const fn = vi.fn()
        const handler = once(fn)

        expect(handler.once).toBe(true)
      })

      it('prevent.stop.capture.once() should chain all modifiers', () => {
        const fn = vi.fn()
        const handler = prevent.stop.capture.once(fn)

        const event = new Event('click')
        vi.spyOn(event, 'preventDefault')
        vi.spyOn(event, 'stopPropagation')

        handler(event)

        expect(event.preventDefault).toHaveBeenCalled()
        expect(event.stopPropagation).toHaveBeenCalled()
        expect(handler.capture).toBe(true)
        expect(handler.once).toBe(true)
      })

      it('mod.prevent.stop() should work as alternative entry', () => {
        const fn = vi.fn()
        const handler = mod.prevent.stop(fn)

        const event = new Event('click')
        vi.spyOn(event, 'preventDefault')
        vi.spyOn(event, 'stopPropagation')

        handler(event)

        expect(event.preventDefault).toHaveBeenCalled()
        expect(event.stopPropagation).toHaveBeenCalled()
      })

      it('self.stop() should combine self with other modifiers', () => {
        const fn = vi.fn()
        const handler = self.stop(fn)

        const event = new Event('click')
        Object.defineProperty(event, 'target', { value: container })
        Object.defineProperty(event, 'currentTarget', { value: container })
        vi.spyOn(event, 'stopPropagation')

        handler(event)

        expect(event.stopPropagation).toHaveBeenCalled()
        expect(fn).toHaveBeenCalledWith(event)
      })
    })

    describe('type safety (compile-time only)', () => {
      it('should not allow duplicate modifiers in chain', () => {
        // 这些测试验证类型系统在编译时阻止重复修饰器
        // 运行时我们只验证功能正确性
        const fn = vi.fn()

        // prevent 只能用一次
        const h1 = prevent(fn)
        expect(h1.__modifiers?.prevent).toBe(true)

        // prevent.stop 不能再用 prevent
        const h2 = prevent.stop(fn)
        expect(h2.__modifiers?.prevent).toBe(true)
        expect(h2.__modifiers?.stop).toBe(true)

        // 完整链
        const h3 = prevent.stop.capture.once.self(fn)
        expect(h3.__modifiers?.prevent).toBe(true)
        expect(h3.__modifiers?.stop).toBe(true)
        expect(h3.__modifiers?.capture).toBe(true)
        expect(h3.__modifiers?.once).toBe(true)
        expect(h3.__modifiers?.self).toBe(true)
      })
    })
  })
  describe.todo('key modifiers (.enter, .esc, .tab)')
  describe.todo('event delegation')
  describe.todo('checkbox checked binding')
  describe.todo('radio button binding')

  describe('element ref', () => {
    it('should set ref value after mount', () => {
      const inputRef = ref<HTMLInputElement | null>(null)
      const unmount = input({ ref: inputRef })(container)

      expect(inputRef.value).not.toBeNull()
      expect(inputRef.value).toBeInstanceOf(HTMLInputElement)
      unmount?.()
    })

    it('should clear ref value on unmount', () => {
      const inputRef = ref<HTMLInputElement | null>(null)
      const unmount = input({ ref: inputRef })(container)

      expect(inputRef.value).not.toBeNull()
      unmount?.()
      expect(inputRef.value).toBeNull()
    })

    it('should allow accessing element methods via ref', () => {
      const inputRef = ref<HTMLInputElement | null>(null)
      const unmount = input({ ref: inputRef, value: 'test' })(container)

      expect(inputRef.value?.value).toBe('test')
      unmount?.()
    })
  })
})
