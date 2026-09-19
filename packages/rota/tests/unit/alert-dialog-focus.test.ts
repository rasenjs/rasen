/**
 * Modal behaviour: focus, and the gestures that ask to close.
 *
 * These mount a real dialog onto the document, because that is the only shape
 * in which focus and document-level key handling mean anything. Before this
 * file the whole focus path — initial focus, the trap, and putting focus back
 * where it came from — had no coverage at all, and `onCloseAutoFocus` was never
 * called by anything.
 *
 * The awaits are not incidental: the initial focus is deferred by a microtask
 * (see the component) because an element factory writes its `ref` before the
 * element is inserted, and focusing a detached element does nothing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { div, text } from '@rasenjs/web/elements'
import { alertDialog } from '@rasenjs/rota'

let container: HTMLElement
let before: HTMLButtonElement
const mounted: Array<(() => void) | undefined> = []

beforeEach(() => {
  useReactiveRuntime()
  container = document.createElement('div')
  before = document.createElement('button')
  before.id = 'before'
  document.body.append(before, container)
})

afterEach(() => {
  // Unmount first: a dialog still on screen keeps a keyboard trap and
  // document-level listeners alive, and those leak into the next test.
  for (const unmount of mounted.splice(0)) unmount?.()
  container.remove()
  before.remove()
})

/** Let the deferred initial focus run. */
const flush = (): Promise<void> => Promise.resolve()

interface Options {
  onEscapeKeyDown?: (event: KeyboardEvent) => void
  onOpenAutoFocus?: (event: Event) => void
  onCloseAutoFocus?: (event: Event) => void
  onPointerDownOutside?: (event: Event) => void
}

/** Mount the dialog the way the site's demo composes it, attached to the DOM. */
function mountDialog(options: Options = {}) {
  const { Root, Overlay, Content, Title, Description, Action, Cancel } =
    alertDialog

  const unmount = Root({
    defaultOpen: true,
    children: (getContext) =>
      div({
        children: [
          Overlay({}, getContext),
          Content(
            {
              onEscapeKeyDown: options.onEscapeKeyDown,
              onOpenAutoFocus: options.onOpenAutoFocus,
              onCloseAutoFocus: options.onCloseAutoFocus,
              onPointerDownOutside: options.onPointerDownOutside,
              children: (getCtx) =>
                div({
                  children: [
                    Title({ children: () => text({ content: 'Sure?' }) }, getCtx),
                    Description(
                      { children: () => text({ content: 'Cannot be undone.' }) },
                      getCtx
                    ),
                    Cancel(
                      { children: () => text({ content: 'Cancel' }) },
                      getCtx
                    ),
                    Action(
                      { children: () => text({ content: 'Delete' }) },
                      getCtx
                    )
                  ]
                })
            },
            getContext
          )
        ]
      })
  })(container)

  const panel = container.querySelector<HTMLElement>('[role="alertdialog"]')!
  const action = container.querySelector<HTMLElement>('[data-action]')!
  const cancel = container.querySelector<HTMLElement>('[data-cancel]')!
  mounted.push(unmount)
  return { unmount, panel, action, cancel }
}

const tab = (target: HTMLElement, shiftKey = false): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey,
    bubbles: true,
    cancelable: true
  })
  target.dispatchEvent(event)
  return event
}

const press = (target: Node): void => {
  target.dispatchEvent(
    new MouseEvent('mousedown', { bubbles: true, cancelable: true })
  )
}

const keyEscape = (target: Node): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true
  })
  target.dispatchEvent(event)
  return event
}

