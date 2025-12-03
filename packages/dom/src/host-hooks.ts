/**
 * DOM 宿主钩子
 *
 * 为 core 的 when、each、switchCase 等组件提供 DOM 操作能力
 * 这些操作是平台相关的，每个渲染目标需要自己实现
 *
 * 统一的 DOM 操作集合，包含所有组件可能需要的操作
 * 各组件按需使用其中的部分
 */

/**
 * DOM 宿主钩子
 *
 * 包含 when、each、repeat、switchCase 等组件需要的所有 DOM 操作
 */
export const hostHooks = {
  /** 创建标记节点（注释节点） */
  createMarker: () => document.createComment('') as Node,

  /** 将标记添加到宿主 */
  appendMarker: (host: HTMLElement, marker: Node) => {
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
