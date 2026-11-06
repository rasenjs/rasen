/**
 * Fragment — regression tests for the DOM host's `<>…</>`.
 *
 * Compiled fragments hand Fragment the same child list as an intrinsic tag:
 * strings / numbers / Refs are kept as-is. Treating them as mountables threw
 * `TypeError: c is not a function` and killed the whole subtree, which is what
 * a plain `<>{cond ? 'a' : 'b'}</>` compiles to. The tests call the factories
 * directly — the exact shape the JSX elimination pass emits.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Fragment } from './components/fragment'
import { span } from './components'
import { ref } from '@vue/reactivity'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { mount } from './index'

let container: HTMLElement

beforeEach(() => {
  useReactiveRuntime()
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => { container.remove() })

describe('Fragment', () => {
  it('renders a single static string child', () => {
    mount(Fragment({ children: 'hello' }), container)
    expect(container.textContent).toBe('hello')
  })

  it('renders numbers and mixes text with elements', () => {
    mount(
      Fragment({
        children: [span({ children: 'a' }), 42, span({ children: 'b' })],
      }),
      container,
    )
    expect(container.textContent).toBe('a42b')
    expect(container.querySelectorAll('span')).toHaveLength(2)
  })

  it('keeps a Ref child reactive', () => {
    const label = ref('first')
    mount(Fragment({ children: label }), container)
    expect(container.textContent).toBe('first')
    label.value = 'second'
    expect(container.textContent).toBe('second')
  })

  it('flattens nested arrays', () => {
    mount(
      Fragment({
        children: ['a', ['b', ['c']], span({ children: 'd' })],
      }),
      container,
    )
    expect(container.textContent).toBe('abcd')
  })

  it('skips null/boolean children and unmounts cleanly', () => {
    const unmount = mount(
      Fragment({ children: [null, false, 'x', undefined] }),
      container,
    )
    expect(container.textContent).toBe('x')
    unmount()
    expect(container.textContent).toBe('')
  })
})
