import { describe, it, expect, beforeEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import {
  aspectRatio,
  createAspectRatio
} from '@rasenjs/rota/components/aspect-ratio'

beforeEach(() => {
  setReactiveRuntime(createReactiveRuntime())
})

describe('@rasenjs/rota - AspectRatio', () => {
  describe('basic rendering', () => {
    it('should render a container element', () => {
      const container = document.createElement('div')
      aspectRatio()(container)

      // aspectRatio creates a container div inside host
      const aspectContainer = container.querySelector('div')
      expect(aspectContainer).toBeTruthy()
    })

    it('should create content wrapper inside container', () => {
      const container = document.createElement('div')
      aspectRatio()(container)

      // Content wrapper is inside the aspect container
      const aspectContainer = container.querySelector('div')
      const contentWrapper = aspectContainer?.querySelector('div')
      expect(contentWrapper).toBeTruthy()
    })

    it('should apply custom class to container', () => {
      const container = document.createElement('div')
      aspectRatio({ class: 'my-aspect-ratio' })(container)

      const el = container.querySelector('div')
      expect(el?.className).toContain('my-aspect-ratio')
    })
  })

  describe('ratio calculation', () => {
    it('should use default ratio of 1 (square)', () => {
      const container = document.createElement('div')
      aspectRatio()(container)

      const el = container.querySelector('div')
      expect(el?.style.paddingBottom).toBe('100%')
    })

    it('should calculate padding for 16:9 ratio', () => {
      const container = document.createElement('div')
      aspectRatio({ ratio: 16 / 9 })(container)

      const el = container.querySelector('div')
      // 16:9 means width/height = 16/9, so height/width = 9/16 = 56.25%
      expect(el?.style.paddingBottom).toBe('56.25%')
    })

    it('should calculate padding for 4:3 ratio', () => {
      const container = document.createElement('div')
      aspectRatio({ ratio: 4 / 3 })(container)

      const el = container.querySelector('div')
      // 4:3 means width/height = 4/3, so height/width = 3/4 = 75%
      expect(el?.style.paddingBottom).toBe('75%')
    })

    it('should calculate padding for 1:1 ratio', () => {
      const container = document.createElement('div')
      aspectRatio({ ratio: 1 })(container)

      const el = container.querySelector('div')
      expect(el?.style.paddingBottom).toBe('100%')
    })
  })

  describe('container styles', () => {
    it('should have position relative', () => {
      const container = document.createElement('div')
      aspectRatio()(container)

      const el = container.querySelector('div')
      expect(el?.style.position).toBe('relative')
    })

    it('should have width 100%', () => {
      const container = document.createElement('div')
      aspectRatio()(container)

      const el = container.querySelector('div')
      expect(el?.style.width).toBe('100%')
    })

    it('should have overflow hidden', () => {
      const container = document.createElement('div')
      aspectRatio()(container)

      const el = container.querySelector('div')
      expect(el?.style.overflow).toBe('hidden')
    })
  })

  describe('with children', () => {
    it('should render children inside content wrapper', () => {
      const container = document.createElement('div')

      aspectRatio({ ratio: 16 / 9 }, () => {
        const img = document.createElement('img')
        img.src = 'test.jpg'
        return (parent: HTMLElement) => {
          parent.appendChild(img)
          return () => img.remove()
        }
      })(container)

      // img should be inside the content wrapper (second div)
      const contentWrapper = container.querySelector('div > div')
      const img = contentWrapper?.querySelector('img')
      expect(img).toBeTruthy()
      expect(img?.src).toContain('test.jpg')
    })

    it('should have img fill the container', () => {
      const container = document.createElement('div')

      aspectRatio({ ratio: 16 / 9 }, () => {
        const img = document.createElement('img')
        img.src = 'test.jpg'
        img.style.width = '100%'
        img.style.height = '100%'
        return (parent: HTMLElement) => {
          parent.appendChild(img)
          return () => img.remove()
        }
      })(container)

      const img = container.querySelector('img')
      expect(img).toBeTruthy()
      expect(img?.style.width).toBe('100%')
      expect(img?.style.height).toBe('100%')
    })
  })

  describe('cleanup', () => {
    it('should remove all elements on unmount', () => {
      const container = document.createElement('div')
      const unmount = aspectRatio({ class: 'cleanup-test' })(container)

      expect(container.querySelector('.cleanup-test')).toBeTruthy()

      unmount?.()

      expect(container.querySelector('.cleanup-test')).toBeFalsy()
    })
  })
})
