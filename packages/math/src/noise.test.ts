import { describe, expect, it } from 'vitest'
import { SimplexNoise, fbm2 } from './noise'

describe('SimplexNoise', () => {
  it('is deterministic for the same seed', () => {
    const a = new SimplexNoise(42)
    const b = new SimplexNoise(42)
    expect(a.noise2(0.31, 1.7)).toBe(b.noise2(0.31, 1.7))
    expect(a.noise3(1, 2, 3)).toBe(b.noise3(1, 2, 3))
  })

  it('differs for different seeds', () => {
    const a = new SimplexNoise(1)
    const b = new SimplexNoise(2)
    expect(a.noise2(0.5, 0.5)).not.toBe(b.noise2(0.5, 0.5))
  })

  it('stays within [-1, 1]', () => {
    const noise = new SimplexNoise(7)
    for (let i = 0; i < 2000; i++) {
      const x = (i * 0.37) % 100
      const y = (i * 0.13) % 100
      const v = noise.noise2(x, y)
      expect(v).toBeGreaterThanOrEqual(-1.01)
      expect(v).toBeLessThanOrEqual(1.01)
    }
  })

  it('produces a coherent field (small input changes → small output changes)', () => {
    const noise = new SimplexNoise(3)
    const a = noise.noise2(0.5, 0.5)
    const b = noise.noise2(0.5001, 0.5001)
    expect(Math.abs(a - b)).toBeLessThan(0.01)
  })
})

describe('fbm2', () => {
  it('is normalized to roughly [-1, 1]', () => {
    const noise = new SimplexNoise(9)
    for (let i = 0; i < 500; i++) {
      const v = fbm2(noise, i * 0.1, i * 0.07, 4, 0.5, 2)
      expect(v).toBeGreaterThanOrEqual(-1.05)
      expect(v).toBeLessThanOrEqual(1.05)
    }
  })

  it('is deterministic', () => {
    const noise = new SimplexNoise(5)
    const a = fbm2(noise, 3, 4, 4, 0.5, 2)
    const b = fbm2(new SimplexNoise(5), 3, 4, 4, 0.5, 2)
    expect(a).toBe(b)
  })
})
