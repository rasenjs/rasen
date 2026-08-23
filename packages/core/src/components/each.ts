 import { getReactiveRuntime, toValue } from '../reactive'
import { com, getHostContext } from '../com'
import { MARKERS } from '../marker-constants'
import { type Mountable, type Ref, type PropValue, type HostContext, type HostHooks } from '../types'

/**
 * each 组件 - 对象列表渲染
 *
 * 使用对象引用（WeakMap）追踪实例，适用于对象列表。
 * 同一对象引用 = 同一实例，对象被移除则销毁实例。
 *
 * 标记布局（anchorMode）：
 *   [a0] n0 [a1] n1 ... [ak] nk [e]
 * 每项一个专属标记，位于该项节点之前。项的区域 = a_i 之后到下一个已知标记/e 之前。
 * 移动/删除通过 nextSibling 区间遍历完成，不依赖 unmount 函数携带 node。
 *
 * @example
 * ```typescript
 * const users = ref<User[]>([])
 * each(users, user => UserRow(user))
 * ```
 */

// 实例信息
interface Instance<N = unknown> {
  /** 该项的定位标记（位于项节点之前）；无标记能力时为空 */
  marker?: N
  unmount?: () => void
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
    // toValue 统一处理 getter / Ref / 普通数组
    items: () => toValue(items),
    render: renderFn
  })
}

/**
 * each 内部配置
 */
interface EachImplConfig<T extends object, Host, N> {
  items: () => T[]
  render: (item: T, index: number) => Mountable<Host>

  /** 显式宿主钩子（缺省时从 HostContext 继承） */
  hooks?: HostHooks<Host, N>
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

      // 宿主上下文：com 挂载时已压栈。优先用 ctx.hooks，config 平铺的 hooks 作为显式 fallback。
      const ctx = getHostContext() as HostContext<Host, N> | undefined
      const hooks = ctx?.hooks ?? config.hooks

      // 标记模式：具备 createMarker + insert + nextSibling 才能做精确定位与移动，
      // 否则退化为顺序追加模式（无标记、无移动，行为等同旧空 hooks 路径）。
      const anchorMode = !!(
        hooks?.createMarker &&
        hooks.insert &&
        hooks.nextSibling
      )

      // 用 WeakMap 追踪对象引用 -> 实例
      const instanceMap = new WeakMap<T, Instance<N>>()
      // 当前对象列表（保持引用以便清理）
      let currentItems: T[] = []
      // 存活项标记集合（区间遍历的终止依据）
      const markers = new Set<N>()
      // 列表末尾标记
      let endAnchor: N | undefined

      // 收集 marker 之后的区域节点，直到下一个已知标记或列表末尾
      const collectRegion = (marker: N): N[] => {
        const nodes: N[] = []
        let cur = hooks!.nextSibling!(marker)
        while (cur && cur !== endAnchor && !markers.has(cur)) {
          nodes.push(cur)
          cur = hooks!.nextSibling!(cur)
        }
        return nodes
      }

      // 移除实例：先 unmount（子组件自清理），再清扫残留节点与标记
      const removeInstance = (item: T) => {
        const instance = instanceMap.get(item)
        if (!instance) return
        instance.unmount?.()
        if (instance.marker != null) {
          for (const node of collectRegion(instance.marker)) {
            hooks!.detach!(node)
          }
          hooks!.detach!(instance.marker)
          markers.delete(instance.marker)
        }
        instanceMap.delete(item)
      }

      // 创建单项：标记插在 boundary 之前，内容经有界宿主落在标记之后、boundary 之前
      // （有界宿主把追加重定向到 boundary 之前，而标记刚插在那里，所以内容紧随标记）
      const createItem = (
        item: T,
        index: number,
        targetHost: Host,
        boundary: N | null
      ): Instance<N> => {
        const marker = hooks!.createMarker!(targetHost, MARKERS.EACH_ITEM)
        hooks!.insert!(targetHost, marker, boundary)
        const mountHost =
          boundary != null && hooks!.boundedHost
            ? hooks!.boundedHost(targetHost, boundary)
            : targetHost
        const unmount = config.render(item, index)(mountHost)
        markers.add(marker)
        return { marker, unmount: unmount ?? undefined }
      }

      // 全量创建（首创 / 无复用）：优先走 batch 快速路径
      const createAll = (items: T[]) => {
        const batch = hooks?.batch ? hooks.batch(host) : undefined
        const targetHost = batch ? batch.host : host
        for (let i = 0; i < items.length; i++) {
          instanceMap.set(
            items[i],
            createItem(items[i], i, targetHost, batch ? null : endAnchor!)
          )
        }
        batch?.flush(host, endAnchor!)
      }

