/**
 * @rasenjs/dom 测试套件
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import { ref, computed } from 'vue'
import {
  mount,
  hydrate,
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
  each,
  repeat,
  // Event modifiers
  modifier,
  mod,
  prevent,
  stop,
  capture,
  once,
  self
} from './index'

// Setup
let container: HTMLElement

beforeEach(() => {
  setReactiveRuntime(createReactiveRuntime())
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  container.remove()
})

describe('@rasenjs/dom', () => {
  describe('element', () => {
    it('should create element with specified tag', () => {
      const unmount = mount(element({ tag: 'article' }), container)
      expect(container.querySelector('article')).not.toBeNull()
      unmount?.()
    })

    it('should remove element on unmount', () => {
      const unmount = mount(element({ tag: 'div' }), container)
      expect(container.children.length).toBe(1)
      unmount?.()
      expect(container.children.length).toBe(0)
    })

    it('should set id attribute', () => {
      const unmount = mount(div({ id: 'my-div' }), container)
      expect(container.querySelector('#my-div')).not.toBeNull()
      unmount?.()
    })

    it('should update id reactively', async () => {
      const id = ref('id-1')
      const unmount = mount(div({ id }), container)
      expect(container.querySelector('#id-1')).not.toBeNull()

      id.value = 'id-2'
      await Promise.resolve()

      expect(container.querySelector('#id-1')).toBeNull()
      expect(container.querySelector('#id-2')).not.toBeNull()
      unmount?.()
    })

    it('should set class', () => {
      const unmount = mount(div({ class: 'container' }), container)
      expect(container.querySelector('.container')).not.toBeNull()
      unmount?.()
    })

    it('should support class alias', () => {
      const unmount = mount(div({ class: 'wrapper' }), container)
      expect(container.querySelector('.wrapper')).not.toBeNull()
      unmount?.()
    })

    it('should update class reactively', async () => {
      const cls = ref('active')
      const unmount = mount(div({ class: cls }), container)
      expect(container.querySelector('.active')).not.toBeNull()

      cls.value = 'inactive'
      await Promise.resolve()

      expect(container.querySelector('.active')).toBeNull()
      expect(container.querySelector('.inactive')).not.toBeNull()
      unmount?.()
    })

    it('should set style object', () => {
      const unmount = mount(div({ style: { color: 'red', 'font-size': '16px' } }), container)
      const el = container.firstElementChild as HTMLElement
      expect(el.style.color).toBe('red')
      expect(el.style.fontSize).toBe('16px')
      unmount?.()
    })

    it('should update style reactively', async () => {
      const color = ref('red')
      const unmount = mount(div({ style: computed(() => ({ color: color.value })) }), container)
      const el = container.firstElementChild as HTMLElement
      expect(el.style.color).toBe('red')

      color.value = 'blue'
      await Promise.resolve()

      expect(el.style.color).toBe('blue')
      unmount?.()
    })

    it('should set arbitrary attributes', () => {
      const unmount = mount(div({
        dataId: '123', ariaLabel: 'test'
      }), container)
      const el = container.firstElementChild as HTMLElement
      expect(el.getAttribute('data-id')).toBe('123')
      expect(el.getAttribute('aria-label')).toBe('test')
      unmount?.()
    })

    it('should handle boolean attribute true', () => {
      const unmount = mount(input({ disabled: true }), container)
      const el = container.querySelector('input') as HTMLInputElement
      expect(el.hasAttribute('disabled')).toBe(true)
      unmount?.()
    })

    it('should handle boolean attribute false', () => {
      const unmount = mount(input({ disabled: false }), container)
      const el = container.querySelector('input') as HTMLInputElement
      expect(el.hasAttribute('disabled')).toBe(false)
      unmount?.()
    })

    it('should set string children as text content', () => {
      const unmount = mount(div({ children: 'Hello World' }), container)
      expect(container.firstElementChild?.textContent).toBe('Hello World')
      unmount?.()
    })

    it('should support shorthand text children', () => {
      const unmount = mount(div('Hello'), container)
      expect(container.firstElementChild?.textContent).toBe('Hello')
      unmount?.()
    })

    it('should update text content reactively', async () => {
      const text = ref('Initial')
      const unmount = mount(div({ children: text }), container)
      expect(container.firstElementChild?.textContent).toBe('Initial')

      text.value = 'Updated'
      await Promise.resolve()

      expect(container.firstElementChild?.textContent).toBe('Updated')
      unmount?.()
    })

    it('should mount child components array', () => {
      const unmount = mount(div({
        children: [span({ children: 'First' }), span({ children: 'Second' })]
      }), container)

      const spans = container.querySelectorAll('span')
      expect(spans.length).toBe(2)
      expect(spans[0].textContent).toBe('First')
      expect(spans[1].textContent).toBe('Second')
      unmount?.()
    })

    it('should support nested components', () => {
      const unmount = mount(div({
        class: 'outer',
        children: [
          div({
            class: 'inner',
            children: [span({ children: 'Nested' })]
          })
        ]
      }), container)

      expect(container.querySelector('.outer .inner span')?.textContent).toBe(
        'Nested'
      )
      unmount?.()
    })

    it('should unmount all children when parent unmounts', () => {
      const unmount = mount(div({
        children: [span({}), span({})]
      }), container)

      expect(container.querySelectorAll('span').length).toBe(2)
      unmount?.()
      expect(container.querySelectorAll('span').length).toBe(0)
    })
  })

  describe('html', () => {
    it('should insert HTML content', () => {
      const unmount = mount(html({ content: '<p>Paragraph</p>' }), container)
      expect(container.querySelector('p')?.textContent).toBe('Paragraph')
      unmount?.()
    })

    it('should support multiple root nodes', () => {
      const unmount = mount(html({
        content: '<span>A</span><span>B</span><span>C</span>'
      }), container)
      const spans = container.querySelectorAll('span')
      expect(spans.length).toBe(3)
      unmount?.()
    })

    it('should remove all nodes on unmount', () => {
      const unmount = mount(html({ content: '<span>A</span><span>B</span>' }), container)
      expect(container.querySelectorAll('span').length).toBe(2)
      unmount?.()
      expect(container.querySelectorAll('span').length).toBe(0)
    })

    it('should update HTML content reactively', async () => {
      const content = ref('<p>Original</p>')
      const unmount = mount(html({ content }), container)
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
      const unmount = mount(component({}), container)
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
    it('should bind click event via onClick', () => {
      const handler = vi.fn()
      const unmount = mount(button({ onClick: handler }), container)
      container.querySelector('button')?.click()
      expect(handler).toHaveBeenCalledTimes(1)
      unmount?.()
    })

    it('should bind input event via onInput', () => {
      const handler = vi.fn()
      const unmount = mount(input({ onInput: handler }), container)
      container.querySelector('input')?.dispatchEvent(new Event('input'))
      expect(handler).toHaveBeenCalledTimes(1)
      unmount?.()
    })

    it('should support onClick shorthand', () => {
      const handler = vi.fn()
      const unmount = mount(button({ onClick: handler }), container)
      container.querySelector('button')?.click()
      expect(handler).toHaveBeenCalledTimes(1)
      unmount?.()
    })

    it('should support onInput shorthand', () => {
      const handler = vi.fn()
      const unmount = mount(input({ onInput: handler }), container)
      container.querySelector('input')?.dispatchEvent(new Event('input'))
      expect(handler).toHaveBeenCalledTimes(1)
      unmount?.()
    })
  })

  describe('form elements', () => {
    it('should set input type', () => {
      const unmount = mount(input({ type: 'password' }), container)
      expect(container.querySelector('input')?.type).toBe('password')
      unmount?.()
    })

    it('should set input value', () => {
      const unmount = mount(input({ value: 'initial' }), container)
      expect(container.querySelector('input')?.value).toBe('initial')
      unmount?.()
    })

    it('should update input value reactively', async () => {
      const value = ref('initial')
      const unmount = mount(input({ value }), container)
      const el = container.querySelector('input')!
      expect(el.value).toBe('initial')

      value.value = 'updated'
      await Promise.resolve()

      expect(el.value).toBe('updated')
      unmount?.()
    })

    it('should set input placeholder', () => {
      const unmount = mount(input({ placeholder: 'Enter text...' }), container)
      expect(container.querySelector('input')?.placeholder).toBe(
        'Enter text...'
      )
      unmount?.()
    })

    it('should create textarea', () => {
      const unmount = mount(textarea({}), container)
      expect(container.querySelector('textarea')).not.toBeNull()
      unmount?.()
    })

    it('should create select with options', () => {
      const unmount = mount(select({
        children: [
          option({ value: 'a', children: 'Option A' }),
          option({ value: 'b', children: 'Option B' })
        ]
      }), container)

      const selectEl = container.querySelector('select')!
      expect(selectEl.options.length).toBe(2)
      expect(selectEl.options[0].value).toBe('a')
      unmount?.()
    })
  })

  describe('specific elements', () => {
    it('should set link href', () => {
      const unmount = mount(a({
        href: 'https://example.com',
        children: 'Link'
      }), container)
      expect(container.querySelector('a')?.getAttribute('href')).toBe(
        'https://example.com'
      )
      unmount?.()
    })

    it('should set link target', () => {
      const unmount = mount(a({ href: '#', target: '_blank' }), container)
      expect(container.querySelector('a')?.target).toBe('_blank')
      unmount?.()
    })

    it('should set img src and alt', () => {
      const unmount = mount(img({ src: 'image.png', alt: 'An image' }), container)
      const el = container.querySelector('img')!
      expect(el.src).toContain('image.png')
      expect(el.alt).toBe('An image')
      unmount?.()
    })
  })

  describe('edge cases', () => {
    it('should handle undefined children', () => {
      const unmount = mount(div({ children: undefined }), container)
      expect(container.firstElementChild).not.toBeNull()
      unmount?.()
    })

    it('should handle empty children array', () => {
      const unmount = mount(div({ children: [] }), container)
      expect(container.firstElementChild?.children.length).toBe(0)
      unmount?.()
    })

    it('should escape text content (not parse as HTML)', () => {
      const unmount = mount(div({ children: '<script>alert("xss")</script>' }), container)
      expect(container.querySelector('script')).toBeNull()
      expect(container.firstElementChild?.textContent).toBe(
        '<script>alert("xss")</script>'
      )
      unmount?.()
    })

    it('should support multiple mount/unmount cycles', () => {
      const Component = () => div({ children: 'Hello' })

      let unmount = mount(Component(), container)
      expect(container.textContent).toBe('Hello')
      unmount?.()
      expect(container.children.length).toBe(0)

      unmount = mount(Component(), container)
      expect(container.textContent).toBe('Hello')
      unmount?.()
      expect(container.children.length).toBe(0)
    })
  })

  describe('component composition', () => {
    it('should support custom components', () => {
      const Button = (props: { label: string }) =>
        button({ children: props.label })

      const unmount = mount(Button({ label: 'Click me' }), container)
      expect(container.querySelector('button')?.textContent).toBe('Click me')
      unmount?.()
    })

    it('should support component nesting', () => {
      const Card = (props: { title: string; content: string }) =>
        div({
          class: 'card',
          children: [
            h1({ children: props.title }),
            p({ children: props.content })
          ]
        })

      const unmount = mount(Card({ title: 'Title', content: 'Content' }), container)
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
      mount(mountFn, container)?.()
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

      const comp = Component()
      expect(mountSpy).not.toHaveBeenCalled()
      mount(comp, container)
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

      const unmount = mount(Component(), container)
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
      const unmount = mount(show({
        when: visible,
        children: div({ children: 'Content' })
      }), container)

      const wrapper = container.firstElementChild as HTMLElement
      const content = wrapper.firstElementChild as HTMLElement
      expect(content.style.display).not.toBe('none')
      unmount?.()
    })

    it('should hide element when condition is false', async () => {
      const visible = ref(false)
      const unmount = mount(show({
        when: visible,
        children: div({ children: 'Content' })
      }), container)

      await Promise.resolve()
      const wrapper = container.firstElementChild as HTMLElement
      const content = wrapper.firstElementChild as HTMLElement
      expect(content.style.display).toBe('none')
      unmount?.()
    })

    it('should toggle visibility reactively', async () => {
      const visible = ref(true)
      const unmount = mount(show({
        when: visible,
        children: div({ children: 'Content' })
      }), container)

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
      const unmount = mount(show({
        when: visible,
        children: div({ id: 'target', children: 'Content' })
      }), container)

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
      const unmount = mount(when({
        condition,
        then: () => div({ children: 'Then' }),
        else: () => div({ children: 'Else' })
      }), container)

      expect(container.textContent).toContain('Then')
      expect(container.textContent).not.toContain('Else')
      unmount?.()
    })

    it('should mount else branch when condition is false', () => {
      const condition = ref(false)
      const unmount = mount(when({
        condition,
        then: () => div({ children: 'Then' }),
        else: () => div({ children: 'Else' })
      }), container)

      expect(container.textContent).toContain('Else')
      expect(container.textContent).not.toContain('Then')
      unmount?.()
    })

    it('should switch branches reactively', async () => {
      const condition = ref(true)
      const unmount = mount(when({
        condition,
        then: () => div({ children: 'Then' }),
        else: () => div({ children: 'Else' })
      }), container)

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
      const unmount = mount(when({
        condition,
        then: () => div({ children: 'Content' })
      }), container)

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

      const unmount = mount(when({
        condition,
        then: ThenComponent,
        else: () => div({ children: 'Else' })
      }), container)

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

  describe('checkbox checked binding', () => {
    it('should bind checked state', () => {
      const isChecked = ref(true)
      const unmount = mount(input({ type: 'checkbox', checked: isChecked }), container)

      const checkbox = container.querySelector('input') as HTMLInputElement
      expect(checkbox.checked).toBe(true)
      unmount?.()
    })

    it('should update checked state reactively', async () => {
      const isChecked = ref(false)
      const unmount = mount(input({ type: 'checkbox', checked: isChecked }), container)

      const checkbox = container.querySelector('input') as HTMLInputElement
      expect(checkbox.checked).toBe(false)

      isChecked.value = true
      await Promise.resolve()
      expect(checkbox.checked).toBe(true)

      isChecked.value = false
      await Promise.resolve()
      expect(checkbox.checked).toBe(false)
      unmount?.()
    })
  })

  describe('radio button binding', () => {
    it('should bind checked state based on value match', () => {
      const gender = ref('male')

      const unmount1 = mount(input({
        type: 'radio',
        name: 'gender', value: 'male',
        checked: computed(() => gender.value === 'male')
      }), container)

      const unmount2 = mount(input({
        type: 'radio',
        name: 'gender', value: 'female',
        checked: computed(() => gender.value === 'female')
      }), container)

      const radios = container.querySelectorAll('input[type="radio"]') as NodeListOf<HTMLInputElement>
      expect(radios[0].checked).toBe(true)
      expect(radios[1].checked).toBe(false)
      unmount1?.()
      unmount2?.()
    })

    it('should update radio selection reactively', async () => {
      const gender = ref('male')

      const unmount1 = mount(input({
        type: 'radio',
        name: 'gender', value: 'male',
        checked: computed(() => gender.value === 'male')
      }), container)

      const unmount2 = mount(input({
        type: 'radio',
        name: 'gender', value: 'female',
        checked: computed(() => gender.value === 'female')
      }), container)

      const radios = container.querySelectorAll('input[type="radio"]') as NodeListOf<HTMLInputElement>
      expect(radios[0].checked).toBe(true)
      expect(radios[1].checked).toBe(false)

      gender.value = 'female'
      await Promise.resolve()
      expect(radios[0].checked).toBe(false)
      expect(radios[1].checked).toBe(true)

      unmount1?.()
      unmount2?.()
    })
  })

  describe('element ref', () => {
    it('should set ref value after mount', () => {
      const inputRef = ref<HTMLInputElement | null>(null)
      const unmount = mount(input({ ref: inputRef }), container)

      expect(inputRef.value).not.toBeNull()
      expect(inputRef.value).toBeInstanceOf(HTMLInputElement)
      unmount?.()
    })

    it('should clear ref value on unmount', () => {
      const inputRef = ref<HTMLInputElement | null>(null)
      const unmount = mount(input({ ref: inputRef }), container)

      expect(inputRef.value).not.toBeNull()
      unmount?.()
      expect(inputRef.value).toBeNull()
    })

    it('should allow accessing element methods via ref', () => {
      const inputRef = ref<HTMLInputElement | null>(null)
      const unmount = mount(input({ ref: inputRef, value: 'test' }), container)

      expect(inputRef.value?.value).toBe('test')
      unmount?.()
    })
  })

  describe('each', () => {
    it('should render list of objects', () => {
      const items = ref([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' }
      ])

      const unmount = mount(each(items, (item) =>
        div({ children: item.name })
      ), container)

      const divs = container.querySelectorAll('div')
      expect(divs.length).toBe(3)
      expect(divs[0].textContent).toBe('Alice')
      expect(divs[1].textContent).toBe('Bob')
      expect(divs[2].textContent).toBe('Charlie')

      unmount?.()
    })

    it('should add new items', async () => {
      const item1 = { id: 1, name: 'Alice' }
      const items = ref([item1])

      const unmount = mount(each(items, (item) =>
        div({ children: item.name })
      ), container)

      expect(container.querySelectorAll('div').length).toBe(1)

      // Add new item while keeping old reference
      items.value = [item1, { id: 2, name: 'Bob' }]
      await Promise.resolve()

      const divs = container.querySelectorAll('div')
      expect(divs.length).toBe(2)
      expect(divs[0].textContent).toBe('Alice')
      expect(divs[1].textContent).toBe('Bob')

      unmount?.()
    })

    it('should remove items', async () => {
      const item1 = { id: 1, name: 'Alice' }
      const item2 = { id: 2, name: 'Bob' }
      const items = ref([item1, item2])

      const unmount = mount(each(items, (item) =>
        div({ children: item.name })
      ), container)

      expect(container.querySelectorAll('div').length).toBe(2)

      items.value = [item1] // Remove item2
      await Promise.resolve()

      const divs = container.querySelectorAll('div')
      expect(divs.length).toBe(1)
      expect(divs[0].textContent).toBe('Alice')

      unmount?.()
    })

    it('should reuse DOM nodes for same object references (swap)', async () => {
      const item1 = { id: 1, name: 'Alice' }
      const item2 = { id: 2, name: 'Bob' }
      const items = ref([item1, item2])

      const unmount = mount(each(items, (item) =>
        div({ children: item.name })
      ), container)

      const divs = container.querySelectorAll('div')
      const node1 = divs[0]
      const node2 = divs[1]

      // Swap items (same object references)
      items.value = [item2, item1]
      await Promise.resolve()

      // Same DOM nodes should be reused, just reordered
      const newDivs = container.querySelectorAll('div')
      expect(newDivs[0]).toBe(node2)
      expect(newDivs[1]).toBe(node1)
      expect(newDivs[0].textContent).toBe('Bob')
      expect(newDivs[1].textContent).toBe('Alice')

      unmount?.()
    })

    it('should create new instances for new objects', async () => {
      const item1 = { id: 1, name: 'Alice' }
      const items = ref([item1])

      const unmount = mount(each(items, (item) =>
        div({ children: item.name })
      ), container)

      const originalNode = container.querySelector('div')

      // Replace with new object (same id but different reference)
      items.value = [{ id: 1, name: 'Alice Updated' }]
      await Promise.resolve()

      // New object = new DOM node
      const newNode = container.querySelector('div')
      expect(newNode).not.toBe(originalNode)
      expect(newNode?.textContent).toBe('Alice Updated')

      unmount?.()
    })

    it('should work with getter function', async () => {
      const items = ref([{ id: 1, name: 'Test' }])

      const unmount = mount(each(
        () => items.value,
        (item) => div({ children: item.name })
      ), container)

      expect(container.querySelectorAll('div').length).toBe(1)

      unmount?.()
    })

    it('should clear all items', async () => {
      const items = ref([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' }
      ])

      const unmount = mount(each(items, (item) =>
        div({ children: item.name })
      ), container)

      expect(container.querySelectorAll('div').length).toBe(2)

      items.value = []
      await Promise.resolve()

      expect(container.querySelectorAll('div').length).toBe(0)

      unmount?.()
    })

    it('should cleanup on unmount', () => {
      const items = ref([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' }
      ])

      const unmount = mount(each(items, (item) =>
        div({ children: item.name })
      ), container)

      expect(container.querySelectorAll('div').length).toBe(2)

      unmount?.()

      expect(container.querySelectorAll('div').length).toBe(0)
    })
  })

  describe('repeat', () => {
    it('should render list of values', () => {
      const tags = ref(['red', 'blue', 'green'])

      const unmount = mount(repeat(tags, (tag) =>
        span({ children: tag })
      ), container)

      const spans = container.querySelectorAll('span')
      expect(spans.length).toBe(3)
      expect(spans[0].textContent).toBe('red')
      expect(spans[1].textContent).toBe('blue')
      expect(spans[2].textContent).toBe('green')

      unmount?.()
    })

    it('should render by count', () => {
      const count = ref(5)

      const unmount = mount(repeat(count, (index) =>
        div({ children: String(index) })
      ), container)

      const divs = container.querySelectorAll('div')
      expect(divs.length).toBe(5)
      expect(divs[0].textContent).toBe('0')
      expect(divs[4].textContent).toBe('4')

      unmount?.()
    })

    it('should add items when count increases', async () => {
      const count = ref(2)

      const unmount = mount(repeat(count, (index) =>
        div({ children: String(index) })
      ), container)

      expect(container.querySelectorAll('div').length).toBe(2)

      count.value = 4
      await Promise.resolve()

      expect(container.querySelectorAll('div').length).toBe(4)

      unmount?.()
    })

    it('should remove items when count decreases', async () => {
      const count = ref(4)

      const unmount = mount(repeat(count, (index) =>
        div({ children: String(index) })
      ), container)

      expect(container.querySelectorAll('div').length).toBe(4)

      count.value = 2
      await Promise.resolve()

      expect(container.querySelectorAll('div').length).toBe(2)

      unmount?.()
    })

    it('should work with getter function', () => {
      const count = ref(3)

      const unmount = mount(repeat(
        () => count.value,
        (index) => div({ children: String(index) })
      ), container)

      expect(container.querySelectorAll('div').length).toBe(3)

      unmount?.()
    })

    it('should cleanup on unmount', () => {
      const count = ref(3)

      const unmount = mount(repeat(count, (index) =>
        div({ children: String(index) })
      ), container)

      expect(container.querySelectorAll('div').length).toBe(3)

      unmount?.()

      expect(container.querySelectorAll('div').length).toBe(0)
    })
  })

  describe('hydrate() - client-side hydration', () => {
    it('should reuse existing DOM elements', () => {
      // 模拟服务端渲染的 HTML
      container.innerHTML = '<div id="test">Hello</div>'
      const existingDiv = container.querySelector('#test')

      const unmount = hydrate(div({ id: 'test', children: 'Hello' }), container)

      // 应该复用已有元素，而不是创建新的
      expect(container.querySelector('#test')).toBe(existingDiv)
      expect(container.children.length).toBe(1)
      unmount?.()
    })

    it('should bind events to existing elements', () => {
      container.innerHTML = '<button>Click me</button>'
      const handler = vi.fn()

      const unmount = hydrate(button({ onClick: handler, children: 'Click me' }), container)

      container.querySelector('button')?.click()
      expect(handler).toHaveBeenCalledTimes(1)
      unmount?.()
    })

    it('should connect reactive data to existing DOM', async () => {
      container.innerHTML = '<div>Initial</div>'
      const text = ref('Initial')

      const unmount = hydrate(div({ children: text }), container)

      expect(container.firstElementChild?.textContent).toBe('Initial')

      text.value = 'Updated'
      await Promise.resolve()

      expect(container.firstElementChild?.textContent).toBe('Updated')
      unmount?.()
    })

    it('should handle nested elements', () => {
      container.innerHTML = '<div class="outer"><span class="inner">Nested</span></div>'
      const existingSpan = container.querySelector('.inner')

      const unmount = hydrate(
        div({
          class: 'outer',
          children: [span({ class: 'inner', children: 'Nested' })]
        }),
        container
      )

      // 应该复用嵌套的元素
      expect(container.querySelector('.inner')).toBe(existingSpan)
      unmount?.()
    })

    it('should warn on hydration mismatch', () => {
      container.innerHTML = '<span>Wrong tag</span>'
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const unmount = hydrate(div({ children: 'Expected div' }), container)

      // 应该有 mismatch 警告
      expect(warnSpy).toHaveBeenCalled()
      warnSpy.mockRestore()
      unmount?.()
    })

    it('should warn on extra nodes', () => {
      container.innerHTML = '<div>First</div><div>Extra</div>'
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const unmount = hydrate(div({ children: 'First' }), container)

      // 应该警告有额外节点
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Extra nodes')
      )
      warnSpy.mockRestore()
      unmount?.()
    })

    it('should throw when container is null', () => {
      expect(() => hydrate(div({}), null)).toThrow()
    })
  })

  describe('lazy', () => {
    it('should load component from async loader', async () => {
      const { lazy, div } = await import('./index')
      
      // 模拟异步模块加载
      const loader = async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return (host: HTMLElement) => {
          const el = document.createElement('span')
          el.textContent = 'Loaded'
          host.appendChild(el)
          return () => el.remove()
        }
      }

      const component = lazy({
        loader,
        loading: () => (host: HTMLElement) => {
          host.textContent = 'Loading...'
          return () => { host.textContent = '' }
        }
      })

      const unmount = mount(component, container)
      
      // 初始显示 loading
      expect(container.textContent).toBe('Loading...')
      
      // 等待加载完成
      await new Promise(resolve => setTimeout(resolve, 50))
      
      expect(container.textContent).toContain('Loaded')
      unmount?.()
    })

    it('should handle error state', async () => {
      const { lazy } = await import('./index')
      
      const failedLoader = () => {
        return Promise.reject(new Error('Load failed'))
      }

      const component = lazy({
        loader: failedLoader,
        loading: () => (host: HTMLElement) => {
          host.textContent = 'Loading...'
          return () => { host.textContent = '' }
        },
        error: (err) => (host: HTMLElement) => {
          host.textContent = `Error: ${err.message}`
          return () => { host.textContent = '' }
        }
      })

      const unmount = mount(component, container)
      
      // 等待错误处理
      await new Promise(resolve => setTimeout(resolve, 50))
      
      expect(container.textContent).toContain('Error: Load failed')
      unmount?.()
    })

    it('should support minDelay to avoid flashing', async () => {
      const { lazy } = await import('./index')
      
      const Component = async () => {
        // 非常快速的加载
        return (host: HTMLElement) => {
          host.textContent = 'Loaded'
        }
      }

      const component = lazy({
        loader: Component,
        loading: () => (host: HTMLElement) => {
          host.textContent = 'Loading...'
        },
        minDelay: 100  // 最小延迟 100ms
      })

      const startTime = Date.now()
      const unmount = mount(component, container)
      
      // 立即检查应该显示 loading
      expect(container.textContent).toBe('Loading...')
      
      // 只等待 30ms - 应该还在 loading
      await new Promise(resolve => setTimeout(resolve, 30))
      expect(container.textContent).toBe('Loading...')
      
      // 等待足够长时间后才显示内容
      await new Promise(resolve => setTimeout(resolve, 80))
      expect(container.textContent).toBe('Loaded')
      
      const elapsed = Date.now() - startTime
      expect(elapsed).toBeGreaterThanOrEqual(100)
      
      unmount?.()
    })

    it('should support createLazy factory', async () => {
      const { createLazy } = await import('./index')
      
      const loader = async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return (host: HTMLElement) => {
          host.textContent = 'Factory Component'
          return () => { host.textContent = '' }
        }
      }

      const LazyComponent = createLazy(loader, {
        loading: () => (host: HTMLElement) => {
          host.textContent = 'Loading...'
          return () => { host.textContent = '' }
        }
      })

      const unmount = mount(LazyComponent(), container)
      
      expect(container.textContent).toBe('Loading...')
      
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(container.textContent).toBe('Factory Component')
      
      unmount?.()
    })
  })
})
