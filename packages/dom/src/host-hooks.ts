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
 *  - batch：DocumentFragment 批量插入（有界挂载的唯一方式：子树挂到 fragment，
 *    再一次性插到 ref 之前。不再用 Proxy 伪装宿主。）
 */

import type { TextHandle } from '@rasenjs/core'
import { getHydrationContext } from './hydration-context'
import { isMarkerMatch } from './marker-constants'

/**
 * 受保护的插入：水合模式下跳过已被 claim 的节点（它们已在正确位置）。
 */
function guardedInsertBefore(
  parent: HTMLElement,
  node: Node,
  ref: Node | null
): void {
  const ctx = getHydrationContext()
  if (ctx?.isHydrating && node.parentNode) return
  parent.insertBefore(node, ref)
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

  /** DocumentFragment 批量插入：在暂存宿主上挂载，flush 时一次性落位 */
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
