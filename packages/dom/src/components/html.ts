import type { SyncComponent, PropValue } from '@rasenjs/core'
import { unref, watchProp } from '../utils'

/**
 * html 组件 - 用于插入原始 HTML 内容
 *
 * 直接将 HTML 字符串解析为 DOM 节点并插入到父元素中，不创建额外的包裹元素。
 * 支持多个节点的同时插入和移除。
 *
 * 安全提示：请确保传入的 HTML 内容是可信的，因为它会直接插入到 DOM 中
 *
 * @example
 * ```ts
 * // 静态 HTML - 直接插入节点
 * div({}, html({ content: '<p>paragraph</p><span>text</span>' }))
 * // 结果: <div><p>paragraph</p><span>text</span></div>
 *
 * // 响应式 HTML
 * const content = ref('<em>Italic</em>')
 * html({ content })
 * ```
 */
export const html: SyncComponent<
  HTMLElement,
  {
    /** 原始 HTML 内容 */
    content: PropValue<string>
  }
> = (props) => {
  return (host) => {
    // 用于追踪当前插入的所有节点
    let currentNodes: Node[] = []
    // 用于定位插入位置的锚点注释节点
    const anchor = document.createComment('html')
    host.appendChild(anchor)

    /**
     * 解析 HTML 字符串为 DOM 节点数组
     */
    const parseHTML = (htmlString: string): Node[] => {
      const template = document.createElement('template')
      template.innerHTML = htmlString
      return Array.from(template.content.childNodes)
    }

    /**
     * 移除当前所有插入的节点
     */
    const removeCurrentNodes = () => {
      for (const node of currentNodes) {
        node.parentNode?.removeChild(node)
      }
      currentNodes = []
    }

    /**
     * 在锚点前插入新节点
     */
    const insertNodes = (nodes: Node[]) => {
      for (const node of nodes) {
        anchor.parentNode?.insertBefore(node, anchor)
      }
      currentNodes = nodes
    }

    const stop = watchProp(
      () => unref(props.content),
      (value) => {
        removeCurrentNodes()
        if (value) {
          const nodes = parseHTML(value)
          insertNodes(nodes)
        }
      }
    )

    return () => {
      stop()
      removeCurrentNodes()
      anchor.remove()
    }
  }
}
