/**
 * each 组件测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime, type ReactiveRuntime, type Ref } from '../reactive'
import { each, repeat } from './each'

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

describe('each', () => {
  let runtime: ReturnType<typeof createMockReactiveRuntime>

  beforeEach(() => {
    runtime = createMockReactiveRuntime()
    setReactiveRuntime(runtime)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('基础渲染', () => {
    it('应该为每个对象渲染组件', () => {
      const items = [{ id: 1 }, { id: 2 }, { id: 3 }]
      const mounted: number[] = []

      const eachMountable = each(items, (item) =>
        (() => {
          mounted.push(item.id)
          return () => {}
        })
      )

      eachMountable({})
      expect(mounted).toEqual([1, 2, 3])
    })

    it('应该传递正确的索引', () => {
      const items = [{ name: 'a' }, { name: 'b' }]
      const indices: number[] = []

      const eachMountable = each(items, (_, index) =>
        (() => {
          indices.push(index)
          return () => {}
        })
      )

      eachMountable({})
      expect(indices).toEqual([0, 1])
    })

    it('应该支持空数组', () => {
      const items: { id: number }[] = []
      const mounted: number[] = []

      const eachMountable = each(items, (item) =>
        (() => {
          mounted.push(item.id)
          return () => {}
        })
      )

      eachMountable({})
      expect(mounted).toEqual([])
    })
  })

  describe('响应式支持', () => {
    it('应该支持 Ref 类型的数组', () => {
      const items = runtime.ref([{ id: 1 }, { id: 2 }])
      const mounted: number[] = []

      const eachMountable = each(items, (item) =>
        (() => {
          mounted.push(item.id)
          return () => {}
        })
      )

      eachMountable({})
      expect(mounted).toEqual([1, 2])
    })

    it('应该支持 getter 函数', () => {
      const items = [{ id: 1 }]
      const mounted: number[] = []

      const eachMountable = each(
        () => items,
        (item) =>
          (() => {
            mounted.push(item.id)
            return () => {}
          })
      )

      eachMountable({})
      expect(mounted).toEqual([1])
    })
  })

  describe('unmount', () => {
    it('应该在 unmount 时清理所有子组件', () => {
      const items = [{ id: 1 }, { id: 2 }]
      const unmounted: number[] = []

      const eachMountable = each(items, (item) =>
        (() => {
          return () => unmounted.push(item.id)
        })
      )

      const cleanup = eachMountable({})
      expect(unmounted).toEqual([])

      cleanup?.()
      expect(unmounted).toEqual([1, 2])
    })
  })
})

describe('repeat', () => {
  let runtime: ReturnType<typeof createMockReactiveRuntime>

  beforeEach(() => {
    runtime = createMockReactiveRuntime()
    setReactiveRuntime(runtime)
  })

  describe('数量模式', () => {
    it('应该根据数量渲染组件', () => {
      const count = runtime.ref(3)
      const mounted: number[] = []

      const repeatMountable = repeat(count, (index) =>
        (() => {
          mounted.push(index)
          return () => {}
        })
      )

      repeatMountable({})
      expect(mounted).toEqual([0, 1, 2])
    })

    it('应该支持 getter 函数', () => {
      const mounted: number[] = []

      const repeatMountable = repeat(
        () => 2,
        (index) =>
          (() => {
            mounted.push(index)
            return () => {}
          })
      )

      repeatMountable({})
      expect(mounted).toEqual([0, 1])
    })

    it('数量为 0 时不应该渲染', () => {
      const count = runtime.ref(0)
      const mounted: number[] = []

      const repeatMountable = repeat(count, (index) =>
        (() => {
          mounted.push(index)
          return () => {}
        })
      )

      repeatMountable({})
      expect(mounted).toEqual([])
    })
  })

  describe('值数组模式', () => {
    it('应该渲染值数组', () => {
      const items = runtime.ref(['a', 'b', 'c'])
      const mounted: string[] = []

      const repeatMountable = repeat(items, (item) =>
        (() => {
          mounted.push(item)
          return () => {}
        })
      )

      repeatMountable({})
      expect(mounted).toEqual(['a', 'b', 'c'])
    })

    it('应该支持 getter 返回数组', () => {
      const items = ['x', 'y']
      const mounted: string[] = []

      const repeatMountable = repeat(
        () => items,
        (item) =>
          (() => {
            mounted.push(item)
            return () => {}
          })
      )

      repeatMountable({})
      expect(mounted).toEqual(['x', 'y'])
    })
  })

  describe('unmount', () => {
    it('应该在 unmount 时清理所有子组件', () => {
      const count = runtime.ref(2)
      const unmounted: number[] = []

      const repeatMountable = repeat(count, (index) =>
        (() => {
          return () => unmounted.push(index)
        })
      )

      const cleanup = repeatMountable({})
      expect(unmounted).toEqual([])

      cleanup?.()
      expect(unmounted).toEqual([0, 1])
    })
  })
})
