/**
 * Fragment — the DOM host's implementation of JSX `<>…</>`.
 *
 * `processChildren` (jsx-runtime) deliberately keeps string / number / Ref
 * children in the child list — intrinsic tags turn them into text nodes — so a
 * Fragment has to do the same instead of calling every child as a mountable.
 * Core's `fragment()` does handle text children, but it needs host hooks and
 * those are only threaded to the ROOT mountable (`mount(x, container, hooks)`):
 * a Fragment nested inside an element is invoked as `child(host)`, so no hooks
 * ever reach it. The DOM adapter therefore provides its own hook-free variant.
 *
 * Text is written through `bindText` for Ref children so `<> {someRef} </>`
 * stays reactive, mirroring the intrinsic-tag child path.
 */

import { getReactiveRuntime, type Mountable, type PropValue } from '@rasenjs/core'
import { bindText } from '../bindings'

/** Core's hook-based fragment stays available for hosts that thread hooks. */
export { fragment, f } from '@rasenjs/core'

export function Fragment(props: { children?: unknown }): Mountable<HTMLElement> {
  const raw = props.children
  const kids = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw]

  return ((host: HTMLElement) => {
    const runtime = getReactiveRuntime()
    const cleanups: Array<(() => void) | undefined> = []

    // Nested arrays (`<>{a}{b.map(…)}</>`) are the same shape one level down.
    const flat: unknown[] = []
    const flatten = (list: unknown[]) => {
      for (const c of list) Array.isArray(c) ? flatten(c) : flat.push(c)
    }
    flatten(kids)

    for (const child of flat) {
      if (child === null || child === undefined || typeof child === 'boolean') continue

      if (typeof child === 'function') {
        cleanups.push((child as (h: HTMLElement) => (() => void) | undefined)(host))
        continue
      }

      // string | number | Ref — a text node, exactly like an element child
      const textNode = (host.ownerDocument || document).createTextNode('')
      host.appendChild(textNode)
      if (runtime.isRef(child)) {
        const stop = bindText(textNode, () => child as PropValue<unknown>)
        cleanups.push(() => { stop(); textNode.remove() })
      } else {
        textNode.textContent = String(child)
        cleanups.push(() => textNode.remove())
      }
    }

    return () => { for (const u of cleanups) if (u) u() }
  }) as unknown as Mountable<HTMLElement>
}
