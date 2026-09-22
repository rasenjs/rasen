/**
 * Tooltip: the described-not-focused layer.
 *
 * These tests pin where it differs from Popover - the trigger describes
 * itself instead of controlling the content, focus never moves into the
 * content, hover is what opens it, and Escape dismisses it in a way that
 * sticks (WCAG "Content on Hover or Focus").
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { text } from '@rasenjs/web/elements'
import { tooltip } from '@rasenjs/rota'
import type { TooltipSide } from '@rasenjs/rota'

let container: HTMLElement
const mounted: Array<(() => void) | undefined> = []

/**
 * The hover area is the root, not the trigger, so a pointer test acts on the
 * root. Tracked module-level so tests that do not care about the element do
 * not have to destructure it.
 */
let currentRoot: HTMLElement
const hover = () => pointer(currentRoot, 'pointerenter')
const unhover = () => pointer(currentRoot, 'pointerleave')

beforeEach(() => {
  useReactiveRuntime()
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount?.()
  container.remove()
  vi.useRealTimers()
})

interface Options {
  open?: boolean
  delayMs?: number
  side?: TooltipSide
  align?: 'start' | 'center' | 'end'
  focusable?: boolean
  onOpenChange?: (open: boolean) => void
}

function mountTooltip(options: Options = {}) {
  const { Root, Trigger, Content } = tooltip

  const unmount = Root({
    id: 'root',
    defaultOpen: options.open ?? false,
    delayMs: options.delayMs ?? 0,
    onOpenChange: options.onOpenChange,
    children: (getContext) => [
      Trigger(
        {
          id: 'trigger',
          focusable: options.focusable,
          children: () => text({ content: 'Hover me' })
        },
        getContext
      ),
      Content(
        {
          id: 'content',
          side: options.side,
          align: options.align,
          children: () => text({ content: 'Explains it' })
        },
        getContext
      )
    ]
  })(container)

  mounted.push(unmount)

  const root = container.querySelector<HTMLElement>('#root')!
  currentRoot = root

  return {
    root,
    trigger: container.querySelector<HTMLElement>('#trigger')!,
    content: container.querySelector<HTMLElement>('[role="tooltip"]')!
  }
}

/** A pointer event of the given type; jsdom has no PointerEvent constructor. */
const pointer = (target: Element, type: 'pointerenter' | 'pointerleave') =>
  target.dispatchEvent(new Event(type, { bubbles: false }))

const isOpen = (content: HTMLElement): boolean => !content.hasAttribute('hidden')

