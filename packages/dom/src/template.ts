/**
 * HTML-string → DOM acquisition layer — the compilation target for build-time
 * static hoisting and the runtime escape hatch for raw HTML.
 *
 * All three acquisition modes live here because they are the same machinery:
 *
 *   | mode     | entry            | behavior                                    |
 *   |----------|------------------|---------------------------------------------|
 *   | CSR      | template(html)   | parse once, cache skeleton, clone per call  |
 *   | raw      | html({ content })| reactive insertion of an HTML string        |
 *   | hydrate  | adopt(el)        | mark server-rendered DOM as the root        |
 *
 * These mirror the runtime layer of compiled no-vdom frameworks (Vue Vapor's
 * `_template`/`_child`/`_next`/`_txt`, Solid's `_template` + navigation
 * chains, Svelte 5's `$.from_html` + `$.child`): a future compiler emits
 * calls to these helpers instead of running the element factory chain.
 *
 * Generated code shape:
 *
 *   import { template, child, bindText } from '@rasenjs/dom/template'
 *
 *   const t0 = template('<tr class=row><td class=col-md-1> </td></tr>')
 *   function Row(item) {
 *     const n = t0(host)
 *     const td = child(n, 0)
 *     const x = child(td, 0) // text placeholder handle
 *     offs.push(bindText(x, () => item.id)) // dynamic wiring, exact node
 *     return n
 *   }
 *
 * This module owns NODE ACQUISITION (clone / adopt / raw insert) and
 * NAVIGATION (absolute-index `child()` — the compiler bakes full paths from
 * the root, so no relative helpers are needed). All value wiring lives in
 * the shared binding layer (`bindings.ts`) — the same layer the element
 * factory chain uses; the two entry points differ only in how nodes are
 * obtained.
 *
 * Contract:
 *  - `html` must be minified (no whitespace between tags) so that
 *    childNodes indices are stable; dynamic text positions use a single
 *    space placeholder inside their parent.
 *  - Clones are plain DOM: event listeners must be attached per instance,
 *    reactive wiring is generated code's responsibility.
 *  - Lazy skeleton init keeps module-level template() calls SSR-safe until
 *    actually invoked on a client.
 */

import { claimElement, getHydrationContext, isHydrating } from './hydration-context'

/** Parse an HTML string into a detached fragment. Shared core of every
 *  acquisition mode above; also consumed by the html component
 *  (components/html.ts). */
export function parseFragment(source: string): DocumentFragment {
  const t = document.createElement('template')
  t.innerHTML = source
  return t.content
}

/**
 * Parse HTML once; each call returns an instance of the root.
 *
 * Acquisition policy (the ONLY mode branch, shared by both flows):
 *  - `t0(host)` while hydrating → claim the server-rendered counterpart,
 *    verify the tag against the skeleton, adopt it (no re-insertion).
 *    Navigation paths below work identically on adopted roots because the
 *    server emitted the same template HTML.
 *  - `t0(host)` otherwise → clone + appendChild to host.
 *  - `t0()` → pure clone (no host interaction).
 */
export function template(html: string): (host?: HTMLElement) => HTMLElement {
  let skeleton: HTMLElement | null = null
  const ensureSkeleton = (): HTMLElement => {
    if (!skeleton) {
      const first = parseFragment(html).firstElementChild
      if (!first) {
        throw new Error('[Rasen template] html must contain a root element')
      }
      skeleton = first as HTMLElement
    }
    return skeleton
  }
  return (host?: HTMLElement) => {
    if (host) {
      // Expected tag comes from the skeleton: the HTML string stays the
      // single source of truth for structure. On mismatch claimElement
      // removes the stale node and we fall through to clone+append.
      const claimed = claimElement(ensureSkeleton().tagName.toLowerCase())
      if (claimed) return adopt(claimed)
    }
    const n = ensureSkeleton().cloneNode(true) as HTMLElement
    host?.appendChild(n)
    return n
  }
}

/** nth child node of parent (childNodes-based; see contract above). */
export function child(parent: ParentNode, index: number): ChildNode {
  return parent.childNodes[index]
}

/** Mark an existing DOM element as a template root (hydration mode).
 *  Internal: t0(host) adopts claimed roots; not part of the public API. */
function adopt<N extends Element>(el: N): N {
  return el
}

// ---------------------------------------------------------------------------
// Component mount points (P4a) — slot anchors inside compiled templates
//
// The compiler bakes `<!--rasen-slot-->` at each component-child position
// and emits the matching close marker around SSR child output.
// All three modes pass a HOST down to the child (pure Mountable protocol):
//   CSR      → detached DocumentFragment; children spliced before the anchor
//   Hydration→ cursor window over the slot region; the child claims its own
//              nodes (recursing into t0(host) works untouched)
//   SSR      → ssrSlot() (core) runs the child against a temp StringHost;
//              open/close markers are positional literals in the parent's
//              emission, symmetric with the template anchor.
// ---------------------------------------------------------------------------

/** Mount a component at a slot anchor (CSR or hydration). */
export function mountSlot(
  anchor: ChildNode,
  m: (host: unknown) => unknown
): () => void {
  const parent = anchor.parentNode!
  if (isHydrating()) {
    // Window into the slot region: inner content follows the opening
    // comment; the closing comment terminates the window. The child
    // claims its own nodes; host is only used for mismatch fallbacks.
    const ctx = getHydrationContext()
    ctx!.enterAt(anchor.nextSibling!)
    const un = m(parent)
    ctx!.claim() // consume closing marker comment
    ctx!.exitChildren()
    return un as () => void
  }
  // CSR: fragment as host keeps the Mountable protocol untouched, then all
  // children splice in before the anchor in one insertion.
  const frag = document.createDocumentFragment()
  const un = m(frag)
  parent.insertBefore(frag, anchor)
  return un as () => void
}

// Re-export the shared binding layer: compiled code imports everything from
// '@rasenjs/dom/template' (the compiler's default `templateSource`).
export {
  bindClass,
  bindStyle,
  bindText,
  bindProp,
  bindAttr,
  bindKey,
  on,
  configureEventDelegation,
  escapeHtml,
  escapeAttr,
  renderText,
  type StyleSource,
} from './bindings'
// SSR slot collector — pure string helper, lives in core alongside the
// other SSR emission utils; re-exported for the compiler's import source.
export { collectHtml } from '@rasenjs/core'
