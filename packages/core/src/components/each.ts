import { toValue, getReactiveRuntime } from '../reactive'
import { com } from '../com'
import { MARKERS } from '../marker-constants'
import { type Mountable, type Ref, type PropValue, type HostHooks } from '../types'

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
type Instance<N = unknown> = {
  /** marker 哨兵路径：该项的定位标记（位于项节点之前） */
  marker?: N
  /** 静态区域路径（编译器打标 STATIC_REGION 的行）：区域首尾节点。
   *  免除每行 comment 哨兵——create 少 2 次原生调用/行，clear 少销毁
   *  N 个节点，单根行移动变 O(1) 单次 insertBefore。 */
  first?: N
  last?: N
  unmount?: () => void
}

/**
 * each 组件 Props
 */
export interface EachProps<T extends object, N = unknown> {
  of: T[] | Ref<T[]> | (() => T[])
  children: (item: T, index: number) => Mountable<N>
}

/**
 * each 内部配置
 */
interface EachConfig<T extends object, N = unknown> {
  items: () => T[]
  render: (item: T, index: number) => Mountable<N>

  /** 显式宿主钩子（缺省时从 HostContext 继承） */
  hooks?: HostHooks<N>
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
export function each<T extends object, N = unknown>(
  props: EachProps<T, N>
): Mountable<N>
export function each<T extends object, N = unknown>(
  items: T[] | Ref<T[]> | (() => T[]),
  render: (item: T, index: number) => Mountable<N>
): Mountable<N>
export function each<T extends object, N = unknown>(
  itemsOrProps: T[] | Ref<T[]> | (() => T[]) | EachProps<T, N>,
  render?: (item: T, index: number) => Mountable<N>
): Mountable<N> {
  // 判断是否为 Props 形式（对象且有 of 属性）
  const isProps = (v: unknown): v is EachProps<T, N> =>
    v !== null && typeof v === 'object' && 'of' in v && 'children' in v

  let items: T[] | Ref<T[]> | (() => T[])
  let renderFn: (item: T, index: number) => Mountable<N>

  if (isProps(itemsOrProps)) {
    items = itemsOrProps.of
    renderFn = itemsOrProps.children as (item: T, index: number) => Mountable<N>
  } else {
    items = itemsOrProps
    renderFn = render! as (item: T, index: number) => Mountable<N>
  }

  return com(
    (
      config: EachConfig<T, N>
    ): Mountable<N> => {
      return (node: N, hooks: HostHooks<N> | undefined) => {
        const runtime = getReactiveRuntime()

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

        // 复用缓冲区：diff 每次触发都重建这些结构，千行级列表下分配与 GC
        // 压力是 Swap/Remove 热路径的主要常数因子。按需增长、永不收缩。
        let sourcesBuf: number[] = []
        let keptBuf: number[] = []
        let lisPredBuf: number[] = []
        let lisIdxBuf: number[] = []
        let lisResBuf: number[] = []
        let usedBuf = new Uint8Array(0)
        let movedBuf = new Uint8Array(0)
        const oldIndexMap = new Map<T, number>()

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

        // 实例区域节点：静态区域行直接沿节点对遍历（首尾已知，无需判停）；
        // marker 行走哨兵路径。
        const regionNodes = (instance: Instance<N>): N[] => {
          if (instance.first != null) {
            const nodes: N[] = []
            const lastNode = instance.last ?? instance.first
            let cur: N | null = instance.first
            while (cur) {
              nodes.push(cur)
              if (cur === lastNode) break
              cur = hooks!.nextSibling!(cur)
            }
            return nodes
          }
          return instance.marker != null ? collectRegion(instance.marker) : []
        }

        // 移除实例：先 unmount（子组件自清理），再清扫残留节点与标记
        const removeInstance = (item: T) => {
          const instance = instanceMap.get(item)
          if (!instance) return
          instance.unmount?.()
          if (instance.first != null || instance.marker != null) {
            for (const node of regionNodes(instance)) {
              hooks!.detach!(node)
            }
            if (instance.marker != null) {
              hooks!.detach!(instance.marker)
              markers.delete(instance.marker)
            }
          }
          instanceMap.delete(item)
        }

        // 创建单项。渲染后检查 mountable 的 STATIC_REGION 品牌：
        //  - 带品牌（编译器纯元素模板）→ 节点对边界 Instance，免 comment 哨兵
        //  - 不带（when/match/工厂路径/slot 模板）→ 后补 marker 哨兵，走老路
        // 统一暂存区协议（vapor 对齐）：行组件渲染进父级提供的插入目标，
        // 边界由宿主 firstChild/lastChild 直接读出——无品牌、无双轨。
        // batch 可用时所有行走节点对边界；缺失时回退 marker 哨兵路径。
        const createItem = (
          item: T,
          index: number,
          targetHost: N,
          boundary: N | null
        ): Instance<N> => {
          const mountable = config.render(item, index)
          if (hooks!.batch) {
            let unmount: (() => void) | void
            let first: N | undefined
            let last: N | undefined
            if (boundary == null) {
              // Append case (inside an outer mount batch): snapshot the host's
              // lastChild before rendering — everything after it is this row.
              const hostAny = targetHost as unknown as {
                lastChild: N | null
                firstChild: N
              }
              const prevLast = hostAny.lastChild
              unmount = mountable(targetHost, hooks)
              first =
                prevLast != null
                  ? hooks!.nextSibling!(prevLast) ?? undefined
                  : hostAny.firstChild ?? undefined
              last = hostAny.lastChild ?? undefined
              createdInBatch++
              return { first, last, unmount: unmount ?? undefined }
            } else {
              // Anchored case (single-row insert before `boundary`): render into
              // a fresh fragment, read bounds, flush once.
              const b = hooks!.batch!(targetHost)
              unmount = mountable(b.parent, hooks)
              first = (b.parent as unknown as { firstChild: N }).firstChild
              last = (b.parent as unknown as { lastChild: N }).lastChild
              b.flush(targetHost, boundary)
              createdInBatch++
              return { first, last, unmount: unmount ?? undefined }
            }
          }
          // No batch support: legacy boundedHost / direct-append paths.
          const marker = hooks!.createMarker!(targetHost, MARKERS.EACH_ITEM)
          hooks!.insert!(targetHost, marker, boundary)
          let unmount: (() => void) | void
          if (boundary != null && hooks!.boundedHost) {
            const mountHost = hooks!.boundedHost(targetHost, boundary)
            unmount = config.render(item, index)(mountHost, hooks)
          } else {
            unmount = config.render(item, index)(targetHost, hooks)
          }
          markers.add(marker)
          createdInBatch++
          return { marker, unmount: unmount ?? undefined }
        }

        // 全量创建（首创 / 无复用）：优先走 batch 快速路径
        const createAll = (items: T[]) => {
          const batch = hooks?.batch ? hooks.batch(node) : undefined
          const targetHost = batch ? batch.parent : node
          for (let i = 0; i < items.length; i++) {
            instanceMap.set(
              items[i],
              createItem(items[i], i, targetHost, batch ? null : endAnchor!)
            )
          }
          batch?.flush(node, endAnchor!)
        }

        // 无标记降级路径：顺序追加，不维护位置
        const legacyCreateAll = (items: T[]) => {
          for (let i = 0; i < items.length; i++) {
            const item = items[i]
            const unmount = config.render(item, i)(node, hooks)
            instanceMap.set(item, { unmount: unmount ?? undefined })
            createdInBatch++
          }
        }

        // Row-effect scopes: one per diff batch that actually created rows.
        // Subscriptions created while a batch scope is active register into it
        // (runtime effectScope contract), so Clear can bulk-stop thousands of
        // row effects with one stop() per creating batch instead of ~3×rows
        // individual stop() unlink passes. Scopes whose batch created nothing
        // are disposed immediately — steady-state updates must not accumulate
        // dead scope objects. (anchorMode only: creation is detected via the
        // monotonic markers count; the legacy path keeps per-row teardown.)
        const batchScopes: { stop(): void }[] = []
        // Instances created during the current diff batch — the retention
        // signal for the batch scope. Counted at creation sites so it works
        // for both anchor and legacy paths, and stays immune to same-batch
        // removals masking net size comparisons.
        let createdInBatch = 0

        // 更新列表 — hot path:首创 1000 行占 Create 1k 全耗时
        const runDiff = () => {
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
                  const unmount = config.render(item, i)(node, hooks)
                  instanceMap.set(item, { unmount: unmount ?? undefined })
                  createdInBatch++
                }
              }
            }
            currentItems = newItems.slice()
            return
          }

          // 首创：建列表末尾标记后全量创建。
          // 守卫：items 初始为空时本分支会先于任何行执行一次（只建 endAnchor），
          // 后续首次真实建行再次进入本分支——若不守卫会重复创建 endAnchor，
          // 旧引用被覆盖成为孤儿注释永久残留。
          if (currentItems.length === 0) {
            if (!endAnchor) {
              endAnchor = hooks.createMarker!(node, MARKERS.EACH_END)
              hooks.insert!(node, endAnchor, null)
            }
            createAll(newItems)
            currentItems = newItems.slice()
            return
          }

          // 清空快速路径：newItems 为空时单趟线性清扫，免去逐实例
          // collectRegion 的重复遍历与逐个 Set 删除的开销（js-framework-
          // benchmark 的 clear 场景是 1000 行一次性清空，逐实例路径的
          // 常数因子在这里占主导）。
          if (newItems.length === 0) {
            // Bulk-stop first: one stop() per creating batch replaces ~3×rows
            // individual effect-stop unlink passes. The per-instance unmount
            // loop below still runs (event-listener cleanup etc.) and every
            // subscription stop inside becomes an O(1) idempotent second call.
            for (let i = 0; i < batchScopes.length; i++) batchScopes[i].stop()
            batchScopes.length = 0
            const firstInst = instanceMap.get(currentItems[0])
            const startNode = firstInst ? (firstInst.first ?? firstInst.marker) : undefined
            if (startNode != null && endAnchor != null) {
              // 所有实例区域在首边界与 endAnchor 之间连续分布。
              // DOM 宿主提供 extractRange 时整段一次原生摘除——千行级清空
              // 的主导成本是逐节点 removeChild 的常数因子；否则退化为遍历。
              // 注意顺序：必须先摘 DOM 再跑逐实例 unmount——行组件的
              // el.remove() 对游离节点是规范定义的 no-op，反过来则会让
              // extractRange 的 setStartAfter 遇到游离节点抛错。
              if (hooks!.extractRange) {
                hooks!.extractRange(node, startNode, endAnchor)
              } else {
                let cur = hooks!.nextSibling!(startNode)
                while (cur && cur !== endAnchor) {
                  const next = hooks!.nextSibling!(cur)
                  hooks!.detach!(cur)
                  cur = next
                }
              }
              // 两种摘除策略对 start 边界的处理不同：textContent 快速路径
              // 连 start 一起清掉，Range 路径保留 start。统一补一刀——
              // 已不在树上时 detach 内部的 parentNode 保护使其成为 no-op。
              if ((startNode as unknown as { parentNode?: unknown }).parentNode) {
                hooks!.detach!(startNode)
              }
            }
            // 逐实例卸载（事件监听等清理必须执行；DOM 已不在树上，
            // 组件的 el.remove() 成为安全的 no-op）
            for (let i = 0; i < currentItems.length; i++) {
              instanceMap.get(currentItems[i])?.unmount?.()
            }
            // 批量簿记：markers 只存存活项标记（endAnchor 独立跟踪），
            // 一次 clear 替代 N 次 delete；WeakMap 条目随 currentItems 一起
            // 不可达，由 GC 回收，无需逐个删除。
            markers.clear()
            currentItems = []
            return
          }

          // 增量路径：单趟构建旧位置映射与源索引；移除检测用 used 位图，
          // 不再需要 WeakSet 与多趟扫描（Swap 热路径的主要 JS 成本）。
          const oldCount = currentItems.length
          const newCount = newItems.length
          oldIndexMap.clear()
          for (let i = 0; i < oldCount; i++) oldIndexMap.set(currentItems[i], i)

          if (sourcesBuf.length < newCount) sourcesBuf.length = newCount
          if (usedBuf.length < oldCount) usedBuf = new Uint8Array(oldCount)
          else usedBuf.fill(0, 0, oldCount)

          let additions = 0
          for (let i = 0; i < newCount; i++) {
            const idx = oldIndexMap.get(newItems[i])
            if (idx === undefined) {
              sourcesBuf[i] = -1
              additions++
            } else {
              sourcesBuf[i] = idx
              usedBuf[idx] = 1
            }
          }

          // 移除检测：未被任何新位置引用的旧项
          const keptOld = newCount - additions
          if (keptOld < oldCount) {
            for (let j = 0; j < oldCount; j++) {
              if (!usedBuf[j]) removeInstance(currentItems[j])
            }
          }

          // 无任何复用 → 全量重建
          if (keptOld === 0) {
            createAll(newItems)
            currentItems = newItems.slice()
            return
          }

          // 提取 kept 源序列，同时检测「已递增」快速路径
          if (keptBuf.length < keptOld) keptBuf.length = keptOld
          let isIncreasing = true
          let prevSrc = -1
          let k = 0
          for (let i = 0; i < newCount; i++) {
            const s = sourcesBuf[i]
            if (s >= 0) {
              if (s <= prevSrc) isIncreasing = false
              prevSrc = s
              keptBuf[k++] = s
            }
          }

          if (isIncreasing) {
            if (additions === 0) {
              // 恒等序列：相对顺序未变，DOM 无需任何变动
              currentItems = newItems.slice()
              return
            }
            // 纯尾部追加（既有项全部位于前 keptOld 个位置且保持顺序）：
            // 批量创建后一次落位，跳过 LIS 与逐项定位。
            let allTrailing = true
            for (let i = 0; i < keptOld; i++) {
              if (sourcesBuf[i] < 0) {
                allTrailing = false
                break
              }
            }
            if (allTrailing && hooks.batch) {
              const b = hooks.batch(node)
              for (let i = keptOld; i < newCount; i++) {
                instanceMap.set(
                  newItems[i],
                  createItem(newItems[i], i, b.parent, null)
                )
              }
              b.flush(node, endAnchor!)
              currentItems = newItems.slice()
              return
            }
          }

          // LIS（复用缓冲区）。结果换算到新下标的 moved 位图：
          // longestIncreasingSubsequenceInto 返回 kept 序列中构成最长递增
          // 子序列的「kept 下标」，不在其中的既有实例才需要移动。
          if (lisPredBuf.length < keptOld) lisPredBuf.length = keptOld
          if (lisIdxBuf.length < keptOld) lisIdxBuf.length = keptOld
          if (lisResBuf.length < keptOld) lisResBuf.length = keptOld
          const lisLen = longestIncreasingSubsequenceInto(
            keptBuf,
            keptOld,
            lisPredBuf,
            lisIdxBuf,
            lisResBuf
          )
          // usedBuf 已完成移除检测使命，此处复用作 kept 层的 LIS 成员标记
          usedBuf.fill(0, 0, keptOld)
          for (let t = 0; t < lisLen; t++) usedBuf[lisResBuf[t]] = 1

          if (movedBuf.length < newCount) movedBuf = new Uint8Array(newCount)
          else movedBuf.fill(0, 0, newCount)
          let ki = 0
          for (let i = 0; i < newCount; i++) {
            if (sourcesBuf[i] >= 0) {
              if (!usedBuf[ki]) movedBuf[i] = 1
              ki++
            }
          }

          // 从后向前处理；nextNode 始终指向已处理部分的物理左边界
          let nextNode: N | null = endAnchor!

          for (let i = newCount - 1; i >= 0; i--) {
            const item = newItems[i]
            const existing = instanceMap.get(item)

            if (!existing) {
              // 新项：标记 + 有界宿主一次到位。
              // 必须登记 instanceMap，否则下一轮 diff 无法找到该实例，
              // 其 DOM 与 marker 将永远无法被清扫（泄漏 + 区域边界错乱）。
              const created = createItem(item, i, node, nextNode)
              instanceMap.set(item, created)
              // 物理左边界双轨同步（与下方 unmoved 分支一致）：batch 协议下
              // createItem 返回节点对（first/last）而非 marker 哨兵，取错轨
              // 会让 nextNode 变 undefined，后续移动行退化为尾部追加。
              nextNode = (created.first ?? created.marker)!
            } else if (movedBuf[i]) {
              // 需要移动：区间收集后整体平移到 nextNode 之前。
              // 顺序关键：① 先取区间节点（原位收集）；② 边界/首节点先落位到
              // nextNode 之前；③ 内容依次插到 nextNode 之前——后插者
              // 紧贴 nextNode，内容最终按原顺序排在边界之后。
              // 若先移边界再收集，收集会发生在新位置、越过实例边界
              // 把相邻节点一并收走；若先插内容后插边界，边界会落到
              // 内容之后，同样破坏「边界在区间头部」的不变量。
              if (existing.first != null) {
                // 静态区域：单根行一次 insertBefore 即完成移动（O(1)）；
                // 多根行沿节点对逐个落位。
                const lastNode = existing.last ?? existing.first!
                if (existing.first === lastNode) {
                  hooks.insert!(node, existing.first, nextNode)
                } else {
                  const nodes = regionNodes(existing)
                  for (const n of nodes) {
                    hooks.insert!(node, n, nextNode)
                  }
                }
                nextNode = existing.first
              } else {
                const nodes = collectRegion(existing.marker!)
                hooks.insert!(node, existing.marker!, nextNode)
                for (const n of nodes) {
                  hooks.insert!(node, n, nextNode)
                }
                nextNode = existing.marker!
              }
            } else {
              // 不需要移动：物理左边界 = 静态区域首节点 / marker 哨兵
              nextNode = (existing.first ?? existing.marker)!
            }
          }

          currentItems = newItems.slice()
        }

