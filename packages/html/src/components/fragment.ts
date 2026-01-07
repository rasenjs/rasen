/**
 * HTML fragment implementation for SSR
 */
import { getReactiveRuntime, type Mountable, type FragmentChild } from '@rasenjs/core'
import type { StringHost } from '../types'
import { escapeHtml } from '../utils'

/**
 * HTML fragment uses empty comments as separators between text nodes
 * to preserve the same structure as client-side rendering for proper hydration
 */
const hostHooks = {
  createTextNode: (text: string) => {
    // Wrap each text piece with comment markers for hydration matching
    return `<!-- t -->${escapeHtml(text)}<!-- /t -->`
  },
  appendNode: (host: StringHost, node: string) => host.append(node),
  updateTextNode: () => {
    // SSR 中不需要更新文本节点
  },
  removeNode: () => {
    // SSR 中不需要移除节点
  }
}

/**
 * Fragment function interface for HTML/SSR
 */
interface FragmentFunction {
  (config: { children: Array<Mountable<StringHost>> }): Mountable<StringHost>
  (strings: TemplateStringsArray, ...values: FragmentChild<StringHost>[]): Mountable<StringHost>
}

/**
 * fragment - 组合多个子组件
 * 
 * 注意：在 SSR 中，响应式值会被立即求值并转换为静态字符串
 * 
 * @example
 * // 对象参数用法
 * fragment({ children: [child1, child2] })
 * 
 * // Tagged template 用法
 * const count = ref(0)
 * fragment`Count: ${count} items`  // SSR: 立即求值
 * 
 * // 别名
 * f`Count: ${count} items`
 */
export const fragment: FragmentFunction = (
  configOrStrings: { children: Array<Mountable<StringHost>> } | TemplateStringsArray,
  ...values: FragmentChild<StringHost>[]
): Mountable<StringHost> => {
  const runtime = getReactiveRuntime()
  
  // 检测是否是 tagged template 调用
  if (Array.isArray(configOrStrings) && 'raw' in configOrStrings) {
    const strings = configOrStrings as TemplateStringsArray
    
    // 直接生成 HTML 字符串而不是通过 core fragment
    // 这样可以避免每个片段都被包装，减少注释标记
    return (host: StringHost) => {
      let html = ''
      for (let i = 0; i < strings.length; i++) {
        if (strings[i]) {
          html += escapeHtml(strings[i])
        }
        if (i < values.length) {
          const value = values[i]
          // Check if it's a ref
          if (runtime.isRef(value)) {
            html += escapeHtml(String((value as any).value))
          } else if (typeof value === 'string' || typeof value === 'number') {
            html += escapeHtml(String(value))
          }
          // Mountables not supported in template strings for SSR
        }
      }
      host.append(html)
      return undefined
    }
  }
  
  // For object config, import core fragment
  const { fragment: coreFragment } = require('@rasenjs/core')
  const config = configOrStrings as { children: Array<Mountable<StringHost>> }
  return coreFragment({ children: config.children, hooks: hostHooks })
}

/**
 * f - fragment 的简写别名
 */
export const f = fragment
