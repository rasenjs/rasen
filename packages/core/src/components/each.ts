import { getReactiveRuntime } from '../reactive'
import type { Component, MountFunction } from '../types'

/**
 * each 组件 - 用于渲染列表，维护稳定的组件实例引用
 * 避免不必要的重新挂载
 * 支持异步组件和可迭代对象
 *
 * 返回 mount 函数，与原始组件保持一致
 */
export function each<T, P = Record<string, unknown>, Host = unknown>(config: {
  items: () => Iterable<T> | AsyncIterable<T>
  getKey: (item: T, index: number) => string | number
  component: Component<Host, P>
  getProps: (item: T, index: number) => P
}): MountFunction<Host>

/**
 * each 组件 - 简化版本
 * @param items 响应式数组或返回数组的函数
 * @param render 渲染函数，接收 item 和 index
 */
export function each<T, Host = unknown>(
  items: (() => T[]) | { value: T[] } | T[],
  render: (item: T, index: number) => MountFunction<Host>
): MountFunction<Host>

export function each<T, P = Record<string, unknown>, Host = unknown>(
  configOrItems: 
    | {
        items: () => Iterable<T> | AsyncIterable<T>
        getKey: (item: T, index: number) => string | number
        component: Component<Host, P>
        getProps: (item: T, index: number) => P
      }
    | (() => T[])
    | { value: T[] }
    | T[],
  render?: (item: T, index: number) => MountFunction<Host>
): MountFunction<Host> {
  // 简化版本
  if (render) {
    let itemsGetter: () => T[]
    
    if (typeof configOrItems === 'function') {
      itemsGetter = configOrItems
    } else if (typeof configOrItems === 'object' && configOrItems !== null && 'value' in configOrItems) {
      // Vue ref
      itemsGetter = () => (configOrItems as any).value
    } else {
      // 静态数组
      itemsGetter = () => configOrItems as T[]
    }

    return eachImpl({
      items: itemsGetter,
      getKey: (item: any, index) => {
        // 尝试从 item 中获取 id 或 key，否则使用 index
        return item?.id ?? item?.key ?? index
      },
      component: (props: any) => render(props[0], props[1]),
      getProps: (item: T, index: number) => [item, index] as any
    })
  }

  // 完整版本
  return eachImpl(configOrItems as any)
}

function eachImpl<T, P = Record<string, unknown>, Host = unknown>(config: {
  items: () => Iterable<T> | AsyncIterable<T>
  getKey: (item: T, index: number) => string | number
  component: Component<Host, P>
  getProps: (item: T, index: number) => P
}): MountFunction<Host> {
  // setup 阶段
  const instanceMap = new Map<
    string | number,
    {
      scope: ReturnType<ReturnType<typeof getReactiveRuntime>['effectScope']>
      unmount?: () => void
    }
  >()

  return (host: Host) => {
    // mount 阶段
    const updateList = async () => {
      const result = config.items()
      let items: T[]

      // 处理可迭代对象
      if (Symbol.asyncIterator in result) {
        // 异步可迭代对象
        items = []
        for await (const item of result) {
          items.push(item)
        }
      } else if (Symbol.iterator in result) {
        // 同步可迭代对象（包括数组、Set、Map、生成器等）
        items = Array.from(result)
      } else {
        // 降级处理：假设是数组
        items = result as unknown as T[]
      }

      const currentKeys = new Set<string | number>()

      // 处理每个 item（可能是异步组件）
      await Promise.all(
        items.map(async (item, index) => {
          const key = config.getKey(item, index)
          currentKeys.add(key)

          if (!instanceMap.has(key)) {
            // 新增：创建新实例
            const scope = getReactiveRuntime().effectScope()
            await scope.run(async () => {
              const mountOrPromise = config.component(
                config.getProps(item, index)
              )

              // 等待异步 setup 完成
              const mount =
                mountOrPromise instanceof Promise
                  ? await mountOrPromise
                  : mountOrPromise

              const unmount = mount(host)
              instanceMap.set(key, { scope, unmount })
            })
          }
        })
      )

      // 移除不在列表中的实例
      for (const [key, instance] of instanceMap.entries()) {
        if (!currentKeys.has(key)) {
          instance.unmount?.()
          instance.scope.stop()
          instanceMap.delete(key)
        }
      }
    }

    // 初始渲染
    updateList().catch((error) => {
      console.error('Each component update error:', error)
    })

    // 监听 items 变化
    getReactiveRuntime().watch(
      config.items as () => T[],
      () => {
        updateList().catch((error) => {
          console.error('Each component update error:', error)
        })
      },
      { deep: true }
    )

    // unmount：清理所有实例
    return () => {
      for (const instance of instanceMap.values()) {
        instance.unmount?.()
        instance.scope.stop()
      }
      instanceMap.clear()
    }
  }
}
