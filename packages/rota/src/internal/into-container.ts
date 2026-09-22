/**
 * The escape hatch for a part that has to render somewhere else.
 *
 * This is deliberately **not** a Portal layer. `Mountable<Node>` already takes
 * its host as an argument, so "render it over there" is another host, not
 * another mechanism - and adding a mechanism would mean teaching every renderer
 * (DOM, string, canvas, native) a relocation protocol they each have to
 * implement and keep in step. Wrapping the part instead leaves the renderers,
 * the compiler and every other host untouched.
 *
 * `container` is a `PropValue`, so a consumer can hand it a getter - which is
 * what most want, since the container usually is not resolvable at render time:
 *
 * ```ts
 * Content({ container: () => document.getElementById('overlay-root') })
 * ```
 *
 * Three cases, one implementation:
 *
 * - **Client render** - the part mounts where it sits, then moves. Identity is
 *   preserved (same element, same ref, same listeners, same state), so the
 *   focus scope and the dismissable layer keep working without knowing.
 * - **Hydration** - the part claims its server-rendered nodes *where the server
 *   put them*, which it must, because the hydration cursor walks the markup in
 *   order; the move happens afterwards. The markup is therefore identical to
 *   the default path, which is what makes hydration match.
 * - **Server render** - there is no document, so the container resolves to
 *   `null` and the part renders inline. A consumer's getter is never called on
 *   the server, so `() => document.getElementById(...)` is safe to write, and
 *   the component does not need a second output target.
 *
 * **One rule, every part that renders out of flow.** Any part whose element is
 * a layer or an overlay - dialog and alert-dialog content and overlay, popover
 * and tooltip content - accepts the same prop with the same meaning. A part
 * that positions itself against its trigger (popover, tooltip) is not excepted:
 * the prop means the same thing there, and the positioning consequence below is
 * the application's to handle. Special-casing which components get it would
 * make the API unpredictable, which costs more than the case it saves.
 *
 * The contract this creates belongs to the application, and it is the price of
 * not hiding the decision in a provider:
 *
 * 1. the container is the application's element, and the part is no longer a
 *    descendant of its component - so ancestor-scoped CSS no longer matches it
 * 2. the container becomes the part's positioning context, so a part that
 *    positions against its trigger needs the application to position it
 * 3. if the container cannot be resolved when the part mounts (for example the
 *    application has not hydrated it yet), the part stays inline - which is the
 *    default behaviour, not a broken state
 *
 * With no `container` the part is returned unchanged: the wrapper is not even
 * created, so the default path costs nothing and behaves exactly as before.
 */
import type { Mountable, PropValue } from '@rasenjs/core'
import { readProp } from './props'
import type { ElementRef } from './element-ref'

/**
 * The escape hatch, declared once.
 *
 * Every out-of-flow part extends this, so the prop cannot drift between
 * components - and its documentation lives in exactly one place (the file
 * comment above), rather than being restated per component with the risk of
 * describing it differently.
 */
export interface ContainerProp {
  /** See the file comment: render this part into an element of your choosing. */
  container?: PropValue<HTMLElement | null>
}

export function intoContainer(
  node: Mountable<HTMLElement>,
  element: ElementRef<HTMLElement>,
  container: PropValue<HTMLElement | null> | undefined
): Mountable<HTMLElement> {
  if (container === undefined) return node

  return (host, hooks) => {
    // Mount (or claim) in place first: during hydration the nodes have to be
    // taken from where the server emitted them.
    const unmount = node(host, hooks)

    // Never resolve the container without a document. The alternative is every
    // consumer writing its own `typeof document` guard, and an SSR build
    // crashing on the one that forgot.
    const target =
      typeof document === 'undefined' ? null : readProp(container, null)
    const el = element.value

    if (target && el && el.parentNode !== target) {
      target.appendChild(el)
    }

    return unmount
  }
}
