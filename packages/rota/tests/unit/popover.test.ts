/**
 * Popover: the non-modal layer.
 *
 * The tests concentrate on what separates it from Dialog — no `aria-modal`,
 * no focus trap, the trigger counts as inside the layer — plus the anchoring
 * contract (a CSS placement, not a measurement) and the id wiring that lets
 * `aria-controls` point at the panel that is actually rendered.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { button, text } from '@rasenjs/web/elements'
import { popover } from '@rasenjs/rota'
import type { PopoverSide } from '@rasenjs/rota'

let container: HTMLElement
let outside: HTMLButtonElement
const mounted: Array<(() => void) | undefined> = []

beforeEach(() => {
  useReactiveRuntime()
  container = document.createElement('div')
  outside = document.createElement('button')
  outside.id = 'outside'
  document.body.append(container, outside)
})

afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount?.()
  container.remove()
  outside.remove()
})

const flush = (): Promise<void> => Promise.resolve()

interface Options {
  open?: boolean
  side?: PopoverSide
  align?: 'start' | 'center' | 'end'
  dismissOnEscape?: boolean
  onOpenChange?: (open: boolean) => void
  onEscapeKeyDown?: (event: KeyboardEvent) => void
  onPointerDownOutside?: (event: Event) => void
}

/** Mount a popover with a trigger and a panel holding one inner button. */
function mountPopover(options: Options = {}) {
  const { Root, Trigger, Content } = popover

  const getParts = () => ({
    root: container.querySelector<HTMLElement>('[data-state]')!,
    trigger: container.querySelector<HTMLElement>('button[aria-haspopup]')!,
    panel: container.querySelector<HTMLElement>('[role="dialog"]')!,
    inner: container.querySelector<HTMLElement>('.inner')!
  })

  const unmount = Root({
    defaultOpen: options.open ?? false,
    onOpenChange: options.onOpenChange,
    children: (getContext) => [
      Trigger(
        { id: 'trigger', children: () => text({ content: 'Open' }) },
        getContext
      ),
      Content(
        {
          id: 'panel',
          side: options.side,
          align: options.align,
          dismissOnEscape: options.dismissOnEscape,
          onEscapeKeyDown: options.onEscapeKeyDown,
          onPointerDownOutside: options.onPointerDownOutside,
          children: () =>
            button({ class: 'inner', children: [text({ content: 'inside' })] })
        },
        getContext
      )
    ]
  })(container)

  mounted.push(unmount)
  return getParts()
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

const press = (target: Node): Event => {
  const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

const isOpen = (panel: HTMLElement): boolean => !panel.hasAttribute('hidden')

describe('@rasenjs/rota - Popover', () => {
  describe('parts', () => {
    it('should render a non-modal layer', async () => {
      const { panel } = mountPopover({ open: true })
      await flush()

      expect(panel.getAttribute('role')).toBe('dialog')
      // Not modal: there is no `aria-modal`, which is what tells assistive
      // technology the rest of the page is still available.
      expect(panel.hasAttribute('aria-modal')).toBe(false)
    })

    it('should start closed and report it', async () => {
      const { root, trigger, panel } = mountPopover()
      await flush()

      expect(root.getAttribute('data-state')).toBe('closed')
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
      expect(isOpen(panel)).toBe(false)
    })

    it('should be the positioning context for the panel', async () => {
      const { root, panel } = mountPopover()
      await flush()

      // Documented contract: the panel is absolute, so the root has to be
      // positioned or it anchors to something further up the tree.
      expect(root.style.position).toBe('relative')
      expect(panel.style.position).toBe('absolute')
    })
  })

  describe('trigger', () => {
    it('should behave as a button that owns a dialog', async () => {
      const { trigger } = mountPopover()
      await flush()

      expect(trigger.tagName).toBe('BUTTON')
      expect(trigger.getAttribute('type')).toBe('button')
      expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')
    })

    it('should point aria-controls at the panel it renders', async () => {
      const { trigger, panel } = mountPopover()
      await flush()

      expect(panel.id).toBe('panel')
      expect(trigger.getAttribute('aria-controls')).toBe('panel')
    })

    it('should open and close the layer on click', async () => {
      const onChange = vi.fn()
      const { trigger, panel } = mountPopover({ onOpenChange: onChange })
      await flush()

      trigger.click()
      await flush()
      expect(isOpen(panel)).toBe(true)
      expect(trigger.getAttribute('aria-expanded')).toBe('true')

      trigger.click()
      await flush()
      expect(isOpen(panel)).toBe(false)
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
      expect(onChange).toHaveBeenCalledTimes(2)
    })
  })

  describe('anchoring', () => {
    it('should default to below the trigger, centred', async () => {
      const { panel } = mountPopover({ open: true })
      await flush()

      expect(panel.getAttribute('data-side')).toBe('bottom')
      expect(panel.getAttribute('data-align')).toBe('center')
      expect(panel.style.top).toBe('100%')
      expect(panel.style.left).toBe('50%')
      expect(panel.style.transform).toBe('translateX(-50%)')
    })

    it('should place the panel on each side', async () => {
      const sides: Array<[PopoverSide, string, string]> = [
        ['top', 'bottom', '100%'],
        ['bottom', 'top', '100%'],
        ['left', 'right', '100%'],
        ['right', 'left', '100%']
      ]

      for (const [side, property, value] of sides) {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const { Root, Trigger, Content } = popover
        Root({
          defaultOpen: true,
          children: (getContext) => [
            Trigger({}, getContext),
            Content({ side, children: () => text({ content: 'panel' }) }, getContext)
          ]
        })(host)
        await flush()

        const panel = host.querySelector<HTMLElement>('[role="dialog"]')!
        expect(panel.getAttribute('data-side')).toBe(side)
        expect(panel.style.getPropertyValue(property)).toBe(value)
        host.remove()
      }
    })

    it('should align along the side', async () => {
      const { panel } = mountPopover({ open: true, align: 'start' })
      await flush()

      expect(panel.getAttribute('data-align')).toBe('start')
      // The DOM normalizes a bare `0` to `0px` when it serializes the style.
      expect(panel.style.left).toBe('0px')
      // Centring is the only alignment that needs a transform, so the others
      // must not leave one behind.
      expect(panel.style.transform).toBe('')
    })
  })

  describe('dismissing', () => {
    it('should close on Escape', async () => {
      const { panel, inner } = mountPopover({ open: true })
      await flush()

      // Escape is dispatched from inside the layer. Moving focus outside first
      // would close it on the focus-outside path and this would no longer be
      // testing Escape at all.
      inner.focus()
      const event = escape(inner)

      expect(isOpen(panel)).toBe(false)
      expect(event.defaultPrevented).toBe(false)
    })

    it('should stay open on Escape when asked not to dismiss', async () => {
      const { panel } = mountPopover({ open: true, dismissOnEscape: false })
      await flush()

      escape(outside)
      expect(isOpen(panel)).toBe(true)
    })

    it('should let the consumer veto Escape', async () => {
      const onEscapeKeyDown = vi.fn((event: KeyboardEvent) =>
        event.preventDefault()
      )
      const { panel } = mountPopover({ open: true, onEscapeKeyDown })
      await flush()

      escape(outside)

      expect(onEscapeKeyDown).toHaveBeenCalledTimes(1)
      expect(isOpen(panel)).toBe(true)
    })

    it('should close on a press outside', async () => {
      const { panel } = mountPopover({ open: true })
      await flush()

      press(outside)
      expect(isOpen(panel)).toBe(false)
    })

    it('should not treat a press on the trigger as outside', async () => {
      const { panel, trigger } = mountPopover({ open: true })
      await flush()

      // The trigger belongs to the layer. If it did not, the layer would close
      // on pointerdown and the trigger's click would toggle it straight back
      // open - a popover that cannot be closed with its own trigger.
      press(trigger)
      expect(isOpen(panel)).toBe(true)

      trigger.click()
      expect(isOpen(panel)).toBe(false)
    })
  })

  describe('focus', () => {
    it('should move focus into the panel on open', async () => {
      const { inner } = mountPopover()
      await flush()

      container.querySelector<HTMLElement>('button[aria-haspopup]')!.click()
      await flush()

      expect(document.activeElement).toBe(inner)
    })

    it('should give focus back to the trigger on close', async () => {
      const { trigger } = mountPopover()
      await flush()

      // Focused explicitly: the layer restores focus to wherever it was when
      // the layer opened, and jsdom does not focus a button on click (a real
      // browser does, which the e2e spec covers). Without this the origin is
      // `body`, which jsdom refuses to focus, so the assertion would be
      // measuring jsdom rather than the component.
      trigger.focus()
      trigger.click()
      await flush()
      escape(document.body)
      await flush()

      expect(document.activeElement).toBe(trigger)
    })

    it('should not trap Tab', async () => {
      const { trigger, inner, panel } = mountPopover()
      await flush()

      trigger.click()
      await flush()
      inner.focus()

      // The panel is the only focusable thing in the layer, so a trap would
      // wrap focus back to it. A popover lets the user tab out.
      const event = new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true
      })
      inner.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(false)
      expect(document.activeElement).toBe(inner)
      expect(panel.hasAttribute('hidden')).toBe(false)
    })
  })

  describe('ids', () => {
    it('should use a generated, non-colliding id when none is given', async () => {
      const a = document.createElement('div')
      const b = document.createElement('div')
      document.body.append(a, b)

      const { Root, Trigger, Content } = popover
      for (const host of [a, b]) {
        Root({
          defaultOpen: true,
          children: (getContext) => [
            Trigger({}, getContext),
            Content({ children: () => text({ content: 'panel' }) }, getContext)
          ]
        })(host)
        await flush()
      }

      const first = a.querySelector('[role="dialog"]')?.id
      const second = b.querySelector('[role="dialog"]')?.id
      expect(first).toBeTruthy()
      expect(second).toBeTruthy()
      // A hardcoded id would make these equal and break aria-controls on a page
      // that renders two popovers.
      expect(first).not.toBe(second)
      a.remove()
      b.remove()
    })
  })

  describe('teardown', () => {
    it('should stop listening once unmounted', async () => {
      const { panel } = mountPopover({ open: true })
      await flush()

      for (const unmount of mounted.splice(0)) unmount?.()
      container.remove()

      // No throw, and nothing left to react: the document listeners are gone.
      expect(() => escape(document.body)).not.toThrow()
      expect(isOpen(panel)).toBe(true)
    })
  })
})
