import { getReactiveRuntime } from '../reactive'
import type { Component, MountFunction } from '../types'

/**
 * each 组件 - 高性能列表渲染
 *
 * 特性：
 * - Keyed reconciliation：通过 key 追踪元素，最小化 DOM 操作
 * - 宿主无关：核心逻辑不依赖任何具体宿主 API
 * - 可选优化：传入宿主操作钩子可启用节点移动、批量插入等优化
 * - 同步渲染：避免 async/await 开销
 */

// 轻量实例信息 - 只保存必要数据
interface Instance<N = unknown> {
  node?: N // 宿主节点（可选，用于移动优化）
  unmount?: () => void
}

/**
 * 宿主操作钩子 - 全部可选
 * 不提供时 each 仍能正确工作，只是没有节点移动/批量插入优化
 */
export interface EachHostHooks<Host = unknown, N = unknown> {
  /** 创建标记节点，用于定位列表边界 */
  createMarker?: () => N
  /** 将标记节点添加到宿主 */
  appendMarker?: (host: Host, marker: N) => void
  /** 在指定位置之前插入节点 */
  insertBefore?: (host: Host, node: N, before: N | null) => void
  /** 移除节点 */
  removeNode?: (node: N) => void
  /** 从 mount 结果中捕获节点 */
  captureNode?: (proxyHost: Host, callback: (node: N) => void) => Host
  /** 创建批量插入的 fragment */
  createFragment?: () => {
    host: Host
    flush: (host: Host, before: N | null) => void
  }
  /** 清理标记节点 */
  removeMarker?: (marker: N) => void
}

/**
 * each 组件 - 完整配置版本
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
    } else if (
      typeof configOrItems === 'object' &&
      configOrItems !== null &&
      'value' in configOrItems
    ) {
      itemsGetter = () => (configOrItems as { value: T[] }).value
    } else {
      itemsGetter = () => configOrItems as T[]
    }

    return eachImpl({
      items: itemsGetter,
      getKey: (item: unknown, index: number) => {
        // 1. 优先使用对象的 id 或 key 属性
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>
          if ('id' in obj) return obj.id as string | number
          if ('key' in obj) return obj.key as string | number
        }
        // 2. 对于基本类型（字符串、数字），直接使用值作为 key
        if (typeof item === 'string' || typeof item === 'number') {
          return item
        }
        // 3. 对于没有 id/key 的对象，使用 index 作为回退
        //    这不是最优的（重排时会重建），但比所有对象都是同一个 key 好
        return index
      },
      render: render as (item: unknown, index: number) => MountFunction<Host>
    })
  }

  // 完整配置版本
  const config = configOrItems as {
    items: () => Iterable<T>
    getKey: (item: T, index: number) => string | number
    component: Component<Host, P>
    getProps: (item: T, index: number) => P
  }

  return eachImpl({
    items: config.items,
    getKey: config.getKey,
    render: (item: T, index: number) => {
      const result = config.component(config.getProps(item, index))
      // 如果是 Promise，这里简化处理，实际异步组件需要额外处理
      if (typeof result === 'function') return result
      return result as unknown as MountFunction<Host>
    }
  })
}

/**
 * each 内部配置
 */
interface EachImplConfig<T, Host, N> {
  items: () => Iterable<T>
  getKey: (item: T, index: number) => string | number
  render: (item: T, index: number) => MountFunction<Host>

  // 可选的宿主操作钩子
  createMarker?: () => N
  appendMarker?: (host: Host, marker: N) => void
  insertBefore?: (host: Host, node: N, before: N | null) => void
  removeNode?: (node: N) => void
  captureNode?: (callback: (node: N) => void) => Host
  createFragment?: () => {
    host: Host
    flush: (host: Host, before: N | null) => void
  }
  removeMarker?: (marker: N) => void
}

/**
 * each 核心实现
 * 宿主无关，所有宿主操作通过可选钩子提供
 */
