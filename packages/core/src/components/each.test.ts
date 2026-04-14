/**
 * each 组件测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime, type ReactiveRuntime, type Ref } from '../reactive'
import { each, repeat } from './each'
import { when } from './when'

// ============================================
// 测试辅助工具
// ============================================

function createMockReactiveRuntime(): ReactiveRuntime & {
  triggerWatchers: () => void
  markReactive: (obj: object) => void
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const watchers: Array<{
    source: () => unknown
    callback: (value: unknown, oldValue: unknown) => void
  }> = []

  const refs = new WeakSet<{ value: unknown }>()
  const reactiveObjects = new WeakSet<object>()

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
      const sourceFn = typeof source === 'function' ? source : () => source
      const watcher = {
        source: sourceFn as () => unknown,
        callback: callback as (value: unknown, oldValue: unknown) => void
      }
      watchers.push(watcher)

      if (options?.immediate) {
        callback(sourceFn(), undefined as T)
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

    isReactive: <T extends object>(value: T): boolean => {
      return reactiveObjects.has(value)
    },

    markReactive: (obj: object) => {
      reactiveObjects.add(obj)
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

  describe('reactive 数组内部变化', () => {
    it('当 reactive 数组 push 时应该触发更新', () => {
      const items = [{ id: 1 }] as { id: number }[]
      runtime.markReactive(items)
      const mounted: number[] = []

      const eachMountable = each(items, (item) =>
        (() => {
          mounted.push(item.id)
          return () => {}
        })
      )

      eachMountable({})
      expect(mounted).toEqual([1])

      items.push({ id: 2 })
      runtime.triggerWatchers()

      expect(mounted).toEqual([1, 2])
    })

    it('当 reactive 数组 splice 时应该触发更新', () => {
      const items = [{ id: 1 }, { id: 2 }, { id: 3 }] as { id: number }[]
      runtime.markReactive(items)
      const unmounted: number[] = []

      const eachMountable = each(items, (item) =>
        (() => {
          return () => unmounted.push(item.id)
        })
      )

      eachMountable({})
      expect(unmounted).toEqual([])

      items.splice(1, 1)
      runtime.triggerWatchers()

      expect(unmounted).toEqual([2])
    })

    it('当 reactive 数组替换 item 时应该触发更新', () => {
      const items = [{ id: 1 }] as { id: number }[]
      runtime.markReactive(items)
      const unmounted: number[] = []
      const mounted: number[] = []

      const eachMountable = each(items, (item) =>
        (() => {
          mounted.push(item.id)
          return () => unmounted.push(item.id)
        })
      )

      eachMountable({})
      expect(mounted).toEqual([1])

      items[0] = { id: 2 }
      runtime.triggerWatchers()

      expect(unmounted).toEqual([1])
      expect(mounted).toEqual([1, 2])
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

describe('each + when 嵌套', () => {
  let runtime: ReturnType<typeof createMockReactiveRuntime>

  beforeEach(() => {
    runtime = createMockReactiveRuntime()
    setReactiveRuntime(runtime)
  })

  it('when condition 变成 false 时应该 unmount when 内部的组件', () => {
    const items = [
      { id: 1, visible: true },
      { id: 2, visible: true }
    ]
    const unmounted: number[] = []

    const eachMountable = each(items, (item) =>
      when({
        condition: () => item.visible,
        then: () => (() => {
          return () => unmounted.push(item.id)
        })
      })
    )

    eachMountable({})
    expect(unmounted).toEqual([])

    items[1].visible = false
    runtime.triggerWatchers()

    expect(unmounted).toEqual([2])
  })

  it('item 从列表移除时应该 unmount', () => {
    const items = [
      { id: 1 },
      { id: 2 }
    ]
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

  it('复现场景：showDetail 从 false->true->false，detail 应该正确显示和隐藏', () => {
    const items = [
      { id: 1, name: 'Item 1', showDetail: false },
      { id: 2, name: 'Item 2', showDetail: false }
    ]
    const detailMounted: number[] = []
    const detailUnmounted: number[] = []

    const eachMountable = each(items, (item) =>
      when({
        condition: () => item.showDetail,
        then: () => (() => {
          detailMounted.push(item.id)
          return () => detailUnmounted.push(item.id)
        })
      })
    )

    const host = {}
    eachMountable(host)

    expect(detailMounted).toEqual([])
    expect(detailUnmounted).toEqual([])

    items[0].showDetail = true
    runtime.triggerWatchers()
    expect(detailMounted).toEqual([1])
    expect(detailUnmounted).toEqual([])

    items[0].showDetail = false
    runtime.triggerWatchers()
    expect(detailMounted).toEqual([1])
    expect(detailUnmounted).toEqual([1])
  })

  it('复现场景：切换多个 item 的 showDetail', () => {
    const items = [
      { id: 1, showDetail: false },
      { id: 2, showDetail: false }
    ]
    const detailUnmounted: number[] = []

    const eachMountable = each(items, (item) =>
      when({
        condition: () => item.showDetail,
        then: () => (() => () => detailUnmounted.push(item.id))
      })
    )

    eachMountable({})

    items[0].showDetail = true
    runtime.triggerWatchers()

    items[1].showDetail = true
    runtime.triggerWatchers()

    expect(detailUnmounted).toEqual([])

    items[0].showDetail = false
    runtime.triggerWatchers()
    expect(detailUnmounted).toEqual([1])

    items[1].showDetail = false
    runtime.triggerWatchers()
    expect(detailUnmounted).toEqual([1, 2])
  })

  it('复现场景：div 内部嵌套 when()，条件变化时应该正确清理', () => {
    const items = [
      { id: 1, name: 'Item 1', showDetail: false },
      { id: 2, name: 'Item 2', showDetail: false }
    ]

    const mounted: number[] = []
    const unmounted: number[] = []

    const eachMountable = each(items, (item) =>
      when({
        condition: () => item.showDetail,
        then: () => (() => {
          mounted.push(item.id)
          return () => unmounted.push(item.id)
        })
      })
    )

    eachMountable({})

    expect(mounted).toEqual([])
    expect(unmounted).toEqual([])

    items[0].showDetail = true
    runtime.triggerWatchers()

    expect(mounted).toEqual([1])
    expect(unmounted).toEqual([])

    items[0].showDetail = false
    runtime.triggerWatchers()

    expect(mounted).toEqual([1])
    expect(unmounted).toEqual([1])
  })

  it('复现场景：同一个 item 内部有多个 when()，应该各自独立工作', () => {
    const items = [
      { id: 1, showA: false, showB: false }
    ]

    const mountedA: number[] = []
    const mountedB: number[] = []
    const unmountedA: number[] = []
    const unmountedB: number[] = []

    // 同一个 item 内部有两个 when
    const eachMountable = each(items, (item) => {
      const whenA = when({
        condition: () => item.showA,
        then: () => (() => {
          mountedA.push(item.id)
          return () => unmountedA.push(item.id)
        })
      })

      const whenB = when({
        condition: () => item.showB,
        then: () => (() => {
          mountedB.push(item.id)
          return () => unmountedB.push(item.id)
        })
      })

      return (host: unknown) => {
        const unmountA = whenA(host)
        const unmountB = whenB(host)
        return () => {
          unmountA?.()
          unmountB?.()
        }
      }
    })

    eachMountable({})

    expect(mountedA).toEqual([])
    expect(mountedB).toEqual([])

    items[0].showA = true
    runtime.triggerWatchers()

    expect(mountedA).toEqual([1])
    expect(mountedB).toEqual([])

    items[0].showB = true
    runtime.triggerWatchers()

    expect(mountedA).toEqual([1])
    expect(mountedB).toEqual([1])

    items[0].showA = false
    runtime.triggerWatchers()

    expect(unmountedA).toEqual([1])
    expect(unmountedB).toEqual([])

    items[0].showB = false
    runtime.triggerWatchers()

    expect(unmountedB).toEqual([1])
  })

  it('复现场景：each + 多个 when，验证 DOM 分支不会残留', () => {
    const items = [
      { id: 1, showA: false, showB: false },
      { id: 2, showA: false, showB: false }
    ]

    const unmountedA: number[] = []
    const unmountedB: number[] = []

    const eachMountable = each(items, (item) => {
      const whenA = when({
        condition: () => item.showA,
        then: () => (() => () => unmountedA.push(item.id))
      })

      const whenB = when({
        condition: () => item.showB,
        then: () => (() => () => unmountedB.push(item.id))
      })

      return (host: unknown) => {
        const unmountA = whenA(host)
        const unmountB = whenB(host)
        return () => {
          unmountA?.()
          unmountB?.()
        }
      }
    })

    eachMountable({})

    items[0].showA = true
    items[1].showA = true
    runtime.triggerWatchers()
    expect(unmountedA).toEqual([])

    items[0].showA = false
    runtime.triggerWatchers()
    expect(unmountedA).toEqual([1])

    items[1].showA = false
    runtime.triggerWatchers()
    expect(unmountedA).toEqual([1, 2])
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
