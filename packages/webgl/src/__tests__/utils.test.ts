/**
 * Utils tests
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { ref } from '@vue/reactivity'
import { 
  parseColor, 
  createIdentityMatrix, 
  createTranslationMatrix,
  createScaleMatrix,
  createRotationMatrix,
  createOrthoMatrix,
  unref
} from '../utils'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import type { MaybeRef } from '../types'

describe('@rasenjs/webgl utils', () => {
  // unref 依赖全局响应式运行时（isRef 判定），测试文件隔离后需自行安装
  beforeAll(() => {
    useReactiveRuntime()
  })

  describe('unref', () => {
    it('should return plain value as-is', () => {
      expect(unref(42)).toBe(42)
      expect(unref('hello')).toBe('hello')
      expect(unref(true)).toBe(true)
    })

    it('should unwrap ref object', () => {
      const r = ref(42)
      expect(unref(r)).toBe(42)
    })

    it('should return plain objects as-is (Vue unref semantics)', () => {
      expect(unref({ value: 42 } as unknown as MaybeRef<number>)).toEqual({ value: 42 })
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
      const color = parseColor('not-a-color')
      expect(color).toEqual({ r: 1, g: 1, b: 1, a: 1 })
    })

    it('should parse rgba format', () => {
      const color = parseColor('rgba(255, 128, 64, 0.5)')
      expect(color.r).toBeCloseTo(1, 2)
      expect(color.g).toBeCloseTo(0.502, 2)
      expect(color.b).toBeCloseTo(0.251, 2)
      expect(color.a).toBe(0.5)
    })

    it('should parse rgb format', () => {
      const color = parseColor('rgb(255, 128, 64)')
      expect(color.r).toBeCloseTo(1, 2)
      expect(color.g).toBeCloseTo(0.502, 2)
      expect(color.b).toBeCloseTo(0.251, 2)
      expect(color.a).toBe(1)
    })

    it('should parse rgba with spaces', () => {
      const color = parseColor('rgba( 255, 128, 64, 0.75 )')
      expect(color.r).toBeCloseTo(1, 2)
      expect(color.g).toBeCloseTo(0.502, 2)
      expect(color.b).toBeCloseTo(0.251, 2)
      expect(color.a).toBe(0.75)
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
      expect(Array.from(matrix)).toEqual([
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
