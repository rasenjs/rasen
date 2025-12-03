import { eachImpl, repeatImpl, type Mountable, type Ref } from '@rasenjs/core'
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
  // 判断是否为 Ref（有 value 属性）
  const isRef = (v: unknown): v is Ref<T[]> =>
    v !== null && typeof v === 'object' && 'value' in v

  return eachImpl<T, HTMLElement, Node>({
    items:
      typeof items === 'function'
        ? items
        : isRef(items)
          ? () => items.value
          : () => items, // 普通数组
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
      const value =
        typeof itemsOrCount === 'function' ? itemsOrCount() : itemsOrCount.value

      if (typeof value === 'number') {
        return Array.from({ length: value }, (_, i) => i) as T[]
      }
      return value as T[]
    },
    render: render as (item: T, index: number) => Mountable<HTMLElement>,
    ...hostHooks
  })
}
