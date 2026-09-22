import { describe, it, expect, beforeEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import { text } from '@rasenjs/dom'
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
      // jsdom does not reflect the loading IDL property; the attribute is
      // the source of truth.
      expect(el?.getAttribute('loading')).toBe('lazy')
    })
  })

  describe('createAvatarFallback', () => {
    it('should apply the class it accepts', () => {
      const container = document.createElement('div')
      const Fallback = createAvatarFallback()
      // `class` is part of AvatarFallbackProps; it used to be declared and then
      // ignored, so a consumer styling the fallback had nothing to hook onto.
      Fallback({ class: 'my-fallback' })(container)

      expect(container.querySelector('span')?.className).toContain('my-fallback')
    })

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

    it('should forward the responsive image attributes to the image', () => {
      const container = document.createElement('div')
      const Avatar = createAvatar()

      Avatar({
        src: 'small.jpg',
        srcSet: 'small.jpg 1x, large.jpg 2x',
        sizes: '(min-width: 600px) 48px, 32px',
        alt: 'Portrait'
      })(container)

      // The Image part has always accepted these; the preset did not pass them
      // on, so a consumer going through the preset could not reach responsive
      // images at all - and nothing failed, because the props were optional.
      const img = container.querySelector('img')
      expect(img?.getAttribute('src')).toBe('small.jpg')
      expect(img?.getAttribute('srcset')).toBe('small.jpg 1x, large.jpg 2x')
      expect(img?.getAttribute('sizes')).toBe('(min-width: 600px) 48px, 32px')
      expect(img?.getAttribute('alt')).toBe('Portrait')
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

/**
 * The reason the component exists: show the image when it loads, the fallback
 * when it fails or is still loading.
 */
describe('@rasenjs/rota - Avatar / load status', () => {
  const mountAvatar = (src: string) => {
    const container = document.createElement('div')
    avatar({ src, alt: 'A user', fallback: () => text({ content: 'AB' }) })(
      container
    )
    return container
  }

  it('should hide the fallback once the image loads', () => {
    const container = mountAvatar('ok.png')
    const img = container.querySelector('img')!
    const fallback = container.querySelector('span span')!

    // Starts visible: the image has not loaded yet.
    expect(fallback.getAttribute('data-state')).toBe('visible')
    expect(fallback.style.opacity).toBe('1')

    img.dispatchEvent(new Event('load'))

    expect(img.getAttribute('data-state')).toBe('loaded')
    expect(fallback.getAttribute('data-state')).toBe('hidden')
    expect(fallback.style.opacity).toBe('0')
  })

  it('should keep the fallback visible when the image fails', () => {
    const container = mountAvatar('broken.png')
    const img = container.querySelector('img')!
    const fallback = container.querySelector('span span')!

    img.dispatchEvent(new Event('error'))

    expect(img.getAttribute('data-state')).toBe('error')
    expect(fallback.getAttribute('data-state')).toBe('visible')
    expect(fallback.style.opacity).toBe('1')
  })

  it('should report status changes to the consumer', () => {
    const seen: string[] = []
    const container = document.createElement('div')
    createAvatarImage()({
      src: 'x.png',
      onLoadingStatusChange: (status) => seen.push(status)
    })(container)

    const img = container.querySelector('img')!
    img.dispatchEvent(new Event('load'))
    img.dispatchEvent(new Event('error'))

    expect(seen).toEqual(['loaded', 'error'])
  })

  describe('createAvatar preset options', () => {
    it('should pass onLoadingStatusChange through to the image', () => {
      const container = document.createElement('div')
      const seen: string[] = []
      avatar({
        src: 'x.png',
        onLoadingStatusChange: (status) => seen.push(status),
        fallback: () => text({ content: 'AB' })
      })(container)

      container.querySelector('img')!.dispatchEvent(new Event('load'))

      expect(seen).toEqual(['loaded'])
    })

    it('should pass delayMs through to the fallback', () => {
      const delayed = document.createElement('div')
      avatar({
        src: 'x.png',
        delayMs: 100,
        fallback: () => text({ content: 'AB' })
      })(delayed)

      // The delay has not elapsed, so the fallback is still hidden even though
      // the image has not loaded either.
      const delayedFallback = delayed.querySelector('span span')!
      expect(delayedFallback.getAttribute('data-state')).toBe('hidden')
      expect(delayedFallback.style.opacity).toBe('0')

      // Without a delay the fallback is visible from the start.
      const immediate = document.createElement('div')
      avatar({
        src: 'x.png',
        fallback: () => text({ content: 'AB' })
      })(immediate)
      expect(immediate.querySelector('span span')!.getAttribute('data-state')).toBe(
        'visible'
      )
    })
  })

  describe('per-instance state', () => {
    it('should keep load status per instance, not per component', () => {
      // Both avatars come from the same preset: one component definition,
      // mounted twice. Per-instance state must not be shared.
      const mountInto = (parent: HTMLElement, src: string) => {
        const host = document.createElement('div')
        parent.append(host)
        avatar({ src, fallback: () => text({ content: 'AB' }) })(host)
        return host
      }

      const page = document.createElement('div')
      const first = mountInto(page, 'broken.png')
      const second = mountInto(page, 'ok.png')

      const firstImg = first.querySelector('img')!
      const secondImg = second.querySelector('img')!

      firstImg.dispatchEvent(new Event('error'))

      expect(firstImg.getAttribute('data-state')).toBe('error')
      expect(first.querySelector('span span')!.style.opacity).toBe('1')
      // One broken image must not blank a working one.
      expect(secondImg.getAttribute('data-state')).toBe('loading')

      secondImg.dispatchEvent(new Event('load'))

      expect(secondImg.getAttribute('data-state')).toBe('loaded')
      expect(second.querySelector('span span')!.style.opacity).toBe('0')
      // ...and the first keeps its own failure.
      expect(firstImg.getAttribute('data-state')).toBe('error')
      expect(first.querySelector('span span')!.style.opacity).toBe('1')
    })
  })
})
