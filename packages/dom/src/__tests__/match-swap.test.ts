/**
 * Repro: does switching a `match` branch unmount the previous branch?
 *
 * RouterView returns `match({ value, cases })`, so if match's swap is broken
 * every route change leaves the old view in the DOM. This test drives match
 * directly — no router, no hydration — to isolate the swap from everything else.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { com, match, when } from '@rasenjs/core'
import { mount, div } from '../index'
import { useReactiveRuntime, ref } from '@rasenjs/reactive-signals'

useReactiveRuntime()

/** The signals runtime delivers watcher callbacks in a batched microtask, so
 *  assertions must run after a flush — a synchronous check is a test artifact. */
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('match branch swap', () => {
  let container: HTMLElement

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>'
    container = document.getElementById('app')!
  })

  it('replaces the previous branch instead of appending', async () => {
    const current = ref<'a' | 'b'>('a')

    const ViewA = com(() => div({ class: 'view-a' }, 'A'))
    const ViewB = com(() => div({ class: 'view-b' }, 'B'))

    const Root = com(() =>
      match({
        value: () => current.value,
        cases: {
          a: () => ViewA(),
          b: () => ViewB(),
        },
      })
    )

    mount(Root(), container)
    expect(container.querySelectorAll('.view-a').length).toBe(1)
    expect(container.querySelectorAll('.view-b').length).toBe(0)

    current.value = 'b'
    await flush()

    expect(container.querySelectorAll('.view-a').length).toBe(0)
    expect(container.querySelectorAll('.view-b').length).toBe(1)
  })

  it('nested inside an element, still replaces the previous branch', async () => {
    const current = ref<'a' | 'b'>('a')

    const ViewA = com(() => div({ class: 'view-a' }, 'A'))
    const ViewB = com(() => div({ class: 'view-b' }, 'B'))

    const RouterView = com(() =>
      match({
        value: () => current.value,
        cases: {
          a: () => ViewA(),
          b: () => ViewB(),
        },
      })
    )

    // Same shape as the SSR template: <div class="app"> … <RouterView/> <footer/>
    const Root = com(() =>
      div(
        { class: 'app' },
        div({ class: 'header' }, 'header'),
        RouterView(),
        div({ class: 'footer' }, 'footer')
      )
    )

    mount(Root(), container)
    const outlet = container.querySelector('.app')!
    expect(outlet.querySelectorAll('.view-a').length).toBe(1)

    current.value = 'b'
    await flush()

    expect(outlet.querySelectorAll('.view-a').length).toBe(0)
    expect(outlet.querySelectorAll('.view-b').length).toBe(1)
    // the footer must still be present and after the view
    expect(outlet.querySelector('.footer')).toBeTruthy()
  })

  it('when() branch swap for comparison', async () => {
    const flag = ref(true)
    const Root = com(() =>
      when({
        condition: () => flag.value,
        then: () => div({ class: 'yes' }, 'yes'),
        else: () => div({ class: 'no' }, 'no'),
      })
    )
    mount(Root(), container)
    expect(container.querySelectorAll('.yes').length).toBe(1)
    flag.value = false
    await flush()
    expect(container.querySelectorAll('.yes').length).toBe(0)
    expect(container.querySelectorAll('.no').length).toBe(1)
  })
})
