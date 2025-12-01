import { getReactiveRuntime } from '../reactive'
import type { Component, MountFunction } from '../types'

/**
 * each 组件 - 高性能列表渲染
 * 
 * 特性：
 * - Keyed reconciliation：通过 key 追踪元素，最小化 DOM 操作
 * - DOM 节点移动：swap/reorder 时直接移动节点，无需重建
 * - 零开销设计：不创建额外的 scope 或 marker
 * - 同步渲染：避免 async/await 开销
 */

// 轻量实例信息 - 只保存必要数据
interface Instance {
  node: Node        // 单个根节点
  unmount?: () => void
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
    } else if (typeof configOrItems === 'object' && configOrItems !== null && 'value' in configOrItems) {
      itemsGetter = () => (configOrItems as { value: T[] }).value
    } else {
      itemsGetter = () => configOrItems as T[]
    }

    return eachImpl({
      items: itemsGetter,
      getKey: (item: unknown) => {
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>
          if ('id' in obj) return obj.id as string | number
          if ('key' in obj) return obj.key as string | number
        }
        // 不使用 index 作为 key，这会破坏 keyed 模式
        return String(item)
      },
      component: (props: unknown) => {
        const [item, idx] = props as [T, number]
        return render(item, idx)
      },
      getProps: (item: T, index: number) => [item, index] as unknown as P
    })
  }

  return eachImpl(configOrItems as {
    items: () => Iterable<T>
    getKey: (item: T, index: number) => string | number
    component: Component<Host, P>
    getProps: (item: T, index: number) => P
  })
}

/**
 * 高性能 each 实现
 * 使用 LIS 算法最小化 DOM 移动，零额外开销
 */
function eachImpl<T, P = Record<string, unknown>, Host = unknown>(config: {
  items: () => Iterable<T>
  getKey: (item: T, index: number) => string | number
  component: Component<Host, P>
  getProps: (item: T, index: number) => P
}): MountFunction<Host> {
  return (host: Host) => {
    const runtime = getReactiveRuntime()
    
    // 实例映射：key -> Instance
    const instanceMap = new Map<string | number, Instance>()
    // 当前 key 顺序
    let currentKeys: (string | number)[] = []
    
    // 末尾标记 - 仅用于定位插入位置
    const endMarker = document.createComment('')
    
    if (host instanceof Node) {
      host.appendChild(endMarker)
    }

    // 创建新实例 - 极简版本
    const createInstance = (item: T, index: number): Instance => {
      const instance: Instance = { node: null! }
      
      // 直接捕获第一个添加的节点
      let capturedNode: Node | null = null
      const proxyHost = {
        appendChild: (node: Node) => {
          if (!capturedNode) capturedNode = node
          if (host instanceof Node) {
            host.insertBefore(node, endMarker)
          }
        },
        insertBefore: (node: Node, ref: Node | null) => {
          if (!capturedNode) capturedNode = node
          if (host instanceof Node) {
            host.insertBefore(node, ref || endMarker)
          }
        }
      } as unknown as Host
      
      const mountResult = config.component(config.getProps(item, index))
      if (typeof mountResult === 'function') {
        instance.unmount = mountResult(proxyHost)
      }
      
      instance.node = capturedNode!
      return instance
    }

    // 移除实例
    const removeInstance = (key: string | number) => {
      const instance = instanceMap.get(key)
      if (instance) {
        instance.unmount?.()
        if (instance.node?.parentNode) {
          instance.node.parentNode.removeChild(instance.node)
        }
        instanceMap.delete(key)
      }
    }

    // Diff 和更新列表
    const updateList = () => {
      const result = config.items()
      const items: T[] = Array.isArray(result) ? result : Array.from(result)
      
      const newKeys: (string | number)[] = []
      const newKeySet = new Set<string | number>()
      const newKeyToItem = new Map<string | number, { item: T, index: number }>()
      
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
      if (currentKeys.length === 0 || !currentKeys.some(k => newKeySet.has(k))) {
        // 使用 DocumentFragment 批量插入
        const fragment = document.createDocumentFragment()
        const tempHost = {
          appendChild: (node: Node) => fragment.appendChild(node),
          insertBefore: (node: Node, ref: Node | null) => fragment.insertBefore(node, ref)
        } as unknown as Host
        
        for (let i = 0; i < items.length; i++) {
          const key = newKeys[i]
          const instance: Instance = { node: null! }
          
          let capturedNode: Node | null = null
          const proxyHost = {
            appendChild: (node: Node) => {
              if (!capturedNode) capturedNode = node
              fragment.appendChild(node)
            },
            insertBefore: (node: Node, ref: Node | null) => {
              if (!capturedNode) capturedNode = node
              fragment.insertBefore(node, ref)
            }
          } as unknown as Host
          
          const mountResult = config.component(config.getProps(items[i], i))
          if (typeof mountResult === 'function') {
            instance.unmount = mountResult(proxyHost)
          }
          instance.node = capturedNode!
          instanceMap.set(key, instance)
        }
        
        if (host instanceof Node) {
          host.insertBefore(fragment, endMarker)
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
      const toCreate: number[] = []
      
      for (let i = 0; i < newKeys.length; i++) {
        const key = newKeys[i]
        if (oldKeyToIndex.has(key)) {
          sources.push(oldKeyToIndex.get(key)!)
        } else {
          sources.push(-1)
          toCreate.push(i)
        }
      }
      
      // 计算 LIS
      const lis = longestIncreasingSubsequence(sources.filter(s => s !== -1))
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
      let nextNode: Node | null = endMarker
      
      for (let i = newKeys.length - 1; i >= 0; i--) {
        const key = newKeys[i]
        const { item, index } = newKeyToItem.get(key)!
        
        if (!instanceMap.has(key)) {
          // 新项：创建
          const instance: Instance = { node: null! }
          
          let capturedNode: Node | null = null
          const proxyHost = {
            appendChild: (node: Node) => {
              if (!capturedNode) capturedNode = node
              if (host instanceof Node) {
                host.insertBefore(node, nextNode)
              }
            },
            insertBefore: (node: Node, ref: Node | null) => {
              if (!capturedNode) capturedNode = node
              if (host instanceof Node) {
                host.insertBefore(node, ref || nextNode)
              }
            }
          } as unknown as Host
          
          const mountResult = config.component(config.getProps(item, index))
          if (typeof mountResult === 'function') {
            instance.unmount = mountResult(proxyHost)
          }
          instance.node = capturedNode!
          instanceMap.set(key, instance)
          nextNode = instance.node
        } else if (!lisIndices.has(i)) {
          // 需要移动的旧项
          const instance = instanceMap.get(key)!
          if (instance.node && host instanceof Node) {
            host.insertBefore(instance.node, nextNode)
          }
          nextNode = instance.node
        } else {
          // LIS 中的项，不需要移动
          nextNode = instanceMap.get(key)!.node
        }
      }
      
      currentKeys = newKeys
    }

    // 初始渲染
    updateList()

    // 监听变化 - 浅层监听
    const stopWatch = runtime.watch(
      config.items as () => T[],
      updateList,
      { deep: false }
    )

    // unmount
    return () => {
      stopWatch?.()
      for (const key of currentKeys) {
        removeInstance(key)
      }
      instanceMap.clear()
      currentKeys = []
      endMarker.remove()
    }
  }
}

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
