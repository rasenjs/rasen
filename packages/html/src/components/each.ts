/**
 * HTML each/repeat components for SSR
 */
import { eachImpl, repeatImpl, toValue, type Mountable, type Ref } from '@rasenjs/core'
import { eachHostHooks } from '../host-hooks'
import type { StringHost } from '../types'

/**
 * each - object list rendering for SSR
 */
export function each<T extends object>(
  items: T[] | Ref<T[]> | (() => T[]),
  render: (item: T, index: number) => Mountable<StringHost>
): Mountable<StringHost> {
  return eachImpl<T, StringHost, string>({
    // toValue 统一处理 getter / Ref / 普通数组
    items: () => toValue(items),
    render,
    ...eachHostHooks
  })
}

/**
 * repeat - value list or count rendering for SSR
 */
export function repeat<T = any>(
  itemsOrCount: Ref<T[]> | (() => T[] | number) | Ref<number> | (() => number),
  render: ((item: T, index: number) => Mountable<StringHost>) | ((index: number) => Mountable<StringHost>)
): Mountable<StringHost> {
  return repeatImpl<T, StringHost, string>({
    items: itemsOrCount as () => T[],
    render: render as (item: T, index: number) => Mountable<StringHost>,
    ...eachHostHooks
  })
}
