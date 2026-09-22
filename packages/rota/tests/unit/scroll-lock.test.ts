/**
 * Scroll lock for modal layers.
 *
 * A modal that leaves the page scrollable underneath can be scrolled *behind*,
 * which slides the layer's content out from under the pointer. What these
 * pin down is the accounting: layers nest, so the page must unlock only when
 * the last one closes, and a consumer that had set its own `overflow` must get
 * it back rather than having it cleared.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { getReactiveRuntime, type Ref } from '@rasenjs/core'
import { div } from '@rasenjs/web/elements'
import { dialog } from '@rasenjs/rota'
import { lockScroll, unlockScroll } from '../../src/internal/scroll-lock'

let container: HTMLElement
const mounted: Array<(() => void) | undefined> = []

beforeEach(() => {
  useReactiveRuntime()
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount?.()
  container.remove()
  // Never leave the shared body styled for the next test.
  document.body.style.overflow = ''
  while (document.body.style.overflow === 'hidden') unlockScroll()
})

const bodyOverflow = (): string => document.body.style.overflow

/** Mount a dialog whose open state the caller controls through a ref. */
function mountDialog(open: Ref<boolean>) {
  const { Root, Content } = dialog
  const unmount = Root({
    open,
    // A single mountable: DialogRootProps.children is not an array slot, and
    // returning one here would be wrapped again and render nothing.
    children: (getContext) => div({ children: [Content({}, getContext)] })
  })(container)
  mounted.push(unmount)
}

const flush = (): Promise<void> => Promise.resolve()

describe('@rasenjs/rota - scroll lock', () => {
  it('should lock the page while a dialog is open and release it on close', async () => {
    // A real ref: the layer follows the open state through a subscription, and
    // a plain variable flip would never reach it - which is the sort of test
    // that passes while proving nothing.
    const rt = getReactiveRuntime()
    const open = rt.ref(false)
    mountDialog(open as Ref<boolean>)
    await flush()

    expect(bodyOverflow()).not.toBe('hidden')

    rt.setValue(open, true)
    await flush()
    expect(bodyOverflow()).toBe('hidden')

    rt.setValue(open, false)
    await flush()
    expect(bodyOverflow()).not.toBe('hidden')
  })

  it('should be a no-op on the server', () => {
    // `typeof document === 'undefined'` is the guard; this asserts the pairing
    // itself is safe to call without one.
    expect(() => {
      lockScroll()
      unlockScroll()
    }).not.toThrow()
  })

  it('should keep the page locked until the last modal closes', async () => {
    lockScroll()
    lockScroll()

    unlockScroll()
    // Still one holder: the page must not unlock underneath it.
    expect(bodyOverflow()).toBe('hidden')

    unlockScroll()
    expect(bodyOverflow()).not.toBe('hidden')
  })

  it('should restore an overflow the consumer had set', () => {
    document.body.style.overflow = 'scroll'

    lockScroll()
    expect(bodyOverflow()).toBe('hidden')

    unlockScroll()
    // Restored, not cleared: the consumer's own value is not ours to discard.
    expect(bodyOverflow()).toBe('scroll')
  })

  it('should ignore an unlock it did not take', () => {
    unlockScroll()
    unlockScroll()

    // Would otherwise drive the counter negative and leave a later lock unable
    // to restore anything.
    lockScroll()
    expect(bodyOverflow()).toBe('hidden')
    unlockScroll()
  })
})
