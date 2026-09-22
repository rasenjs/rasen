/**
 * DOM 宿主钩子（统一造型）
 *
 * 为 core 的 when、each、match、fragment 提供节点操作能力。
 * 水合逻辑完全封装在实现内部：createMarker / createText 在水合模式下 claim 并校验
 * 已有节点，core 不感知水合的存在。
 *
 * 造型说明：
 *  - createMarker：创建标记（Comment），只创建不挂载，位置由 insert 决定
 *  - createText：创建游离文本节点，返回句柄（node + update）
 *  - insert / detach / nextSibling：定位与区间遍历原语
 *  - batch：DocumentFragment 暂存后一次性落位，合并 DOM 写入
 *
 * 有界挂载只有两种互斥方案，各宿主二选一：
 *  - `batch`（本文件）：分支建在暂存 fragment 里、flush 时搬进真实父节点。
 *    暂存容器会失效，因此 `insert` **必须**按 ref 取容器（见其文档）。
 *  - `boundedHost`：长期有效的宿主视图（canvas-2d / gfx 采用）。
 *    两者同时提供就会造出失效宿主。
 */

import type { TextHandle } from '@rasenjs/core'
import { getHydrationContext } from './hydration-context'
import { isMarkerMatch } from './marker-constants'

/**
 * 插入 —— 按 `HostHooks.insert` 的**容器归属规则**实现。契约写在 core 的
 * `host-context.ts`（设计层，三个宿主共用同一套语义），这里只说 DOM 侧的缘由。
 *
 * 规则：
 *   - `ref === null`：追加，容器就是传进来的 `parent`；
 *   - `ref !== null`：容器是 **`ref.parentNode`**，不是 `parent`。
 *
 * 容器本来就由 `ref` 唯一决定：调用方的意图是「紧贴 `ref` 之前」，而这个位置
 * **只在 `ref` 当前所属的那个列表里存在**。`parent` 只是宿主引用，它是可失效的
 * 信息；`ref` 是具体节点，它的位置永远是真的。
 *
 * DOM 宿主为什么必须靠 `ref` 取值——因为它提供 `batch`：为合并 DOM 写入，一个
 * 分支先建在**暂存 DocumentFragment** 里，再由 flush 一次性搬进真实父节点。
 * 于是：
 *
 *   1. 分支在 fragment 里挂载时，`parent === fragment`，`ref.parentNode` 也是
 *      它 —— 两者一致，插入落在暂存区（写入被合并，这正是 `batch` 的目的）；
 *   2. flush 之后 fragment 的子节点全部搬进真实 DOM，**fragment 自身变成游离
 *      空壳**；而在其中挂载过的结构性组件（when/each/match/fragment）已经在
 *      闭包里缓存了它；
 *   3. 该组件此后每次「插到 ref 之前」传入的都是这个空壳 —— 用 `parent` 插入
 *      必然抛 NotFoundError（`ref` 不在其中），且更新会中途中断：
 *      旧分支已销毁、新分支没插进去 = **整个分支消失**。
 *
 * 关键点：按 `ref` 取值在**两种状态下都正确**（目标仍在 fragment 里时，
 * `ref.parentNode` 就是那个 fragment，写入照样被合并），而按 `parent` 取值只能
 * 对上第 1 种。所以这不是「两个都试一下」的容错，而是唯一正确的取值来源。
 *
 * 这也解释了为什么 canvas-2d / gfx 的 host-hooks **刻意不实现 `batch`**（它们用
 * 长期有效的 `boundedHost` 视图，因此宿主引用永不失效）。`batch` 与
 * `boundedHost` 是两种互斥的有界挂载方案，同时提供就会踩到这里。
 */
function guardedInsertBefore(
  parent: HTMLElement,
  node: Node,
  ref: Node | null
): void {
  const ctx = getHydrationContext()
  if (ctx?.isHydrating && node.parentNode) return
  if (ref === null) {
    parent.appendChild(node)
    return
  }
  const container = ref.parentNode
  if (container === null) {
    // 无处可放，也不猜位置：插进一个可能已失效的 `parent` 会把内容放到错误的
    // 末尾，错位比不插更难排查。结构性更新中途更不能抛——抛出会让 UI 停在
    // 「旧内容已销毁、新内容未插入」的状态。
    warnDetachedAnchor()
    return
  }
  container.insertBefore(node, ref)
}

/**
 * 锚点彻底脱离树时的告警（只报一次）。
 *
 * 这种状态说明调用方在更新**已销毁的分支**（通常是订阅没随组件释放），是需要
 * 暴露的逻辑错误；但每次更新都刷屏没有意义。
 */
let warnedDetachedAnchor = false
function warnDetachedAnchor(): void {
  if (warnedDetachedAnchor) return
  warnedDetachedAnchor = true
  console.warn(
    '[Rasen] insert() got an anchor that is no longer in any tree — the caller is' +
      ' updating a branch that was torn down, so the node was not placed. This' +
      ' usually means a subscription outlived its component.'
  )
}

