import { describe, it, expect } from 'vitest'
import { 
  Mat4x4f, 
  mat4x4f, 
  multiply, 
  transpose, 
  determinant, 
  inverse 
} from './mat4x4'
import { vec3f } from './vec3'
import { vec4f } from './vec4'

describe('Mat4x4f', () => {
  describe('constructor and factory', () => {
    it('should create identity matrix by default', () => {
      const m = new Mat4x4f()
      expect(m.get(0, 0)).toBe(1)
      expect(m.get(1, 1)).toBe(1)
      expect(m.get(2, 2)).toBe(1)
      expect(m.get(3, 3)).toBe(1)
      expect(m.get(0, 1)).toBe(0)
      expect(m.get(1, 0)).toBe(0)
    })

    it('should create matrix with factory function', () => {
      const m = mat4x4f()
      expect(m.get(0, 0)).toBe(1)
      expect(m.get(1, 1)).toBe(1)
      expect(m.get(2, 2)).toBe(1)
      expect(m.get(3, 3)).toBe(1)
    })

    it('should create matrix from array', () => {
      const values = [
        1, 2, 3, 4,
        5, 6, 7, 8,
        9, 10, 11, 12,
        13, 14, 15, 16
      ]
      const m = mat4x4f(values)
      expect(m.get(0, 0)).toBe(1)
      expect(m.get(1, 0)).toBe(2)
      expect(m.get(0, 1)).toBe(5)
    })

    it('should have correct source array', () => {
      const m = mat4x4f()
      expect(m.source).toBeInstanceOf(Float32Array)
      expect(m.source.length).toBe(16)
    })

    it('should create static matrices', () => {
      const identity = Mat4x4f.identity()
      expect(identity.get(0, 0)).toBe(1)
      expect(identity.get(1, 1)).toBe(1)
      expect(identity.get(2, 2)).toBe(1)
      expect(identity.get(3, 3)).toBe(1)

      const zero = Mat4x4f.zero()
      expect(zero.get(0, 0)).toBe(0)
      expect(zero.get(1, 1)).toBe(0)
      expect(zero.get(2, 2)).toBe(0)
      expect(zero.get(3, 3)).toBe(0)
    })
  })

  describe('translation', () => {
    it('should create translation matrix', () => {
      const m = Mat4x4f.translate(10, 20, 30)
      expect(m.get(0, 3)).toBe(10)
      expect(m.get(1, 3)).toBe(20)
      expect(m.get(2, 3)).toBe(30)
      expect(m.get(0, 0)).toBe(1)
      expect(m.get(1, 1)).toBe(1)
      expect(m.get(2, 2)).toBe(1)
    })

    it('should translate vec3', () => {
      const m = Mat4x4f.translate(10, 20, 30)
      const v = vec3f(1, 2, 3)
      const result = m.transformPoint(v)
      expect(result.x).toBe(11)
      expect(result.y).toBe(22)
      expect(result.z).toBe(33)
    })
  })

  describe('scaling', () => {
    it('should create scale matrix', () => {
      const m = Mat4x4f.scale(2, 3, 4)
      expect(m.get(0, 0)).toBe(2)
      expect(m.get(1, 1)).toBe(3)
      expect(m.get(2, 2)).toBe(4)
      expect(m.get(3, 3)).toBe(1)
    })

    it('should scale vec3', () => {
      const m = Mat4x4f.scale(2, 3, 4)
      const v = vec3f(1, 2, 3)
      const result = m.transformPoint(v)
      expect(result.x).toBe(2)
      expect(result.y).toBe(6)
      expect(result.z).toBe(12)
    })
  })

  describe('rotation', () => {
    it('should create rotation matrix around X axis', () => {
      const m = Mat4x4f.rotateX(Math.PI / 2)
      const v = vec3f(0, 1, 0)
      const result = m.transformPoint(v)
      expect(result.x).toBeCloseTo(0)
      expect(result.y).toBeCloseTo(0)
      expect(result.z).toBeCloseTo(1)
    })

    it('should create rotation matrix around Y axis', () => {
      const m = Mat4x4f.rotateY(Math.PI / 2)
      const v = vec3f(1, 0, 0)
      const result = m.transformPoint(v)
      expect(result.x).toBeCloseTo(0)
      expect(result.y).toBeCloseTo(0)
      expect(result.z).toBeCloseTo(-1)
    })

    it('should create rotation matrix around Z axis', () => {
      const m = Mat4x4f.rotateZ(Math.PI / 2)
      const v = vec3f(1, 0, 0)
      const result = m.transformPoint(v)
      expect(result.x).toBeCloseTo(0)
      expect(result.y).toBeCloseTo(1)
      expect(result.z).toBeCloseTo(0)
    })

    it('should create rotation matrix around arbitrary axis', () => {
      const axis = vec3f(0, 1, 0)
      const m = Mat4x4f.rotateAxis(axis, Math.PI / 2)
      const v = vec3f(1, 0, 0)
      const result = m.transformPoint(v)
      expect(result.x).toBeCloseTo(0)
      expect(result.y).toBeCloseTo(0)
      expect(result.z).toBeCloseTo(-1)
    })
  })

  describe('perspective projection', () => {
    it('should create perspective projection matrix', () => {
      const fov = Math.PI / 4
      const aspect = 16 / 9
      const near = 0.1
      const far = 100
      const m = Mat4x4f.perspective(fov, aspect, near, far)
      
      expect(m.get(3, 2)).toBe(-1)
      expect(m.get(2, 2)).toBeLessThan(0)
    })
  })

  describe('orthographic projection', () => {
    it('should create orthographic projection matrix', () => {
      const m = Mat4x4f.ortho(0, 800, 0, 600, -1, 1)
      
      const topLeft = m.transformPoint(vec3f(0, 600, 0))
      expect(topLeft.x).toBeCloseTo(-1)
      expect(topLeft.y).toBeCloseTo(1)
      
      const bottomRight = m.transformPoint(vec3f(800, 0, 0))
      expect(bottomRight.x).toBeCloseTo(1)
      expect(bottomRight.y).toBeCloseTo(-1)
    })
  })

  describe('lookAt', () => {
    it('should create view matrix', () => {
      const eye = vec3f(0, 0, 5)
      const target = vec3f(0, 0, 0)
      const up = vec3f(0, 1, 0)
      const m = Mat4x4f.lookAt(eye, target, up)
      
      const origin = m.transformPoint(vec3f(0, 0, 0))
      expect(origin.z).toBeCloseTo(-5)
    })
  })

  describe('matrix operations', () => {
    it('should multiply matrices', () => {
      const a = Mat4x4f.translate(10, 0, 0)
      const b = Mat4x4f.scale(2, 2, 2)
      const result = a.multiply(b)
      
      const v = vec3f(5, 0, 0)
      const transformed = result.transformPoint(v)
      expect(transformed.x).toBe(20)
    })

    it('should multiply vec4', () => {
      const m = Mat4x4f.translate(10, 20, 30)
      const v = vec4f(1, 2, 3, 1)
      const result = m.multiplyVec4(v)
      expect(result.x).toBe(11)
      expect(result.y).toBe(22)
      expect(result.z).toBe(33)
      expect(result.w).toBe(1)
    })

    it('should transform point (w=1)', () => {
      const m = Mat4x4f.translate(10, 20, 30)
      const v = vec3f(1, 2, 3)
      const result = m.transformPoint(v)
      expect(result.x).toBe(11)
      expect(result.y).toBe(22)
      expect(result.z).toBe(33)
    })

    it('should transform direction (w=0)', () => {
      const m = Mat4x4f.scale(2, 3, 4)
      const v = vec3f(1, 1, 1)
      const result = m.transformDirection(v)
      expect(result.x).toBe(2)
      expect(result.y).toBe(3)
      expect(result.z).toBe(4)
    })

    it('should transpose matrix', () => {
      const values = [
        1, 2, 3, 4,
        5, 6, 7, 8,
        9, 10, 11, 12,
        13, 14, 15, 16
      ]
      const m = mat4x4f(values)
      const t = m.transpose()
      expect(t.get(0, 0)).toBe(1)
      expect(t.get(1, 0)).toBe(5)
      expect(t.get(0, 1)).toBe(2)
    })

    it('should calculate determinant', () => {
      const m = Mat4x4f.identity()
      expect(m.determinant()).toBe(1)
    })

    it('should invert matrix', () => {
      const m = Mat4x4f.translate(10, 20, 30)
      const inv = m.invert()
      
      const v = vec3f(1, 2, 3)
      const transformed = m.transformPoint(v)
      const back = inv.transformPoint(transformed)
      
      expect(back.x).toBeCloseTo(1)
      expect(back.y).toBeCloseTo(2)
      expect(back.z).toBeCloseTo(3)
    })

    it('should invert scale matrix', () => {
      const m = Mat4x4f.scale(2, 3, 4)
      const inv = m.invert()
      
      const v = vec3f(6, 9, 12)
      const back = inv.transformPoint(v)
      
      expect(back.x).toBeCloseTo(3)
      expect(back.y).toBeCloseTo(3)
      expect(back.z).toBeCloseTo(3)
    })
  })

  describe('function aliases (WGSL style)', () => {
    it('should multiply with function', () => {
      const a = Mat4x4f.translate(10, 0, 0)
      const b = Mat4x4f.scale(2, 2, 2)
      const result = multiply(a, b)
      
      const v = vec3f(5, 0, 0)
      const transformed = result.transformPoint(v)
      expect(transformed.x).toBe(20)
    })

    it('should transpose with function', () => {
      const m = mat4x4f([
        1, 2, 3, 4,
        5, 6, 7, 8,
        9, 10, 11, 12,
        13, 14, 15, 16
      ])
      const t = transpose(m)
      expect(t.get(0, 1)).toBe(2)
      expect(t.get(1, 0)).toBe(5)
    })

    it('should get determinant with function', () => {
      const m = Mat4x4f.identity()
      expect(determinant(m)).toBe(1)
    })

    it('should invert with function', () => {
      const m = Mat4x4f.translate(10, 20, 30)
      const inv = inverse(m)
      
      const v = vec3f(1, 2, 3)
      const transformed = m.transformPoint(v)
      const back = inv.transformPoint(transformed)
      
      expect(back.x).toBeCloseTo(1)
      expect(back.y).toBeCloseTo(2)
      expect(back.z).toBeCloseTo(3)
    })
  })
})
