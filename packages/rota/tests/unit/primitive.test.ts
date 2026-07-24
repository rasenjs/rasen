import { describe, it, expect, beforeEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import { primitive } from '@rasenjs/rota/primitives/primitive'

beforeEach(() => {
  setReactiveRuntime(createReactiveRuntime())
})

describe('@rasenjs/rota - primitive', () => {
  describe('basic element creation', () => {
    it('should create a div element', () => {
      const div = primitive('div')
      const container = document.createElement('div')

      const unmount = div({ class: 'test' })(container)

      expect(container.querySelector('.test')).toBeTruthy()
      expect(container.querySelector('div')).toBeTruthy()

      unmount?.()
    })

    it('should create an element with text content', () => {
      const span = primitive('span')
      const container = document.createElement('div')

      span({ children: 'Hello World' })(container)

      expect(container.textContent).toBe('Hello World')
    })

    it('should apply className', () => {
      const button = primitive('button')
      const container = document.createElement('div')

      button({ class: 'btn btn-primary', children: 'Click' })(container)

      const el = container.querySelector('button')
      expect(el?.className).toBe('btn btn-primary')
    })

    it('should apply inline styles', () => {
      const div = primitive('div')
      const container = document.createElement('div')

      div({
        style: {
          color: 'red',
          fontSize: '16px'
        }
      })(container)

      const el = container.querySelector('div')
      expect(el?.style.color).toBe('red')
      expect(el?.style.fontSize).toBe('16px')
    })

    it('should handle string styles', () => {
      const div = primitive('div')
      const container = document.createElement('div')

      div({ style: 'color: blue; padding: 10px' })(container)

      const el = container.querySelector('div')
      expect(el?.style.color).toBe('blue')
      expect(el?.style.padding).toBe('10px')
    })

    it('should add event listeners', () => {
      const button = primitive('button')
      const container = document.createElement('div')
      let clicked = false

      button({
        children: 'Click me',
        onClick: () => {
          clicked = true
        }
      })(container)

      const btn = container.querySelector('button')
      btn?.click()

      expect(clicked).toBe(true)
    })

    it('should set attributes', () => {
      const input = primitive('input')
      const container = document.createElement('div')

      input({
        type: 'text',
        placeholder: 'Enter text',
        disabled: true
      })(container)

      const el = container.querySelector('input')
      expect(el?.getAttribute('type')).toBe('text')
      expect(el?.getAttribute('placeholder')).toBe('Enter text')
      expect(el?.disabled).toBe(true)
    })

    it('should cleanup on unmount', () => {
      const div = primitive('div')
      const container = document.createElement('div')

      const unmount = div({ class: 'cleanup-test' })(container)
      expect(container.querySelector('.cleanup-test')).toBeTruthy()

      unmount?.()
      expect(container.querySelector('.cleanup-test')).toBeFalsy()
    })
  })
})