describe('@rasenjs/rota - Tooltip', () => {
  describe('parts', () => {
    it('should render a description, not a control', () => {
      const { content } = mountTooltip({ open: true })

      expect(content.getAttribute('role')).toBe('tooltip')
      // Never focusable: it is a description, not a stop on the way anywhere.
      expect(content.hasAttribute('tabindex')).toBe(false)
      // But it *is* hit-testable, because WCAG requires the content to be
      // hoverable - the user must be able to move onto it without it
      // vanishing. Hit-testable is not interactive: it holds no controls.
      expect(content.style.pointerEvents).not.toBe('none')
    })

    it('should start closed and report it', () => {
      const { root, trigger, content } = mountTooltip()

      expect(root.getAttribute('data-state')).toBe('closed')
      expect(trigger.getAttribute('data-state')).toBe('closed')
      expect(isOpen(content)).toBe(false)
    })

    it('should be the positioning context for the content', () => {
      const { root, content } = mountTooltip()

      expect(root.style.position).toBe('relative')
      expect(content.style.position).toBe('absolute')
    })

    it('should default to above the trigger, centred', () => {
      const { content } = mountTooltip({ open: true })

      expect(content.getAttribute('data-side')).toBe('top')
      expect(content.getAttribute('data-align')).toBe('center')
      expect(content.style.bottom).toBe('100%')
      expect(content.style.transform).toBe('translateX(-50%)')
    })
  })

  describe('trigger', () => {
    it('should be reachable by keyboard', () => {
      const { trigger } = mountTooltip()

      // A tooltip has to be available without a mouse.
      expect(trigger.getAttribute('tabindex')).toBe('0')
    })

    it('should not add a tab stop when asked not to', () => {
      const { trigger } = mountTooltip({ focusable: false })
      expect(trigger.hasAttribute('tabindex')).toBe(false)
    })

    it('should describe itself only while the content is there', () => {
      const { trigger, content } = mountTooltip()

      // A dangling aria-describedby announces an empty description, which is
      // worse than none.
      expect(trigger.hasAttribute('aria-describedby')).toBe(false)

      hover()
      expect(trigger.getAttribute('aria-describedby')).toBe('content')
      expect(content.id).toBe('content')

      unhover()
      expect(trigger.hasAttribute('aria-describedby')).toBe(false)
    })
  })

  describe('opening', () => {
    it('should open on hover after the delay', () => {
      vi.useFakeTimers()
      const { trigger, content } = mountTooltip({ delayMs: 300 })

      hover()
      expect(isOpen(content)).toBe(false)

      vi.advanceTimersByTime(299)
      expect(isOpen(content)).toBe(false)

      vi.advanceTimersByTime(1)
      expect(isOpen(content)).toBe(true)
    })

    it('should not open if the pointer leaves before the delay elapses', () => {
      vi.useFakeTimers()
      const { trigger, content } = mountTooltip({ delayMs: 300 })

      hover()
      vi.advanceTimersByTime(200)
      unhover()

      vi.advanceTimersByTime(1000)
      expect(isOpen(content)).toBe(false)
    })

    it('should open immediately on focus', () => {
      vi.useFakeTimers()
      const { trigger, content } = mountTooltip({ delayMs: 300 })

      // No delay for the keyboard: the user has already committed to the
      // element, and the wait is the usual complaint about tooltips.
      trigger.focus()

      expect(isOpen(content)).toBe(true)
    })

    it('should keep the tooltip open while the pointer is on the content', () => {
      const { root, trigger, content } = mountTooltip()

      hover()
      expect(isOpen(content)).toBe(true)

      // The pointer moved off the trigger and onto the tooltip. Leaving would
      // make the content unreachable, which is what "hoverable" forbids.
      pointer(trigger, 'pointerleave')
      pointer(content, 'pointerenter')
      expect(isOpen(content)).toBe(true)

      // Leaving the whole area is what closes it.
      unhover()
      expect(isOpen(content)).toBe(false)
    })

    it('should close on blur', () => {
      const { trigger, content } = mountTooltip()

      trigger.focus()
      expect(isOpen(content)).toBe(true)

      trigger.blur()
      expect(isOpen(content)).toBe(false)
    })
  })

  describe('Escape', () => {
    it('should dismiss on Escape', () => {
      const { trigger, content } = mountTooltip()

      trigger.focus()
      expect(isOpen(content)).toBe(true)

      trigger.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      )

      expect(isOpen(content)).toBe(false)
    })

    it('should stay dismissed while the pointer is still on the trigger', () => {
      const { trigger, content } = mountTooltip({ delayMs: 0 })

      hover()
      expect(isOpen(content)).toBe(true)

      trigger.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      )
      expect(isOpen(content)).toBe(false)

      // Still hovering. Reopening here is exactly what WCAG forbids: the
      // dismissal has to stick until the user re-engages.
      unhover()
      hover()
      expect(isOpen(content)).toBe(true)
    })

    it('should not reopen while focus is held after Escape', () => {
      const { trigger, content } = mountTooltip()

      trigger.focus()
      trigger.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      )
      expect(isOpen(content)).toBe(false)

      // Re-firing focus (as browsers do on some interactions) must not bring
      // it back.
      trigger.dispatchEvent(new FocusEvent('focus'))
      expect(isOpen(content)).toBe(false)
    })
  })

  describe('focus stays put', () => {
    it('should not move focus into the content', () => {
      const { trigger, content } = mountTooltip()

      trigger.focus()
      expect(isOpen(content)).toBe(true)

      // The whole point of a tooltip: the user keeps their place.
      expect(document.activeElement).toBe(trigger)
    })
  })

  describe('teardown', () => {
    it('should not open after unmount while a delay is pending', () => {
      vi.useFakeTimers()
      const { trigger, content } = mountTooltip({ delayMs: 300 })

      hover()
      for (const unmount of mounted.splice(0)) unmount?.()

      expect(() => vi.advanceTimersByTime(1000)).not.toThrow()
      expect(isOpen(content)).toBe(false)
    })
  })

  describe('ids', () => {
    it('should not share ids between two tooltips', () => {
      const a = document.createElement('div')
      const b = document.createElement('div')
      document.body.append(a, b)

      const { Root, Trigger, Content } = tooltip
      for (const host of [a, b]) {
        Root({
          defaultOpen: true,
          children: (getContext) => [
            Trigger({}, getContext),
            Content({ children: () => text({ content: 'tip' }) }, getContext)
          ]
        })(host)
      }

      const first = a.querySelector('[role="tooltip"]')?.id
      const second = b.querySelector('[role="tooltip"]')?.id
      expect(first).toBeTruthy()
      expect(second).toBeTruthy()
      expect(first).not.toBe(second)
      a.remove()
      b.remove()
    })
  })
})
