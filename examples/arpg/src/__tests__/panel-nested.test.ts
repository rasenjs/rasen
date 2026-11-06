/**
 * The nested panel: a `when` inside another `when`'s branch.
 *
 * The HUD's structure is a gate (`when(started)`) whose branch holds the
 * panels, and each panel is a `when` of its own. The panel's branch is
 * mounted into the gate's staging fragment, and the gate's fragment is then
 * flushed into the real tree — which empties it. The panel's marker moves
 * with the flush, but the panel's own host (the fragment it was mounted
 * into) does not: it is a detached empty shell from then on.
 *
 * So the panel's later insertion has to find its marker in the tree, not in
 * the shell it was born in.
 */

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Fragment, div, mount } from '@rasenjs/dom'
import { when } from '@rasenjs/core'
import { ref, useReactiveRuntime } from '@rasenjs/reactive-signals'

describe('a panel inside a gate', () => {
  it('opens after the gate flushed its staging fragment', async () => {
    useReactiveRuntime()
    const started = ref(false)
    const open = ref(false)

    const container = document.createElement('div')
    document.body.appendChild(container)

    mount(
      div({
        children: [
          when({
            condition: () => started.value,
            then: () =>
              Fragment({
                children: [
                  when({
                    condition: () => open.value,
                    then: () => div({ 'data-panel': 'bag', children: 'PANEL' }),
                  }),
                ],
              }),
          }),
        ],
      }),
      container,
    )

    expect(container.querySelectorAll('[data-panel]').length).toBe(0)

    started.value = true
    await Promise.resolve()
    await Promise.resolve()
    expect(container.querySelectorAll('[data-panel]').length).toBe(0)

    open.value = true
    await Promise.resolve()
    await Promise.resolve()

    expect(container.querySelectorAll('[data-panel]').length).toBe(1)
    expect(container.textContent).toContain('PANEL')
    container.remove()
  })
})
