/**
 * DOM fragment implementation
 */
import { type Mountable, type FragmentChild } from '@rasenjs/core'
import { getHydrationContext } from '../hydration-context'
import { isMarkerMatch } from '../marker-constants'

const hostHooks = {
  createTextNode: (text: string) => {
    const ctx = getHydrationContext()
    if (ctx?.isHydrating) {
      // In hydration mode, try to claim an existing text node
      const claimed = ctx.claim()
      if (claimed?.nodeType === Node.TEXT_NODE) {
        return claimed as Text
      }
      // If claimed node is not a text node, create a new one
      // (it will be appended by appendNode)
      return document.createTextNode(text)
    }
    return document.createTextNode(text)
  },
  appendNode: (host: HTMLElement, node: Node) => {
    // Only append if not already in DOM (hydration scenario)
    if (!node.parentNode) {
      host.appendChild(node)
    }
  },
  updateTextNode: (node: Node, text: string) => {
    node.textContent = text
  },
  removeNode: (node: Node) => {
    node.parentNode?.removeChild(node)
  },
  createMarker: (_host: HTMLElement, content: string) => {
    const ctx = getHydrationContext()
    
    if (ctx?.isHydrating) {
      // In hydration mode, claim existing comment marker
      const claimed = ctx.claim()
      if (claimed?.nodeType === Node.COMMENT_NODE) {
        const comment = claimed as Comment
        // Verify it's the correct marker using helper
        if (isMarkerMatch(comment, content)) {
          return comment
        }
      }
      // Marker mismatch - create new one
      console.warn(
        `[Rasen Hydration] Fragment marker mismatch: expected "<!-- ${content} -->"`,
        claimed
      )
      return document.createComment(content)
    }
    return document.createComment(content)
  },
  appendMarker: (host: HTMLElement, marker: Node) => {
    // Only append if not already in DOM (hydration scenario)
    if (!marker.parentNode) {
      host.appendChild(marker)
    }
  },
  removeMarker: (marker: Node) => {
    marker.parentNode?.removeChild(marker)
  }
}

/**
 * Fragment function interface for DOM
 */
interface FragmentFunction {
  (config: { children: Array<Mountable<HTMLElement>> }): Mountable<HTMLElement>
  (strings: TemplateStringsArray, ...values: FragmentChild<HTMLElement>[]): Mountable<HTMLElement>
}

/**
 * fragment - 组合多个子组件
 * 
 * @example
 * // 对象参数用法
 * fragment({ children: [child1, child2] })
 * 
 * // Tagged template 用法（支持响应式）
 * const count = ref(0)
 * fragment`Count: ${count} items`
 * 
 * // 别名
 * f`Count: ${count} items`
 */
export const fragment: FragmentFunction = (
  configOrStrings: { children: Array<Mountable<HTMLElement>> } | TemplateStringsArray,
  ...values: FragmentChild<HTMLElement>[]
): Mountable<HTMLElement> => {
  // 统一使用 core fragment - 无论是对象参数还是 tagged template
  const { fragment: coreFragment } = require('@rasenjs/core')
  
  // 检测是否是 tagged template 调用
  if (Array.isArray(configOrStrings) && 'raw' in configOrStrings) {
    const strings = configOrStrings as TemplateStringsArray
    
    // Tagged template: 将所有部分组合成单个响应式文本 child
    // core fragment 会通过 hostHooks.createTextNode 处理 hydration
    const children: Array<FragmentChild<HTMLElement>> = []
    
    // 将 template strings 和 values 交错组合
    for (let i = 0; i < strings.length; i++) {
      if (strings[i]) {
        children.push(strings[i])
      }
      if (i < values.length) {
        children.push(values[i])
      }
    }
    
    return coreFragment({ children, hooks: hostHooks })
  }
  
  // 对象参数用法
  const config = configOrStrings as { children: Array<Mountable<HTMLElement>> }
  return coreFragment({ children: config.children, hooks: hostHooks })
}

/**
 * f - fragment 的简写别名
 */
export const f = fragment
