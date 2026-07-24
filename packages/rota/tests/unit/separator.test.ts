import { describe, it, expect, beforeEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import {
  separator,
  hseparator,
  vseparator,
  createSeparator
} from '@rasenjs/rota/components/separator'

beforeEach(() => {
  setReactiveRuntime(createReactiveRuntime())
})

describe('@rasenjs/rota - Separator', () => {
  describe('basic rendering', () => {
    it('should render an hr element', () => {
      const container = document.createElement('div')
      separator()(container)

      const el = container.querySelector('hr')
      expect(el).toBeTruthy()
    })

    it('should render horizontal separator by default', () => {
      const container = document.createElement('div')
      separator()(container)

      const el = container.querySelector('hr')
      expect(el?.getAttribute('data-orientation')).toBe('horizontal')
      expect(el?.getAttribute('aria-orientation')).toBe('horizontal')
    })

    it('should render with custom class', () => {
      const container = document.createElement('div')
      separator({ class: 'my-separator' })(container)

      const el = container.querySelector('hr')
      expect(el?.className).toContain('my-separator')
    })

    it('should apply custom styles', () => {
      const container = document.createElement('div')
      separator({
        style: {
          backgroundColor: 'red'
        }
      })(container)

      const el = container.querySelector('hr')
      expect(el?.style.backgroundColor).toBe('red')
    })
  })

  describe('orientation', () => {
    it('should support horizontal orientation', () => {
      const container = document.createElement('div')
      separator({ orientation: 'horizontal' })(container)

      const el = container.querySelector('hr')
      expect(el?.getAttribute('data-orientation')).toBe('horizontal')
      expect(el?.style.height).toBe('1px')
    })

    it('should support vertical orientation', () => {
      const container = document.createElement('div')
      separator({ orientation: 'vertical' })(container)

      const el = container.querySelector('hr')
      expect(el?.getAttribute('data-orientation')).toBe('vertical')
      expect(el?.style.width).toBe('1px')
    })

    it('should render horizontal separator with hseparator helper', () => {
      const container = document.createElement('div')
      hseparator()(container)

      const el = container.querySelector('hr')
      expect(el?.getAttribute('data-orientation')).toBe('horizontal')
    })

    it('should render vertical separator with vseparator helper', () => {
      const container = document.createElement('div')
      vseparator()(container)

      const el = container.querySelector('hr')
      expect(el?.getAttribute('data-orientation')).toBe('vertical')
    })
  })

  describe('decorative', () => {
    it('should add separator role when decorative is false', () => {
      const container = document.createElement('div')
      separator({ decorative: false })(container)

      const el = container.querySelector('hr')
      expect(el?.getAttribute('role')).toBe('separator')
      expect(el?.getAttribute('aria-orientation')).toBe('horizontal')
    })

    it('should not add separator role when decorative is true', () => {
      const container = document.createElement('div')
      separator({ decorative: true })(container)

      const el = container.querySelector('hr')
      expect(el?.hasAttribute('role')).toBe(false)
      expect(el?.hasAttribute('aria-orientation')).toBe(false)
    })

    it('should default to semantic (not decorative)', () => {
      const container = document.createElement('div')
      separator()(container)

      const el = container.querySelector('hr')
      expect(el?.getAttribute('role')).toBe('separator')
    })
  })

  describe('cleanup', () => {
    it('should remove element on unmount', () => {
      const container = document.createElement('div')
      const unmount = separator({ class: 'cleanup-test' })(container)

      expect(container.querySelector('.cleanup-test')).toBeTruthy()

      unmount?.()

      expect(container.querySelector('.cleanup-test')).toBeFalsy()
    })
  })
})
