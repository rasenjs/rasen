import { describe, it, expect, beforeEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import { createTabs } from '@rasenjs/rota/components/tabs'

beforeEach(() => {
  setReactiveRuntime(createReactiveRuntime())
})

const threeTabs = {
  defaultValue: 'tab1',
  tabs: [
    { value: 'tab1', label: 'Tab 1', content: 'c1' },
    { value: 'tab2', label: 'Tab 2', content: 'c2' },
    { value: 'tab3', label: 'Tab 3', content: 'c3', disabled: true }
  ]
}

function mount(): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  createTabs()(threeTabs)(container)
  return container
}

const tabEls = (container: HTMLElement): HTMLElement[] =>
  [...container.querySelectorAll<HTMLElement>('[role="tab"]')]

function press(target: HTMLElement, key: string): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  )
}

describe('tabs keyboard navigation', () => {
  it('should expose only the active tab in the tab order', () => {
    const container = mount()
    const [first, second] = tabEls(container)

    expect(first?.getAttribute('tabindex')).toBe('0')
    expect(second?.getAttribute('tabindex')).toBe('-1')
  })

  it('should move focus forward and back with the arrows', () => {
    const container = mount()
    const [first, second] = tabEls(container)

    first!.focus()
    press(first!, 'ArrowRight')
    expect(document.activeElement).toBe(second)

    press(second!, 'ArrowLeft')
    expect(document.activeElement).toBe(first)
  })

  it('should skip the disabled tab and wrap around', () => {
    const container = mount()
    const [first, second] = tabEls(container)

    // tab3 is disabled, so forward from tab2 wraps to tab1.
    second!.focus()
    press(second!, 'ArrowRight')
    expect(document.activeElement).toBe(first)
  })

  it('should jump to the first and last enabled tabs with Home and End', () => {
    const container = mount()
    const [first, second] = tabEls(container)

    second!.focus()
    press(second!, 'Home')
    expect(document.activeElement).toBe(first)

    press(first!, 'End')
    // The last tab is disabled, so End stops on the last enabled one.
    expect(document.activeElement).toBe(second)
  })

  it('should move focus without activating (manual activation)', () => {
    const container = mount()
    const [first, second] = tabEls(container)

    first!.focus()
    press(first!, 'ArrowRight')

    // Focus moved, but the selection did not.
    expect(document.activeElement).toBe(second)
    expect(second?.getAttribute('aria-selected')).toBe('false')
    expect(first?.getAttribute('aria-selected')).toBe('true')
  })

  it('should not move focus when every tab is disabled', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    createTabs()({
      defaultValue: 'a',
      tabs: [{ value: 'a', label: 'A', content: 'a', disabled: true }]
    })(container)

    const [only] = tabEls(container)
    only!.focus()
    press(only!, 'ArrowRight')
    expect(document.activeElement).toBe(only)
  })
})
