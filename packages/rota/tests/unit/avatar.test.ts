import { describe, it, expect, beforeEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import {
  createAvatarRoot,
  createAvatarImage,
  createAvatarFallback,
  createAvatar,
  avatar
} from '@rasenjs/rota/components/avatar'

beforeEach(() => {
  setReactiveRuntime(createReactiveRuntime())
})

describe('@rasenjs/rota - Avatar', () => {
  describe('createAvatarRoot', () => {
    it('should render a span element', () => {
      const container = document.createElement('div')
      const Root = createAvatarRoot()
      Root()(container)

      const el = container.querySelector('span')
      expect(el).toBeTruthy()
    })

    it('should apply custom class', () => {
      const container = document.createElement('div')
      const Root = createAvatarRoot()
      Root({ class: 'avatar-root' })(container)

      const el = container.querySelector('span')
      expect(el?.className).toContain('avatar-root')
    })

    it('should have relative position', () => {
      const container = document.createElement('div')
      const Root = createAvatarRoot()
      Root()(container)

      const el = container.querySelector('span')
      expect(el?.style.position).toBe('relative')
    })

    it('should have overflow hidden', () => {
      const container = document.createElement('div')
      const Root = createAvatarRoot()
      Root()(container)

      const el = container.querySelector('span')
      expect(el?.style.overflow).toBe('hidden')
    })
  })

  describe('createAvatarImage', () => {
    it('should render an img element', () => {
      const container = document.createElement('div')
      const Image = createAvatarImage()
      Image({ src: 'test.jpg', alt: 'test' })(container)

      const el = container.querySelector('img')
      expect(el).toBeTruthy()
    })

    it('should set src and alt', () => {
      const container = document.createElement('div')
      const Image = createAvatarImage()
      Image({ src: 'avatar.jpg', alt: 'User avatar' })(container)

      const el = container.querySelector('img')
      expect(el?.src).toContain('avatar.jpg')
      expect(el?.alt).toBe('User avatar')
    })

    it('should have absolute positioning', () => {
      const container = document.createElement('div')
      const Image = createAvatarImage()
      Image({ src: 'test.jpg' })(container)

      const el = container.querySelector('img')
      expect(el?.style.position).toBe('absolute')
      expect(el?.style.top).toBe('0px')
      expect(el?.style.left).toBe('0px')
    })

    it('should have object-fit cover', () => {
      const container = document.createElement('div')
      const Image = createAvatarImage()
      Image({ src: 'test.jpg' })(container)

      const el = container.querySelector('img')
      expect(el?.style.objectFit).toBe('cover')
    })

    it('should set loading attribute', () => {
      const container = document.createElement('div')
      const Image = createAvatarImage()
      Image({ src: 'test.jpg', loading: 'lazy' })(container)

      const el = container.querySelector('img')
      expect(el?.loading).toBe('lazy')
    })
  })

  describe('createAvatarFallback', () => {
    it('should render a span element', () => {
      const container = document.createElement('div')
      const Fallback = createAvatarFallback()
      Fallback()(container)

      const el = container.querySelector('span')
      expect(el).toBeTruthy()
    })

    it('should have absolute positioning', () => {
      const container = document.createElement('div')
      const Fallback = createAvatarFallback()
      Fallback()(container)

      const el = container.querySelector('span')
      expect(el?.style.position).toBe('absolute')
    })

    it('should be visible by default (delayMs=0)', () => {
      const container = document.createElement('div')
      const Fallback = createAvatarFallback()
      Fallback()(container)

      const el = container.querySelector('span')
      expect(el?.dataset.state).toBe('visible')
      expect(el?.style.opacity).toBe('1')
    })

    it('should be hidden with delayMs', () => {
      const container = document.createElement('div')
      const Fallback = createAvatarFallback()
      Fallback({ delayMs: 100 })(container)

      const el = container.querySelector('span')
      expect(el?.dataset.state).toBe('hidden')
      expect(el?.style.opacity).toBe('0')
    })

    it('should use flexbox for centering', () => {
      const container = document.createElement('div')
      const Fallback = createAvatarFallback()
      Fallback()(container)

      const el = container.querySelector('span')
      expect(el?.style.display).toBe('flex')
      expect(el?.style.alignItems).toBe('center')
      expect(el?.style.justifyContent).toBe('center')
    })
  })

  describe('createAvatar (composed)', () => {
    it('should render root with class', () => {
      const container = document.createElement('div')
      const Avatar = createAvatar()

      Avatar({
        src: 'test.jpg',
        class: 'my-avatar',
        style: { borderRadius: '50%' }
      })(container)

      const root = container.querySelector('span')
      expect(root).toBeTruthy()
      expect(root?.className).toContain('my-avatar')
      expect(root?.style.borderRadius).toBe('50%')
    })
  })

  describe('cleanup', () => {
    it('should remove root on unmount', () => {
      const container = document.createElement('div')
      const Root = createAvatarRoot()
      const unmount = Root({ class: 'cleanup-test' })(container)

      expect(container.querySelector('.cleanup-test')).toBeTruthy()

      unmount?.()

      expect(container.querySelector('.cleanup-test')).toBeFalsy()
    })

    it('should remove img on unmount', () => {
      const container = document.createElement('div')
      const Image = createAvatarImage()
      const unmount = Image({ src: 'test.jpg' })(container)

      expect(container.querySelector('img')).toBeTruthy()

      unmount?.()

      expect(container.querySelector('img')).toBeFalsy()
    })

    it('should remove fallback on unmount', () => {
      const container = document.createElement('div')
      const Fallback = createAvatarFallback()
      const unmount = Fallback()(container)

      expect(container.querySelector('span')).toBeTruthy()

      unmount?.()

      expect(container.querySelector('span')).toBeFalsy()
    })
  })
})
