/**
 * fragment 组件测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime, getReactiveRuntime, type ReactiveRuntime, type Ref, type ReadonlyRef } from '../reactive'
import { fragment, type FragmentHostHooks } from './fragment'

// ============================================
// 测试辅助工具
// ============================================

function createMockReactiveRuntime(): ReactiveRuntime {
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
      return () => {}
    },

    computed: <T>(getter: () => T) =>
      ({
        get value() {
          return getter()
        }
      } as unknown as ReadonlyRef<T>),

    effectScope: () => ({
      run: <T>(fn: () => T) => fn(),
      stop: () => {}
    }),

    unref: <T>(value: T | Ref<T> | ReadonlyRef<T>) => {
      if (value && typeof value === 'object' && 'value' in value) {
        return (value as unknown as { value: T }).value
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

// Mock host hooks for testing
function createMockHostHooks<Host = unknown>(): FragmentHostHooks<Host> {
  return {
    createMarker: (_host: Host, kind: string) => ({ type: 'marker', content: kind } as Host),
    insert: () => {},
    detach: () => {},
    nextSibling: () => null,
    createText: (_host: Host, content: string) => {
      const node = { type: 'text', text: content }
      return {
        node: node as Host,
        update: (v: string) => {
          node.text = v
        },
      }
    },
    boundedHost: (host: Host) => host
  }
}

// Setup reactive runtime for tests
function useReactiveRuntime() {
  setReactiveRuntime(createMockReactiveRuntime())
}

describe('fragment', () => {
  beforeEach(() => {
    useReactiveRuntime()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('基础功能', () => {
    it('应该挂载所有子组件', () => {
      const mountCalls: string[] = []

      const child1 = (() => {
        mountCalls.push('child1')
        return () => {}
      })

      const child2 = (() => {
        mountCalls.push('child2')
        return () => {}
      })

      const frag = fragment({ children: [child1, child2] })
      frag({}, undefined)

      expect(mountCalls).toEqual(['child1', 'child2'])
    })

    it('应该按顺序挂载子组件', () => {
      const order: number[] = []

      const children = [1, 2, 3, 4, 5].map((n) =>
        (() => {
          order.push(n)
          return () => {}
        })
      )

      const frag = fragment({ children })
      frag({}, undefined)

      expect(order).toEqual([1, 2, 3, 4, 5])
    })

    it('应该支持空子组件列表', () => {
      const frag = fragment({ children: [] })
      const cleanup = frag({}, undefined)

      expect(cleanup).toBeDefined()
      expect(() => cleanup?.()).not.toThrow()
    })
  })

  describe('host 传递', () => {
    it('应该将相同的 host 传递给所有子组件', () => {
      const receivedHosts: unknown[] = []
      const testHost = { id: 'shared-host' }

      const child = ((host: unknown) => {
        receivedHosts.push(host)
        return () => {}
      })

      const frag = fragment({ children: [child, child, child] })
      frag(testHost, undefined)

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

      const child = ((host: unknown) => {
        receivedHost.push(host as ComplexHost)
        return () => {}
      })

      const frag = fragment({ children: [child] })
      frag(testHost, undefined)

      expect(receivedHost[0]).toBe(testHost)
    })
  })

  describe('unmount', () => {
    it('应该在 unmount 时清理所有子组件', () => {
      const unmountCalls: string[] = []

      const child1 = (() => {
        return () => unmountCalls.push('child1')
      })

      const child2 = (() => {
        return () => unmountCalls.push('child2')
      })

      const frag = fragment({ children: [child1, child2] })
      const cleanup = frag({}, undefined)

      expect(unmountCalls).toEqual([])

      cleanup?.()
      expect(unmountCalls).toEqual(['child1', 'child2'])
    })

    it('应该按顺序调用 unmount', () => {
      const order: number[] = []

      const children = [1, 2, 3].map((n) =>
        (() => {
          return () => order.push(n)
        })
      )

      const frag = fragment({ children })
      const cleanup = frag({}, undefined)

      cleanup?.()
      expect(order).toEqual([1, 2, 3])
    })

    it('应该处理子组件返回 undefined 的情况', () => {
      const child1 = (() => {
        return undefined
      })

      const child2 = (() => {
        return () => {}
      })

      const frag = fragment({ children: [child1, child2] })
      const cleanup = frag({}, undefined)

      expect(() => cleanup?.()).not.toThrow()
    })
  })

  describe('嵌套 fragment', () => {
    it('应该支持嵌套的 fragment', () => {
      const mountOrder: string[] = []

      const innerChild = (() => {
        mountOrder.push('inner')
        return () => {}
      })

      const innerFragment = fragment({ children: [innerChild, innerChild] })

      const outerChild = (() => {
        mountOrder.push('outer')
        return () => {}
      })

      const outerFragment = fragment({
        children: [outerChild, innerFragment, outerChild]
      })

      outerFragment({}, undefined)

      expect(mountOrder).toEqual(['outer', 'inner', 'inner', 'outer'])
    })
  })

  describe('带 hooks 的功能', () => {
    it('应该能处理文本节点', () => {
      const textNodes: Array<{ type: string; text: string }> = []
      const hooks = createMockHostHooks()
      hooks.createText = (_host: unknown, content: string) => {
        const node = { type: 'text', text: content }
        textNodes.push(node)
        return {
          node: node as any,
          update: () => {}
        }
      }

      const frag = fragment({ 
        children: ['Hello', ' ', 'World'], 
        hooks 
      })
      frag({}, undefined)

      expect(textNodes).toHaveLength(3)
      expect(textNodes[0].text).toBe('Hello')
      expect(textNodes[1].text).toBe(' ')
      expect(textNodes[2].text).toBe('World')
    })

    it('应该能处理混合内容', () => {
      const mountCalls: string[] = []
      const textNodes: string[] = []
      
      const hooks = createMockHostHooks()
      hooks.createText = (_host: unknown, content: string) => {
        textNodes.push(content)
        return { node: { text: content } as any, update: () => {} }
      }

      const component = (() => {
        mountCalls.push('component')
        return () => {}
      })

      const frag = fragment({ 
        children: ['Text1', component, 'Text2'], 
        hooks 
      })
      frag({}, undefined)

      expect(textNodes).toEqual(['Text1', 'Text2'])
      expect(mountCalls).toEqual(['component'])
    })

    it('应该添加边界标记（如果提供）', () => {
      const markers: Array<{ type: string; content: string }> = []
      const hooks = createMockHostHooks()
      hooks.createMarker = (_host: any, kind: string) => {
        const marker = { type: 'marker', content: kind }
        markers.push(marker)
        return marker as any
      }

      const child = (() => () => {})

      const frag = fragment({ children: [child], hooks })
      frag({}, undefined)

      expect(markers).toHaveLength(2)
      expect(markers[0].content).toBe('f')
      expect(markers[1].content).toBe('/f')
    })

    it('应该在没有标记钩子时正常工作', () => {
      const hooks = createMockHostHooks()
      delete hooks.createMarker
      delete hooks.insert
      delete hooks.detach

      const child = (() => () => {})

      const frag = fragment({ children: [child], hooks })
      const cleanup = frag({}, undefined)

      expect(() => cleanup?.()).not.toThrow()
    })

    it('应该在 unmount 时移除标记', () => {
      const markers: any[] = []
      const removedMarkers: any[] = []
      
      const hooks = createMockHostHooks()
      hooks.createMarker = (_host: any, kind: string) => {
        const marker = { type: 'marker', content: kind }
        markers.push(marker)
        return marker
      }
      hooks.detach = (node: any) => {
        removedMarkers.push(node)
      }

      const child = (() => () => {})
      
      const frag = fragment({ children: [child], hooks })
      const cleanup = frag({}, undefined)

      expect(markers).toHaveLength(2)
      expect(removedMarkers).toHaveLength(0)

      cleanup?.()

      expect(removedMarkers).toHaveLength(2)
      expect(removedMarkers[0]).toBe(markers[0])
      expect(removedMarkers[1]).toBe(markers[1])
    })

    it('应该正确更新响应式文本节点', () => {
      const runtime = getReactiveRuntime()
      const count = runtime.ref(0)
      
      let watchCallback: ((val: number) => void) | null = null
      const originalSubscribe = runtime.subscribe
      runtime.subscribe = (source: any, callback: any) => {
        watchCallback = callback
        return originalSubscribe(source, callback)
      }
      
      const updates: string[] = []
      const hooks = createMockHostHooks()
      hooks.createText = (_host: unknown, content: string) => {
        const node = { text: content }
        return {
          node: node as any,
          update: (v: string) => {
            node.text = v
            updates.push(v)
          }
        }
      }

      const frag = fragment({ 
        children: [count], 
        hooks 
      })
      frag({}, undefined)

      expect(watchCallback).toBeTruthy()
      expect(updates).toHaveLength(0)

      // Manually trigger the watch callback
      watchCallback!(1)
      expect(updates).toHaveLength(1)
      expect(updates[0]).toBe('1')

      watchCallback!(42)
      expect(updates).toHaveLength(2)
      expect(updates[1]).toBe('42')
    })

    it('应该在 unmount 时停止响应式文本节点的监听', () => {
      const runtime = getReactiveRuntime()
      const count = runtime.ref(0)
      
      let stopCalled = false
      const originalSubscribe = runtime.subscribe
      runtime.subscribe = (source: any, callback: any) => {
        const stop = originalSubscribe(source, callback)
        return () => {
          stopCalled = true
          stop()
        }
      }

      const hooks = createMockHostHooks()

      const frag = fragment({ 
        children: [count], 
        hooks 
      })
      const cleanup = frag({}, undefined)

      expect(stopCalled).toBe(false)

      cleanup?.()

      expect(stopCalled).toBe(true)
    })

    it('应该正确调用所有 hooks 方法', () => {
      const calls: string[] = []
      
      const hooks = createMockHostHooks()
      hooks.createMarker = (_host: any, kind: string) => {
        calls.push(`createMarker:${kind}`)
        return { kind }
      }
      hooks.insert = () => {
        calls.push('insert')
      }
      hooks.createText = (_host: unknown, content: string) => {
        calls.push(`createText:${content}`)
        return {
          node: { text: content },
          update: () => {}
        }
      }
      hooks.detach = () => {
        calls.push('detach')
      }

      const frag = fragment({ 
        children: ['Hello'], 
        hooks 
      })
      const cleanup = frag({}, undefined)

      expect(calls).toEqual([
        'createMarker:f',
        'insert',
        'createText:Hello',
        'insert',
        'createMarker:/f',
        'insert'
      ])

      calls.length = 0
      cleanup?.()

      expect(calls).toEqual([
        'detach',
        'detach',
        'detach'
      ])
    })

    it('应该处理数字类型的子元素', () => {
      const textNodes: string[] = []
      const hooks = createMockHostHooks()
      hooks.createText = (_host: unknown, content: string) => {
        textNodes.push(content)
        return { node: { text: content } as any, update: () => {} }
      }

      const frag = fragment({ 
        children: [0, 42, -1, 3.14], 
        hooks 
      })
      frag({}, undefined)

      expect(textNodes).toEqual(['0', '42', '-1', '3.14'])
    })

    it('应该在缺少 hooks 时对文本节点发出警告', () => {
      const warns: string[] = []
      const originalWarn = console.warn
      console.warn = (msg: string) => warns.push(msg)

      const frag = fragment({ 
        children: ['Hello'] 
      })
      frag({}, undefined)

      console.warn = originalWarn

      expect(warns).toHaveLength(1)
      expect(warns[0]).toContain('Text children require hooks')
    })

    it('应该在缺少 hooks 时对响应式 ref 发出警告', () => {
      const runtime = getReactiveRuntime()
      const count = runtime.ref(0)

      const warns: string[] = []
      const originalWarn = console.warn
      console.warn = (msg: string) => warns.push(msg)

      const frag = fragment({ 
        children: [count] 
      })
      frag({}, undefined)

      console.warn = originalWarn

      expect(warns).toHaveLength(1)
      expect(warns[0]).toContain('Reactive ref children require hooks')
    })
  })
})
