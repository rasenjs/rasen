import { describe, it, expect } from 'vitest'
import { cubicBezier, cubicBezierTangent, solveCubicBezierX, evalCurve1D } from './index'

describe('Cubic Bézier utilities', () => {
  describe('cubicBezier', () => {
    it('returns start point at t=0', () => {
      const p = cubicBezier(0, 0, 0, 0.5, 1, 0.5, 1, 1, 0)
      expect(p.x).toBeCloseTo(0)
      expect(p.y).toBeCloseTo(0)
    })

    it('returns end point at t=1', () => {
      const p = cubicBezier(1, 0, 0, 0.5, 1, 0.5, 1, 1, 0)
      expect(p.x).toBeCloseTo(1)
      expect(p.y).toBeCloseTo(0)
    })

    it('returns midpoint at t=0.5 for linear curve', () => {
      // Linear: control points on the line
      const p = cubicBezier(0.5, 0, 0, 0.33, 0.67, 0.67, 0.67, 1, 0)
      expect(p.x).toBeCloseTo(0.5, 1)
    })

    it('evaluates S-curve correctly', () => {
      // Classic ease-in-out: cubic-bezier(0.42, 0, 0.58, 1)
      const p = cubicBezier(0.5, 0, 0, 0.42, 0, 0.58, 1, 1, 1)
      expect(p.y).toBeGreaterThan(0.4)
      expect(p.y).toBeLessThan(0.6)
    })
  })

  describe('cubicBezierTangent', () => {
    it('returns angle of first segment at t≈0', () => {
      const angle = cubicBezierTangent(0, 0, 0, 1, 2, 3, 4, 4, 0)
      // Tangent should point toward first control point
      expect(angle).toBeCloseTo(Math.atan2(2, 1), 2)
    })

    it('returns angle of last segment at t≈1', () => {
      const angle = cubicBezierTangent(1, 0, 0, 1, 2, 3, 4, 4, 0)
      // Tangent should point from last control toward end
      expect(angle).toBeCloseTo(Math.atan2(-4, 1), 2)
    })
  })

  describe('solveCubicBezierX', () => {
    it('solves for t=0 → returns 0', () => {
      expect(solveCubicBezierX(0, 0.25, 0.75)).toBeCloseTo(0, 4)
    })

    it('solves for t=1 → returns 1', () => {
      expect(solveCubicBezierX(1, 0.25, 0.75)).toBeCloseTo(1, 4)
    })

    it('solves mid-point accurately', () => {
      const cx1 = 0.42, cx2 = 0.58
      const s = solveCubicBezierX(0.5, cx1, cx2)
      // Verify: plug s back into bezier X
      const oms = 1 - s
      const x = 3 * oms * oms * s * cx1 + 3 * oms * s * s * cx2 + s * s * s
      expect(x).toBeCloseTo(0.5, 4)
    })
  })

  describe('evalCurve1D', () => {
    it('linear when no curve', () => {
      expect(evalCurve1D(undefined, 0, 10, 20, 0, 1)).toBe(10)
      expect(evalCurve1D(undefined, 1, 10, 20, 0, 1)).toBe(20)
      expect(evalCurve1D(undefined, 0.5, 10, 20, 0, 1)).toBe(15)
    })

    it('stepped holds start value', () => {
      expect(evalCurve1D('stepped', 0.5, 10, 20, 0, 1)).toBe(10)
      expect(evalCurve1D('stepped', 0.99, 10, 20, 0, 1)).toBe(10)
    })

    it('bezier interpolation produces intermediate values', () => {
      // Cubic bezier curve handles: [cx1, cy1, cx2, cy2]
      const curve = [0.25, 0.1, 0.75, 0.9]
      const v0 = 0, v1 = 100, t0 = 0, t1 = 1
      const mid = evalCurve1D(curve, 0.5, v0, v1, t0, t1)
      expect(mid).toBeGreaterThan(10)
      expect(mid).toBeLessThan(90)
    })

    it('matches linear at endpoints', () => {
      const curve = [0.25, 0.1, 0.75, 0.9]
      expect(evalCurve1D(curve, 0, 10, 20, 0, 1)).toBeCloseTo(10, 2)
      expect(evalCurve1D(curve, 1, 10, 20, 0, 1)).toBeCloseTo(20, 2)
    })
  })
})
