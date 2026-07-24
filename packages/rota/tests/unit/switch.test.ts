import { describe, it, expect, beforeEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import {
  createSwitchRoot,
  createSwitchThumb,
  switchRoot,
  switchThumb
} from '@rasenjs/rota/components/switch'

beforeEach(() => {
  setReactiveRuntime(createReactiveRuntime())
})

describe('@rasenjs/rota - Switch', () => {
  describe('createSwitchRoot', () => {
    it('should render a button element with role="switch"', () => {
      const container = document.createElement('div')
      const Root = createSwitchRoot()
      Root()(container)

      const el = container.querySelector('button')
      expect(el).toBeTruthy()
      expect(el?.getAttribute('role')).toBe('switch')
    })

    it('should have aria-checked="false" by default', () => {
      const container = document.createElement('div')
      const Root = createSwitchRoot()
      Root()(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('aria-checked')).toBe('false')
    })

    it('should have data-state="unchecked" by default', () => {
      const container = document.createElement('div')
      const Root = createSwitchRoot()
      Root()(container)

      const el = container.querySelector('button')
      expect(el?.dataset.state).toBe('unchecked')
    })

    it('should have aria-checked="true" when defaultChecked is true', () => {
      const container = document.createElement('div')
      const Root = createSwitchRoot()
      Root({ defaultChecked: true })(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('aria-checked')).toBe('true')
      expect(el?.dataset.state).toBe('checked')
    })

    it('should have aria-checked="true" when checked is true', () => {
      const container = document.createElement('div')
      const Root = createSwitchRoot()
      Root({ checked: true })(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('aria-checked')).toBe('true')
    })

    it('should have aria-disabled when disabled', () => {
      const container = document.createElement('div')
      const Root = createSwitchRoot()
      Root({ disabled: true })(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('aria-disabled')).toBe('true')
      expect(el?.dataset.disabled).toBe('')
    })

    it('should have aria-required when required', () => {
      const container = document.createElement('div')
      const Root = createSwitchRoot()
      Root({ required: true })(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('aria-required')).toBe('true')
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const Root = createSwitchRoot()
      Root({ class: 'my-switch' })(container)

      const el = container.querySelector('button')
      expect(el?.className).toContain('my-switch')
    })

    it('should apply custom styles', () => {
      const container = document.createElement('div')
      const Root = createSwitchRoot()
      Root({ style: { backgroundColor: 'blue' } })(container)

      const el = container.querySelector('button')
      expect(el?.style.backgroundColor).toBe('blue')
    })

    it('should toggle state on click', () => {
      const container = document.createElement('div')
      const Root = createSwitchRoot()
      Root()(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('aria-checked')).toBe('false')

      el?.click()

      expect(el?.getAttribute('aria-checked')).toBe('true')
      expect(el?.dataset.state).toBe('checked')
    })

    it('should not toggle when disabled', () => {
      const container = document.createElement('div')
      const Root = createSwitchRoot()
      Root({ disabled: true })(container)

      const el = container.querySelector('button')
      expect(el?.getAttribute('aria-checked')).toBe('false')

      el?.click()

      expect(el?.getAttribute('aria-checked')).toBe('false')
    })

    it('should call onCheckedChange on toggle', () => {
      const container = document.createElement('div')
      const onCheckedChange = vi.fn()
      const Root = createSwitchRoot()
      Root({ onCheckedChange })(container)

      const el = container.querySelector('button')
      el?.click()

      expect(onCheckedChange).toHaveBeenCalledWith(true)
    })

    it('should toggle with Space key', () => {
      const container = document.createElement('div')
      const Root = createSwitchRoot()
      Root()(container)

      const el = container.querySelector('button')
      const event = new KeyboardEvent('keydown', { key: ' ' })
      el?.dispatchEvent(event)

      expect(el?.getAttribute('aria-checked')).toBe('true')
    })

    it('should toggle with Enter key', () => {
      const container = document.createElement('div')
      const Root = createSwitchRoot()
      Root()(container)

      const el = container.querySelector('button')
      const event = new KeyboardEvent('keydown', { key: 'Enter' })
      el?.dispatchEvent(event)

      expect(el?.getAttribute('aria-checked')).toBe('true')
    })

    it('should respect controlled checked prop', () => {
      const container = document.createElement('div')
      const onCheckedChange = vi.fn()
      const Root = createSwitchRoot()
      Root({ checked: false, onCheckedChange })(container)

      const el = container.querySelector('button')
      el?.click()

      expect(onCheckedChange).toHaveBeenCalledWith(true)
      expect(el?.getAttribute('aria-checked')).toBe('false')
    })
  })

  describe('createSwitchThumb', () => {
    it('should render a span element', () => {
      const container = document.createElement('div')
      const Thumb = createSwitchThumb()
      Thumb()(container)

      const el = container.querySelector('span')
      expect(el).toBeTruthy()
    })

    it('should have data-state="unchecked" by default', () => {
      const container = document.createElement('div')
      const Thumb = createSwitchThumb()
      Thumb()(container)

      const el = container.querySelector('span')
      expect(el?.dataset.state).toBe('unchecked')
    })

    it('should have data-state="checked" when context is checked', () => {
      const container = document.createElement('div')
      const Thumb = createSwitchThumb()
      Thumb({}, () => ({ checked: true, disabled: false }))(container)

      const el = container.querySelector('span')
      expect(el?.dataset.state).toBe('checked')
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const Thumb = createSwitchThumb()
      Thumb({ class: 'my-thumb' })(container)

      const el = container.querySelector('span')
      expect(el?.className).toContain('my-thumb')
    })

    it('should apply custom styles', () => {
      const container = document.createElement('div')
      const Thumb = createSwitchThumb()
      Thumb({ style: { backgroundColor: 'red' } })(container)

      const el = container.querySelector('span')
      expect(el?.style.backgroundColor).toBe('red')
    })

    it('should have default thumb styles', () => {
      const container = document.createElement('div')
      const Thumb = createSwitchThumb()
      Thumb()(container)

      const el = container.querySelector('span')
      expect(el?.style.display).toBe('block')
      expect(el?.style.borderRadius).toBe('9999px')
      expect(el?.style.transition).toContain('transform')
    })
  })

  describe('cleanup', () => {
    it('should remove button on unmount', () => {
      const container = document.createElement('div')
      const Root = createSwitchRoot()
      const unmount = Root({ class: 'cleanup-test' })(container)

      expect(container.querySelector('.cleanup-test')).toBeTruthy()

      unmount?.()

      expect(container.querySelector('.cleanup-test')).toBeFalsy()
    })

    it('should remove thumb on unmount', () => {
      const container = document.createElement('div')
      const Thumb = createSwitchThumb()
      const unmount = Thumb()(container)

      expect(container.querySelector('span')).toBeTruthy()

      unmount?.()

      expect(container.querySelector('span')).toBeFalsy()
    })

    it('should remove event listeners on unmount', () => {
      const container = document.createElement('div')
      const onCheckedChange = vi.fn()
      const Root = createSwitchRoot()
      const unmount = Root({ onCheckedChange })(container)

      unmount?.()

      const el = container.querySelector('button')
      el?.click()

      expect(onCheckedChange).not.toHaveBeenCalled()
    })
  })
})