        // Batch-scope wrapper: subscriptions created synchronously inside
        // runDiff register into a fresh scope; retain it only when the batch
        // created rows (markers grew), else dispose it right away.
        const updateList = () => {
          const scope = runtime.effectScope()
          createdInBatch = 0
          try {
            scope.run(runDiff)
          } finally {
            if (createdInBatch > 0) {
              batchScopes.push(scope)
            } else {
              scope.stop()
            }
          }
        }

        // 初始渲染
        updateList()

        // Single subscription: config.items() already reads the signal (Ref.value / getter).
        // Whether the producer does `data.value = [...d]` or mutating methods, the
        // ref's identity is replaced or the getter re-evaluates, so one watch is enough.
        // The old nested watch leaked a new watcher per update (created after microtask,
        // outside the captured scope) and `deep:false` is ignored by signals adapter.
        runtime.subscribe(config.items, updateList)

        // unmount
        return () => {
          // Release retained batch scopes before per-instance teardown so the
          // individual subscription stops below degrade to O(1) no-ops.
          for (let i = 0; i < batchScopes.length; i++) batchScopes[i].stop()
          batchScopes.length = 0
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
  )({
    items: () => toValue(items),
    render: renderFn
  })
}

/**
 * repeat 内部配置
 */
interface RepeatConfig<T, N = unknown> {
  items: () => T[]
  render: (item: T, index: number) => Mountable<N>

