import { describe, expect, it } from 'vitest'
import { runReactiveRuntimeTests } from '@rasenjs/core/test-utils'
import { createReactiveRuntime, ref, isRef, unref } from '../src/index'

runReactiveRuntimeTests('alien-signals Runtime', createReactiveRuntime)

describe('standalone exports', () => {
  it('exposes the raw signal callable as the ref', () => {
    const count = ref(0)
    expect(isRef(count)).toBe(true)
    expect(unref(count)).toBe(0)

    // alien-signals call-syntax write: the ref IS the signal.
    const write = count as unknown as (value: number) => void
    write(5)
    expect(unref(count)).toBe(5)
  })

  it('does not treat plain functions as refs', () => {
    expect(isRef(() => 42)).toBe(false)
  })
})
