/**
 * HostContext 机制测试
 *
 * 验证 com 托管的宿主上下文：
 * 1. 根 mount 传入 ctx → 组件树继承
 * 2. 子组件覆盖 ctx（如 canvas 切换宿主）→ 子树用新 ctx
 * 3. com 退出时还原父 ctx
 * 4. each 的响应式增删子项使用挂载时捕获的 ctx（闭包）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime, type ReactiveRuntime, type Ref } from './reactive'
import { com, getHostContext, provideHostContext } from './com'
import { mount } from './mount'
import { each } from './components/each'
import type { HostContext, HostHooks } from './host-context'

// 模拟宿主：一个简单的"节点数组"宿主
type MockHost = { nodes: string[] }

// 模拟 hooks：把节点"插入"到 host.nodes
function createMockHooks(tag: string): HostHooks<MockHost, unknown> {
  return {
    createMarker: (_host, content) => `[${tag}:${content}]`,
    appendMarker: (host, marker) => { host.nodes.push(marker as string) },
    insertBefore: (host, node, before) => {
      const idx = before ? host.nodes.indexOf(before as string) : host.nodes.length
      if (idx === -1) host.nodes.push(node as string)
      else host.nodes.splice(idx, 0, node as string)
    },
    removeNode: () => { /* no-op for test */ },
    removeMarker: () => { /* no-op */ },
  }
}

function createMockRuntime(): ReactiveRuntime {
  const refs = new WeakSet<{ value: unknown }>()
  return {
    ref: <T>(value: T): Ref<T> => {
      const r = { value }
      refs.add(r)
      return r
    },
    computed: <T>(getter: () => T) => {
      const c = { get value() { return getter() } }
      refs.add(c)
      return c
    },
    watch: <T>(source: () => T, callback: (v: T, o: T) => void, options?: { immediate?: boolean }) => {
      if (options?.immediate) callback(source(), undefined as T)
      return () => {}
    },
    effectScope: () => ({
      run: <T>(fn: () => T) => fn(),
      stop: () => {},
    }),
    unref: <T>(value: T | Ref<T> | { readonly value: T }) =>
      value && typeof value === 'object' && 'value' in value
        ? (value as { value: T }).value
        : (value as T),
    setValue: <T>(ref: Ref<T>, value: T): void => {
      ;(ref as { value: T }).value = value
    },
    isRef: (value: unknown): boolean =>
      value !== null && typeof value === 'object' && refs.has(value as { value: unknown }),
  }
}

describe('HostContext', () => {
  beforeEach(() => {
    setReactiveRuntime(createMockRuntime())
  })
  afterEach(() => {
    // reset ctx stack
  })

  it('根 mount 传入 ctx，组件树继承', () => {
    const host: MockHost = { nodes: [] }
    const domHooks = createMockHooks('dom')

    // 组件在 mount 时读取当前 ctx
    const Probe = com(() => {
      return () => {
        const ctx = getHostContext()
        expect(ctx?.hooks).toBe(domHooks)
        return () => {}
      }
    })

    provideHostContext({ hooks: domHooks }, () => mount(Probe(), host))
  })

  it('子组件覆盖 ctx（canvas 切换宿主），子树用新 ctx，兄弟不受影响', () => {
    const host: MockHost = { nodes: [] }
    const domHooks = createMockHooks('dom')
    const webglHooks = createMockHooks('webgl')

    const seen: string[] = []

    // 普通子组件：继承父 ctx（dom）
    const Child = com((label: string) => {
      return (_h: MockHost) => {
        const ctx = getHostContext()
        seen.push(`${label}:${(ctx?.hooks as HostHooks<MockHost, string>).createMarker?.({ nodes: [] }, 'x')}`)
        return () => {}
      }
    })

    // 覆盖组件：进入时覆盖 ctx 为 webgl（用 provideHostContext 包裹子树挂载）
    const Canvas = com((children: Array<(h: MockHost) => unknown>) => {
      return (h: MockHost) => {
        const childCtx: HostContext<MockHost> = { hooks: webglHooks }
        children.forEach((c) => provideHostContext(childCtx, () => c(h)))
        return () => {}
      }
    })

    const App = com(() => {
      return (h: MockHost) => {
        const ctx = getHostContext()
        seen.push(`app:${(ctx?.hooks as HostHooks<MockHost, string>).createMarker?.({ nodes: [] }, 'x')}`)
        // 挂一个普通子组件（继承 dom）
        Child('sibling')(h)
        // 挂 canvas（覆盖为 webgl）
        Canvas([Child('inside')])(h)
        return () => {}
      }
    })

    // 外层用 provideHostContext 提供 dom ctx
    provideHostContext({ hooks: domHooks }, () => mount(App(), host))

    expect(seen).toContain('app:[dom:x]')
    expect(seen).toContain('sibling:[dom:x]')
    expect(seen).toContain('inside:[webgl:x]')
  })

  it('each 挂载时捕获 ctx，响应式增删子项使用闭包 ctx', () => {
    const host: MockHost = { nodes: [] }
    const domHooks = createMockHooks('dom')

    // 用 each 渲染，子项读取 ctx
    const items = [{ id: 1 }, { id: 2 }]
    const seen: string[] = []

    const Item = com((item: { id: number }) => {
      return (_h: MockHost) => {
        const ctx = getHostContext()
        seen.push(`item${item.id}:${(ctx?.hooks as HostHooks<MockHost, string>).createMarker?.({ nodes: [] }, 'x')}`)
        return () => {}
      }
    })

    const List = com(() => {
      return (h: MockHost) => {
        return each(items, (item) => Item(item))(h)
      }
    })

    // 外层用 provideHostContext 提供 dom ctx
    provideHostContext({ hooks: domHooks }, () => mount(List(), host))

    expect(seen).toContain('item1:[dom:x]')
    expect(seen).toContain('item2:[dom:x]')
  })

  it('com 退出后还原父 ctx', () => {
    const host: MockHost = { nodes: [] }
    const domHooks = createMockHooks('dom')
    const webglHooks = createMockHooks('webgl')

    const seen: string[] = []

    const Inner = com(() => {
      return (_h: MockHost) => {
        const ctx = getHostContext()
        seen.push(`inner:${(ctx?.hooks as HostHooks<MockHost, string>).createMarker?.({ nodes: [] }, 'x')}`)
        return () => {}
      }
    })

    const Outer = com(() => {
      return (h: MockHost) => {
        // 挂一个覆盖 ctx 的组件，然后挂一个普通组件，验证还原
        const Canvas = com(() => {
          return (h: MockHost) => {
            provideHostContext({ hooks: webglHooks }, () => Inner()(h))
            return () => {}
          }
        })
        Canvas()(h)
        // 此时应还原为 dom
        Inner()(h)
        return () => {}
      }
    })

    // 外层用 provideHostContext 提供 dom ctx
    provideHostContext({ hooks: domHooks }, () => mount(Outer(), host))

    expect(seen).toContain('inner:[webgl:x]')
    expect(seen).toContain('inner:[dom:x]')
  })
})