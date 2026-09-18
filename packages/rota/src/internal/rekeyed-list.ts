/**
 * List helper for value-derived children.
 *
 * `each` keys instances by object identity, which suits arrays of objects but
 * not a `string[]`: there is no stable identity to hand it, and it keeps
 * surviving instances mounted — so an `index` handed to a part goes stale as
 * soon as an item is removed, and every positional binding with it.
 *
 * This helper takes the other trade: it re-mounts the whole list whenever the
 * items change. Indices always match the current array, removal and insertion
 * are immediately correct, and short lists (tags, cells) are exactly the case
 * where DOM churn costs nothing.
 */
import type { Mountable } from '@rasenjs/core'
import { com, getReactiveRuntime, type HostHooks } from '@rasenjs/core'

export function rekeyedList<T>(
  items: () => T[],
  render: (item: T, index: number) => Mountable<HTMLElement>
): Mountable<HTMLElement> {
  // `com` wraps a component factory; calling it here gives this list its own
  // scope, so the subscription stops with the list.
  return com(
    (): Mountable<HTMLElement> =>
      (host: HTMLElement, hooks: HostHooks<HTMLElement> | undefined) => {
        const rt = getReactiveRuntime()
        let unmounts: (() => void)[] = []

        const clear = (): void => {
          // Reverse order: later children may hold references to earlier ones.
          for (const unmount of unmounts.reverse()) unmount()
          unmounts = []
        }

        const draw = (): void => {
          const list = items()
          for (let index = 0; index < list.length; index++) {
            const unmount = render(list[index]!, index)(host, hooks)
            if (typeof unmount === 'function') unmounts.push(unmount)
          }
        }

        draw()
        const stop = rt.subscribe(items, () => {
          clear()
          draw()
        })

        return () => {
          stop()
          clear()
        }
      }
  )()
}
