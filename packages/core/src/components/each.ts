import { getReactiveRuntime } from '../reactive'
import { com } from '../com'
import { type Mountable, type Ref } from '../types'

/**
 * each 组件 - 对象列表渲染
 *
 * 使用对象引用（WeakMap）追踪实例，适用于对象列表。
 * 同一对象引用 = 同一实例，对象被移除则销毁实例。
 *
 * @example
 * ```typescript
 * const users = ref<User[]>([])
 * each(users, user => UserRow(user))
 * ```
 */

// 实例信息
interface Instance<N = unknown> {
  node?: N | null
  unmount?: () => void
}

/**
 * 宿主操作钩子 - 全部可选
 */
export interface EachHostHooks<Host = unknown, N = unknown> {
  createMarker?: () => N
  appendMarker?: (host: Host, marker: N) => void
  insertBefore?: (host: Host, node: N, before: N | null) => void
  removeNode?: (node: N) => void
  createFragment?: () => {
    host: Host
    flush: (host: Host, before: N | null) => void
  }
  removeMarker?: (marker: N) => void
}

/**
 * each 组件 Props
 */
export interface EachProps<T extends object, Host = unknown> {
  of: T[] | Ref<T[]> | (() => T[])
  children: (item: T, index: number) => Mountable<Host>
}

/**
 * each - 对象列表渲染
 *
 * 支持两种调用形式：
 * 1. 函数形式：each(items, render)
 * 2. 组件形式：each({ of, children })
 *
 * @example
 * ```typescript
 * // 函数形式
 * each(users, user => UserRow(user))
 *
 * // 组件/JSX 形式
 * <each of={users}>
 *   {(user) => <UserRow user={user} />}
 * </each>
 * ```
 */
export function each<T extends object, Host = unknown>(
  props: EachProps<T, Host>
): Mountable<Host>
export function each<T extends object, Host = unknown>(
  items: T[] | Ref<T[]> | (() => T[]),
  render: (item: T, index: number) => Mountable<Host>
): Mountable<Host>
export function each<T extends object, Host = unknown>(
  itemsOrProps: T[] | Ref<T[]> | (() => T[]) | EachProps<T, Host>,
  render?: (item: T, index: number) => Mountable<Host>
): Mountable<Host> {
  // 判断是否为 Props 形式（对象且有 of 属性）
  const isProps = (v: unknown): v is EachProps<T, Host> =>
    v !== null && typeof v === 'object' && 'of' in v && 'children' in v

  // 判断是否为 Ref（有 value 属性）
  const isRef = (v: unknown): v is Ref<T[]> =>
    v !== null && typeof v === 'object' && 'value' in v

  let items: T[] | Ref<T[]> | (() => T[])
  let renderFn: (item: T, index: number) => Mountable<Host>

  if (isProps(itemsOrProps)) {
    items = itemsOrProps.of
    renderFn = itemsOrProps.children
  } else {
    items = itemsOrProps
    renderFn = render!
  }

  return eachImpl({
    items:
      typeof items === 'function'
        ? items
        : isRef(items)
          ? () => items.value
          : () => items, // 普通数组
    render: renderFn
  })
}

/**
 * each 内部配置
 */
interface EachImplConfig<T extends object, Host, N> {
  items: () => T[]
  render: (item: T, index: number) => Mountable<Host>

  // 可选的宿主操作钩子
  createMarker?: () => N
  appendMarker?: (host: Host, marker: N) => void
  insertBefore?: (host: Host, node: N, before: N | null) => void
  removeNode?: (node: N) => void
  createFragment?: () => {
    host: Host
    flush: (host: Host, before: N | null) => void
  }
  removeMarker?: (marker: N) => void
}

/**
 * each 核心实现
 * 使用 WeakMap 追踪对象引用
 */
