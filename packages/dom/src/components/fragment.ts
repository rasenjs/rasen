/**
 * DOM fragment implementation
 */
import { getReactiveRuntime, type Mountable, type FragmentChild } from '@rasenjs/core'
import { getHydrationContext } from '../hydration-context'
import { watchProp } from '../utils'

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
  const runtime = getReactiveRuntime()
  
  // 检测是否是 tagged template 调用
  if (Array.isArray(configOrStrings) && 'raw' in configOrStrings) {
    const strings = configOrStrings as TemplateStringsArray
    
    // 对于 template strings，我们需要创建一个单独的文本节点来匹配 SSR 输出
    // 而不是为每个部分创建独立的节点
    return (host: HTMLElement) => {
      const ctx = getHydrationContext()
      
      // 创建 computed 来组合所有部分
      const getText = () => {
        let result = ''
        for (let i = 0; i < strings.length; i++) {
          result += strings[i]
          if (i < values.length) {
            const value = values[i]
            if (runtime.isRef(value)) {
              result += String((value as any).value)
            } else if (typeof value === 'string' || typeof value === 'number') {
              result += String(value)
            }
          }
        }
        return result
      }
      
      let textNode: Text
      if (ctx?.isHydrating) {
        const claimed = ctx.claim()
        if (claimed?.nodeType === Node.TEXT_NODE) {
          textNode = claimed as Text
        } else {
          textNode = document.createTextNode(getText())
          host.appendChild(textNode)
        }
      } else {
        textNode = document.createTextNode(getText())
        host.appendChild(textNode)
      }
      
      // 监听所有响应式值的变化
      const stop = watchProp(getText, (text) => {
        textNode.textContent = text
      }, ctx?.isHydrating ?? false)
      
      return () => {
        stop()
        textNode.remove()
      }
    }
  }
  
  // 对象参数用法 - 使用 core fragment with hooks
  const { fragment: coreFragment } = require('@rasenjs/core')
  const config = configOrStrings as { children: Array<Mountable<HTMLElement>> }
  return coreFragment({ children: config.children, hooks: hostHooks })
}

/**
 * f - fragment 的简写别名
 */
export const f = fragment