  /** 显式宿主钩子（缺省时从 HostContext 继承） */
  hooks?: HostHooks<N>
}

/**
 * repeat - 数量渲染
 *
 * 使用索引追踪，按数量渲染 N 个实例。列表渲染请使用 each。
 *
 * @example
 * ```typescript
 * // 数量
 * repeat(count, i => <Star />)
 * ```
 */
export function repeat<N = unknown>(
  count: PropValue<number>,
  render: (index: number) => Mountable<N>
): Mountable<N> {
  return com(
    <T, N = unknown>(
      config: RepeatConfig<T, N>
    ): Mountable<N> => {
      return (node: N, hooks: HostHooks<N> | undefined) => {
        const runtime = getReactiveRuntime()

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
              endAnchor = hooks.createMarker!(node, MARKERS.EACH_END)
              hooks.insert!(node, endAnchor, null)
            }
            const batch =
              newLength - oldLength > 1 && hooks.batch
                ? hooks.batch(node)
                : undefined
            const targetHost = batch ? batch.parent : node
            for (let i = oldLength; i < newLength; i++) {
              const marker = hooks.createMarker!(targetHost, MARKERS.EACH_ITEM)
              hooks.insert!(targetHost, marker, batch ? null : endAnchor)
              const mountHost =
                !batch && hooks.boundedHost
                  ? hooks.boundedHost(targetHost, endAnchor)
                  : targetHost
              const unmount = config.render(newItems[i], i)(mountHost, hooks)
              instances.push({ marker, unmount: unmount ?? undefined })
            }
            batch?.flush(node, endAnchor)
            return
          }

          if (newLength > oldLength) {
            for (let i = oldLength; i < newLength; i++) {
              const unmount = config.render(newItems[i], i)(node, hooks)
              instances.push({ unmount: unmount ?? undefined })
            }
          }
        }

        // 初始渲染
        updateList()

        const stopSubscription = runtime.subscribe(config.items, updateList)

        // unmount
        return () => {
          stopSubscription()
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
  )({
    items: () => {
      // toValue 统一处理 getter / Ref / 普通值
      const value = toValue(count)
      return Array.from({ length: value }, (_, i) => i)
    },
    render: render as (item: number, index: number) => Mountable<N>
  })
}

/**
 * 计算最长递增子序列的 kept 下标（缓冲区版本，零分配）。
 * 结果写入 out[0..outLen)，返回 outLen。调用方保证三个缓冲区长度 ≥ n。
 */
function longestIncreasingSubsequenceInto(
  arr: number[],
  n: number,
  predecessors: number[],
  indices: number[],
  out: number[]
): number {
  if (n === 0) return 0

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
    out[i] = idx
    idx = predecessors[idx]
  }

  return length
}