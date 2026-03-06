/**
 * fragment 组件测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime, getReactiveRuntime, type ReactiveRuntime, type Ref } from '../reactive'
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

// Mock host hooks for testing
function createMockHostHooks<Host = unknown, N = unknown>(): FragmentHostHooks<Host, N> {
  return {
    createTextNode: (text: string) => ({ type: 'text', text } as N),
    appendNode: () => {},
    updateTextNode: () => {},
    removeNode: () => {},
    createMarker: (_host: Host, content: string) => ({ type: 'marker', content } as N),
    appendMarker: () => {},
    removeMarker: () => {}
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
      frag({})

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
      frag({})

      expect(order).toEqual([1, 2, 3, 4, 5])
    })

    it('应该支持空子组件列表', () => {
      const frag = fragment({ children: [] })
      const cleanup = frag({})

      expect(cleanup).toBeDefined()
      expect(() => cleanup?.()).not.toThrow()
    })
  })

  describe('host 传递', () => {
    it('应该将相同的 host 传递给所有子组件', () => {
      const receivedHosts: unknown[] = []
      const testHost = { id: 'shared-host' }

      const child = ((host: { id: string }) => {
        receivedHosts.push(host)
        return () => {}
      })

      const frag = fragment({ children: [child, child, child] })
      frag(testHost)

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

      const child = ((host: ComplexHost) => {
        receivedHost.push(host)
        return () => {}
      })

      const frag = fragment({ children: [child] })
      frag(testHost)

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
      const cleanup = frag({})

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
      const cleanup = frag({})

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
      const cleanup = frag({})

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

      outerFragment({})

      expect(mountOrder).toEqual(['outer', 'inner', 'inner', 'outer'])
    })
  })

  describe('带 hooks 的功能', () => {
    it('应该能处理文本节点', () => {
      const textNodes: Array<{ type: string; text: string }> = []
      const hooks = createMockHostHooks()
      hooks.createTextNode = (text: string) => {
        const node = { type: 'text', text }
        textNodes.push(node)
        return node as any
      }

      const frag = fragment({ 
        children: ['Hello', ' ', 'World'], 
        hooks 
      })
      frag({})

      expect(textNodes).toHaveLength(3)
      expect(textNodes[0].text).toBe('Hello')
      expect(textNodes[1].text).toBe(' ')
      expect(textNodes[2].text).toBe('World')
    })

    it('应该能处理混合内容', () => {
      const mountCalls: string[] = []
      const textNodes: string[] = []
      
      const hooks = createMockHostHooks()
      hooks.createTextNode = (text: string) => {
        textNodes.push(text)
        return { type: 'text', text } as any
      }

      const component = (() => {
        mountCalls.push('component')
        return () => {}
      })

      const frag = fragment({ 
        children: ['Text1', component, 'Text2'], 
        hooks 
      })
      frag({})

      expect(textNodes).toEqual(['Text1', 'Text2'])
      expect(mountCalls).toEqual(['component'])
    })

    it('应该添加边界标记（如果提供）', () => {
      const markers: Array<{ type: string; content: string }> = []
      const hooks = createMockHostHooks()
      hooks.createMarker = (_host: any, content: string) => {
        const marker = { type: 'marker', content }
        markers.push(marker)
        return marker as any
      }

      const child = (() => () => {})

      const frag = fragment({ children: [child], hooks })
      frag({})

      expect(markers).toHaveLength(2)
      expect(markers[0].content).toBe('f')
      expect(markers[1].content).toBe('/f')
    })

    it('应该在没有标记钩子时正常工作', () => {
      const hooks = createMockHostHooks()
      delete hooks.createMarker
      delete hooks.appendMarker
      delete hooks.removeMarker

      const child = (() => () => {})

      const frag = fragment({ children: [child], hooks })
      const cleanup = frag({})

      expect(() => cleanup?.()).not.toThrow()
    })

    it('应该在 unmount 时移除标记', () => {
      const markers: any[] = []
      const removedMarkers: any[] = []
      
      const hooks = createMockHostHooks()
      hooks.createMarker = (_host: any, content: string) => {
        const marker = { type: 'marker', content }
        markers.push(marker)
        return marker
      }
      hooks.removeMarker = (marker: any) => {
        removedMarkers.push(marker)
      }

      const child = (() => () => {})
      
      const frag = fragment({ children: [child], hooks })
      const cleanup = frag({})

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
      const originalWatch = runtime.watch
      runtime.watch = (source: any, callback: any, options?: any) => {
        watchCallback = callback
        if (options?.immediate) {
          callback(source())
        }
        return originalWatch(source, callback, options)
      }
      
      const updates: string[] = []
      const hooks = createMockHostHooks()
      hooks.createTextNode = (text: string) => ({ text })
      hooks.updateTextNode = (node: any, text: string) => {
        node.text = text
        updates.push(text)
      }

      const frag = fragment({ 
        children: [count], 
        hooks 
      })
      frag({})

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
      const originalWatch = runtime.watch
      runtime.watch = (source: any, callback: any, options?: any) => {
        const stop = originalWatch(source, callback, options)
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
      const cleanup = frag({})

      expect(stopCalled).toBe(false)

      cleanup?.()

      expect(stopCalled).toBe(true)
    })

    it('应该正确调用所有 hooks 方法', () => {
      const calls: string[] = []
      
      const hooks = createMockHostHooks()
      hooks.createTextNode = (text: string) => {
        calls.push(`createTextNode:${text}`)
        return { text }
      }
      hooks.appendNode = () => {
        calls.push('appendNode')
      }
      hooks.createMarker = (_host: any, content: string) => {
        calls.push(`createMarker:${content}`)
        return { content }
      }
      hooks.appendMarker = () => {
        calls.push('appendMarker')
      }
      hooks.removeNode = () => {
        calls.push('removeNode')
      }
      hooks.removeMarker = () => {
        calls.push('removeMarker')
      }

      const frag = fragment({ 
        children: ['Hello'], 
        hooks 
      })
      const cleanup = frag({})

      expect(calls).toEqual([
        'createMarker:f',
        'appendMarker',
        'createTextNode:Hello',
        'appendNode',
        'createMarker:/f',
        'appendMarker'
      ])

      calls.length = 0
      cleanup?.()

      expect(calls).toEqual([
        'removeNode',
        'removeMarker',
        'removeMarker'
      ])
    })

    it('应该处理数字类型的子元素', () => {
      const textNodes: string[] = []
      const hooks = createMockHostHooks()
      hooks.createTextNode = (text: string) => {
        textNodes.push(text)
        return { text }
      }

      const frag = fragment({ 
        children: [0, 42, -1, 3.14], 
        hooks 
      })
      frag({})

      expect(textNodes).toEqual(['0', '42', '-1', '3.14'])
    })

    it('应该在缺少 hooks 时对文本节点发出警告', () => {
      const warns: string[] = []
      const originalWarn = console.warn
      console.warn = (msg: string) => warns.push(msg)

      const frag = fragment({ 
        children: ['Hello'] 
      })
      frag({})

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
      frag({})

      console.warn = originalWarn

      expect(warns).toHaveLength(1)
      expect(warns[0]).toContain('Reactive ref children require hooks')
    })
  })
})
