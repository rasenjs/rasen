/**
 * each - 列表渲染组件
 */

import 'react-native/Libraries/Text/TextNativeComponent'

import { eachImpl, type EachImplConfig } from '@rasenjs/core'
import type { Mountable } from '@rasenjs/core'
import type { Ref } from '@rasenjs/core'
import { RNNode } from '../node'

/**
 * each - 对象列表渲染
 *
 * 使用 eachImpl 实现
 *
 * @param items - 数组或响应式引用
 * @param render - 渲染函数，接收 (item, index)
 */
export function each<T extends object>(
  items: T[] | Ref<T[]>,
  render: (item: T, index: number) => Mountable<RNNode>
): Mountable<RNNode> {
  const config: EachImplConfig<T, RNNode, RNNode> = {
    items: () => {
      if (Array.isArray(items)) {
        return items
      }
      return (items as Ref<T[]>).value
    },
    render,
    removeNode: (node) => {
      const parent = (node as RNNode).parentNode
      if (parent) {
        parent.removeChild(node as RNNode)
      }
    }
  }

  return eachImpl<T, RNNode, RNNode>(config)
}