/**
 * extractRange 允许区域外存活的最多节点数，超过则退回 Range 摘除。
 *
 * 真实应用的宿主容器从来不是干净的：App 的 index.html 里总会有换行空白文本
 * 与占位注释（如 <tbody> 里的 `<!-- rows will be rendered here -->`），所以
 * “区域覆盖宿主全部子节点”这个旧判据在实践中永远为假——测试 fixture 里的干净
 * 容器是唯一的例外，快路径事实上是死代码（千行清空因此退化成一干次
 * removeChild）。留出少量名额即可覆盖这类宿主样板；真出现大量区域外节点时退回
 * Range，行为与旧版一致。
 */
const MAX_OUTSIDE_NODES = 8

/**
 * DOM 宿主钩子
 *
 * 支持 SSR hydration：在水合模式下 createMarker/createText 会 claim 已有节点而不是创建新节点。
 */
export const hostHooks = {
  /** 创建定位标记（Comment）。水合模式下 claim 并校验已有标记，不重复挂载。 */
  createMarker: (parent: HTMLElement, kind: string): Node => {
    const hydrationContext = getHydrationContext()

    if (hydrationContext) {
      // Hydration mode: claim existing marker
      const node = hydrationContext.claim()
      if (node && node.nodeType === Node.COMMENT_NODE) {
        const comment = node as Comment

        // Verify marker content matches expected content
        if (!isMarkerMatch(comment, kind)) {
          throw new Error(
            `[Rasen Hydration] Marker mismatch: expected "${kind}", got "${comment.textContent?.trim()}"`
          )
        }

        return comment
      }
      throw new Error('[Rasen Hydration] Expected marker comment but got: ' + node?.nodeName)
    }

    // Client mode: create detached marker; position decided by insert()
    return (parent.ownerDocument || document).createComment(kind)
  },

  /** 在 ref 之前插入节点（null = 追加到末尾）；也用于移动已有节点 */
  insert: (parent: HTMLElement, node: Node, ref: Node | null): void => {
    guardedInsertBefore(parent, node, ref)
  },

  /** 将节点从树上摘除 */
  detach: (node: Node): void => {
    node.parentNode?.removeChild(node)
  },

  /** 区间批量摘除：整段覆盖时走 textContent 快速路径，否则 Range 摘除 */
  extractRange: (parent: HTMLElement, start: Node, end: Node): void => {
    if (start.parentNode === parent && end.parentNode === parent) {
      // 区域 (start, end) 之外的节点属于宿主自身的标记（占位注释、空白文本），
      // 必须保下来。先数一下：只要这类节点不多，就用「整段弃子 + 回插幸存节点」，
      // 因为浏览器清空子列表是一次原生批量操作，而逐个 removeChild 是 N 次。
      const before: Node[] = []
      for (let n = parent.firstChild; n && n !== start; n = n.nextSibling) {
        before.push(n)
      }
      const after: Node[] = []
      for (let n = end.nextSibling; n; n = n.nextSibling) after.push(n)

      if (before.length + after.length <= MAX_OUTSIDE_NODES) {
        parent.textContent = ''
        for (const n of before) parent.appendChild(n)
        parent.appendChild(end)
        for (const n of after) parent.appendChild(n)
        return
      }
    }

    const range = (parent.ownerDocument || document).createRange()
    range.setStartAfter(start)
    range.setEndBefore(end)
    // deleteContents 而不是 extractContents：摘下来的节点是直接丢弃的，而
    // extractContents 会先把它们全部搬进一个随即被扔掉的 DocumentFragment
    // （千行规模下这是实打实的分配与迁移成本）。
    range.deleteContents()
  },

  /** 下一个兄弟节点（区间遍历用） */
  nextSibling: (node: Node): Node | null => {
    return node.nextSibling
  },

  /** 创建游离文本节点，返回句柄。水合模式下 claim 已有文本节点（已在 DOM 中，insert 时自动跳过）。 */
  createText: (parent: HTMLElement, content: string): TextHandle<Node> => {
    const hydrationContext = getHydrationContext()
    let textNode: Text

    if (hydrationContext) {
      const claimed = hydrationContext.claim()
      if (claimed?.nodeType === Node.TEXT_NODE) {
        textNode = claimed as Text
      } else {
        textNode = (parent.ownerDocument || document).createTextNode(content)
      }
    } else {
      textNode = (parent.ownerDocument || document).createTextNode(content)
    }

    return {
      node: textNode,
      update: (v: string) => {
        textNode.textContent = v
      },
    }
  },

  /**
   * DocumentFragment 暂存后一次性落位。
   * ⚠️ 返回的 `parent` 只在 flush 前有效（flush 后它是游离空壳），而挂载在其上
   * 的子树会缓存它——因此定位一律走 `insert` 的 ref 规则，不依赖这个 `parent`。
   */
  batch: (
    parent: HTMLElement
  ): {
    parent: HTMLElement
    flush: (parent: HTMLElement, ref: Node | null) => void
  } => {
    const fragment = (parent.ownerDocument || document).createDocumentFragment()
    return {
      parent: fragment as unknown as HTMLElement,
      flush: (targetHost: HTMLElement, ref: Node | null) => {
        guardedInsertBefore(targetHost, fragment, ref)
      },
    }
  },
}

/**
 * 类型导出
 */
export type HostHooks = typeof hostHooks
