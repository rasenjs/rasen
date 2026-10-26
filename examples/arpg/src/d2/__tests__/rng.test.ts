/**
 * The random number generator, against the original's own trace.
 *
 * The table is the spec's worked example: seed 12345 stepped and drawn from, with
 * the resulting `low`/`high` after each call. A 64-bit multiply written with the
 * usual JavaScript mistakes (a plain `*`, or losing the carry into the high word)
 * still looks random and still drifts, so the only honest test is the exact
 * state — which is what a save or a regenerated map depends on.
 */

import { describe, expect, it } from 'vitest'
import { range, rangePowerOfTwo, seedFrom, seedOne, step, type Seed } from '../rng'

describe('step', () => {
  it('multiplies and adds without losing the carry', () => {
    const seed = seedFrom(12345)
    expect(seed).toEqual({ low: 0x3039, high: 0x029a })
    step(seed)
    expect(seed.low).toBe(0x015b2e77)
    expect(seed.high).toBe(0x0000141d)
  })

  it('starts one at the fixed baseline', () => {
    expect(seedOne()).toEqual({ low: 1, high: 666 })
  })
})

describe('range', () => {
  it('matches the trace call for call', () => {
    const seed = seedFrom(12345)
    expect(range(seed, 100)).toBe(87)
    expect([seed.low, seed.high]).toEqual([0x015b2e77, 0x0000141d])
  })

  it('does not draw when the count is below one', () => {
    const seed: Seed = { low: 0x015b2e77, high: 0x0000141d }
    expect(range(seed, 0)).toBe(0)
    expect(range(seed, -5)).toBe(0)
    // Unchanged: this is the guard that keeps a zero-count roll from shifting the
    // whole sequence by one draw.
    expect([seed.low, seed.high]).toEqual([0x015b2e77, 0x0000141d])
  })

  it('keeps matching after the guarded calls', () => {
    const seed = seedFrom(12345)
    expect(range(seed, 100)).toBe(87)
    expect(range(seed, 0)).toBe(0)
    expect(range(seed, 8)).toBe(0)
    expect([seed.low, seed.high]).toEqual([0x8b57c5b0, 0x0090ce87])
    expect(range(seed, 7)).toBe(3)
    expect([seed.low, seed.high]).toEqual([0x606eeef7, 0x3a1e6c8a])
  })
})

describe('rangePowerOfTwo', () => {
  it('masks the low word', () => {
    const seed = seedFrom(12345)
    expect(rangePowerOfTwo(seed, 8)).toBe(seed.low % 8)
    expect([seed.low, seed.high]).toEqual([0x015b2e77, 0x0000141d])
  })
})
