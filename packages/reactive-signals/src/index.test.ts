import { describe, expect, it, vi } from 'vitest'
import { runReactiveRuntimeTests } from '@rasenjs/core/test-utils'
import { getReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime, ref, useReactiveRuntime } from '../src/index'

runReactiveRuntimeTests('TC39 Signals Runtime', createReactiveRuntime)

describe('useReactiveRuntime', () => {
  it('installs the SAME runtime the signals are created with', async () => {
    // Two runtimes here would leave every core component that subscribes
    // (when(), match(), ...) watching a runtime that never sees the signals'
    // changes, so nothing a signal drives would ever appear.
    useReactiveRuntime()
    const count = ref(0)
    const callback = vi.fn()
    getReactiveRuntime().subscribe(() => count.value, callback)
    count.value = 1
    await Promise.resolve()
    await Promise.resolve()
    expect(callback).toHaveBeenCalled()
  })
})
