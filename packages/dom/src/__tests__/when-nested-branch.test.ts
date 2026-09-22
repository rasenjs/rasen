/**
 * A `when` nested inside another `when` must be able to switch its own branch.
 *
 * Reproduced from the viewer: switching the renderer from Canvas 2D to WebGL left
 * the stage with NO canvas at all — the inner `when` never inserted its branch —
 * and refreshing "fixed" it because a fresh mount never takes this path. Only that
 * one transition failed; WebGL -> WebGPU and WebGPU -> Canvas 2D changed the OUTER
 * `when`, which is why it read as "sometimes needs a refresh".
 *
 * What happens: `when` mounts a branch into a host-provided staging area (the DOM
 * adapter's DocumentFragment) and then flushes it in front of its own marker. The
 * inner `when` is mounted INTO the outer one's fragment, so it captures that
 * fragment as its host. When the outer branch is flushed, the marker (and the rest
 * of the content) is moved into the real DOM and the captured fragment is left
 * detached and empty. The inner `when`'s next switch then asked the stage to
 * insert its branch in front of a marker that is no longer a child of that
 * fragment, which throws NotFoundError mid-update — so the branch is never
 * inserted and the previous one is already gone.
 *
 * The assertions are behavioural (the branch's content is present afterwards), not
 * merely "did not throw": swallowing the exception would still leave an empty
 * stage, which is the actual defect.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ref } from '@vue/reactivity'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { mount, when, each, element } from '../index'

describe('when nested in a batched branch', () => {
  let container: HTMLElement
  let unmount: (() => void) | undefined

  beforeEach(() => {
    useReactiveRuntime()
    document.body.innerHTML = ''
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    unmount?.()
    unmount = undefined
    document.body.innerHTML = ''
  })

  it('switches the INNER branch after the outer branch has been flushed', () => {
    const outer = ref(true)
    const inner = ref(true)

    unmount = mount(
      when({
        condition: () => outer.value,
        then: () =>
          when({
            condition: () => inner.value,
            then: () => element({ tag: 'div', children: 'A' }),
            else: () => element({ tag: 'div', children: 'B' })
          }),
        else: () => element({ tag: 'div', children: 'E' })
      }),
      container
    )

    expect(container.textContent).toBe('A')

    // The failing transition: only the inner condition changes, so the inner
    // `when` re-inserts relative to a marker its outer batch has already moved.
    inner.value = false

    expect(container.textContent).toBe('B')
  })

  it('returns to the outer else branch and back', () => {
    const outer = ref(true)
    const inner = ref(true)

    unmount = mount(
      when({
        condition: () => outer.value,
        then: () =>
          when({
            condition: () => inner.value,
            then: () => element({ tag: 'div', children: 'A' }),
            else: () => element({ tag: 'div', children: 'B' })
          }),
        else: () => element({ tag: 'div', children: 'E' })
      }),
      container
    )

    outer.value = false
    expect(container.textContent).toBe('E')

    outer.value = true
    expect(container.textContent).toBe('A')

    // After the outer branch has been rebuilt, the inner one must still work.
    inner.value = false
    expect(container.textContent).toBe('B')
  })

  it('does not accumulate nodes across repeated inner switches', () => {
    const outer = ref(true)
    const inner = ref(true)

    unmount = mount(
      when({
        condition: () => outer.value,
        then: () =>
          when({
            condition: () => inner.value,
            then: () => element({ tag: 'div', children: 'A' }),
            else: () => element({ tag: 'div', children: 'B' })
          }),
        else: () => element({ tag: 'div', children: 'E' })
      }),
      container
    )

    const before = container.childNodes.length
    for (let i = 0; i < 5; i++) {
      inner.value = !inner.value
    }
    // Content plus the when's own markers; it must not grow with each switch.
    expect(container.childNodes.length).toBe(before)
    // Five flips from true land on the else branch.
    expect(container.textContent).toBe('B')
  })

  // The same stale-host situation, reached through `each` instead of `when`: a
  // list mounted inside a batched branch captures the staging fragment as its
  // host, and every later diff inserts relative to markers that have since moved
  // into the real DOM. Sharing `guardedInsertBefore` means one fix covers both,
  // so this pins the general invariant rather than just the reported screen.
  it('lets an each inside a batched branch update its list', () => {
    const show = ref(true)
    const items = ref<{ id: number }[]>([{ id: 1 }, { id: 2 }])

    unmount = mount(
      when({
        condition: () => show.value,
        then: () =>
          each(
            () => items.value,
            (item: { id: number }) => element({ tag: 'div', children: String(item.id) })
          ),
        else: () => element({ tag: 'div', children: 'E' })
      }),
      container
    )

    expect(container.textContent).toBe('12')

    items.value = [{ id: 1 }, { id: 2 }, { id: 3 }]
    expect(container.textContent).toBe('123')

    items.value = [{ id: 3 }]
    expect(container.textContent).toBe('3')

    // Leaving and re-entering the branch rebuilds the list from scratch.
    show.value = false
    expect(container.textContent).toBe('E')
    show.value = true
    expect(container.textContent).toBe('3')
  })
})
