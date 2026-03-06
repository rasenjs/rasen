/**
 * HTML each/repeat components for SSR
 */
import { eachImpl, repeatImpl, type Mountable, type Ref } from '@rasenjs/core'
import { eachHostHooks } from '../host-hooks'
import type { StringHost } from '../types'

/**
 * each - object list rendering for SSR
 */
export function each<T extends object>(
  items: T[] | Ref<T[]> | (() => T[]),
  render: (item: T, index: number) => Mountable<StringHost>
): Mountable<StringHost> {
  // Determine if it's a Ref (has value property)
  const isRef = (v: unknown): v is Ref<T[]> =>
    v !== null && typeof v === 'object' && 'value' in v

  return eachImpl<T, StringHost, string>({
    items:
      typeof items === 'function'
        ? items
        : isRef(items)
          ? () => items.value
          : () => items,
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
