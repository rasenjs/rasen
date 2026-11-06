/**
 * Fragment — the DOM host's implementation of JSX `<>…</>`.
 *
 * `processChildren` (jsx-runtime) deliberately keeps string / number / Ref
 * children in the child list — intrinsic tags turn them into text nodes — so a
 * Fragment has to do the same instead of calling every child as a mountable.
 * Core's `fragment()` does handle text children, but it needs host hooks and
 * those are only threaded to the ROOT mountable (`mount(x, container, hooks)`):
 * a Fragment nested inside an element is invoked as `child(host)`, so no hooks
 * ever reach it. The DOM adapter therefore provides its own variant that
 * creates the text nodes itself.
 *
 * Text is written through `bindText` for Ref children so `<> {someRef} </>`
 * stays reactive, mirroring the intrinsic-tag child path.
 *
 * The host hooks DO travel with the children, though. A structural child
 * (`when`/`each`/`match`) needs them: `when` creates its marker with
 * `hooks.createMarker` and stages its branch with `hooks.batch`, and without
 * a marker it cannot find where to insert — it falls back to appending into
 * whatever host it was given. That host is often a staging `DocumentFragment`
 * which the enclosing `when` has already flushed into the tree, so the branch
 * lands in a detached shell and never appears. This is the whole of why a
 * panel inside a gate used to stay shut.
 */

import { getReactiveRuntime, normalizeChildren, type Mountable, type PropValue } from '@rasenjs/core'
import { bindText } from '../bindings'
import type { HostHooks as DomHostHooks } from '../host-hooks'

/** Core's hook-based fragment stays available for hosts that thread hooks. */
export { fragment, f } from '@rasenjs/core'

export function Fragment(props: { children?: unknown }): Mountable<HTMLElement> {
  // One rule, shared with core/compilers (coerce, flatten, drop
  // nullish/boolean) — this host only owns the per-child rendering below.
  const kids = normalizeChildren(props.children)

  return ((host: HTMLElement, hooks?: DomHostHooks) => {
    const runtime = getReactiveRuntime()
    const cleanups: Array<(() => void) | undefined> = []

    for (const child of kids) {
      if (typeof child === 'function') {
        // The hooks go down with the child: a structural child places its
        // content with them (see the note above).
        cleanups.push(
          (child as (h: HTMLElement, hooks?: DomHostHooks) => (() => void) | undefined)(host, hooks),
        )
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
