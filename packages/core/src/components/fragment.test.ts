/**
 * fragment 组件测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime, type ReactiveRuntime, type Ref } from '../reactive'
import { fragment } from './fragment'
import type { MountFunction } from '../types'

// ============================================
// 测试辅助工具
// ============================================

function createMockReactiveRuntime(): ReactiveRuntime {
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
    }
  }
}

describe('fragment', () => {
  beforeEach(() => {
    setReactiveRuntime(createMockReactiveRuntime())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('基础功能', () => {
    it('应该挂载所有子组件', () => {
      const mountCalls: string[] = []

      const child1: MountFunction<unknown> = () => {
        mountCalls.push('child1')
        return () => {}
      }

      const child2: MountFunction<unknown> = () => {
        mountCalls.push('child2')
        return () => {}
      }

      const mount = fragment({ children: [child1, child2] })
      mount({})

      expect(mountCalls).toEqual(['child1', 'child2'])
    })

    it('应该按顺序挂载子组件', () => {
      const order: number[] = []

      const children = [1, 2, 3, 4, 5].map(
        (n): MountFunction<unknown> =>
          () => {
            order.push(n)
            return () => {}
          }
      )

      const mount = fragment({ children })
      mount({})

      expect(order).toEqual([1, 2, 3, 4, 5])
    })

    it('应该支持空子组件列表', () => {
      const mount = fragment({ children: [] })
      const unmount = mount({})

      expect(unmount).toBeDefined()
      expect(() => unmount?.()).not.toThrow()
    })
  })

  describe('host 传递', () => {
    it('应该将相同的 host 传递给所有子组件', () => {
      const receivedHosts: unknown[] = []
      const testHost = { id: 'shared-host' }

      const child: MountFunction<{ id: string }> = (host) => {
        receivedHosts.push(host)
        return () => {}
      }

      const mount = fragment({ children: [child, child, child] })
      mount(testHost)

      expect(receivedHosts).toEqual([testHost, testHost, testHost])
    })

    it('应该支持复杂的 host 类型', () => {
      interface ComplexHost {
        element: { tagName: string }
        context: Map<string, unknown>
      }

      const receivedHost: ComplexHost[] = []
      const testHost: ComplexHost = {
        element: { tagName: 'DIV' },
        context: new Map([['key', 'value']])
      }

      const child: MountFunction<ComplexHost> = (host) => {
        receivedHost.push(host)
        return () => {}
      }

      const mount = fragment({ children: [child] })
      mount(testHost)

      expect(receivedHost[0]).toBe(testHost)
    })
  })

  describe('unmount', () => {
    it('应该在 unmount 时清理所有子组件', () => {
      const unmountCalls: string[] = []

      const child1: MountFunction<unknown> = () => {
        return () => unmountCalls.push('child1')
      }

      const child2: MountFunction<unknown> = () => {
        return () => unmountCalls.push('child2')
      }

      const mount = fragment({ children: [child1, child2] })
      const unmount = mount({})

      expect(unmountCalls).toEqual([])

      unmount?.()
      expect(unmountCalls).toEqual(['child1', 'child2'])
    })

    it('应该按顺序调用 unmount', () => {
      const order: number[] = []

      const children = [1, 2, 3].map(
        (n): MountFunction<unknown> =>
          () => {
            return () => order.push(n)
          }
      )

      const mount = fragment({ children })
      const unmount = mount({})

      unmount?.()
      expect(order).toEqual([1, 2, 3])
    })

    it('应该处理子组件返回 undefined 的情况', () => {
      const child1: MountFunction<unknown> = () => {
        return undefined
      }

      const child2: MountFunction<unknown> = () => {
        return () => {}
      }

      const mount = fragment({ children: [child1, child2] })
      const unmount = mount({})

      expect(() => unmount?.()).not.toThrow()
    })
  })

  describe('嵌套 fragment', () => {
    it('应该支持嵌套的 fragment', () => {
      const mountOrder: string[] = []

      const innerChild: MountFunction<unknown> = () => {
        mountOrder.push('inner')
        return () => {}
      }

      const innerFragment = fragment({ children: [innerChild, innerChild] })

      const outerChild: MountFunction<unknown> = () => {
        mountOrder.push('outer')
        return () => {}
      }

      const outerFragment = fragment({
        children: [outerChild, innerFragment, outerChild]
      })

      outerFragment({})

      expect(mountOrder).toEqual(['outer', 'inner', 'inner', 'outer'])
    })
  })
})
