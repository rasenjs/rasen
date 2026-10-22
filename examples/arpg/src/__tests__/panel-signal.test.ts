/**
 * The panel problem, reproduced in a test.
 *
 * A signal-driven `when` that lives in a component tag never opened: the
 * state flipped, the condition was re-read, and the branch never mounted.
 * The browser round-trip was too slow to narrow this down, so the whole
 * path is set up here instead: compile the tag form, mount it in jsdom,
 * flip the signal, and look at the DOM.
 *
 * The difference that matters is the FORM: `{Component()}` goes through
 * the JSX runtime, `<Component />` goes through the compiler's template
 * path (an HTML template, `collectHtml` and `mountSlot`). The second one
 * is what the example app's panels use.
 */

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { compileModule } from '@rasenjs/compiler'
import { mount } from '@rasenjs/dom'
import { template, child, mountSlot, collectHtml } from '../../../../packages/dom/src/template'
// The core's SOURCE, so a probe in it is live: the package resolution
// would hand the built bundle instead.
import { when } from '../../../../packages/core/src/components/when'
import { createReactiveRuntime, ref, useReactiveRuntime } from '../../../../packages/reactive-signals/src/index'
import { getReactiveRuntime, setReactiveRuntime } from '../../../../packages/core/src/reactive'

/**
 * Compile a snippet and evaluate it with the DOM template helpers in scope,
 * the way the bundler does.
 */
function evaluate(source: string): (flag: { value: boolean }) => unknown {
  const result = compileModule(source)
  expect(result).not.toBeNull()
  expect(result!.fellBack).toBe(0)
  // The bundler supplies the imports; here they are parameters, and the
  // import lines come out.
  const code = result!.code.replace(/^import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?\s*$/gm, '')
  const factory = new Function(
    'template',
    'child',
    'mountSlot',
    'collectHtml',
    'when',
    `${code}\nreturn make`,
  ) as (...args: unknown[]) => (flag: { value: boolean }) => unknown
  return factory(template, child, mountSlot, collectHtml, when)
}

describe('the compiled panel', () => {
  it('mounts the host hooks into the component it mounts', () => {
    // The compiler's template path mounts a component tag through
    // `mountSlot(anchor, component, hooks)`. Without the hooks the
    // component has no marker and no batch, and it mounts its content
    // into the fragment that `mountSlot` empties right after — so the
    // content lives in an orphaned shell and never reaches the page.
    const make = evaluate(`
      import { when } from '@rasenjs/core'
      function Panel(props) {
        return when({
          condition: () => props.flag.value,
          then: () => <span>PANEL</span>,
        })
      }
      function make(flag) {
        const el = <div><Panel flag={flag} /></div>
        return el
      }
    `)
    useReactiveRuntime()
    setReactiveRuntime(createReactiveRuntime())
    const flag = ref(false)
    const container = document.createElement('div')
    document.body.appendChild(container)
    mount(make(flag) as never, container)
    flag.value = true
    return Promise.resolve()
      .then(() => Promise.resolve())
      .then(() => {
        expect(container.textContent).toContain('PANEL')
        container.remove()
      })
  })
})

describe('the runtime the signals live in', () => {
  it('delivers a signal change through the signals runtime itself', async () => {
    const rt = createReactiveRuntime()
    const flag = rt.ref(false)
    const seen: boolean[] = []
    rt.subscribe(() => rt.unref(flag), (value) => seen.push(value))
    rt.setValue(flag, true)
    await Promise.resolve()
    await Promise.resolve()
    expect(seen).toEqual([true])
  })

  it('delivers a signal change to a subscriber', async () => {
    useReactiveRuntime()
    // The core the components read and the runtime the signals live on must
    // be ONE runtime: a second instance leaves the components watching a
    // runtime that never sees the signals' changes.
    setReactiveRuntime(createReactiveRuntime())
    const flag = ref(false)
    const seen: boolean[] = []
    getReactiveRuntime().subscribe(() => flag.value, (value) => seen.push(value))
    flag.value = true
    await Promise.resolve()
    await Promise.resolve()
    expect(seen).toEqual([true])
  })
})

describe('the compiled panel', () => {
  it('mounts its branch when the signal turns true', () => {
    useReactiveRuntime()
    const make = evaluate(`
      // The core's SOURCE, so a probe in it is live: the package resolution
// would hand the built bundle instead.
import { when } from '../../../../packages/core/src/components/when'
      function Panel(props) {
        return when({
          condition: () => props.flag.value,
          then: () => <span>PANEL</span>,
        })
      }
      function make(flag) {
        const el = <div><Panel flag={flag} /></div>
        return el
      }
    `)
    const flag = ref(false)
    const container = document.createElement('div')
    document.body.appendChild(container)
    mount(make(flag) as never, container)
    expect(container.textContent).not.toContain('PANEL')
    flag.value = true
    // The runtime flushes the watchers in a microtask.
    return Promise.resolve()
      .then(() => Promise.resolve())
      .then(() => {
        expect(container.textContent).toContain('PANEL')
        container.remove()
      })
  })
})