const eachImpl = com(
  <T extends object, Host = unknown, N = unknown>(
    config: EachImplConfig<T, Host, N>
  ): Mountable<Host> => {
    return (host: Host) => {
      const runtime = getReactiveRuntime()

      // 用 WeakMap 追踪对象引用 -> 实例
      const instanceMap = new WeakMap<T, Instance<N>>()
      // 当前对象列表（保持引用以便清理）
      let currentItems: T[] = []

      // 末尾标记
      const endMarker = config.createMarker?.()
      if (endMarker && config.appendMarker) {
        config.appendMarker(host, endMarker)
      }

      // 移除实例
      const removeInstance = (item: T) => {
        const instance = instanceMap.get(item)
        if (instance) {
          instance.unmount?.()
          if (config.removeNode && instance.node != null) {
            config.removeNode(instance.node)
          }
          instanceMap.delete(item)
        }
      }

      // 创建实例
      const createInstance = (
        item: T,
        index: number,
        targetHost: Host
      ): Instance<N> => {
        const instance: Instance<N> = {}

        const mountResult = config.render(item, index)
        const unmount = mountResult(targetHost)
        instance.unmount = unmount
        // 从 unmount 函数上获取节点引用
        if (unmount && typeof unmount === 'function' && 'node' in unmount) {
          instance.node = (unmount as { node?: N }).node
        }

        return instance
      }

      // 更新列表
      const updateList = () => {
        const newItems = config.items()

        // 构建新项集合
        const newItemSet = new WeakSet<T>()
        for (const item of newItems) {
          newItemSet.add(item)
        }

        // 1. 移除不再存在的项
        for (const item of currentItems) {
          if (!newItemSet.has(item)) {
            removeInstance(item)
          }
        }

        // 2. 快速路径：完全新建
        const hasExisting = currentItems.some((item) => newItemSet.has(item))

        if (currentItems.length === 0 || !hasExisting) {
          if (config.createFragment) {
            const { host: fragmentHost, flush } = config.createFragment()

            for (let i = 0; i < newItems.length; i++) {
              const item = newItems[i]
              const instance = createInstance(item, i, fragmentHost)
              instanceMap.set(item, instance)
            }

            flush(host, endMarker ?? null)
          } else {
            for (let i = 0; i < newItems.length; i++) {
              const item = newItems[i]
              const instance = createInstance(item, i, host)
              instanceMap.set(item, instance)
            }
          }

          currentItems = newItems.slice()
          return
        }

        // 3. 增量更新：使用 LIS 最小化移动
        // 构建旧位置映射
        const oldIndexMap = new Map<T, number>()
        for (let i = 0; i < currentItems.length; i++) {
          if (newItemSet.has(currentItems[i])) {
            oldIndexMap.set(currentItems[i], i)
          }
        }

        // 构建源索引数组
        const sources: number[] = []
        for (let i = 0; i < newItems.length; i++) {
          const item = newItems[i]
          if (oldIndexMap.has(item)) {
            sources.push(oldIndexMap.get(item)!)
          } else {
            sources.push(-1)
          }
        }

        // 计算 LIS
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

        for (let i = newItems.length - 1; i >= 0; i--) {
          const item = newItems[i]

          if (!instanceMap.has(item)) {
            // 新项：创建
            const instance = createInstance(item, i, host)
            instanceMap.set(item, instance)
            // 如果有 insertBefore，需要插入到正确位置
            if (config.insertBefore && instance.node != null) {
              config.insertBefore(host, instance.node, nextNode)
            }
            if (instance.node != null) {
              nextNode = instance.node
            }
          } else if (config.insertBefore && !lisIndices.has(i)) {
            // 需要移动
            const instance = instanceMap.get(item)!
            if (instance.node != null) {
              config.insertBefore(host, instance.node, nextNode)
              nextNode = instance.node
            }
          } else {
            // 不需要移动
            const instance = instanceMap.get(item)
            if (instance?.node != null) {
              nextNode = instance.node
            }
          }
        }

        currentItems = newItems.slice()
      }

      // 初始渲染
      updateList()

      // 监听变化（由 com 自动清理）
      runtime.watch(config.items, updateList, { deep: false })

      // unmount
      return () => {
        for (const item of currentItems) {
          removeInstance(item)
        }
        currentItems = []
        if (endMarker && config.removeMarker) {
          config.removeMarker(endMarker)
        }
      }
    }
  }
)

/**
 * repeat - 值列表或数量渲染
 *
 * 使用索引追踪，适用于基本值列表或纯数量渲染。
 *
 * @example
 * ```typescript
 * // 值列表
 * repeat(tags, (tag, i) => <span>{tag}</span>)
 *
 * // 数量
 * repeat(count, i => <Star />)
 * ```
 */
