import { describe, it, expect } from 'vitest'
import { 
  Vec3f, 
  vec3f, 
  add, 
  subtract, 
  multiply, 
  divide, 
  dot, 
  length, 
  lengthSquared, 
  normalize, 
  negate, 
  lerp, 
  distance, 
  distanceSquared,
  cross,
  reflect
} from './vec3'
import { vec2f } from './vec2'

describe('Vec3f', () => {
  describe('constructor and factory', () => {
    it('should create vector with constructor', () => {
      const v = new Vec3f(1, 2, 3)
      expect(v.x).toBe(1)
      expect(v.y).toBe(2)
      expect(v.z).toBe(3)
    })

    it('should create vector with factory function (x, y, z)', () => {
      const v = vec3f(1, 2, 3)
      expect(v.x).toBe(1)
      expect(v.y).toBe(2)
      expect(v.z).toBe(3)
    })

    it('should create vector from vec2f + z (WGSL style)', () => {
      const v2 = vec2f(1, 2)
      const v = vec3f(v2, 3)
      expect(v.x).toBe(1)
      expect(v.y).toBe(2)
      expect(v.z).toBe(3)
    })

    it('should create vector from x + vec2f (WGSL style)', () => {
      const v2 = vec2f(2, 3)
      const v = vec3f(1, v2)
      expect(v.x).toBe(1)
      expect(v.y).toBe(2)
      expect(v.z).toBe(3)
    })

    it('should create vector from vec3f (copy)', () => {
      const original = vec3f(1, 2, 3)
      const copy = vec3f(original)
      expect(copy.x).toBe(1)
      expect(copy.y).toBe(2)
      expect(copy.z).toBe(3)
      expect(copy).not.toBe(original)
    })

    it('should have correct source array', () => {
      const v = vec3f(1, 2, 3)
      expect(v.source).toBeInstanceOf(Float32Array)
      expect(v.source.length).toBe(3)
      expect(v.source[0]).toBe(1)
      expect(v.source[1]).toBe(2)
      expect(v.source[2]).toBe(3)
    })

    it('should create static vectors', () => {
      expect(Vec3f.zero()).toEqual(vec3f(0, 0, 0))
      expect(Vec3f.one()).toEqual(vec3f(1, 1, 1))
      expect(Vec3f.up()).toEqual(vec3f(0, 1, 0))
      expect(Vec3f.down()).toEqual(vec3f(0, -1, 0))
      expect(Vec3f.left()).toEqual(vec3f(-1, 0, 0))
      expect(Vec3f.right()).toEqual(vec3f(1, 0, 0))
      expect(Vec3f.forward()).toEqual(vec3f(0, 0, -1))
      expect(Vec3f.back()).toEqual(vec3f(0, 0, 1))
    })

    it('should create from array', () => {
      const v = Vec3f.fromArray([4, 5, 6])
      expect(v.x).toBe(4)
      expect(v.y).toBe(5)
      expect(v.z).toBe(6)
    })
  })

  describe('swizzle', () => {
    it('should get xy', () => {
      const v = vec3f(1, 2, 3)
      const xy = v.xy
      expect(xy.x).toBe(1)
      expect(xy.y).toBe(2)
    })

    it('should get yz', () => {
      const v = vec3f(1, 2, 3)
      const yz = v.yz
      expect(yz.x).toBe(2)
      expect(yz.y).toBe(3)
    })

    it('should get xz', () => {
      const v = vec3f(1, 2, 3)
      const xz = v.xz
      expect(xz.x).toBe(1)
      expect(xz.y).toBe(3)
    })
  })

  describe('instance methods', () => {
    it('should add vectors', () => {
      const a = vec3f(1, 2, 3)
      const b = vec3f(4, 5, 6)
      const result = a.add(b)
      expect(result.x).toBe(5)
      expect(result.y).toBe(7)
      expect(result.z).toBe(9)
    })

    it('should subtract vectors', () => {
      const a = vec3f(4, 5, 6)
      const b = vec3f(1, 2, 3)
      const result = a.subtract(b)
      expect(result.x).toBe(3)
      expect(result.y).toBe(3)
      expect(result.z).toBe(3)
    })

    it('should multiply vectors component-wise', () => {
      const a = vec3f(1, 2, 3)
      const b = vec3f(2, 3, 4)
      const result = a.multiply(b)
      expect(result.x).toBe(2)
      expect(result.y).toBe(6)
      expect(result.z).toBe(12)
    })

    it('should divide vectors component-wise', () => {
      const a = vec3f(10, 20, 30)
      const b = vec3f(2, 5, 10)
      const result = a.divide(b)
      expect(result.x).toBe(5)
      expect(result.y).toBe(4)
      expect(result.z).toBe(3)
    })

    it('should scale vector', () => {
      const v = vec3f(1, 2, 3)
      const result = v.scale(2)
      expect(result.x).toBe(2)
      expect(result.y).toBe(4)
      expect(result.z).toBe(6)
    })

    it('should calculate dot product', () => {
      const a = vec3f(1, 2, 3)
      const b = vec3f(4, 5, 6)
      expect(a.dot(b)).toBe(32)
    })

    it('should calculate cross product', () => {
      const a = vec3f(1, 0, 0)
      const b = vec3f(0, 1, 0)
      const result = a.cross(b)
      expect(result.x).toBe(0)
      expect(result.y).toBe(0)
      expect(result.z).toBe(1)
    })

    it('should calculate cross product (reverse)', () => {
      const a = vec3f(0, 1, 0)
      const b = vec3f(1, 0, 0)
      const result = a.cross(b)
      expect(result.x).toBe(0)
      expect(result.y).toBe(0)
      expect(result.z).toBe(-1)
    })

    it('should calculate length', () => {
      const v = vec3f(0, 4, 3)
      expect(v.length()).toBe(5)
    })

    it('should calculate length squared', () => {
      const v = vec3f(0, 4, 3)
      expect(v.lengthSquared()).toBe(25)
    })

    it('should normalize vector', () => {
      const v = vec3f(0, 4, 3)
      const n = v.normalize()
      expect(n.x).toBeCloseTo(0)
      expect(n.y).toBeCloseTo(0.8)
      expect(n.z).toBeCloseTo(0.6)
      expect(n.length()).toBeCloseTo(1)
    })

    it('should handle normalize of zero vector', () => {
      const v = vec3f(0, 0, 0)
      const n = v.normalize()
      expect(n.x).toBe(0)
      expect(n.y).toBe(0)
      expect(n.z).toBe(0)
    })

    it('should negate vector', () => {
      const v = vec3f(1, -2, 3)
      const n = v.negate()
      expect(n.x).toBe(-1)
      expect(n.y).toBe(2)
      expect(n.z).toBe(-3)
    })

    it('should lerp between vectors', () => {
      const a = vec3f(0, 0, 0)
      const b = vec3f(10, 20, 30)
      const result = a.lerp(b, 0.5)
      expect(result.x).toBe(5)
      expect(result.y).toBe(10)
      expect(result.z).toBe(15)
    })

    it('should calculate distance', () => {
      const a = vec3f(0, 0, 0)
      const b = vec3f(0, 4, 3)
      expect(a.distance(b)).toBe(5)
    })

    it('should calculate distance squared', () => {
      const a = vec3f(0, 0, 0)
      const b = vec3f(0, 4, 3)
      expect(a.distanceSquared(b)).toBe(25)
    })

    it('should reflect vector', () => {
      const v = vec3f(1, -1, 0)
      const normal = vec3f(0, 1, 0)
      const result = v.reflect(normal)
      expect(result.x).toBeCloseTo(1)
      expect(result.y).toBeCloseTo(1)
      expect(result.z).toBeCloseTo(0)
    })

    it('should clone vector', () => {
      const v = vec3f(1, 2, 3)
      const c = v.clone()
      expect(c.x).toBe(1)
      expect(c.y).toBe(2)
      expect(c.z).toBe(3)
      expect(c).not.toBe(v)
    })

    it('should compare vectors for equality', () => {
      const a = vec3f(1, 2, 3)
      const b = vec3f(1, 2, 3)
      const c = vec3f(1.00001, 2, 3)
      expect(a.equals(b)).toBe(true)
      expect(a.equals(c)).toBe(true)
    })
  })

  describe('function aliases (WGSL style)', () => {
    it('should add with function', () => {
      const a = vec3f(1, 2, 3)
      const b = vec3f(4, 5, 6)
      const result = add(a, b)
      expect(result.x).toBe(5)
      expect(result.y).toBe(7)
      expect(result.z).toBe(9)
    })

    it('should subtract with function', () => {
      const a = vec3f(4, 5, 6)
      const b = vec3f(1, 2, 3)
      const result = subtract(a, b)
      expect(result.x).toBe(3)
      expect(result.y).toBe(3)
      expect(result.z).toBe(3)
    })

    it('should multiply with function', () => {
      const a = vec3f(1, 2, 3)
      const b = vec3f(2, 3, 4)
      const result = multiply(a, b)
      expect(result.x).toBe(2)
      expect(result.y).toBe(6)
      expect(result.z).toBe(12)
    })

    it('should divide with function', () => {
      const a = vec3f(10, 20, 30)
      const b = vec3f(2, 5, 10)
      const result = divide(a, b)
      expect(result.x).toBe(5)
      expect(result.y).toBe(4)
      expect(result.z).toBe(3)
    })

    it('should dot with function', () => {
      const a = vec3f(1, 2, 3)
      const b = vec3f(4, 5, 6)
      expect(dot(a, b)).toBe(32)
    })

    it('should cross with function', () => {
      const a = vec3f(1, 0, 0)
      const b = vec3f(0, 1, 0)
      const result = cross(a, b)
      expect(result.x).toBe(0)
      expect(result.y).toBe(0)
      expect(result.z).toBe(1)
    })

    it('should get length with function', () => {
      const v = vec3f(0, 4, 3)
      expect(length(v)).toBe(5)
    })

    it('should get lengthSquared with function', () => {
      const v = vec3f(0, 4, 3)
      expect(lengthSquared(v)).toBe(25)
    })

    it('should normalize with function', () => {
      const v = vec3f(0, 4, 3)
      const n = normalize(v)
      expect(n.x).toBeCloseTo(0)
      expect(n.y).toBeCloseTo(0.8)
      expect(n.z).toBeCloseTo(0.6)
    })

    it('should negate with function', () => {
      const v = vec3f(1, -2, 3)
      const n = negate(v)
      expect(n.x).toBe(-1)
      expect(n.y).toBe(2)
      expect(n.z).toBe(-3)
    })

    it('should lerp with function', () => {
      const a = vec3f(0, 0, 0)
      const b = vec3f(10, 20, 30)
      const result = lerp(a, b, 0.5)
      expect(result.x).toBe(5)
      expect(result.y).toBe(10)
      expect(result.z).toBe(15)
    })

    it('should get distance with function', () => {
      const a = vec3f(0, 0, 0)
      const b = vec3f(0, 4, 3)
      expect(distance(a, b)).toBe(5)
    })

    it('should get distanceSquared with function', () => {
      const a = vec3f(0, 0, 0)
      const b = vec3f(0, 4, 3)
      expect(distanceSquared(a, b)).toBe(25)
    })

    it('should reflect with function', () => {
      const v = vec3f(1, -1, 0)
      const normal = vec3f(0, 1, 0)
      const result = reflect(v, normal)
      expect(result.x).toBeCloseTo(1)
      expect(result.y).toBeCloseTo(1)
      expect(result.z).toBeCloseTo(0)
    })
  })
})
