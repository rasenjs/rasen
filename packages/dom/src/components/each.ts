import { eachImpl, repeatImpl, toValue, type Mountable, type Ref, type PropValue } from '@rasenjs/core'
import { hostHooks } from '../host-hooks'

/**
 * DOM 优化版 each 组件
 *
 * 使用对象引用（WeakMap）追踪实例，适用于对象列表。
 * 在 core 的 each 基础上，提供 DOM 特定优化：
 * - 使用 Comment 节点作为标记
 * - 使用 DocumentFragment 批量插入
 * - 支持节点移动（insertBefore）
 */

/**
 * each - 对象列表渲染
 *
 * @param items 数组、响应式数组引用或 getter 函数
 * @param render 渲染函数
 */
export function each<T extends object>(
  items: T[] | Ref<T[]> | (() => T[]),
  render: (item: T, index: number) => Mountable<HTMLElement>
): Mountable<HTMLElement> {
  return eachImpl<T, HTMLElement, Node>({
    // toValue 统一处理 getter / Ref / 普通数组
    items: () => toValue(items),
    render,
    ...hostHooks
  })
}

/**
 * repeat - 值列表或数量渲染
 *
 * 使用索引追踪，适用于基本值列表或纯数量渲染。
 */
export function repeat<T>(
  items: Ref<T[]> | (() => T[]),
  render: (item: T, index: number) => Mountable<HTMLElement>
): Mountable<HTMLElement>

export function repeat(
  count: Ref<number> | (() => number),
  render: (index: number) => Mountable<HTMLElement>
): Mountable<HTMLElement>

export function repeat<T>(
  itemsOrCount: Ref<T[]> | Ref<number> | (() => T[]) | (() => number),
  render:
    | ((item: T, index: number) => Mountable<HTMLElement>)
    | ((index: number) => Mountable<HTMLElement>)
): Mountable<HTMLElement> {
  return repeatImpl<T, HTMLElement, Node>({
    items: () => {
      // toValue 统一处理 getter / Ref / 普通值
      const value = toValue(itemsOrCount as PropValue<T[] | number>)

      if (typeof value === 'number') {
        return Array.from({ length: value }, (_, i) => i) as T[]
      }
      return value as T[]
    },
    render: render as (item: T, index: number) => Mountable<HTMLElement>,
    ...hostHooks
  })
}
