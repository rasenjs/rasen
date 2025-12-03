/**
 * @rasenjs/core 测试套件
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  setReactiveRuntime,
  getReactiveRuntime,
  unrefValue,
  fragment,
  each,
  repeat,
  when,
  type ReactiveRuntime,
  type MountFunction,
  type Ref
} from './index'

// ============================================
// 测试辅助工具
// ============================================

/**
 * 创建 Mock 响应式运行时
 */
function createMockReactiveRuntime(): ReactiveRuntime {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const watchers: Array<{
    source: () => unknown
    callback: (value: unknown, oldValue: unknown) => void
    options?: { immediate?: boolean; deep?: boolean }
  }> = []

  const refs = new WeakSet<{ value: unknown }>()

  const runtime: ReactiveRuntime = {
    ref: <T>(value: T): Ref<T> => {
      const r = { value }
      refs.add(r)
      return r
    },

    computed: <T>(getter: () => T) => {
      return {
        get value() {
          return getter()
        }
      }
    },

    watch: <T>(
      source: () => T,
      callback: (value: T, oldValue: T) => void,
      options?: { immediate?: boolean; deep?: boolean }
    ) => {
      const watcher = {
        source: source as () => unknown,
        callback: callback as (value: unknown, oldValue: unknown) => void,
        options
      }
      watchers.push(watcher)

      // 初始调用
      if (options?.immediate) {
        const value = source()
        callback(value, undefined as T)
      }

      return () => {
        const index = watchers.indexOf(watcher)
        if (index > -1) {
          watchers.splice(index, 1)
        }
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
      return value !== null && typeof value === 'object' && refs.has(value as { value: unknown })
    }
  }

  // 添加触发方法用于测试
  ;(runtime as MockReactiveRuntime).triggerWatchers = () => {
    for (const watcher of watchers) {
      const newValue = watcher.source()
      watcher.callback(newValue, undefined)
    }
  }

  return runtime
}

interface MockReactiveRuntime extends ReactiveRuntime {
  triggerWatchers: () => void
}

// ============================================
// 响应式运行时测试
// ============================================

describe('@rasenjs/core', () => {
  let mockRuntime: MockReactiveRuntime

  beforeEach(() => {
    mockRuntime = createMockReactiveRuntime() as MockReactiveRuntime
    setReactiveRuntime(mockRuntime)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('setReactiveRuntime / getReactiveRuntime', () => {
    it('应该能设置和获取响应式运行时', () => {
      const runtime = getReactiveRuntime()
      expect(runtime).toBe(mockRuntime)
    })

    it('在没有设置运行时时应该抛出错误', () => {
      // 重置运行时
      setReactiveRuntime(null as unknown as ReactiveRuntime)
      expect(() => getReactiveRuntime()).toThrow()
    })
  })

  describe('unrefValue', () => {
    it('应该解包 Ref 类型', () => {
      const ref = mockRuntime.ref(42)
      expect(unrefValue(ref)).toBe(42)
    })

    it('应该返回普通值', () => {
      expect(unrefValue(100)).toBe(100)
      expect(unrefValue('hello')).toBe('hello')
    })

    it('应该返回 computed 的值', () => {
      const ref = mockRuntime.ref(10)
      const computed = mockRuntime.computed(() => ref.value * 2)
      expect(unrefValue(computed)).toBe(20)
    })
  })

  // ============================================
  // fragment 组件测试
  // ============================================

  describe('fragment', () => {
    it('应该挂载所有子组件', () => {
      const mountCalls: string[] = []
      const unmountCalls: string[] = []

      const child1 = (() => {
        mountCalls.push('child1')
        return () => unmountCalls.push('child1')
      })

      const child2 = (() => {
        mountCalls.push('child2')
        return () => unmountCalls.push('child2')
      })

      const frag = fragment({ children: [child1, child2] })
      const cleanup = frag({})

      expect(mountCalls).toEqual(['child1', 'child2'])
      expect(unmountCalls).toEqual([])

      cleanup?.()
      expect(unmountCalls).toEqual(['child1', 'child2'])
    })

    it('应该支持空子组件列表', () => {
      const frag = fragment({ children: [] })
      const cleanup = frag({})
      expect(cleanup).toBeDefined()
      cleanup?.()
    })

    it('应该传递正确的 host 给子组件', () => {
      const receivedHosts: unknown[] = []

      const child = ((host: { id: string }) => {
        receivedHosts.push(host)
        return () => {}
      })

      const testHost = { id: 'test-host' }
      const frag = fragment({ children: [child, child] })
      frag(testHost)

      expect(receivedHosts).toEqual([testHost, testHost])
    })
  })

  // ============================================
  // when 组件测试
  // ============================================

  describe('when', () => {
    it('当条件为 true 时应该渲染 then 分支', () => {
      const thenMounted = vi.fn()
      const elseMounted = vi.fn()

      const whenMountable = when({
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

      whenMountable({})

      expect(thenMounted).toHaveBeenCalled()
      expect(elseMounted).not.toHaveBeenCalled()
    })

    it('当条件为 false 时应该渲染 else 分支', () => {
      const thenMounted = vi.fn()
      const elseMounted = vi.fn()

      const whenMountable = when({
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

      whenMountable({})

      expect(thenMounted).not.toHaveBeenCalled()
      expect(elseMounted).toHaveBeenCalled()
    })

    it('当没有 else 分支且条件为 false 时不应该渲染任何内容', () => {
      const thenMounted = vi.fn()

      const whenMountable = when({
        condition: false,
        then: () => (() => {
          thenMounted()
          return () => {}
        })
      })

      whenMountable({})

      expect(thenMounted).not.toHaveBeenCalled()
    })

    it('应该支持 Ref 类型的条件', () => {
      const condition = mockRuntime.ref(true)
      const thenMounted = vi.fn()

      const whenMountable = when({
        condition,
        then: () => (() => {
          thenMounted()
          return () => {}
        })
      })

      whenMountable({})

      expect(thenMounted).toHaveBeenCalled()
    })

    it('unmount 时应该清理子组件', () => {
      const childUnmounted = vi.fn()

      const whenMountable = when({
        condition: true,
        then: () => (() => {
          return () => childUnmounted()
        })
      })

      const unmount = whenMountable({})
      expect(childUnmounted).not.toHaveBeenCalled()

      unmount?.()
      expect(childUnmounted).toHaveBeenCalled()
    })
  })

  // ============================================
  // each 组件测试
  // ============================================

  describe('each', () => {
    it('应该为每个项目渲染组件', () => {
      const items = [{ id: 1 }, { id: 2 }, { id: 3 }]
      const mountedItems: number[] = []

      const eachMountable = each(items, (item) =>
        (() => {
          mountedItems.push(item.id)
          return () => {}
        })
      )

      eachMountable({})

      expect(mountedItems).toEqual([1, 2, 3])
    })

    it('应该支持 Ref 类型的数组', () => {
      const items = mockRuntime.ref([{ id: 1 }, { id: 2 }])
      const mountedItems: number[] = []

      const eachMountable = each(items, (item) =>
        (() => {
          mountedItems.push(item.id)
          return () => {}
        })
      )

      eachMountable({})

      expect(mountedItems).toEqual([1, 2])
    })

    it('应该支持 getter 函数', () => {
      const items = [{ id: 1 }, { id: 2 }]
      const mountedItems: number[] = []

      const eachMountable = each(
        () => items,
        (item) =>
          (() => {
            mountedItems.push(item.id)
            return () => {}
          })
      )

      eachMountable({})

      expect(mountedItems).toEqual([1, 2])
    })

    it('应该传递正确的 index', () => {
      const items = [{ name: 'a' }, { name: 'b' }, { name: 'c' }]
      const receivedIndices: number[] = []

      const eachMountable = each(items, (_, index) =>
        (() => {
          receivedIndices.push(index)
          return () => {}
        })
      )

      eachMountable({})

      expect(receivedIndices).toEqual([0, 1, 2])
    })

    it('unmount 时应该清理所有子组件', () => {
      const items = [{ id: 1 }, { id: 2 }]
      const unmountedItems: number[] = []

      const eachMountable = each(items, (item) =>
        (() => {
          return () => unmountedItems.push(item.id)
        })
      )

      const cleanup = eachMountable({})
      expect(unmountedItems).toEqual([])

      cleanup?.()
      expect(unmountedItems).toEqual([1, 2])
    })

    it('应该支持空数组', () => {
      const items: { id: number }[] = []
      const mountedItems: number[] = []

      const eachMountable = each(items, (item) =>
        (() => {
          mountedItems.push(item.id)
          return () => {}
        })
      )

      eachMountable({})

      expect(mountedItems).toEqual([])
    })
  })

  // ============================================
  // repeat 组件测试
  // ============================================

  describe('repeat', () => {
    it('应该根据数量渲染组件', () => {
      const count = mockRuntime.ref(3)
      const mountedIndices: number[] = []

      const repeatMountable = repeat(count, (index) =>
        (() => {
          mountedIndices.push(index)
          return () => {}
        })
      )

      repeatMountable({})

      expect(mountedIndices).toEqual([0, 1, 2])
    })

    it('应该支持值数组', () => {
      const items = mockRuntime.ref(['a', 'b', 'c'])
      const mountedItems: string[] = []

      const repeatMountable = repeat(items, (item) =>
        (() => {
          mountedItems.push(item)
          return () => {}
        })
      )

      repeatMountable({})

      expect(mountedItems).toEqual(['a', 'b', 'c'])
    })

    it('应该支持 getter 函数返回数量', () => {
      const mountedIndices: number[] = []

      const repeatMountable = repeat(
        () => 2,
        (index) =>
          (() => {
            mountedIndices.push(index)
            return () => {}
          })
      )

      repeatMountable({})

      expect(mountedIndices).toEqual([0, 1])
    })

    it('应该支持 getter 函数返回数组', () => {
      const items = ['x', 'y']
      const mountedItems: string[] = []

      const repeatMountable = repeat(
        () => items,
        (item) =>
          (() => {
            mountedItems.push(item)
            return () => {}
          })
      )

      repeatMountable({})

      expect(mountedItems).toEqual(['x', 'y'])
    })

    it('unmount 时应该清理所有子组件', () => {
      const count = mockRuntime.ref(2)
      const unmountedIndices: number[] = []

      const repeatMountable = repeat(count, (index) =>
        (() => {
          return () => unmountedIndices.push(index)
        })
      )

      const cleanup = repeatMountable({})
      expect(unmountedIndices).toEqual([])

      cleanup?.()
      expect(unmountedIndices).toEqual([0, 1])
    })
  })

  // ============================================
  // 类型导出测试
  // ============================================

  describe('类型导出', () => {
    it('应该导出核心类型', () => {
      // 通过 TypeScript 编译来验证类型导出
      const mountFn: MountFunction<HTMLElement> = () => () => {}
      const ref: Ref<number> = { value: 1 }

      expect(typeof mountFn).toBe('function')
      expect(ref.value).toBe(1)
    })
  })
})
