/**
 * reactive 模块测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  setReactiveRuntime,
  getReactiveRuntime,
  toValue,
  unref,
  setValue,
  ref,
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
        return r
      },

      computed: <T>(getter: () => T) => {
        const c = {
          get value() {
            return getter()
          }
        }
        refs.add(c)
        return c
      },

      watch: <T>(
        source: () => T,
        callback: (value: T, oldValue: T) => void,
        options?: { immediate?: boolean }
      ) => {
        if (options?.immediate) {
          callback(source(), undefined as T)
        }
        return () => {}
      },

      effectScope: () => ({
        run: <T>(fn: () => T) => fn(),
        stop: () => {}
      }),

      unref: <T>(value: T | Ref<T> | { readonly value: T }) => {
        if (value && typeof value === 'object' && 'value' in value) {
          return (value as { value: T }).value
        }
        return value as T
      },

      setValue: <T>(ref: Ref<T>, value: T): void => {
        ;(ref as { value: T }).value = value
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

    it('应该解包 computed 值', () => {
      const r = mockRuntime.ref(10)
      const c = mockRuntime.computed(() => unref(r) * 2)
      expect(toValue(c)).toBe(20)
    })

    it('应该处理复杂对象', () => {
      const obj = { a: 1, b: 2 }
      const r = mockRuntime.ref(obj)
      expect(toValue(r)).toBe(obj)
    })
  })

  describe('ref', () => {
    it('应该创建响应式引用', () => {
      const r = ref(10)
      expect(unref(r)).toBe(10)
    })

    it('应该允许修改值', () => {
      const r = ref(0)
      setValue(r, 5)
      expect(unref(r)).toBe(5)
    })

    it('应该支持任意类型', () => {
      const objRef = ref({ x: 1 })
      expect(unref(objRef)).toEqual({ x: 1 })

      const arrRef = ref([1, 2, 3])
      expect(unref(arrRef)).toEqual([1, 2, 3])

      const nullRef = ref(null)
      expect(unref(nullRef)).toBe(null)
    })
  })

  describe('ReactiveRuntime 接口', () => {
    it('watch 应该支持 immediate 选项', () => {
      let called = false
      mockRuntime.watch(
        () => 1,
        () => {
          called = true
        },
        { immediate: true }
      )
      expect(called).toBe(true)
    })

    it('watch 应该返回停止函数', () => {
      const stop = mockRuntime.watch(
        () => 1,
        () => {}
      )
      expect(typeof stop).toBe('function')
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

    it('computed 应该正确计算值', () => {
      const r = mockRuntime.ref(5)
      const c = mockRuntime.computed(() => unref(r) + 10)
      expect(unref(c)).toBe(15)

      setValue(r, 10)
      expect(unref(c)).toBe(20)
    })
  })
})
