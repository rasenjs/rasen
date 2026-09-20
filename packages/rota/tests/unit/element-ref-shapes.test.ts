/**
 * Element refs must work under *any* reactive adapter. This file pins the shape
 * difference that makes that non-obvious, and it is written the way a plain
 * browser page actually runs: with a **callable-ref** runtime installed
 * globally.
 *
 * The two adapters disagree on what a ref is:
 *
 * - `@rasenjs/reactive-vue`'s ref is an **object** with `.value`.
 * - the builtin runtime's ref (what a page with no adapter installed gets) is
 *   **callable** and has no `.value` - you read it by calling it.
 *
 * `ElementRef<T>` is typed `{ value: T | null }`. A cell that *is* the raw
 * runtime ref therefore works under Vue and returns `undefined` under the
 * builtin runtime. It fails read-only: the DOM renderer writes through
 * `setValue`, which understands both shapes, so the element is stored and
 * nothing errors - it just cannot be read back, breaking things like focus
 * management and measurement.
 *
 * Two details are what make this test able to fail at all, and both must be
 * kept:
 *
 * 1. `tests/setup.ts` installs Vue for this package, so the runtime under test
 *    has to be installed here explicitly.
 * 2. The *global* runtime must be the callable one too. `element.ts` writes the
 *    element with `getReactiveRuntime().setValue(...)`; Vue's `setValue` just
 *    assigns `.value`, which lands a real `.value` property on a callable and
 *    hides the bug entirely. Only a callable-aware `setValue` (invoking it)
 *    reproduces what the browser does.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  ref,
  unref,
  setValue,
  getReactiveRuntime,
  setReactiveRuntime,
  type ReactiveRuntime
} from '@rasenjs/core'
import { div } from '@rasenjs/web/elements'
import { createElementRef } from '../../src/internal/element-ref'

let installed: ReactiveRuntime

/**
 * The installed runtime, with the three ref members replaced by core's callable
 * primitives - the builtin runtime's shape, without hand-rolling reactivity.
 * `subscribe`/`effectScope` are inherited so element creation still works.
 */
function callableRuntime(): ReactiveRuntime {
  return {
    ...installed,
    ref: <T>(initial: T) => ref(initial),
    unref: <T>(value: T) => unref(value as never),
    setValue: <T>(target: never, value: T) => setValue(target, value)
  } as unknown as ReactiveRuntime
}

beforeEach(() => {
  installed = getReactiveRuntime()
})

afterEach(() => {
  setReactiveRuntime(installed)
})

describe('element ref on a callable-ref runtime', () => {
  it('should document why a raw runtime ref is not a usable cell', () => {
    const callable = ref(1)
    expect(typeof callable).toBe('function')
    // The `.value` an `ElementRef` promises does not exist on this shape.
    expect((callable as unknown as { value?: unknown }).value).toBeUndefined()
  })

  it('should expose the mounted element through .value', () => {
    const runtime = callableRuntime()
    setReactiveRuntime(runtime)

    const cell = createElementRef<HTMLDivElement>(runtime)
    const container = document.createElement('div')

    div({ ref: cell, class: 'probe' })(container)

    expect(cell.value).not.toBeNull()
    expect(cell.value?.className).toBe('probe')
  })

  it('should clear .value on unmount', () => {
    const runtime = callableRuntime()
    setReactiveRuntime(runtime)

    const cell = createElementRef<HTMLDivElement>(runtime)
    const container = document.createElement('div')

    const unmount = div({ ref: cell, class: 'probe' })(container)
    expect(cell.value).not.toBeNull()

    unmount?.()
    expect(cell.value).toBeNull()
  })
})
