import { describe, it, expect } from 'vitest'
import { 
  Mat3x3f, 
  mat3x3f, 
  multiply, 
  transpose, 
  determinant, 
  inverse 
} from './mat3x3'
import { vec2f } from './vec2'
import { vec3f } from './vec3'

describe('Mat3x3f', () => {
  describe('constructor and factory', () => {
    it('should create identity matrix by default', () => {
      const m = new Mat3x3f()
      expect(m.get(0, 0)).toBe(1)
      expect(m.get(1, 1)).toBe(1)
      expect(m.get(2, 2)).toBe(1)
      expect(m.get(0, 1)).toBe(0)
      expect(m.get(1, 0)).toBe(0)
    })

    it('should create matrix with factory function', () => {
      const m = mat3x3f()
      expect(m.get(0, 0)).toBe(1)
      expect(m.get(1, 1)).toBe(1)
      expect(m.get(2, 2)).toBe(1)
    })

    it('should create matrix from array', () => {
      const m = mat3x3f([
        1, 2, 3,
        4, 5, 6,
        7, 8, 9
      ])
      expect(m.get(0, 0)).toBe(1)
      expect(m.get(1, 0)).toBe(2)
      expect(m.get(2, 0)).toBe(3)
      expect(m.get(0, 1)).toBe(4)
    })

    it('should have correct source array', () => {
      const m = mat3x3f()
      expect(m.source).toBeInstanceOf(Float32Array)
      expect(m.source.length).toBe(9)
    })

    it('should create static matrices', () => {
      const identity = Mat3x3f.identity()
      expect(identity.get(0, 0)).toBe(1)
      expect(identity.get(1, 1)).toBe(1)
      expect(identity.get(2, 2)).toBe(1)

      const zero = Mat3x3f.zero()
      expect(zero.get(0, 0)).toBe(0)
      expect(zero.get(1, 1)).toBe(0)
      expect(zero.get(2, 2)).toBe(0)
    })
  })

  describe('translation', () => {
    it('should create translation matrix', () => {
      const m = Mat3x3f.translate(10, 20)
      expect(m.get(0, 2)).toBe(10)
      expect(m.get(1, 2)).toBe(20)
      expect(m.get(0, 0)).toBe(1)
      expect(m.get(1, 1)).toBe(1)
    })

    it('should translate vec2', () => {
      const m = Mat3x3f.translate(10, 20)
      const v = vec2f(5, 5)
      const result = m.multiplyVec2(v)
      expect(result.x).toBe(15)
      expect(result.y).toBe(25)
    })
  })

  describe('scaling', () => {
    it('should create scale matrix', () => {
      const m = Mat3x3f.scale(2, 3)
      expect(m.get(0, 0)).toBe(2)
      expect(m.get(1, 1)).toBe(3)
      expect(m.get(2, 2)).toBe(1)
    })

    it('should scale vec2', () => {
      const m = Mat3x3f.scale(2, 3)
      const v = vec2f(5, 5)
      const result = m.multiplyVec2(v)
      expect(result.x).toBe(10)
      expect(result.y).toBe(15)
    })
  })

  describe('rotation', () => {
    it('should create rotation matrix for 0 degrees', () => {
      const m = Mat3x3f.rotate(0)
      expect(m.get(0, 0)).toBeCloseTo(1)
      expect(m.get(1, 1)).toBeCloseTo(1)
      expect(m.get(0, 1)).toBeCloseTo(0)
      expect(m.get(1, 0)).toBeCloseTo(0)
    })

    it('should create rotation matrix for 90 degrees', () => {
      const m = Mat3x3f.rotate(Math.PI / 2)
      expect(m.get(0, 0)).toBeCloseTo(0)
      expect(m.get(0, 1)).toBeCloseTo(-1)
      expect(m.get(1, 0)).toBeCloseTo(1)
      expect(m.get(1, 1)).toBeCloseTo(0)
    })

    it('should rotate vec2', () => {
      const m = Mat3x3f.rotate(Math.PI / 2)
      const v = vec2f(1, 0)
      const result = m.multiplyVec2(v)
      expect(result.x).toBeCloseTo(0)
      expect(result.y).toBeCloseTo(1)
    })
  })

  describe('matrix operations', () => {
    it('should multiply matrices', () => {
      const a = Mat3x3f.translate(10, 20)
      const b = Mat3x3f.scale(2, 2)
      const result = a.multiply(b)
      
      const v = vec2f(5, 5)
      const transformed = result.multiplyVec2(v)
      expect(transformed.x).toBe(20)
      expect(transformed.y).toBe(30)
    })

    it('should multiply vec3', () => {
      const m = Mat3x3f.scale(2, 3)
      const v = vec3f(1, 2, 1)
      const result = m.multiplyVec3(v)
      expect(result.x).toBe(2)
      expect(result.y).toBe(6)
      expect(result.z).toBe(1)
    })

    it('should transpose matrix', () => {
      const m = mat3x3f([
        1, 2, 3,
        4, 5, 6,
        7, 8, 9
      ])
      const t = m.transpose()
      expect(t.get(0, 0)).toBe(1)
      expect(t.get(1, 0)).toBe(4)
      expect(t.get(2, 0)).toBe(7)
      expect(t.get(0, 1)).toBe(2)
    })

    it('should calculate determinant', () => {
      const m = mat3x3f([
        1, 2, 3,
        4, 5, 6,
        7, 8, 9
      ])
      expect(m.determinant()).toBe(0)
    })

    it('should calculate determinant of identity', () => {
      const m = Mat3x3f.identity()
      expect(m.determinant()).toBe(1)
    })

    it('should invert matrix', () => {
      const m = Mat3x3f.scale(2, 3)
      const inv = m.invert()
      
      const v = vec2f(10, 15)
      const transformed = m.multiplyVec2(v)
      const back = inv.multiplyVec2(transformed)
      
      expect(back.x).toBeCloseTo(10)
      expect(back.y).toBeCloseTo(15)
    })

    it('should return identity for non-invertible matrix', () => {
      const m = mat3x3f([
        1, 2, 3,
        4, 5, 6,
        7, 8, 9
      ])
      const inv = m.invert()
      expect(inv.get(0, 0)).toBe(1)
      expect(inv.get(1, 1)).toBe(1)
      expect(inv.get(2, 2)).toBe(1)
    })
  })

  describe('orthographic projection', () => {
    it('should create orthographic projection matrix', () => {
      const m = Mat3x3f.ortho(0, 800, 600, 0)
      const topLeft = m.multiplyVec2(vec2f(0, 0))
      const bottomRight = m.multiplyVec2(vec2f(800, 600))
      
      expect(topLeft.x).toBeCloseTo(-1)
      expect(topLeft.y).toBeCloseTo(1)
      expect(bottomRight.x).toBeCloseTo(1)
      expect(bottomRight.y).toBeCloseTo(-1)
    })
  })

  describe('function aliases (WGSL style)', () => {
    it('should multiply with function', () => {
      const a = Mat3x3f.translate(10, 20)
      const b = Mat3x3f.scale(2, 2)
      const result = multiply(a, b)
      
      const v = vec2f(5, 5)
      const transformed = result.multiplyVec2(v)
      expect(transformed.x).toBe(20)
      expect(transformed.y).toBe(30)
    })

    it('should transpose with function', () => {
      const m = mat3x3f([
        1, 2, 3,
        4, 5, 6,
        7, 8, 9
      ])
      const t = transpose(m)
      expect(t.get(0, 1)).toBe(2)
      expect(t.get(1, 0)).toBe(4)
    })

    it('should get determinant with function', () => {
      const m = Mat3x3f.identity()
      expect(determinant(m)).toBe(1)
    })

    it('should invert with function', () => {
      const m = Mat3x3f.scale(2, 3)
      const inv = inverse(m)
      
      const v = vec2f(10, 15)
      const transformed = m.multiplyVec2(v)
      const back = inv.multiplyVec2(transformed)
      
      expect(back.x).toBeCloseTo(10)
      expect(back.y).toBeCloseTo(15)
    })
  })
})
