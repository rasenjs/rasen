import { describe, it, expect, beforeEach } from 'vitest'
import { setReactiveRuntime, getReactiveRuntime, type Ref } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import {
  createSwitch,
  createSwitchRoot,
  createSwitchThumb,
  switchControl
} from '@rasenjs/rota/components/switch'

beforeEach(() => {
  setReactiveRuntime(createReactiveRuntime())
})

/**
 * Props are `PropValue`s: the JSX transform hands over a getter for a dynamic
 * expression (`checked={count > 2}` → `() => count > 2`), and a signal adapter
 * may hand over a ref. Reading the prop directly would compare the function.
 */
describe('@rasenjs/rota - Switch / reactive props', () => {
  it('should follow a getter-valued `checked`', () => {
    const rt = getReactiveRuntime()
    const flag = rt.ref(false)
    const container = document.createElement('div')

    switchControl({ checked: () => rt.unref(flag) })(container)
    const el = container.querySelector('[role="switch"]')!
    expect(el.getAttribute('aria-checked')).toBe('false')

    rt.setValue(flag, true)
    expect(el.getAttribute('aria-checked')).toBe('true')
    expect(el.getAttribute('data-state')).toBe('checked')
  })

  it('should follow a ref-valued `checked`', () => {
    const rt = getReactiveRuntime()
    const flag = rt.ref(false) as unknown as Ref<boolean>
    const container = document.createElement('div')

    switchControl({ checked: flag })(container)
    const el = container.querySelector('[role="switch"]')!

    rt.setValue(flag as never, true as never)
    expect(el.getAttribute('aria-checked')).toBe('true')
  })

  it('should follow a getter-valued `disabled`', () => {
    const rt = getReactiveRuntime()
    const off = rt.ref(false)
    const container = document.createElement('div')
    const seen: boolean[] = []

    switchControl({
      disabled: () => rt.unref(off),
      onCheckedChange: (next) => seen.push(next)
    })(container)

    const el = container.querySelector('[role="switch"]') as HTMLButtonElement
    expect(el.getAttribute('aria-disabled')).toBe('false')

    rt.setValue(off, true)
    expect(el.getAttribute('aria-disabled')).toBe('true')
    expect(el.getAttribute('data-disabled')).toBe('')

    el.click()
    expect(seen).toEqual([])
  })

  it('should let the thumb follow a getter-valued checked through the context', () => {
    const rt = getReactiveRuntime()
    const flag = rt.ref(false)
    const container = document.createElement('div')
    const Root = createSwitchRoot()
    const Thumb = createSwitchThumb()

    Root({
      checked: () => rt.unref(flag),
      children: (getContext) => Thumb({}, getContext)
    })(container)

    const thumb = container.querySelector('span')!
    expect(thumb.getAttribute('data-state')).toBe('unchecked')

    rt.setValue(flag, true)
    expect(thumb.getAttribute('data-state')).toBe('checked')
  })

  it('should accept an `id` so a Label can point at it', () => {
    const container = document.createElement('div')
    createSwitch()({ id: 'notifications' })(container)

    expect(container.querySelector('[role="switch"]')?.id).toBe('notifications')
  })

  it('should still ignore a controlled prop while uncontrolled', () => {
    const container = document.createElement('div')
    switchControl({ checked: () => true, defaultChecked: false })(container)

    const el = container.querySelector('[role="switch"]') as HTMLButtonElement
    // Controlled: the getter wins over the default.
    expect(el.getAttribute('aria-checked')).toBe('true')
    el.click()
    expect(el.getAttribute('aria-checked')).toBe('true')
  })
})
