/**
 * Run something when a mountable is unmounted.
 *
 * Parts need this to undo a registration (a roving-focus item announces
 * itself, then has to withdraw). Wrapping the mountable is the Mountable
 * protocol itself — the framework calls the cleanup — so it needs no DOM.
 */
import type { Mountable } from '@rasenjs/core'

export function withCleanup(
  node: Mountable<HTMLElement>,
  cleanup: () => void
): Mountable<HTMLElement> {
  return (host, hooks) => {
    const unmount = node(host, hooks)
    return () => {
      unmount?.()
      cleanup()
    }
  }
}
