/**
 * DOM 宿主钩子
 *
 * 为 core 的 when、each、match 等组件提供 DOM 操作能力
 * 这些操作是平台相关的，每个渲染目标需要自己实现
 *
 * 统一的 DOM 操作集合，包含所有组件可能需要的操作
 * 各组件按需使用其中的部分
 */

import { getHydrationContext } from './hydration-context'
import { isMarkerMatch } from './marker-constants'

/**
 * DOM 宿主钩子
 *
 * 包含 when、each、repeat、match 等组件需要的所有 DOM 操作
 * 支持 SSR hydration：在水合模式下会 claim 已有节点而不是创建新节点
 */
export const hostHooks = {
  /** 创建标记节点（注释节点）from host's ownerDocument to support iframe */
  createMarker: (host: HTMLElement, content: string) => {
    const hydrationContext = getHydrationContext()
    
    if (hydrationContext) {
      // Hydration mode: claim existing marker
      const node = hydrationContext.claim()
      if (node && node.nodeType === Node.COMMENT_NODE) {
        const comment = node as Comment
        
        // Verify marker content matches expected content
        if (!isMarkerMatch(comment, content)) {
          throw new Error(
            `[Rasen Hydration] Marker mismatch: expected "${content}", got "${comment.textContent?.trim()}"`
          )
        }
        
        return comment
      }
      throw new Error('[Rasen Hydration] Expected marker comment but got: ' + node?.nodeName)
    }
    
    // Client mode: create new marker with specified content
    return (host.ownerDocument || document).createComment(content) as Node
  },

  /** 将标记添加到宿主 */
  appendMarker: (host: HTMLElement, marker: Node) => {
    const hydrationContext = getHydrationContext()
    
    // In hydration mode, marker is already in DOM, skip append
    if (hydrationContext) {
      return
    }
    
    host.appendChild(marker)
  },

  /** 在指定位置之前插入节点 */
  insertBefore: (host: HTMLElement, node: Node, before: Node | null) => {
    host.insertBefore(node, before)
  },

  /** 移除节点（用于移除列表项等） */
  removeNode: (node: Node) => {
    node.parentNode?.removeChild(node)
  },

  /** 移除标记节点（与 removeNode 相同，语义不同） */
  get removeMarker() {
    return this.removeNode
  },

  /** 创建 DocumentFragment 用于批量插入 */
  createFragment: () => {
    const fragment = document.createDocumentFragment()
    return {
      host: fragment as unknown as HTMLElement,
      flush: (host: HTMLElement, before: Node | null) => {
        host.insertBefore(fragment, before)
      }
    }
  }
}

/**
 * 类型导出
 */
export type HostHooks = typeof hostHooks
