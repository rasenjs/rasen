/**
 * when 组件测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime, type ReactiveRuntime, type Ref } from '../reactive'
import { when } from './when'

// ============================================
// 测试辅助工具
// ============================================

function createMockReactiveRuntime(): ReactiveRuntime & {
  triggerWatchers: () => void
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const watchers: Array<{
    source: () => unknown
    callback: (value: unknown, oldValue: unknown) => void
  }> = []

  const refs = new WeakSet<{ value: unknown }>()

  return {
    ref: <T>(value: T): Ref<T> => {
      const r = { value }
      refs.add(r)
      return r
    },

    computed: <T>(getter: () => T) => ({
      get value() {
        return getter()
      }
    }),

    watch: <T>(
      source: () => T,
      callback: (value: T, oldValue: T) => void,
      options?: { immediate?: boolean }
    ) => {
      const watcher = {
        source: source as () => unknown,
        callback: callback as (value: unknown, oldValue: unknown) => void
      }
      watchers.push(watcher)

      if (options?.immediate) {
        callback(source(), undefined as T)
      }

      return () => {
        const index = watchers.indexOf(watcher)
        if (index > -1) watchers.splice(index, 1)
      }
    },

    effectScope: () => ({
      run: <T>(fn: () => T) => fn(),
      stop: () => {}
    }),

    unref: <T>(value: T | Ref<T> | { readonly value: T }) => {
      if (value && typeof value === 'object' && 'value' in value) {
        return (value as Ref<T>).value
      }
      return value as T
    },

    isRef: (value: unknown): boolean => {
      return (
        value !== null &&
        typeof value === 'object' &&
        refs.has(value as { value: unknown })
      )
    },

    triggerWatchers: () => {
      for (const watcher of [...watchers]) {
        const newValue = watcher.source()
        watcher.callback(newValue, undefined)
      }
    }
  }
}

describe('when', () => {
  let runtime: ReturnType<typeof createMockReactiveRuntime>

  beforeEach(() => {
    runtime = createMockReactiveRuntime()
    setReactiveRuntime(runtime)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('条件渲染', () => {
    it('条件为 true 时应该渲染 then 分支', () => {
      const thenMounted = vi.fn()
      const elseMounted = vi.fn()

      const result = when({
        condition: true,
        then: () => (() => {
          thenMounted()
          return () => {}
        }),
        else: () => (() => {
          elseMounted()
          return () => {}
        })
      })

      result({})

      expect(thenMounted).toHaveBeenCalled()
      expect(elseMounted).not.toHaveBeenCalled()
    })

    it('条件为 false 时应该渲染 else 分支', () => {
      const thenMounted = vi.fn()
      const elseMounted = vi.fn()

      const result = when({
        condition: false,
        then: () => (() => {
          thenMounted()
          return () => {}
        }),
        else: () => (() => {
          elseMounted()
          return () => {}
        })
      })

      result({})

      expect(thenMounted).not.toHaveBeenCalled()
      expect(elseMounted).toHaveBeenCalled()
    })

    it('没有 else 分支且条件为 false 时不应该渲染', () => {
      const thenMounted = vi.fn()

      const result = when({
        condition: false,
        then: () => (() => {
          thenMounted()
          return () => {}
        })
      })

      result({})

      expect(thenMounted).not.toHaveBeenCalled()
    })
  })

  describe('响应式条件', () => {
    it('应该支持 Ref 类型的条件', () => {
      const condition = runtime.ref(true)
      const thenMounted = vi.fn()

      const result = when({
        condition,
        then: () => (() => {
          thenMounted()
          return () => {}
        })
      })

      result({})

      expect(thenMounted).toHaveBeenCalled()
    })

    it('应该支持 computed 类型的条件', () => {
      const value = runtime.ref(10)
      const condition = runtime.computed(() => value.value > 5)
      const thenMounted = vi.fn()

      const result = when({
        condition,
        then: () => (() => {
          thenMounted()
          return () => {}
        })
      })

      result({})

      expect(thenMounted).toHaveBeenCalled()
    })
  })

  describe('unmount', () => {
    it('unmount 时应该清理子组件', () => {
      const childUnmounted = vi.fn()

      const result = when({
        condition: true,
        then: () => (() => {
          return () => childUnmounted()
        })
      })

      const unmount = result({})
      expect(childUnmounted).not.toHaveBeenCalled()

      unmount?.()
      expect(childUnmounted).toHaveBeenCalled()
    })

    it('条件为 false 时 unmount 也应该正常工作', () => {
      const result = when({
        condition: false,
        then: () => (() => {
          return () => {}
        })
      })

      const unmount = result({})
      expect(() => unmount?.()).not.toThrow()
    })
  })

  describe('host 传递', () => {
    it('应该将 host 传递给子组件', () => {
      const receivedHost: unknown[] = []
      const testHost = { id: 'test' }

      const result = when({
        condition: true,
        then: () => ((host: unknown) => {
          receivedHost.push(host)
          return () => {}
        })
      })

      result(testHost)

      // when 可能会创建代理 host，所以我们只检查是否收到了 host
      expect(receivedHost.length).toBe(1)
    })
  })
})
