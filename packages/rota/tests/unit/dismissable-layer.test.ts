/**
 * Dismissable layer.
 *
 * These are document-level listeners, so the tests dispatch on the document (or
 * on an element that bubbles to it) and check what the layer reported — and, in
 * the cancellation cases, that it reported something it then honoured.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createDismissableLayer,
  type DismissableLayerOptions
} from '../../src/internal/dismissable-layer'

let container: HTMLElement
let outside: HTMLButtonElement

/**
 * Every layer made by a test, so they can all be deactivated afterwards.
 *
 * A layer listens on `document`, and a layer nobody deactivates keeps
 * listening: the first version of this file leaked them, and the leaked
 * handlers — two of which deliberately call `preventDefault()` — swallowed the
 * events the later tests dispatched. That is not a test-only hazard either: it
 * is why the components must deactivate on unmount.
 */
const layers: Array<{ deactivate: () => void }> = []

beforeEach(() => {
  container = document.createElement('div')
  outside = document.createElement('button')
  outside.id = 'outside'
  document.body.append(container, outside)
})

afterEach(() => {
  for (const layer of layers.splice(0)) layer.deactivate()
  container.remove()
  outside.remove()
})

/** jsdom has no PointerEvent, so the layer listens for `mousedown` there. */
const press = (target: Node): void => {
  target.dispatchEvent(
    new MouseEvent('mousedown', { bubbles: true, cancelable: true })
  )
}

const escape = (target: Node): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true
  })
  target.dispatchEvent(event)
  return event
}

const focusIn = (target: Node): FocusEvent => {
  const event = new FocusEvent('focusin', { bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

function layer(options: Partial<DismissableLayerOptions> = {}) {
  const spies = {
    onDismiss: vi.fn(),
    onEscapeKeyDown: vi.fn(),
    onPointerDownOutside: vi.fn(),
    onFocusOutside: vi.fn()
  }
  const instance = createDismissableLayer({
    container: () => container,
    ...spies,
    ...options
  })
  layers.push(instance)
  return { instance, ...spies }
}

describe('@rasenjs/rota - dismissable layer', () => {
  describe('while inactive', () => {
    it('should not listen at all', () => {
      const { instance, onDismiss } = layer()
      escape(document.body)
      press(outside)
      expect(onDismiss).not.toHaveBeenCalled()
      expect(instance.isActive()).toBe(false)
    })
  })

  describe('Escape', () => {
    it('should dismiss', () => {
      const { instance, onDismiss } = layer()
      instance.activate()
      escape(document.body)
      expect(onDismiss).toHaveBeenCalledTimes(1)
    })

    it('should reach the document even when focus is outside the panel', () => {
      // The reason the listener is not on the container: with focus on the
      // body, a panel-local handler would never see the key.
      const { instance, onDismiss } = layer()
      instance.activate()
      outside.focus()
      escape(outside)
      expect(onDismiss).toHaveBeenCalled()
    })

    it('should report before dismissing, and honour preventDefault', () => {
      // The callback that decides must be the one the layer was given, so
      // assert on it — not on the helper's default spy, which it replaced.
      const seen = vi.fn((event: KeyboardEvent) => event.preventDefault())
      const { instance, onDismiss } = layer({ onEscapeKeyDown: seen })
      instance.activate()
      escape(document.body)
      expect(seen).toHaveBeenCalledTimes(1)
      expect(onDismiss).not.toHaveBeenCalled()
    })

    it('should stay open when the consumer opts out', () => {
      const { instance, onDismiss } = layer({ dismissOnEscape: false })
      instance.activate()
      escape(document.body)
      expect(onDismiss).not.toHaveBeenCalled()
    })

    it('should ignore other keys', () => {
      const { instance, onDismiss } = layer()
      instance.activate()
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })
      )
      expect(onDismiss).not.toHaveBeenCalled()
    })
  })

  describe('a press outside', () => {
    it('should dismiss', () => {
      const { instance, onDismiss, onPointerDownOutside } = layer()
      instance.activate()
      press(outside)
      expect(onPointerDownOutside).toHaveBeenCalledTimes(1)
      expect(onDismiss).toHaveBeenCalledTimes(1)
    })

    it('should ignore a press inside', () => {
      const { instance, onDismiss } = layer()
      instance.activate()
      press(container)
      expect(onDismiss).not.toHaveBeenCalled()
    })

    it('should honour preventDefault', () => {
      const seen = vi.fn((event: Event) => event.preventDefault())
      const { instance, onDismiss } = layer({ onPointerDownOutside: seen })
      instance.activate()
      press(outside)
      expect(seen).toHaveBeenCalledTimes(1)
      expect(onDismiss).not.toHaveBeenCalled()
    })

    it('should stay open when the consumer opts out (press)', () => {
      const { instance, onDismiss, onPointerDownOutside } = layer({
        dismissOnPointerDownOutside: false
      })
      instance.activate()
      press(outside)
      expect(onPointerDownOutside).toHaveBeenCalledTimes(1)
      expect(onDismiss).not.toHaveBeenCalled()
    })

    it('should fire even if a handler inside stops propagation upward', () => {
      // Capture phase on the document, so a press that happened outside can
      // never be hidden by something in the tree.
      const swallow = (event: Event) => event.stopPropagation()
      document.body.addEventListener('mousedown', swallow)
      try {
        const { instance, onDismiss } = layer()
        instance.activate()
        press(outside)
        expect(onDismiss).toHaveBeenCalledTimes(1)
      } finally {
        document.body.removeEventListener('mousedown', swallow)
      }
    })

    it('should treat a listed element as inside', () => {
      const { instance, onDismiss } = layer({
        isInside: (target) => target === outside
      })
      instance.activate()
      press(outside)
      expect(onDismiss).not.toHaveBeenCalled()
    })
  })

  describe('focus leaving', () => {
    it('should report without dismissing by default', () => {
      const { instance, onDismiss, onFocusOutside } = layer()
      instance.activate()
      focusIn(outside)
      expect(onFocusOutside).toHaveBeenCalledTimes(1)
      expect(onDismiss).not.toHaveBeenCalled()
    })

    it('should dismiss when asked to', () => {
      const { instance, onDismiss } = layer({ dismissOnFocusOutside: true })
      instance.activate()
      focusIn(outside)
      expect(onDismiss).toHaveBeenCalledTimes(1)
    })

    it('should ignore focus staying inside', () => {
      const { instance, onFocusOutside } = layer()
      instance.activate()
      focusIn(container)
      expect(onFocusOutside).not.toHaveBeenCalled()
    })
  })

  describe('deactivating', () => {
    it('should stop listening', () => {
      const { instance, onDismiss } = layer()
      instance.activate()
      instance.deactivate()
      escape(document.body)
      press(outside)
      expect(onDismiss).not.toHaveBeenCalled()
      expect(instance.isActive()).toBe(false)
    })

    it('should not listen twice when activated twice', () => {
      const { instance, onDismiss } = layer()
      instance.activate()
      instance.activate()
      escape(document.body)
      expect(onDismiss).toHaveBeenCalledTimes(1)
    })
  })
})