      // 无标记降级路径：顺序追加，不维护位置
      const legacyCreateAll = (items: T[]) => {
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          const unmount = config.render(item, i)(host)
          instanceMap.set(item, { unmount: unmount ?? undefined })
        }
      }

      // 更新列表 — hot path:首创 1000 行占 Create 1k 全耗时
      const updateList = () => {
        const newItems = config.items()

        // 降级模式：只做移除 + 末尾追加，不做移动
        if (!anchorMode) {
          if (currentItems.length === 0) {
            legacyCreateAll(newItems)
            currentItems = newItems.slice()
            return
          }
          const newItemSet = new WeakSet<T>()
          for (let i = 0; i < newItems.length; i++) newItemSet.add(newItems[i])

          for (let i = 0; i < currentItems.length; i++) {
            const item = currentItems[i]
            if (!newItemSet.has(item)) {
              instanceMap.get(item)?.unmount?.()
              instanceMap.delete(item)
            }
          }
          const hasExisting = currentItems.some((item) => newItemSet.has(item))
          if (!hasExisting) {
            legacyCreateAll(newItems)
          } else {
            for (let i = 0; i < newItems.length; i++) {
              const item = newItems[i]
              if (!instanceMap.has(item)) {
                const unmount = config.render(item, i)(host)
                instanceMap.set(item, { unmount: unmount ?? undefined })
              }
            }
          }
          currentItems = newItems.slice()
          return
        }

        // 首创：建列表末尾标记后全量创建
        if (currentItems.length === 0) {
          endAnchor = hooks.createMarker!(host, MARKERS.EACH_END)
          hooks.insert!(host, endAnchor, null)
          createAll(newItems)
          currentItems = newItems.slice()
          return
        }

        // 增量路径：构建集合、清理、判全新建
        const newItemSet = new WeakSet<T>()
        for (let i = 0; i < newItems.length; i++) newItemSet.add(newItems[i])

        // 1. 移除不再存在的项
        for (let i = 0; i < currentItems.length; i++) {
          const item = currentItems[i]
          if (!newItemSet.has(item)) removeInstance(item)
        }

        // 2. 若无任何复用，全量重建（swap/remove 后可能命中）
        const hasExisting = currentItems.some((item) => newItemSet.has(item))
        if (!hasExisting) {
          createAll(newItems)
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

        // 快速路径：纯尾部追加（新增项连续位于末尾、保留前缀相对顺序未变）。
        // 此时无任何移动，跳过 LIS 与逐项定位，直接批量创建后一次落位。
        let tailStart = sources.length
        for (let i = 0; i < sources.length; i++) {
          if (sources[i] === -1) {
            tailStart = i
            break
          }
        }
        let pureTail =
          tailStart < sources.length && sources.length - tailStart > 1
        if (pureTail) {
          for (let i = tailStart + 1; i < sources.length; i++) {
            if (sources[i] !== -1) {
              pureTail = false
              break
            }
          }
          for (let i = 1; pureTail && i < tailStart; i++) {
            if (sources[i] <= sources[i - 1]) pureTail = false
          }
        }
        if (pureTail && hooks.batch) {
          const b = hooks.batch(host)
          for (let i = tailStart; i < newItems.length; i++) {
            instanceMap.set(
              newItems[i],
              createItem(newItems[i], i, b.host, null)
            )
          }
          b.flush(host, endAnchor!)
          currentItems = newItems.slice()
          return
        }

        // 计算 LIS
        const lis = longestIncreasingSubsequence(sources.filter((s) => s !== -1))
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

        // 从后向前处理；nextNode 始终指向已处理部分的物理左边界
        let nextNode: N | null = endAnchor!

        for (let i = newItems.length - 1; i >= 0; i--) {
          const item = newItems[i]
          const existing = instanceMap.get(item)

          if (!existing) {
            // 新项：标记 + 有界宿主一次到位
            nextNode = createItem(item, i, host, nextNode).marker!
          } else if (!lisIndices.has(i)) {
            // 需要移动：区间收集后整体平移到 nextNode 之前
            const nodes = collectRegion(existing.marker!)
            for (const node of nodes) {
              hooks.insert!(host, node, nextNode)
            }
            hooks.insert!(host, existing.marker!, nextNode)
            nextNode = existing.marker!
          } else {
            // 不需要移动
            nextNode = existing.marker!
          }
        }

        currentItems = newItems.slice()
      }

      // 初始渲染
      updateList()

      // Single subscription: config.items() already reads the signal (Ref.value / getter).
      // Whether the producer does `data.value = [...d]` or mutating methods, the
      // ref's identity is replaced or the getter re-evaluates, so one watch is enough.
      // The old nested watch leaked a new watcher per update (created after microtask,
      // outside the captured scope) and `deep:false` is ignored by signals adapter.
      const scope = runtime.effectScope()
      scope.run(() => {
        runtime.watch(config.items, updateList, { deep: false })
      })

      // unmount
      return () => {
        scope.stop()
        for (const item of currentItems) {
          removeInstance(item)
        }
        currentItems = []
        if (endAnchor && hooks?.detach) {
          hooks.detach(endAnchor)
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
      // toValue 统一处理 getter / Ref / 普通值
      const value = toValue(itemsOrCount as PropValue<T[] | number>)

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

  /** 显式宿主钩子（缺省时从 HostContext 继承） */
  hooks?: HostHooks<Host, N>
}

/**
 * repeat 核心实现
 * 使用索引追踪，简单高效；列表顺序永不变化，只做尾部增删
 */
const repeatImpl = com(
  <T, Host = unknown, N = unknown>(
    config: RepeatImplConfig<T, Host, N>
  ): Mountable<Host> => {
    return (host: Host) => {
      const runtime = getReactiveRuntime()

      // 宿主上下文：com 挂载时已压栈。优先用 ctx.hooks，config.hooks 作为显式 fallback。
      const ctx = getHostContext() as HostContext<Host, N> | undefined
      const hooks = ctx?.hooks ?? config.hooks

      const anchorMode = !!(
        hooks?.createMarker &&
        hooks.insert &&
        hooks.nextSibling
      )

      // 按索引存储实例
      let instances: Instance<N>[] = []
      // 列表末尾标记
      let endAnchor: N | undefined

      // 移除第 j 个实例：区域右边界 = 下一实例标记或列表末尾（repeat 不重排，物理顺序即数组顺序）
      const removeAt = (j: number) => {
        const instance = instances[j]
        if (!instance) return
        instance.unmount?.()
        if (anchorMode && instance.marker != null) {
          const rightBoundary =
            j + 1 < instances.length ? instances[j + 1].marker : endAnchor
          const nodes: N[] = []
          let cur = hooks!.nextSibling!(instance.marker)
          while (cur && cur !== rightBoundary) {
            nodes.push(cur)
            cur = hooks!.nextSibling!(cur)
          }
          for (const node of nodes) hooks!.detach!(node)
          hooks!.detach!(instance.marker)
        }
      }

      // 更新列表
      const updateList = () => {
        const newItems = config.items()
        const oldLength = instances.length
        const newLength = newItems.length

        // 移除多余的实例（从尾部开始，保证右边界仍有效）
        for (let i = newLength; i < oldLength; i++) {
          removeAt(i)
        }

        // 截断数组
        if (newLength < oldLength) {
          instances.length = newLength
        }

        // 创建新的实例（如果需要）
        if (newLength > oldLength && anchorMode) {
          if (!endAnchor) {
            endAnchor = hooks.createMarker!(host, MARKERS.EACH_END)
            hooks.insert!(host, endAnchor, null)
          }
          const batch =
            newLength - oldLength > 1 && hooks.batch
              ? hooks.batch(host)
              : undefined
          const targetHost = batch ? batch.host : host
          for (let i = oldLength; i < newLength; i++) {
            const marker = hooks.createMarker!(targetHost, MARKERS.EACH_ITEM)
            hooks.insert!(targetHost, marker, batch ? null : endAnchor)
            const mountHost =
              !batch && hooks.boundedHost
                ? hooks.boundedHost(targetHost, endAnchor)
                : targetHost
            const unmount = config.render(newItems[i], i)(mountHost)
            instances.push({ marker, unmount: unmount ?? undefined })
          }
          batch?.flush(host, endAnchor)
          return
        }

        if (newLength > oldLength) {
          for (let i = oldLength; i < newLength; i++) {
            const unmount = config.render(newItems[i], i)(host)
            instances.push({ unmount: unmount ?? undefined })
          }
        }
      }

      // 初始渲染
      updateList()

      const scope = runtime.effectScope()
      scope.run(() => {
        runtime.watch(config.items, updateList, { deep: false })
      })

      // unmount
      return () => {
        scope.stop()
        for (let i = 0; i < instances.length; i++) {
          removeAt(i)
        }
        instances = []
        if (endAnchor && hooks?.detach) {
          hooks.detach(endAnchor)
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
