import { describe, it, expect } from 'vitest'
import { 
  Vec4f, 
  vec4f, 
  add, 
  subtract, 
  multiply, 
  divide, 
  dot, 
  length, 
  lengthSquared, 
  normalize, 
  negate, 
  lerp
} from './vec4'
import { vec2f } from './vec2'
import { vec3f } from './vec3'

describe('Vec4f', () => {
  describe('constructor and factory', () => {
    it('should create vector with constructor', () => {
      const v = new Vec4f(1, 2, 3, 4)
      expect(v.x).toBe(1)
      expect(v.y).toBe(2)
      expect(v.z).toBe(3)
      expect(v.w).toBe(4)
    })

    it('should create vector with factory function (x, y, z, w)', () => {
      const v = vec4f(1, 2, 3, 4)
      expect(v.x).toBe(1)
      expect(v.y).toBe(2)
      expect(v.z).toBe(3)
      expect(v.w).toBe(4)
    })

    it('should create vector from vec2f + z + w (WGSL style)', () => {
      const v2 = vec2f(1, 2)
      const v = vec4f(v2, 3, 4)
      expect(v.x).toBe(1)
      expect(v.y).toBe(2)
      expect(v.z).toBe(3)
      expect(v.w).toBe(4)
    })

    it('should create vector from x + y + vec2f (WGSL style)', () => {
      const v2 = vec2f(3, 4)
      const v = vec4f(1, 2, v2)
      expect(v.x).toBe(1)
      expect(v.y).toBe(2)
      expect(v.z).toBe(3)
      expect(v.w).toBe(4)
    })

    it('should create vector from x + vec2f + w (WGSL style)', () => {
      const v2 = vec2f(2, 3)
      const v = vec4f(1, v2, 4)
      expect(v.x).toBe(1)
      expect(v.y).toBe(2)
      expect(v.z).toBe(3)
      expect(v.w).toBe(4)
    })

    it('should create vector from two vec2f (WGSL style)', () => {
      const v2a = vec2f(1, 2)
      const v2b = vec2f(3, 4)
      const v = vec4f(v2a, v2b)
      expect(v.x).toBe(1)
      expect(v.y).toBe(2)
      expect(v.z).toBe(3)
      expect(v.w).toBe(4)
    })

    it('should create vector from vec3f + w (WGSL style)', () => {
      const v3 = vec3f(1, 2, 3)
      const v = vec4f(v3, 4)
      expect(v.x).toBe(1)
      expect(v.y).toBe(2)
      expect(v.z).toBe(3)
      expect(v.w).toBe(4)
    })

    it('should create vector from x + vec3f (WGSL style)', () => {
      const v3 = vec3f(2, 3, 4)
      const v = vec4f(1, v3)
      expect(v.x).toBe(1)
      expect(v.y).toBe(2)
      expect(v.z).toBe(3)
      expect(v.w).toBe(4)
    })

    it('should create vector from vec4f (copy)', () => {
      const original = vec4f(1, 2, 3, 4)
      const copy = vec4f(original)
      expect(copy.x).toBe(1)
      expect(copy.y).toBe(2)
      expect(copy.z).toBe(3)
      expect(copy.w).toBe(4)
      expect(copy).not.toBe(original)
    })

    it('should have correct source array', () => {
      const v = vec4f(1, 2, 3, 4)
      expect(v.source).toBeInstanceOf(Float32Array)
      expect(v.source.length).toBe(4)
      expect(v.source[0]).toBe(1)
      expect(v.source[1]).toBe(2)
      expect(v.source[2]).toBe(3)
      expect(v.source[3]).toBe(4)
    })

    it('should create static vectors', () => {
      expect(Vec4f.zero()).toEqual(vec4f(0, 0, 0, 0))
      expect(Vec4f.one()).toEqual(vec4f(1, 1, 1, 1))
    })

    it('should create from array', () => {
      const v = Vec4f.fromArray([5, 6, 7, 8])
      expect(v.x).toBe(5)
      expect(v.y).toBe(6)
      expect(v.z).toBe(7)
      expect(v.w).toBe(8)
    })
  })

  describe('accessors', () => {
    it('should have xyzw accessors', () => {
      const v = vec4f(1, 2, 3, 4)
      expect(v.x).toBe(1)
      expect(v.y).toBe(2)
      expect(v.z).toBe(3)
      expect(v.w).toBe(4)
    })

    it('should have rgba accessors', () => {
      const v = vec4f(1, 2, 3, 4)
      expect(v.r).toBe(1)
      expect(v.g).toBe(2)
      expect(v.b).toBe(3)
      expect(v.a).toBe(4)
    })
  })

  describe('swizzle', () => {
    it('should get xy', () => {
      const v = vec4f(1, 2, 3, 4)
      const xy = v.xy
      expect(xy.x).toBe(1)
      expect(xy.y).toBe(2)
    })

    it('should get yz', () => {
      const v = vec4f(1, 2, 3, 4)
      const yz = v.yz
      expect(yz.x).toBe(2)
      expect(yz.y).toBe(3)
    })

    it('should get zw', () => {
      const v = vec4f(1, 2, 3, 4)
      const zw = v.zw
      expect(zw.x).toBe(3)
      expect(zw.y).toBe(4)
    })

    it('should get xyz', () => {
      const v = vec4f(1, 2, 3, 4)
      const xyz = v.xyz
      expect(xyz.x).toBe(1)
      expect(xyz.y).toBe(2)
      expect(xyz.z).toBe(3)
    })

    it('should get yzw', () => {
      const v = vec4f(1, 2, 3, 4)
      const yzw = v.yzw
      expect(yzw.x).toBe(2)
      expect(yzw.y).toBe(3)
      expect(yzw.z).toBe(4)
    })

    it('should convert to vec3', () => {
      const v = vec4f(1, 2, 3, 4)
      const v3 = v.toVec3()
      expect(v3.x).toBe(1)
      expect(v3.y).toBe(2)
      expect(v3.z).toBe(3)
    })
  })

  describe('instance methods', () => {
    it('should add vectors', () => {
      const a = vec4f(1, 2, 3, 4)
      const b = vec4f(5, 6, 7, 8)
      const result = a.add(b)
      expect(result.x).toBe(6)
      expect(result.y).toBe(8)
      expect(result.z).toBe(10)
      expect(result.w).toBe(12)
    })

    it('should subtract vectors', () => {
      const a = vec4f(5, 6, 7, 8)
      const b = vec4f(1, 2, 3, 4)
      const result = a.subtract(b)
      expect(result.x).toBe(4)
      expect(result.y).toBe(4)
      expect(result.z).toBe(4)
      expect(result.w).toBe(4)
    })

    it('should multiply vectors component-wise', () => {
      const a = vec4f(1, 2, 3, 4)
      const b = vec4f(2, 3, 4, 5)
      const result = a.multiply(b)
      expect(result.x).toBe(2)
      expect(result.y).toBe(6)
      expect(result.z).toBe(12)
      expect(result.w).toBe(20)
    })

    it('should divide vectors component-wise', () => {
      const a = vec4f(10, 20, 30, 40)
      const b = vec4f(2, 5, 10, 20)
      const result = a.divide(b)
      expect(result.x).toBe(5)
      expect(result.y).toBe(4)
      expect(result.z).toBe(3)
      expect(result.w).toBe(2)
    })

    it('should scale vector', () => {
      const v = vec4f(1, 2, 3, 4)
      const result = v.scale(2)
      expect(result.x).toBe(2)
      expect(result.y).toBe(4)
      expect(result.z).toBe(6)
      expect(result.w).toBe(8)
    })

    it('should calculate dot product', () => {
      const a = vec4f(1, 2, 3, 4)
      const b = vec4f(5, 6, 7, 8)
      expect(a.dot(b)).toBe(70)
    })

    it('should calculate length', () => {
      const v = vec4f(0, 0, 3, 4)
      expect(v.length()).toBe(5)
    })

    it('should calculate length squared', () => {
      const v = vec4f(0, 0, 3, 4)
      expect(v.lengthSquared()).toBe(25)
    })

    it('should normalize vector', () => {
      const v = vec4f(0, 0, 3, 4)
      const n = v.normalize()
      expect(n.x).toBeCloseTo(0)
      expect(n.y).toBeCloseTo(0)
      expect(n.z).toBeCloseTo(0.6)
      expect(n.w).toBeCloseTo(0.8)
      expect(n.length()).toBeCloseTo(1)
    })

    it('should handle normalize of zero vector', () => {
      const v = vec4f(0, 0, 0, 0)
      const n = v.normalize()
      expect(n.x).toBe(0)
      expect(n.y).toBe(0)
      expect(n.z).toBe(0)
      expect(n.w).toBe(0)
    })

    it('should negate vector', () => {
      const v = vec4f(1, -2, 3, -4)
      const n = v.negate()
      expect(n.x).toBe(-1)
      expect(n.y).toBe(2)
      expect(n.z).toBe(-3)
      expect(n.w).toBe(4)
    })

    it('should lerp between vectors', () => {
      const a = vec4f(0, 0, 0, 0)
      const b = vec4f(10, 20, 30, 40)
      const result = a.lerp(b, 0.5)
      expect(result.x).toBe(5)
      expect(result.y).toBe(10)
      expect(result.z).toBe(15)
      expect(result.w).toBe(20)
    })

    it('should clone vector', () => {
      const v = vec4f(1, 2, 3, 4)
      const c = v.clone()
      expect(c.x).toBe(1)
      expect(c.y).toBe(2)
      expect(c.z).toBe(3)
      expect(c.w).toBe(4)
      expect(c).not.toBe(v)
    })

    it('should compare vectors for equality', () => {
      const a = vec4f(1, 2, 3, 4)
      const b = vec4f(1, 2, 3, 4)
      const c = vec4f(1.00001, 2, 3, 4)
      expect(a.equals(b)).toBe(true)
      expect(a.equals(c)).toBe(true)
    })
  })

  describe('function aliases (WGSL style)', () => {
    it('should add with function', () => {
      const a = vec4f(1, 2, 3, 4)
      const b = vec4f(5, 6, 7, 8)
      const result = add(a, b)
      expect(result.x).toBe(6)
      expect(result.y).toBe(8)
      expect(result.z).toBe(10)
      expect(result.w).toBe(12)
    })

    it('should subtract with function', () => {
      const a = vec4f(5, 6, 7, 8)
      const b = vec4f(1, 2, 3, 4)
      const result = subtract(a, b)
      expect(result.x).toBe(4)
      expect(result.y).toBe(4)
      expect(result.z).toBe(4)
      expect(result.w).toBe(4)
    })

    it('should multiply with function', () => {
      const a = vec4f(1, 2, 3, 4)
      const b = vec4f(2, 3, 4, 5)
      const result = multiply(a, b)
      expect(result.x).toBe(2)
      expect(result.y).toBe(6)
      expect(result.z).toBe(12)
      expect(result.w).toBe(20)
    })

    it('should divide with function', () => {
      const a = vec4f(10, 20, 30, 40)
      const b = vec4f(2, 5, 10, 20)
      const result = divide(a, b)
      expect(result.x).toBe(5)
      expect(result.y).toBe(4)
      expect(result.z).toBe(3)
      expect(result.w).toBe(2)
    })

    it('should dot with function', () => {
      const a = vec4f(1, 2, 3, 4)
      const b = vec4f(5, 6, 7, 8)
      expect(dot(a, b)).toBe(70)
    })

    it('should get length with function', () => {
      const v = vec4f(0, 0, 3, 4)
      expect(length(v)).toBe(5)
    })

    it('should get lengthSquared with function', () => {
      const v = vec4f(0, 0, 3, 4)
      expect(lengthSquared(v)).toBe(25)
    })

    it('should normalize with function', () => {
      const v = vec4f(0, 0, 3, 4)
      const n = normalize(v)
      expect(n.x).toBeCloseTo(0)
      expect(n.y).toBeCloseTo(0)
      expect(n.z).toBeCloseTo(0.6)
      expect(n.w).toBeCloseTo(0.8)
    })

    it('should negate with function', () => {
      const v = vec4f(1, -2, 3, -4)
      const n = negate(v)
      expect(n.x).toBe(-1)
      expect(n.y).toBe(2)
      expect(n.z).toBe(-3)
      expect(n.w).toBe(4)
    })

    it('should lerp with function', () => {
      const a = vec4f(0, 0, 0, 0)
      const b = vec4f(10, 20, 30, 40)
      const result = lerp(a, b, 0.5)
      expect(result.x).toBe(5)
      expect(result.y).toBe(10)
      expect(result.z).toBe(15)
      expect(result.w).toBe(20)
    })
  })
})
