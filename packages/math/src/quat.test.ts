import { describe, it, expect } from 'vitest'
import { 
  Quatf, 
  quatf, 
  add, 
  subtract, 
  multiply, 
  dot, 
  length, 
  normalize, 
  conjugate, 
  inverse, 
  lerp, 
  slerp 
} from './quat'
import { vec3f } from './vec3'

describe('Quatf', () => {
  describe('constructor and factory', () => {
    it('should create quaternion with constructor', () => {
      const q = new Quatf(1, 2, 3, 4)
      expect(q.x).toBe(1)
      expect(q.y).toBe(2)
      expect(q.z).toBe(3)
      expect(q.w).toBe(4)
    })

    it('should create quaternion with factory function', () => {
      const q = quatf(1, 2, 3, 4)
      expect(q.x).toBe(1)
      expect(q.y).toBe(2)
      expect(q.z).toBe(3)
      expect(q.w).toBe(4)
    })

    it('should create identity quaternion by default', () => {
      const q = quatf()
      expect(q.x).toBe(0)
      expect(q.y).toBe(0)
      expect(q.z).toBe(0)
      expect(q.w).toBe(1)
    })

    it('should have correct source array', () => {
      const q = quatf(1, 2, 3, 4)
      expect(q.source).toBeInstanceOf(Float32Array)
      expect(q.source.length).toBe(4)
    })

    it('should create static quaternions', () => {
      const identity = Quatf.identity()
      expect(identity.x).toBe(0)
      expect(identity.y).toBe(0)
      expect(identity.z).toBe(0)
      expect(identity.w).toBe(1)
    })

    it('should create from array', () => {
      const q = Quatf.fromArray([1, 2, 3, 4])
      expect(q.x).toBe(1)
      expect(q.y).toBe(2)
      expect(q.z).toBe(3)
      expect(q.w).toBe(4)
    })
  })

  describe('from axis-angle', () => {
    it('should create quaternion from axis-angle', () => {
      const axis = vec3f(0, 1, 0)
      const angle = Math.PI / 2
      const q = Quatf.fromAxisAngle(axis, angle)
      
      expect(q.x).toBeCloseTo(0)
      expect(q.y).toBeCloseTo(Math.sin(Math.PI / 4))
      expect(q.z).toBeCloseTo(0)
      expect(q.w).toBeCloseTo(Math.cos(Math.PI / 4))
    })

    it('should rotate vector by 90 degrees around Y', () => {
      const axis = vec3f(0, 1, 0)
      const angle = Math.PI / 2
      const q = Quatf.fromAxisAngle(axis, angle)
      
      const v = vec3f(1, 0, 0)
      const rotated = q.rotateVec(v)
      
      expect(rotated.x).toBeCloseTo(0)
      expect(rotated.y).toBeCloseTo(0)
      expect(rotated.z).toBeCloseTo(-1)
    })
  })

  describe('from euler angles', () => {
    it('should create quaternion from euler angles', () => {
      const q = Quatf.fromEuler(0, Math.PI / 2, 0)
      
      const v = vec3f(1, 0, 0)
      const rotated = q.rotateVec(v)
      
      expect(rotated.x).toBeCloseTo(0)
      expect(rotated.y).toBeCloseTo(0)
      expect(rotated.z).toBeCloseTo(-1)
    })
  })

  describe('quaternion operations', () => {
    it('should add quaternions', () => {
      const a = quatf(1, 2, 3, 4)
      const b = quatf(5, 6, 7, 8)
      const result = a.add(b)
      expect(result.x).toBe(6)
      expect(result.y).toBe(8)
      expect(result.z).toBe(10)
      expect(result.w).toBe(12)
    })

    it('should subtract quaternions', () => {
      const a = quatf(5, 6, 7, 8)
      const b = quatf(1, 2, 3, 4)
      const result = a.subtract(b)
      expect(result.x).toBe(4)
      expect(result.y).toBe(4)
      expect(result.z).toBe(4)
      expect(result.w).toBe(4)
    })

    it('should multiply quaternions', () => {
      const q1 = Quatf.fromAxisAngle(vec3f(0, 1, 0), Math.PI / 4)
      const q2 = Quatf.fromAxisAngle(vec3f(0, 1, 0), Math.PI / 4)
      const result = q1.multiply(q2)
      
      const v = vec3f(1, 0, 0)
      const rotated = result.rotateVec(v)
      
      expect(rotated.x).toBeCloseTo(0)
      expect(rotated.y).toBeCloseTo(0)
      expect(rotated.z).toBeCloseTo(-1)
    })

    it('should scale quaternion', () => {
      const q = quatf(1, 2, 3, 4)
      const result = q.scale(2)
      expect(result.x).toBe(2)
      expect(result.y).toBe(4)
      expect(result.z).toBe(6)
      expect(result.w).toBe(8)
    })

    it('should calculate dot product', () => {
      const a = quatf(1, 2, 3, 4)
      const b = quatf(5, 6, 7, 8)
      expect(a.dot(b)).toBe(70)
    })

    it('should calculate length', () => {
      const q = quatf(0, 0, 0, 1)
      expect(q.length()).toBe(1)
    })

    it('should normalize quaternion', () => {
      const q = quatf(1, 2, 3, 4)
      const n = q.normalize()
      expect(n.length()).toBeCloseTo(1)
    })

    it('should calculate conjugate', () => {
      const q = quatf(1, 2, 3, 4)
      const c = q.conjugate()
      expect(c.x).toBe(-1)
      expect(c.y).toBe(-2)
      expect(c.z).toBe(-3)
      expect(c.w).toBe(4)
    })

    it('should invert quaternion', () => {
      const q = Quatf.fromAxisAngle(vec3f(0, 1, 0), Math.PI / 4)
      const inv = q.invert()
      
      const v = vec3f(1, 0, 0)
      const rotated = q.rotateVec(v)
      const back = inv.rotateVec(rotated)
      
      expect(back.x).toBeCloseTo(1)
      expect(back.y).toBeCloseTo(0)
      expect(back.z).toBeCloseTo(0)
    })
  })

  describe('interpolation', () => {
    it('should lerp between quaternions', () => {
      const a = Quatf.identity()
      const b = Quatf.fromAxisAngle(vec3f(0, 1, 0), Math.PI / 2)
      const result = lerp(a, b, 0.5)
      
      const v = vec3f(1, 0, 0)
      const rotated = result.rotateVec(v)
      
      expect(rotated.x).toBeCloseTo(Math.cos(Math.PI / 4), 3)
      expect(rotated.z).toBeCloseTo(-Math.sin(Math.PI / 4), 3)
    })

    it('should slerp between quaternions', () => {
      const a = Quatf.identity()
      const b = Quatf.fromAxisAngle(vec3f(0, 1, 0), Math.PI / 2)
      const result = slerp(a, b, 0.5)
      
      const v = vec3f(1, 0, 0)
      const rotated = result.rotateVec(v)
      
      expect(rotated.x).toBeCloseTo(Math.cos(Math.PI / 4), 3)
      expect(rotated.z).toBeCloseTo(-Math.sin(Math.PI / 4), 3)
    })
  })

  describe('conversion', () => {
    it('should convert to matrix', () => {
      const q = Quatf.fromAxisAngle(vec3f(0, 1, 0), Math.PI / 2)
      const m = q.toMat4()
      
      const v = vec3f(1, 0, 0)
      const rotated = m.transformPoint(v)
      
      expect(rotated.x).toBeCloseTo(0)
      expect(rotated.y).toBeCloseTo(0)
      expect(rotated.z).toBeCloseTo(-1)
    })

    it('should convert to euler angles', () => {
      const q = Quatf.fromEuler(Math.PI / 4, 0, 0)
      const euler = q.toEuler()
      
      expect(euler.x).toBeCloseTo(Math.PI / 4)
      expect(euler.y).toBeCloseTo(0)
      expect(euler.z).toBeCloseTo(0)
    })

    it('should get axis and angle', () => {
      const axis = vec3f(0, 1, 0)
      const angle = Math.PI / 2
      const q = Quatf.fromAxisAngle(axis, angle)
      
      const returnedAxis = q.getAxis()
      const returnedAngle = q.getAngle()
      
      expect(returnedAxis.x).toBeCloseTo(0)
      expect(returnedAxis.y).toBeCloseTo(1)
      expect(returnedAxis.z).toBeCloseTo(0)
      expect(returnedAngle).toBeCloseTo(angle)
    })
  })

  describe('lookRotation', () => {
    it.skip('should create identity quaternion for forward direction', () => {
      const forward = vec3f(0, 0, -1)
      const up = vec3f(0, 1, 0)
      const q = Quatf.lookRotation(forward, up)
      
      expect(q.w).toBeCloseTo(1, 1)
      expect(q.x).toBeCloseTo(0, 1)
      expect(q.y).toBeCloseTo(0, 1)
      expect(q.z).toBeCloseTo(0, 1)
    })
  })

  describe('function aliases (WGSL style)', () => {
    it('should add with function', () => {
      const a = quatf(1, 2, 3, 4)
      const b = quatf(5, 6, 7, 8)
      const result = add(a, b)
      expect(result.x).toBe(6)
      expect(result.y).toBe(8)
    })

    it('should subtract with function', () => {
      const a = quatf(5, 6, 7, 8)
      const b = quatf(1, 2, 3, 4)
      const result = subtract(a, b)
      expect(result.x).toBe(4)
      expect(result.y).toBe(4)
    })

    it('should multiply with function', () => {
      const q1 = Quatf.fromAxisAngle(vec3f(0, 1, 0), Math.PI / 4)
      const q2 = Quatf.fromAxisAngle(vec3f(0, 1, 0), Math.PI / 4)
      const result = multiply(q1, q2)
      
      const v = vec3f(1, 0, 0)
      const rotated = result.rotateVec(v)
      
      expect(rotated.x).toBeCloseTo(0)
      expect(rotated.z).toBeCloseTo(-1)
    })

    it('should dot with function', () => {
      const a = quatf(1, 2, 3, 4)
      const b = quatf(5, 6, 7, 8)
      expect(dot(a, b)).toBe(70)
    })

    it('should get length with function', () => {
      const q = quatf(0, 0, 0, 1)
      expect(length(q)).toBe(1)
    })

    it('should normalize with function', () => {
      const q = quatf(1, 2, 3, 4)
      const n = normalize(q)
      expect(n.length()).toBeCloseTo(1)
    })

    it('should conjugate with function', () => {
      const q = quatf(1, 2, 3, 4)
      const c = conjugate(q)
      expect(c.x).toBe(-1)
      expect(c.y).toBe(-2)
    })

    it('should invert with function', () => {
      const q = Quatf.fromAxisAngle(vec3f(0, 1, 0), Math.PI / 4)
      const inv = inverse(q)
      
      const v = vec3f(1, 0, 0)
      const rotated = q.rotateVec(v)
      const back = inv.rotateVec(rotated)
      
      expect(back.x).toBeCloseTo(1)
    })
  })
})