describe('@rasenjs/rota - AlertDialog modal behaviour', () => {
  describe('initial focus', () => {
    it('should focus the decision button when it opens', async () => {
      const { action } = mountDialog()
      await flush()
      expect(document.activeElement).toBe(action)
    })

    it('should settle for the cancel button when there is no action', async () => {
      const { Root, Content, Title, Cancel } = alertDialog
      mounted.push(
        Root({
        defaultOpen: true,
        children: (getContext) =>
          Content(
            {
              children: (getCtx) =>
                div({
                  children: [
                    Title({ children: () => text({ content: 'Sure?' }) }, getCtx),
                    Cancel(
                      { children: () => text({ content: 'Cancel' }) },
                      getCtx
                    )
                  ]
                })
            },
            getContext
          )
        })(container)
      )
      await flush()

      expect(document.activeElement).toBe(
        container.querySelector('[data-cancel]')
      )
    })

    it('should focus the panel when it holds nothing focusable', async () => {
      const { Root, Content, Title } = alertDialog
      mounted.push(
        Root({
        defaultOpen: true,
        children: (getContext) =>
          Content(
            {
              children: (getCtx) =>
                Title({ children: () => text({ content: 'Sure?' }) }, getCtx)
            },
            getContext
          )
        })(container)
      )
      await flush()

      expect(document.activeElement).toBe(
        container.querySelector('[role="alertdialog"]')
      )
    })

    it('should report the auto focus, and honour preventDefault', async () => {
      const onOpenAutoFocus = vi.fn((event: Event) => event.preventDefault())
      mountDialog({ onOpenAutoFocus })
      await flush()

      expect(onOpenAutoFocus).toHaveBeenCalledTimes(1)
      // The consumer took over, so focus did not move into the dialog.
      expect(document.activeElement).not.toBe(
        container.querySelector('[data-action]')
      )
    })
  })

  describe('the focus trap', () => {
    it('should wrap forward from the last control', async () => {
      const { action, cancel } = mountDialog()
      await flush()

      action.focus()
      const event = tab(action)

      expect(event.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(cancel)
    })

    it('should wrap backward from the first control', async () => {
      const { action, cancel } = mountDialog()
      await flush()

      cancel.focus()
      const event = tab(cancel, true)

      expect(event.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(action)
    })

    it('should pull focus back in when it is on the page behind', async () => {
      const { cancel } = mountDialog()
      await flush()

      before.focus()
      const event = tab(before)

      expect(event.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(cancel)
    })
  })

  describe('closing', () => {
    it('should put focus back where it was', async () => {
      before.focus()
      const { action, cancel } = mountDialog()
      await flush()
      expect(document.activeElement).toBe(action)

      cancel.click()

      expect(document.activeElement).toBe(before)
    })

    it('should report the auto focus on close', async () => {
      const onCloseAutoFocus = vi.fn()
      before.focus()
      const { cancel } = mountDialog({ onCloseAutoFocus })
      await flush()

      cancel.click()

      expect(onCloseAutoFocus).toHaveBeenCalledTimes(1)
      expect(document.activeElement).toBe(before)
    })

    it('should let the consumer place focus itself', async () => {
      const onCloseAutoFocus = vi.fn((event: Event) => event.preventDefault())
      const { cancel } = mountDialog({ onCloseAutoFocus })
      await flush()

      cancel.click()

      // preventDefault means "I will decide": the scope must not override it.
      expect(document.activeElement).not.toBe(before)
    })

    it('should stop trapping once closed', async () => {
      const { cancel } = mountDialog()
      await flush()

      cancel.click()

      before.focus()
      const event = tab(before)

      expect(event.defaultPrevented).toBe(false)
      expect(document.activeElement).toBe(before)
    })

    it('should stop trapping when it is unmounted while open', async () => {
      // The open state never changes here, so nothing would tear the trap down
      // unless unmounting does it — and a leaked trap outlives the element.
      const { unmount } = mountDialog()
      await flush()

      unmount?.()

      before.focus()
      const event = tab(before)

      expect(event.defaultPrevented).toBe(false)
      expect(document.activeElement).toBe(before)
    })

    it('should stop listening for Escape when it is unmounted', async () => {
      const onEscapeKeyDown = vi.fn()
      const { unmount } = mountDialog({ onEscapeKeyDown })
      await flush()

      unmount?.()
      keyEscape(before)

      expect(onEscapeKeyDown).not.toHaveBeenCalled()
    })
  })

  describe('dismiss gestures', () => {
    it('should swallow Escape and stay open', async () => {
      mountDialog()
      await flush()

      before.focus()
      const event = keyEscape(before)

      expect(event.defaultPrevented).toBe(true)
      // Still open: an AlertDialog is not dismissible by Escape.
      expect(
        container.querySelector('[role="alertdialog"]')!.getAttribute('hidden')
      ).toBeNull()
    })

    it('should report Escape to the consumer', async () => {
      const onEscapeKeyDown = vi.fn()
      mountDialog({ onEscapeKeyDown })
      await flush()

      keyEscape(before)

      expect(onEscapeKeyDown).toHaveBeenCalledTimes(1)
    })

    it('should report a press outside without closing', async () => {
      const onPointerDownOutside = vi.fn()
      mountDialog({ onPointerDownOutside })
      await flush()

      press(before)

      expect(onPointerDownOutside).toHaveBeenCalledTimes(1)
      expect(
        container.querySelector('[role="alertdialog"]')!.hasAttribute('hidden')
      ).toBe(false)
    })

    it('should ignore a press on the panel itself', async () => {
      const onPointerDownOutside = vi.fn()
      const { panel } = mountDialog({ onPointerDownOutside })
      await flush()

      press(panel)

      expect(onPointerDownOutside).not.toHaveBeenCalled()
    })
  })
})
