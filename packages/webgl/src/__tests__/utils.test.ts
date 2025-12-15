/**
 * Utils tests
 */
import { describe, it, expect } from 'vitest'
import { 
  parseColor, 
  createIdentityMatrix, 
  createTranslationMatrix,
  createScaleMatrix,
  createRotationMatrix,
  createOrthoMatrix,
  unref
} from '../utils'

describe('@rasenjs/webgl utils', () => {
  describe('unref', () => {
    it('should return plain value as-is', () => {
      expect(unref(42)).toBe(42)
      expect(unref('hello')).toBe('hello')
      expect(unref(true)).toBe(true)
    })

    it('should unwrap ref object', () => {
      const ref = { value: 42 }
      expect(unref(ref)).toBe(42)
    })
  })

  describe('parseColor', () => {
    it('should parse 6-digit hex color', () => {
      const color = parseColor('#4CAF50')
      expect(color.r).toBeCloseTo(0.298, 2)
      expect(color.g).toBeCloseTo(0.686, 2)
      expect(color.b).toBeCloseTo(0.314, 2)
      expect(color.a).toBe(1)
    })

    it('should parse 8-digit hex color with alpha', () => {
      const color = parseColor('#4CAF5080')
      expect(color.r).toBeCloseTo(0.298, 2)
      expect(color.a).toBeCloseTo(0.502, 2)
    })

    it('should default to white for unsupported format', () => {
      const color = parseColor('rgb(255, 0, 0)')
      expect(color).toEqual({ r: 1, g: 1, b: 1, a: 1 })
    })
  })

  describe('matrix operations', () => {
    it('should create identity matrix', () => {
      const matrix = createIdentityMatrix()
      expect(matrix).toEqual([
        1, 0, 0,
        0, 1, 0,
        0, 0, 1
      ])
    })

    it('should create translation matrix', () => {
      const matrix = createTranslationMatrix(10, 20)
      expect(matrix).toEqual([
        1, 0, 0,
        0, 1, 0,
        10, 20, 1
      ])
    })

    it('should create scale matrix', () => {
      const matrix = createScaleMatrix(2, 3)
      expect(matrix).toEqual([
        2, 0, 0,
        0, 3, 0,
        0, 0, 1
      ])
    })

    it('should create rotation matrix for 0 degrees', () => {
      const matrix = createRotationMatrix(0)
      expect(matrix[0]).toBeCloseTo(1)
      expect(matrix[1]).toBeCloseTo(0)
      expect(matrix[3]).toBeCloseTo(0)
      expect(matrix[4]).toBeCloseTo(1)
    })

    it('should create orthographic projection matrix', () => {
      const matrix = createOrthoMatrix(800, 600)
      expect(matrix[0]).toBeCloseTo(2 / 800, 5)
      expect(matrix[4]).toBeCloseTo(-2 / 600, 5)
      expect(matrix[6]).toBe(-1)
      expect(matrix[7]).toBe(1)
    })
  })
})