function eachImpl<T, Host = unknown, N = unknown>(
  config: EachImplConfig<T, Host, N>
): MountFunction<Host> {
  return (host: Host) => {
    const runtime = getReactiveRuntime()

    // 实例映射：key -> Instance
    const instanceMap = new Map<string | number, Instance<N>>()
    // 当前 key 顺序
    let currentKeys: (string | number)[] = []

    // 末尾标记（可选）
    const endMarker = config.createMarker?.()
    if (endMarker && config.appendMarker) {
      config.appendMarker(host, endMarker)
    }

    // 移除实例
    const removeInstance = (key: string | number) => {
      const instance = instanceMap.get(key)
      if (instance) {
        instance.unmount?.()
        // 如果提供了 removeNode 钩子且有节点，则移除节点
        if (config.removeNode && instance.node !== undefined) {
          config.removeNode(instance.node)
        }
        instanceMap.delete(key)
      }
    }

    // 创建实例
    const createInstanceAt = (
      item: T,
      index: number,
      targetHost: Host,
      _beforeNode?: N | null
    ): Instance<N> => {
      const instance: Instance<N> = {}

      let actualHost = targetHost

      // 如果提供了 captureNode，使用它来捕获节点
      if (config.captureNode) {
        actualHost = config.captureNode((node) => {
          instance.node = node
        })
      }

      const mountResult = config.render(item, index)
      if (typeof mountResult === 'function') {
        instance.unmount = mountResult(actualHost)
      }

      return instance
    }

    // Diff 和更新列表
    const updateList = () => {
      const result = config.items()
      const items: T[] = Array.isArray(result) ? result : Array.from(result)

      const newKeys: (string | number)[] = []
      const newKeySet = new Set<string | number>()
      const newKeyToItem = new Map<
        string | number,
        { item: T; index: number }
      >()

      // 收集新的 keys
      for (let i = 0; i < items.length; i++) {
        const key = config.getKey(items[i], i)
        newKeys.push(key)
        newKeySet.add(key)
        newKeyToItem.set(key, { item: items[i], index: i })
      }

      // 1. 移除不再存在的项
      for (const key of currentKeys) {
        if (!newKeySet.has(key)) {
          removeInstance(key)
        }
      }

      // 2. 快速路径：完全新建（如 clear 后 create）
      if (
        currentKeys.length === 0 ||
        !currentKeys.some((k) => newKeySet.has(k))
      ) {
        // 如果提供了 fragment 优化
        if (config.createFragment) {
          const { host: fragmentHost, flush } = config.createFragment()

          for (let i = 0; i < items.length; i++) {
            const key = newKeys[i]
            const { item, index } = newKeyToItem.get(key)!
            const instance = createInstanceAt(item, index, fragmentHost)
            instanceMap.set(key, instance)
          }

          flush(host, endMarker ?? null)
        } else {
          // 无优化：直接挂载到 host
          for (let i = 0; i < items.length; i++) {
            const key = newKeys[i]
            const { item, index } = newKeyToItem.get(key)!
            const instance = createInstanceAt(item, index, host)
            instanceMap.set(key, instance)
          }
        }

        currentKeys = newKeys
        return
      }

      // 3. 增量更新：使用 LIS 最小化移动
      const oldKeyToIndex = new Map<string | number, number>()
      for (let i = 0; i < currentKeys.length; i++) {
        if (newKeySet.has(currentKeys[i])) {
          oldKeyToIndex.set(currentKeys[i], i)
        }
      }

      // 构建新位置数组（只包含已存在的项）
      const sources: number[] = []

      for (let i = 0; i < newKeys.length; i++) {
        const key = newKeys[i]
        if (oldKeyToIndex.has(key)) {
          sources.push(oldKeyToIndex.get(key)!)
        } else {
          sources.push(-1)
        }
      }

      // 计算 LIS（仅当有 insertBefore 钩子时才有意义）
      const lis = config.insertBefore
        ? longestIncreasingSubsequence(sources.filter((s) => s !== -1))
        : []
      const lisIndices = new Set<number>()
      let lisPtr = 0
      let srcPtr = 0
      for (let i = 0; i < sources.length; i++) {
        if (sources[i] !== -1) {
          if (lisPtr < lis.length && lis[lisPtr] === srcPtr) {
            lisIndices.add(i)
            lisPtr++
          }
          srcPtr++
        }
      }

      // 从后向前处理
      let nextNode: N | null = endMarker ?? null

      for (let i = newKeys.length - 1; i >= 0; i--) {
        const key = newKeys[i]
        const { item, index } = newKeyToItem.get(key)!

        if (!instanceMap.has(key)) {
          // 新项：创建
          const instance = createInstanceAt(item, index, host, nextNode)
          instanceMap.set(key, instance)
          if (instance.node !== undefined) {
            nextNode = instance.node
          }
        } else if (config.insertBefore && !lisIndices.has(i)) {
          // 需要移动的旧项（仅当提供了 insertBefore 时）
          const instance = instanceMap.get(key)!
          if (instance.node !== undefined) {
            config.insertBefore(host, instance.node, nextNode)
            nextNode = instance.node
          }
        } else {
          // LIS 中的项，不需要移动
          const instance = instanceMap.get(key)
          if (instance?.node !== undefined) {
            nextNode = instance.node
          }
        }
      }

      currentKeys = newKeys
    }

    // 初始渲染
    updateList()

    // 监听变化 - 浅层监听
    const stopWatch = runtime.watch(config.items as () => T[], updateList, {
      deep: false
    })

    // unmount
    return () => {
      stopWatch?.()
      for (const key of currentKeys) {
        removeInstance(key)
      }
      instanceMap.clear()
      currentKeys = []
      if (endMarker && config.removeMarker) {
        config.removeMarker(endMarker)
      }
    }
  }
}

/**
 * 导出 eachImpl 供 DOM 等模块使用
 */
export { eachImpl, type EachImplConfig }

/**
 * 计算最长递增子序列的索引
 */
function longestIncreasingSubsequence(arr: number[]): number[] {
  const n = arr.length
  if (n === 0) return []

  const result: number[] = []
  const predecessors: number[] = new Array(n)
  const indices: number[] = new Array(n)

  let length = 0

  for (let i = 0; i < n; i++) {
    const num = arr[i]

    let lo = 0
    let hi = length

    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (arr[indices[mid]] < num) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }

    predecessors[i] = lo > 0 ? indices[lo - 1] : -1
    indices[lo] = i

    if (lo >= length) {
      length++
    }
  }

  let idx = indices[length - 1]
  for (let i = length - 1; i >= 0; i--) {
    result[i] = idx
    idx = predecessors[idx]
  }

  return result
}
