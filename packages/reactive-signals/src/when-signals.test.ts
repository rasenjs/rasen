/**
 * A signals ref driving a core `when` — the shape every panel in the arpg
 * example uses (a `ref(false)` for "panel open" and a `when` on it).
 */
import { describe, expect, it } from 'vitest'
import { when } from '@rasenjs/core'
import { ref, useReactiveRuntime } from '../src/index'

describe('signals ref driving core when', () => {
  it('mounts the branch when the signal turns true', async () => {
    useReactiveRuntime()
    const open = ref(false)
    const mounted: string[] = []
    const unmount = when({
      condition: () => open.value,
      then: () => () => {
        mounted.push('then')
        return () => {
          mounted.push('unmount')
        }
      },
    })(null as never)
    expect(mounted).toEqual([])
    open.value = true
    await Promise.resolve()
    await Promise.resolve()
    expect(mounted).toContain('then')
    unmount()
  })
})
