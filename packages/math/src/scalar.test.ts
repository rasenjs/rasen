import { describe, it, expect } from 'vitest'
import {
  clamp, mix, smoothstep, step, fract, mod, sign, degToRad, radToDeg,
  Vec2f, vec2f
} from './index'

describe('Scalar math (WGSL conventions)', () => {
  describe('clamp', () => {
    it('clamps value to range', () => {
      expect(clamp(5, 0, 10)).toBe(5)
      expect(clamp(-1, 0, 10)).toBe(0)
      expect(clamp(15, 0, 10)).toBe(10)
    })

    it('handles boundary values', () => {
      expect(clamp(0, 0, 10)).toBe(0)
      expect(clamp(10, 0, 10)).toBe(10)
    })
  })

  describe('mix', () => {
    it('interpolates between two values', () => {
      expect(mix(0, 10, 0)).toBe(0)
      expect(mix(0, 10, 1)).toBe(10)
      expect(mix(0, 10, 0.5)).toBe(5)
    })

    it('works with negative values', () => {
      expect(mix(-10, 10, 0.5)).toBe(0)
      expect(mix(10, -10, 0.25)).toBe(5)
    })
  })

  describe('smoothstep', () => {
    it('returns 0 below edge0', () => {
      expect(smoothstep(0, 1, -1)).toBe(0)
    })

    it('returns 1 above edge1', () => {
      expect(smoothstep(0, 1, 2)).toBe(1)
    })

    it('returns 0.5 at midpoint', () => {
      expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5)
    })

    it('is smooth at edges (derivative = 0)', () => {
      // At edge0 and edge1, the derivative should be 0
      const eps = 0.001
      const v0 = smoothstep(0, 1, eps)
      const v1 = smoothstep(0, 1, 1 - eps)
      expect(v0).toBeLessThan(0.01)
      expect(v1).toBeGreaterThan(0.99)
    })
  })

  describe('step', () => {
    it('returns 0 when x < edge', () => {
      expect(step(0.5, 0.3)).toBe(0)
    })

    it('returns 1 when x >= edge', () => {
      expect(step(0.5, 0.5)).toBe(1)
      expect(step(0.5, 0.7)).toBe(1)
    })
  })

  describe('fract', () => {
    it('returns fractional part', () => {
      expect(fract(3.7)).toBeCloseTo(0.7)
      expect(fract(-3.7)).toBeCloseTo(0.3) // -3.7 - floor(-3.7) = -3.7 - (-4) = 0.3
      expect(fract(0)).toBe(0)
      expect(fract(1)).toBe(0)
    })
  })

  describe('mod', () => {
    it('returns positive result for positive divisor', () => {
      expect(mod(7, 3)).toBe(1)
      expect(mod(-1, 3)).toBe(2) // WGSL: mod(-1, 3) = 2
      expect(mod(0, 5)).toBe(0)
    })

    it('differs from JS % for negative values', () => {
      // JS % preserves sign of dividend: -1 % 3 = -1
      expect(-1 % 3).toBe(-1)
      // mod() follows WGSL convention: mod(-1, 3) = 2
      expect(mod(-1, 3)).toBe(2)
    })
  })

  describe('sign', () => {
    it('returns -1, 0, or 1', () => {
      expect(sign(-5)).toBe(-1)
      expect(sign(0)).toBe(0)
      expect(sign(5)).toBe(1)
    })
  })

  describe('degToRad / radToDeg', () => {
    it('converts degrees to radians', () => {
      expect(degToRad(180)).toBeCloseTo(Math.PI)
      expect(degToRad(90)).toBeCloseTo(Math.PI / 2)
    })

    it('converts radians to degrees', () => {
      expect(radToDeg(Math.PI)).toBeCloseTo(180)
      expect(radToDeg(Math.PI / 2)).toBeCloseTo(90)
    })

    it('roundtrips', () => {
      expect(radToDeg(degToRad(45))).toBeCloseTo(45)
    })
  })
})

describe('Vec2f angle operations', () => {
  describe('fromAngle', () => {
    it('creates vector from angle', () => {
      const v = Vec2f.fromAngle(0)
      expect(v.x).toBeCloseTo(1)
      expect(v.y).toBeCloseTo(0)
    })

    it('handles 90 degrees', () => {
      const v = Vec2f.fromAngle(Math.PI / 2)
      expect(v.x).toBeCloseTo(0)
      expect(v.y).toBeCloseTo(1)
    })
  })

  describe('angle', () => {
    it('returns angle of vector', () => {
      expect(vec2f(1, 0).angle()).toBeCloseTo(0)
      expect(vec2f(0, 1).angle()).toBeCloseTo(Math.PI / 2)
      expect(vec2f(-1, 0).angle()).toBeCloseTo(Math.PI)
    })
  })

  describe('rotate', () => {
    it('rotates vector by angle', () => {
      const v = vec2f(1, 0).rotate(Math.PI / 2)
      expect(v.x).toBeCloseTo(0)
      expect(v.y).toBeCloseTo(1)
    })

    it('roundtrips rotation', () => {
      const v = vec2f(3, 4).rotate(0.5).rotate(-0.5)
      expect(v.x).toBeCloseTo(3)
      expect(v.y).toBeCloseTo(4)
    })
  })

  describe('fromAngle + angle roundtrip', () => {
    it('preserves angle through fromAngle/angle', () => {
      for (const deg of [0, 30, 45, 90, 180, 270, 360]) {
        const rad = degToRad(deg)
        const v = Vec2f.fromAngle(rad)
        expect(v.angle()).toBeCloseTo(deg > 180 ? degToRad(deg - 360) : rad, 5)
      }
    })
  })
})
