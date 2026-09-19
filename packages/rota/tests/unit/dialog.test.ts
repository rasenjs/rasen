/**
 * Dialog: the modal that can be dismissed.
 *
 * The tests concentrate on what separates it from AlertDialog — Escape and an
 * outside press close it, and both can be vetoed — plus the parts it adds
 * (Trigger, Close) and the focus behaviour they all share.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { div, text } from '@rasenjs/web/elements'
import { dialog } from '@rasenjs/rota'

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
  onEscapeKeyDown?: (event: KeyboardEvent) => void
  onPointerDownOutside?: (event: Event) => void
  onOpenAutoFocus?: (event: Event) => void
  onCloseAutoFocus?: (event: Event) => void
  dismissOnEscape?: boolean
  dismissOnPointerDownOutside?: boolean
}

/**
 * Mount a dialog with trigger, overlay, panel, title and a close button.
 */
function mountDialog(options: Options = {}) {
  const { Root, Trigger, Overlay, Content, Title, Description, Close } = dialog

  const unmount = Root({
    defaultOpen: options.open ?? true,
    children: (getContext) =>
      div({
        children: [
          Trigger(
            { children: () => text({ content: 'Open' }) },
            getContext
          ),
          Overlay({}, getContext),
          Content(
            {
              dismissOnEscape: options.dismissOnEscape,
              dismissOnPointerDownOutside: options.dismissOnPointerDownOutside,
              onEscapeKeyDown: options.onEscapeKeyDown,
              onPointerDownOutside: options.onPointerDownOutside,
              onOpenAutoFocus: options.onOpenAutoFocus,
              onCloseAutoFocus: options.onCloseAutoFocus,
              children: (getCtx) =>
                div({
                  children: [
                    Title({ children: () => text({ content: 'Settings' }) }, getCtx),
                    Description(
                      { children: () => text({ content: 'Change things.' }) },
                      getCtx
                    ),
                    Close({ children: () => text({ content: 'x' }) }, getCtx)
                  ]
                })
            },
            getContext
          )
        ]
      })
  })(container)

  mounted.push(unmount)
  return {
    unmount,
    panel: container.querySelector<HTMLElement>('[role="dialog"]')!,
    trigger: container.querySelector<HTMLElement>('[aria-haspopup="dialog"]')!,
    overlay: container.querySelector<HTMLElement>('[data-overlay]')!,
    close: container.querySelector<HTMLElement>('[data-close]')!
  }
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

describe('@rasenjs/rota - Dialog', () => {
  describe('parts', () => {
    it('should render a modal dialog with a title and description', async () => {
      const { panel } = mountDialog()
      await flush()

      expect(panel.getAttribute('role')).toBe('dialog')
      expect(panel.getAttribute('aria-modal')).toBe('true')
      const title = panel.querySelector('h2')!
      const description = panel.querySelector('p')!
      expect(panel.getAttribute('aria-labelledby')).toBe(title.id)
      expect(panel.getAttribute('aria-describedby')).toBe(description.id)
    })

    it('should render the trigger as the dialog opener', async () => {
      const { trigger, panel } = mountDialog({ open: false })
      await flush()
      expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
      expect(isOpen(panel)).toBe(false)

      trigger.click()

      expect(isOpen(panel)).toBe(true)
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
    })

    it('should render an overlay that is hidden while closed', async () => {
      const { overlay } = mountDialog({ open: false })
      await flush()
      expect(overlay).toBeTruthy()
      expect(overlay.hasAttribute('hidden')).toBe(true)
    })

    it('should close from the close button', async () => {
      const { close, panel } = mountDialog()
      await flush()

      close.click()

      expect(isOpen(panel)).toBe(false)
    })

    it('should report open state through data-state', async () => {
      const { panel, close } = mountDialog()
      await flush()
      expect(panel.getAttribute('data-state')).toBe('open')

      close.click()
      expect(panel.getAttribute('data-state')).toBe('closed')
    })
  })

  describe('dismissing', () => {
    it('should close on Escape', async () => {
      const { panel } = mountDialog()
      await flush()

      outside.focus()
      const event = escape(outside)

      expect(isOpen(panel)).toBe(false)
      expect(event.defaultPrevented).toBe(false)
    })

    it('should close on a press outside', async () => {
      const { panel } = mountDialog()
      await flush()

      press(outside)

      expect(isOpen(panel)).toBe(false)
    })

    it('should not close on a press inside the panel', async () => {
      const { panel } = mountDialog()
      await flush()

      press(panel)

      expect(isOpen(panel)).toBe(true)
    })

    it('should let the consumer veto Escape with preventDefault', async () => {
      const onEscapeKeyDown = vi.fn((event: KeyboardEvent) =>
        event.preventDefault()
      )
      const { panel } = mountDialog({ onEscapeKeyDown })
      await flush()

      escape(outside)

      expect(onEscapeKeyDown).toHaveBeenCalledTimes(1)
      expect(isOpen(panel)).toBe(true)
    })

    it('should let the consumer veto an outside press', async () => {
      const onPointerDownOutside = vi.fn((event: Event) =>
        event.preventDefault()
      )
      const { panel } = mountDialog({ onPointerDownOutside })
      await flush()

      press(outside)

      expect(onPointerDownOutside).toHaveBeenCalledTimes(1)
      expect(isOpen(panel)).toBe(true)
    })

    it('should report an outside press without closing when asked not to', async () => {
      const onPointerDownOutside = vi.fn()
      const { panel } = mountDialog({
        onPointerDownOutside,
        dismissOnPointerDownOutside: false
      })
      await flush()

      press(outside)

      expect(onPointerDownOutside).toHaveBeenCalledTimes(1)
      expect(isOpen(panel)).toBe(true)
    })

    it('should stay open on Escape when asked not to dismiss', async () => {
      const { panel } = mountDialog({ dismissOnEscape: false })
      await flush()

      escape(outside)

      expect(isOpen(panel)).toBe(true)
    })

    it('should stop dismissing once closed', async () => {
      const onEscapeKeyDown = vi.fn()
      const { close, panel } = mountDialog({ onEscapeKeyDown })
      await flush()

      close.click()
      escape(outside)

      expect(isOpen(panel)).toBe(false)
      expect(onEscapeKeyDown).not.toHaveBeenCalled()
    })
  })

  describe('focus', () => {
    it('should move focus into the panel', async () => {
      const { close } = mountDialog()
      await flush()
      expect(document.activeElement).toBe(close)
    })

    it('should trap Tab inside the panel', async () => {
      const { close } = mountDialog()
      await flush()

      close.focus()
      const event = new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true
      })
      close.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(close)
    })

    it('should give focus back on close', async () => {
      outside.focus()
      const { close } = mountDialog()
      await flush()

      close.click()

      expect(document.activeElement).toBe(outside)
    })

    it('should report the auto focus, and let the consumer take over', async () => {
      const onOpenAutoFocus = vi.fn((event: Event) => event.preventDefault())
      const { close } = mountDialog({ onOpenAutoFocus })
      await flush()

      expect(onOpenAutoFocus).toHaveBeenCalledTimes(1)
      expect(document.activeElement).not.toBe(close)
    })

    it('should report the close auto focus', async () => {
      const onCloseAutoFocus = vi.fn()
      outside.focus()
      const { close } = mountDialog({ onCloseAutoFocus })
      await flush()

      close.click()

      expect(onCloseAutoFocus).toHaveBeenCalledTimes(1)
      expect(document.activeElement).toBe(outside)
    })

    it('should stop trapping when unmounted while open', async () => {
      const { unmount } = mountDialog()
      await flush()

      unmount?.()
      outside.focus()
      const event = new KeyboardEvent('keydown', {
        key: 'Tab',
        bubbles: true,
        cancelable: true
      })
      outside.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(false)
    })
  })
})
