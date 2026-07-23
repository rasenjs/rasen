/**
 * @rasenjs/react-native - Host Hooks
 * 
 * 为 core 的 when、each、match 等组件提供 RN 操作能力
 * 
 * 使用 RNCommentNode 作为逻辑 marker（不渲染到 Fabric）
 * 只在 DOM 层用于定位
 */

import { RNDocument } from '@rasenjs/rn-dom'
import type { RNNode, RNTextNode, RNCommentNode } from '@rasenjs/rn-dom'

/**
 * React Native 宿主钩子
 * 
 * 实现 core 需要的 DOM 操作接口
 */
export const hostHooks = {
  /** 创建标记节点（使用 RNCommentNode 作为占位符） */
  createMarker: (_host: RNNode, content: string): RNCommentNode => {
    // 使用 RNDocument 创建 comment
    return RNDocument.getOrCreate().createComment(content)
  },

  /** 将标记添加到宿主 */
  appendMarker: (host: RNNode, marker: RNCommentNode) => {
    host.appendChild(marker)
  },

  /** 在指定位置之前插入节点 */
  insertBefore: (host: RNNode, node: RNNode | RNTextNode | RNCommentNode, before: RNCommentNode | null) => {
    if (before) {
      host.insertBefore(node, before)
    } else {
      host.appendChild(node)
    }
  },

  /** 移除节点 */
  removeNode: (node: RNNode | RNTextNode | RNCommentNode) => {
    node.parentNode?.removeChild(node)
  },

  /** 移除标记节点 */
  removeMarker: (marker: unknown) => {
    const m = marker as RNCommentNode
    m.parentNode?.removeChild(m)
  }
}

export type HostHooks = typeof hostHooks
