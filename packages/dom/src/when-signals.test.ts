/**
 * `when` driven by a TC39-Signals ref — the shape the arpg example uses for
 * its panels (a `ref(false)` for "open" and a `when` on it).
 *
 * The Vue adapter has its own coverage in `index.test.ts`; this one pins the
 * signals adapter, whose runtime is a different implementation of the same
 * contract.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { span } from './components'
import { when } from '@rasenjs/core'
import { ref, useReactiveRuntime } from '@rasenjs/reactive-signals'
import { mount } from './index'

let container: HTMLElement

beforeEach(() => {
  useReactiveRuntime()
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  container.remove()
})

describe('when() with a signals ref', () => {
  it('switches branches when the signal changes', async () => {
    const condition = ref(true)
    const unmount = mount(
      when({
        condition: () => condition.value,
        then: () => span({ children: 'Then' }),
        else: () => span({ children: 'Else' }),
      }),
      container,
    )
    expect(container.textContent).toContain('Then')
    condition.value = false
    await Promise.resolve()
    await Promise.resolve()
    expect(container.textContent).toContain('Else')
    unmount?.()
  })
})