export function repeat<T, Host = unknown>(
  items: Ref<T[]> | (() => T[]),
  render: (item: T, index: number) => Mountable<Host>
): Mountable<Host>

export function repeat<Host = unknown>(
  count: Ref<number> | (() => number),
  render: (index: number) => Mountable<Host>
): Mountable<Host>

export function repeat<T, Host = unknown>(
  itemsOrCount: Ref<T[]> | Ref<number> | (() => T[]) | (() => number),
  render:
    | ((item: T, index: number) => Mountable<Host>)
    | ((index: number) => Mountable<Host>)
): Mountable<Host> {
  return repeatImpl({
    items: () => {
      const value =
        typeof itemsOrCount === 'function' ? itemsOrCount() : itemsOrCount.value

      if (typeof value === 'number') {
        // 数量模式：生成索引数组
        return Array.from({ length: value }, (_, i) => i) as T[]
      }
      return value as T[]
    },
    render: render as (item: T, index: number) => Mountable<Host>
  })
}

/**
 * repeat 内部配置
 */
interface RepeatImplConfig<T, Host, N> {
  items: () => T[]
  render: (item: T, index: number) => Mountable<Host>

  // 可选的宿主操作钩子
  createMarker?: () => N
  appendMarker?: (host: Host, marker: N) => void
  removeNode?: (node: N) => void
  createFragment?: () => {
    host: Host
    flush: (host: Host, before: N | null) => void
  }
  removeMarker?: (marker: N) => void
}

/**
 * repeat 核心实现
 * 使用索引追踪，简单高效
 */
const repeatImpl = com(
  <T, Host = unknown, N = unknown>(
    config: RepeatImplConfig<T, Host, N>
  ): Mountable<Host> => {
    return (host: Host) => {
      const runtime = getReactiveRuntime()

      // 按索引存储实例
      let instances: Instance<N>[] = []

      // 末尾标记
      const endMarker = config.createMarker?.()
      if (endMarker && config.appendMarker) {
        config.appendMarker(host, endMarker)
      }

      // 更新列表
      const updateList = () => {
        const newItems = config.items()
        const oldLength = instances.length
        const newLength = newItems.length

        // 移除多余的实例
        for (let i = newLength; i < oldLength; i++) {
          const instance = instances[i]
          instance.unmount?.()
          if (config.removeNode && instance.node != null) {
            config.removeNode(instance.node)
          }
        }

        // 截断数组
        if (newLength < oldLength) {
          instances.length = newLength
        }

        // 创建新的实例（如果需要）
        if (newLength > oldLength) {
          if (config.createFragment && newLength - oldLength > 1) {
            const { host: fragmentHost, flush } = config.createFragment()

            for (let i = oldLength; i < newLength; i++) {
              const instance: Instance<N> = {}
              const mountResult = config.render(newItems[i], i)
              const unmount = mountResult(fragmentHost)
              instance.unmount = unmount
              if (
                unmount &&
                typeof unmount === 'function' &&
                'node' in unmount
              ) {
                instance.node = (unmount as { node?: N }).node
              }
              instances.push(instance)
            }

            flush(host, endMarker ?? null)
          } else {
            for (let i = oldLength; i < newLength; i++) {
              const instance: Instance<N> = {}
              const mountResult = config.render(newItems[i], i)
              const unmount = mountResult(host)
              instance.unmount = unmount
              if (
                unmount &&
                typeof unmount === 'function' &&
                'node' in unmount
              ) {
                instance.node = (unmount as { node?: N }).node
              }
              instances.push(instance)
            }
          }
        }
      }

      // 初始渲染
      updateList()

      // 监听变化（由 com 自动清理）
      runtime.watch(config.items, updateList, { deep: false })

      // unmount
      return () => {
        for (const instance of instances) {
          instance.unmount?.()
          if (config.removeNode && instance.node != null) {
            config.removeNode(instance.node)
          }
        }
        instances = []
        if (endMarker && config.removeMarker) {
          config.removeMarker(endMarker)
        }
      }
    }
  }
)

// 导出供 DOM 等模块使用
export { eachImpl, repeatImpl, type EachImplConfig, type RepeatImplConfig }

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
