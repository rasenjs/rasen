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
 *  - boundedHost：有界宿主视图，子树追加全部落在标记之前
 *  - batch：DocumentFragment 批量插入
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
    // 快速路径：区域 (start, end) 覆盖宿主全部子节点时，等价于原生
    // textContent=''（浏览器单次批量弃子，无 fragment 构建），随后恢复
    // end 哨兵。千行级 tbody 清空与 vanilla 的 removeAllRows 同级成本。
    if (start.previousSibling === null && end.nextSibling === null &&
        start.parentNode === parent && end.parentNode === parent) {
      parent.textContent = ''
      parent.appendChild(end)
      return
    }

    const range = (parent.ownerDocument || document).createRange()
    range.setStartAfter(start)
    range.setEndBefore(end)
    // 摘下的 fragment 直接丢弃，由 GC 回收
    range.extractContents()
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
   * 有界宿主：透传所有宿主属性（ownerDocument 等），
   * 只拦截 appendChild / insertBefore 重定向到标记之前。
   */
  boundedHost: (parent: HTMLElement, marker: Node): HTMLElement => {
    return new Proxy(parent, {
      get(target, prop, receiver) {
        if (prop === 'appendChild') {
          return (node: Node) => {
            guardedInsertBefore(target, node, marker)
            return node
          }
        }
        if (prop === 'insertBefore') {
          return (node: Node, ref: Node | null) => {
            guardedInsertBefore(target, node, ref || marker)
            return node
          }
        }
        return Reflect.get(target, prop, receiver)
      },
    }) as HTMLElement
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
