/**
 * ReactiveRuntime.subscribe contract tests (vue adapter, source-level like
 * the other dom tests do):
 *   1. Static sources (getters that read nothing reactive) never fire the
 *      callback — the adapter drops the subscription after the first
 *      evaluation (static-tolerance clause).
 *   2. Reactive sources deliver updates synchronously; unchanged values are
 *      skipped (Object.is gate).
 *   3. The initial value is NOT delivered — callers write it themselves
 *      (see the dom binding layer's hydration contract).
 * These properties are what let bindText use one unified subscription path
 * for static and dynamic expressions alike.
 */
import { describe, it, expect } from 'vitest'
import { ref } from '@vue/reactivity'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'

describe('ReactiveRuntime.subscribe contract', () => {
  it('static getter: callback never fires and no subscription is kept', () => {
    const runtime = createReactiveRuntime()
    let fired = 0

    // A plain object property read collects zero reactive dependencies.
    const item = { label: 'Static' }
    const stop = runtime.subscribe(() => item.label, () => {
      fired++
    })

    // Mutating the plain object cannot trigger anything.
    item.label = 'Changed'
    expect(fired).toBe(0)
    stop()
  })

  it('reactive ref source: fires on change with previous value', () => {
    const runtime = createReactiveRuntime()
    const label = ref('Initial')
    const seen: Array<[string, string]> = []

    const stop = runtime.subscribe(
      () => label.value,
      (value, oldValue) => {
        seen.push([value, oldValue])
      }
    )

    // Initial value must NOT be delivered (caller writes it themselves).
    expect(seen).toEqual([])

    label.value = 'Updated'
    expect(seen).toEqual([['Updated', 'Initial']])

    // Writing the same value must not fire again (Object.is gate).
    label.value = 'Updated'
    expect(seen.length).toBe(1)
    stop()
  })

  it('stop() detaches the subscription', () => {
    const runtime = createReactiveRuntime()
    const count = ref(0)
    let fired = 0

    const stop = runtime.subscribe(() => count.value, () => {
      fired++
    })
    stop()

    count.value = 1
    expect(fired).toBe(0)
  })

  it('bindText-style integration: static text stays static, reactive text updates', () => {
    const runtime = createReactiveRuntime()
    const label = ref('Row')

    const staticNode = document.createElement('span')
    document.body.appendChild(staticNode)
    const item = { label: 'Plain' }

    // Static expression: one initial write, then inert.
    staticNode.textContent = String(item.label)
    const stopStatic = runtime.subscribe(
      () => item.label,
      (v) => {
        staticNode.textContent = String(v)
      }
    )

    const reactiveNode = document.createElement('span')
    document.body.appendChild(reactiveNode)
    reactiveNode.textContent = String(label.value)
    const stopReactive = runtime.subscribe(
      () => label.value,
      (v) => {
        reactiveNode.textContent = String(v)
      }
    )

    expect(staticNode.textContent).toBe('Plain')
    expect(reactiveNode.textContent).toBe('Row')

    label.value = 'Row !!!'
    expect(staticNode.textContent).toBe('Plain')
    expect(reactiveNode.textContent).toBe('Row !!!')

    stopStatic()
    stopReactive()
  })
})

/**
 * effectScope auto-registration contract (all four adapters):
 * a subscription created while a scope is active is owned by that scope —
 * scope.stop() releases it. This is what lets each() bulk-stop thousands of
 * row subscriptions on Clear with one stop() per creating batch.
 *
 * Delivery timing differs per adapter (vue/nanostores synchronous,
 * alien-signals/TC39 microtask-batched), so every case flushes a macrotask
 * before asserting.
 */
describe('effectScope auto-registration contract', () => {
  const flush = () => new Promise<void>(r => setTimeout(r, 0))

  for (const [pkg, importPath] of [
    ['vue', '@rasenjs/reactive-vue'],
    ['alien-signals', '@rasenjs/reactive-alien-signals'],
    ['signals', '@rasenjs/reactive-signals'],
    ['nanostores', '@rasenjs/reactive-nanostores']
  ] as const) {
    it(`[${pkg}] scope.stop() releases subscriptions created inside`, async () => {
      const { createReactiveRuntime } = await import(importPath)
      const runtime = createReactiveRuntime()
      const src = runtime.ref(0)
      let fired = 0

      const scope = runtime.effectScope()
      scope.run(() => {
        runtime.subscribe(() => runtime.unref(src), () => {
          fired++
        })
      })

      // While the scope lives, the subscription delivers.
      runtime.setValue(src, 1)
      await flush()
      expect(fired).toBe(1)

      // After scope.stop(), the same write must stay silent.
      scope.stop()
      runtime.setValue(src, 2)
      await flush()
      expect(fired).toBe(1)
    })

    it(`[${pkg}] subscriptions created outside any scope are unaffected`, async () => {
      const { createReactiveRuntime } = await import(importPath)
      const runtime = createReactiveRuntime()
      const src = runtime.ref(0)
      let fired = 0

      const scope = runtime.effectScope()
      scope.run(() => {})
      scope.stop()

      runtime.subscribe(() => runtime.unref(src), () => {
        fired++
      })

      runtime.setValue(src, 1)
      await flush()
      expect(fired).toBe(1)
    })
  }
})


