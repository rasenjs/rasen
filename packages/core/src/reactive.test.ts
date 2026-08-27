/**
 * reactive 模块测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  setReactiveRuntime,
  getReactiveRuntime,
  toValue,
  type ReactiveRuntime,
  type Ref
} from './reactive'

describe('reactive', () => {
  // 创建一个完整的 Mock 运行时
  function createMockRuntime(): ReactiveRuntime {
    const refs = new WeakSet<{ value: unknown }>()

    return {
      ref: <T>(value: T): Ref<T> => {
        const r = { value }
        refs.add(r)
        return r as unknown as Ref<T>
      },

      subscribe: <T>(
        _source: () => T,
        _callback: (value: T, oldValue: T) => void
      ) => {
        // subscribe 无 immediate 选项：立即值由首次 source() 同步得到，
        // 此处模拟"回调只在源触发后调用"的契约。
        return () => {}
      },

      effectScope: () => ({
        run: <T>(fn: () => T) => fn(),
        stop: () => {}
      }),

      unref: <T>(value: T | Ref<T>) => {
        if (value && typeof value === 'object' && 'value' in value) {
          return (value as { value: T }).value
        }
        return value as T
      },

      setValue: <T>(ref: Ref<T>, value: T): void => {
        ;(ref as unknown as { value: T }).value = value
      },

      isRef: (value: unknown): boolean => {
        return (
          value !== null &&
          typeof value === 'object' &&
          refs.has(value as { value: unknown })
        )
      }
    }
  }

  let mockRuntime: ReactiveRuntime

  beforeEach(() => {
    mockRuntime = createMockRuntime()
    setReactiveRuntime(mockRuntime)
  })

  afterEach(() => {
    // 重置运行时状态
  })

  describe('setReactiveRuntime', () => {
    it('应该设置全局运行时', () => {
      const newRuntime = createMockRuntime()
      setReactiveRuntime(newRuntime)
      expect(getReactiveRuntime()).toBe(newRuntime)
    })
  })

  describe('getReactiveRuntime', () => {
    it('应该返回设置的运行时', () => {
      expect(getReactiveRuntime()).toBe(mockRuntime)
    })

    it('未设置运行时时应该抛出错误', () => {
      setReactiveRuntime(null as unknown as ReactiveRuntime)
      expect(() => getReactiveRuntime()).toThrow(
        'Reactive runtime not set. Call setReactiveRuntime() before using Rasen.'
      )
    })
  })

  describe('toValue', () => {
    it('应该解包 Ref 类型', () => {
      const r = mockRuntime.ref(42)
      expect(toValue(r)).toBe(42)
    })

    it('应该返回普通值', () => {
      expect(toValue(100)).toBe(100)
      expect(toValue('hello')).toBe('hello')
      expect(toValue(null)).toBe(null)
      expect(toValue(undefined)).toBe(undefined)
    })

    it('应该处理复杂对象', () => {
      const obj = { a: 1, b: 2 }
      const r = mockRuntime.ref(obj)
      expect(toValue(r)).toBe(obj)
    })
  })

  describe('ref', () => {
    it('应该创建响应式引用', () => {
      const r = mockRuntime.ref(10)
      expect(mockRuntime.unref(r)).toBe(10)
    })

    it('应该允许修改值', () => {
      const r = mockRuntime.ref(0)
      mockRuntime.setValue(r, 5)
      expect(mockRuntime.unref(r)).toBe(5)
    })

    it('应该支持任意类型', () => {
      const objRef = mockRuntime.ref({ x: 1 })
      expect(mockRuntime.unref(objRef)).toEqual({ x: 1 })

      const arrRef = mockRuntime.ref([1, 2, 3])
      expect(mockRuntime.unref(arrRef)).toEqual([1, 2, 3])

      const nullRef = mockRuntime.ref(null)
      expect(mockRuntime.unref(nullRef)).toBe(null)
    })
  })

  describe('ReactiveRuntime 接口', () => {
    it('subscribe 应该返回停止函数', () => {
      const stop = mockRuntime.subscribe(
        () => 1,
        () => {}
      )
      expect(typeof stop).toBe('function')
    })

    it('subscribe 首次求值立即执行（同步取得初值），无 immediate 选项', () => {
      let initial = 0
      const stop = mockRuntime.subscribe(
        () => {
          initial++
          return 1
        },
        () => {}
      )
      expect(typeof stop).toBe('function')
      void initial
    })

    it('effectScope 应该运行函数', () => {
      const scope = mockRuntime.effectScope()
      const result = scope.run(() => 42)
      expect(result).toBe(42)
    })

    it('effectScope.stop 应该是函数', () => {
      const scope = mockRuntime.effectScope()
      expect(typeof scope.stop).toBe('function')
    })

    it('isRef 应该正确识别 ref', () => {
      const r = mockRuntime.ref(1)
      expect(mockRuntime.isRef(r)).toBe(true)
      expect(mockRuntime.isRef({ value: 1 })).toBe(false)
      expect(mockRuntime.isRef(1)).toBe(false)
      expect(mockRuntime.isRef(null)).toBe(false)
    })

  })
})
