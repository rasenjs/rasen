import { describe, it, expect, beforeEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import {
  createToggle,
  toggle,
  toggleText
} from '@rasenjs/rota/components/toggle'

beforeEach(() => {
  setReactiveRuntime(createReactiveRuntime())
})

describe('@rasenjs/rota - Toggle', () => {
  it('should render a button that stays a button', () => {
    const container = document.createElement('div')
    createToggle()()(container)

    const el = container.querySelector('button')
    expect(el).toBeTruthy()
    expect(el?.getAttribute('type')).toBe('button')
    expect(el?.getAttribute('role')).toBeNull()
  })

  it('should report its state through aria-pressed and data-state', () => {
    const container = document.createElement('div')
    createToggle()({ defaultPressed: true })(container)

    const el = container.querySelector('button')
    expect(el?.getAttribute('aria-pressed')).toBe('true')
    expect(el?.getAttribute('data-state')).toBe('on')
  })

  it('should default to unpressed', () => {
    const container = document.createElement('div')
    createToggle()()(container)

    const el = container.querySelector('button')
    expect(el?.getAttribute('aria-pressed')).toBe('false')
    expect(el?.getAttribute('data-state')).toBe('off')
  })

  it('should toggle on click', () => {
    const container = document.createElement('div')
    toggle()(container)

    const el = container.querySelector('button') as HTMLButtonElement
    el.click()
    expect(el.getAttribute('aria-pressed')).toBe('true')
    expect(el.getAttribute('data-state')).toBe('on')

    el.click()
    expect(el.getAttribute('aria-pressed')).toBe('false')
  })

  it('should report every change through onPressedChange', () => {
    const container = document.createElement('div')
    const seen: boolean[] = []
    toggle({ onPressedChange: (next: boolean) => seen.push(next) })(container)

    const el = container.querySelector('button') as HTMLButtonElement
    el.click()
    el.click()

    expect(seen).toEqual([true, false])
  })

  it('should not change itself while controlled', () => {
    const container = document.createElement('div')
    const seen: boolean[] = []
    toggle({ pressed: false, onPressedChange: (n: boolean) => seen.push(n) })(
      container
    )

    const el = container.querySelector('button') as HTMLButtonElement
    el.click()

    expect(seen).toEqual([true])
    // The value is the owner's; the component only reports.
    expect(el.getAttribute('aria-pressed')).toBe('false')
  })

  it('should ignore clicks while disabled', () => {
    const container = document.createElement('div')
    const seen: boolean[] = []
    toggle({ disabled: true, onPressedChange: (n: boolean) => seen.push(n) })(
      container
    )

    const el = container.querySelector('button') as HTMLButtonElement
    el.click()

    expect(seen).toEqual([])
    expect(el.disabled).toBe(true)
    expect(el.getAttribute('data-disabled')).toBe('')
  })

  it('should render text content through the helper', () => {
    const container = document.createElement('div')
    toggleText('Bold')(container)

    expect(container.querySelector('button')?.textContent).toBe('Bold')
  })

  it('should remove the button on unmount', () => {
    const container = document.createElement('div')
    const unmount = toggle()(container)
    unmount?.()

    expect(container.querySelector('button')).toBeFalsy()
  })
})
