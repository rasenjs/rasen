import { describe, it, expect } from 'vitest'
import { 
  Vec2f, 
  vec2f, 
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
  reflect
} from './vec2'

describe('Vec2f', () => {
  describe('constructor and factory', () => {
    it('should create vector with constructor', () => {
      const v = new Vec2f(3, 4)
      expect(v.x).toBe(3)
      expect(v.y).toBe(4)
    })

    it('should create vector with factory function', () => {
      const v = vec2f(3, 4)
      expect(v.x).toBe(3)
      expect(v.y).toBe(4)
    })

    it('should have correct source array', () => {
      const v = vec2f(3, 4)
      expect(v.source).toBeInstanceOf(Float32Array)
      expect(v.source.length).toBe(2)
      expect(v.source[0]).toBe(3)
      expect(v.source[1]).toBe(4)
    })

    it('should create static vectors', () => {
      expect(Vec2f.zero()).toEqual(vec2f(0, 0))
      expect(Vec2f.one()).toEqual(vec2f(1, 1))
      expect(Vec2f.up()).toEqual(vec2f(0, 1))
      expect(Vec2f.down()).toEqual(vec2f(0, -1))
      expect(Vec2f.left()).toEqual(vec2f(-1, 0))
      expect(Vec2f.right()).toEqual(vec2f(1, 0))
    })

    it('should create from array', () => {
      const v = Vec2f.fromArray([5, 6])
      expect(v.x).toBe(5)
      expect(v.y).toBe(6)
    })
  })

  describe('instance methods', () => {
    it('should add vectors', () => {
      const a = vec2f(1, 2)
      const b = vec2f(3, 4)
      const result = a.add(b)
      expect(result.x).toBe(4)
      expect(result.y).toBe(6)
    })

    it('should subtract vectors', () => {
      const a = vec2f(5, 7)
      const b = vec2f(2, 3)
      const result = a.subtract(b)
      expect(result.x).toBe(3)
      expect(result.y).toBe(4)
    })

    it('should multiply vectors component-wise', () => {
      const a = vec2f(2, 3)
      const b = vec2f(4, 5)
      const result = a.multiply(b)
      expect(result.x).toBe(8)
      expect(result.y).toBe(15)
    })

    it('should divide vectors component-wise', () => {
      const a = vec2f(10, 20)
      const b = vec2f(2, 4)
      const result = a.divide(b)
      expect(result.x).toBe(5)
      expect(result.y).toBe(5)
    })

    it('should scale vector', () => {
      const v = vec2f(2, 3)
      const result = v.scale(2)
      expect(result.x).toBe(4)
      expect(result.y).toBe(6)
    })

    it('should calculate dot product', () => {
      const a = vec2f(1, 2)
      const b = vec2f(3, 4)
      expect(a.dot(b)).toBe(11)
    })

    it('should calculate length', () => {
      const v = vec2f(3, 4)
      expect(v.length()).toBe(5)
    })

    it('should calculate length squared', () => {
      const v = vec2f(3, 4)
      expect(v.lengthSquared()).toBe(25)
    })

    it('should normalize vector', () => {
      const v = vec2f(3, 4)
      const n = v.normalize()
      expect(n.x).toBeCloseTo(0.6)
      expect(n.y).toBeCloseTo(0.8)
      expect(n.length()).toBeCloseTo(1)
    })

    it('should handle normalize of zero vector', () => {
      const v = vec2f(0, 0)
      const n = v.normalize()
      expect(n.x).toBe(0)
      expect(n.y).toBe(0)
    })

    it('should negate vector', () => {
      const v = vec2f(3, -4)
      const n = v.negate()
      expect(n.x).toBe(-3)
      expect(n.y).toBe(4)
    })

    it('should lerp between vectors', () => {
      const a = vec2f(0, 0)
      const b = vec2f(10, 20)
      const result = a.lerp(b, 0.5)
      expect(result.x).toBe(5)
      expect(result.y).toBe(10)
    })

    it('should calculate distance', () => {
      const a = vec2f(0, 0)
      const b = vec2f(3, 4)
      expect(a.distance(b)).toBe(5)
    })

    it('should calculate distance squared', () => {
      const a = vec2f(0, 0)
      const b = vec2f(3, 4)
      expect(a.distanceSquared(b)).toBe(25)
    })

    it('should reflect vector', () => {
      const v = vec2f(1, -1)
      const normal = vec2f(0, 1)
      const result = v.reflect(normal)
      expect(result.x).toBeCloseTo(1)
      expect(result.y).toBeCloseTo(1)
    })

    it('should clone vector', () => {
      const v = vec2f(3, 4)
      const c = v.clone()
      expect(c.x).toBe(3)
      expect(c.y).toBe(4)
      expect(c).not.toBe(v)
    })

    it('should compare vectors for equality', () => {
      const a = vec2f(1, 2)
      const b = vec2f(1, 2)
      const c = vec2f(1.00001, 2)
      expect(a.equals(b)).toBe(true)
      expect(a.equals(c)).toBe(true)
    })
  })

  describe('function aliases (WGSL style)', () => {
    it('should add with function', () => {
      const a = vec2f(1, 2)
      const b = vec2f(3, 4)
      const result = add(a, b)
      expect(result.x).toBe(4)
      expect(result.y).toBe(6)
    })

    it('should subtract with function', () => {
      const a = vec2f(5, 7)
      const b = vec2f(2, 3)
      const result = subtract(a, b)
      expect(result.x).toBe(3)
      expect(result.y).toBe(4)
    })

    it('should multiply with function', () => {
      const a = vec2f(2, 3)
      const b = vec2f(4, 5)
      const result = multiply(a, b)
      expect(result.x).toBe(8)
      expect(result.y).toBe(15)
    })

    it('should divide with function', () => {
      const a = vec2f(10, 20)
      const b = vec2f(2, 4)
      const result = divide(a, b)
      expect(result.x).toBe(5)
      expect(result.y).toBe(5)
    })

    it('should dot with function', () => {
      const a = vec2f(1, 2)
      const b = vec2f(3, 4)
      expect(dot(a, b)).toBe(11)
    })

    it('should get length with function', () => {
      const v = vec2f(3, 4)
      expect(length(v)).toBe(5)
    })

    it('should get lengthSquared with function', () => {
      const v = vec2f(3, 4)
      expect(lengthSquared(v)).toBe(25)
    })

    it('should normalize with function', () => {
      const v = vec2f(3, 4)
      const n = normalize(v)
      expect(n.x).toBeCloseTo(0.6)
      expect(n.y).toBeCloseTo(0.8)
    })

    it('should negate with function', () => {
      const v = vec2f(3, -4)
      const n = negate(v)
      expect(n.x).toBe(-3)
      expect(n.y).toBe(4)
    })

    it('should lerp with function', () => {
      const a = vec2f(0, 0)
      const b = vec2f(10, 20)
      const result = lerp(a, b, 0.5)
      expect(result.x).toBe(5)
      expect(result.y).toBe(10)
    })

    it('should get distance with function', () => {
      const a = vec2f(0, 0)
      const b = vec2f(3, 4)
      expect(distance(a, b)).toBe(5)
    })

    it('should get distanceSquared with function', () => {
      const a = vec2f(0, 0)
      const b = vec2f(3, 4)
      expect(distanceSquared(a, b)).toBe(25)
    })

    it('should reflect with function', () => {
      const v = vec2f(1, -1)
      const normal = vec2f(0, 1)
      const result = reflect(v, normal)
      expect(result.x).toBeCloseTo(1)
      expect(result.y).toBeCloseTo(1)
    })
  })
})
