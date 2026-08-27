/**
 * mountLynx — renderer entry
 *
 * Creates (or adopts) a page element, mounts the component tree into it
 * with the Lynx host hooks, and returns an unmount function.
 */

import type { Mountable, HostHooks } from '@rasenjs/core'
import type { LynxNode } from './node'
import { unlink, wrapElement } from './node'
import { lynxHostHooks } from './host-hooks'
import * as papi from './papi'

/**
 * Mount a Rasen component tree into a Lynx page.
 *
 * @param mountable - component tree root
 * @param existingPage - optional native page element to adopt; created via
 *                       `__CreatePage` when omitted
 * @returns unmount function detaching the whole tree
 */
export function mountLynx(
  mountable: Mountable<LynxNode>,
  existingPage?: papi.LynxElement,
  hooks: HostHooks<LynxNode> = lynxHostHooks
): () => void {
  const pageEl = existingPage ?? papi.createPage('page', 0)
  const rootNode = wrapElement(pageEl, 'page')

  const unmount = mountable(rootNode, hooks)
  papi.scheduleFlush()

  return () => {
    if (unmount) unmount()
    // Drop any children left on the page root itself
    let child = rootNode.firstChild
    while (child !== null) {
      const next = child.nextSibling
      if (child.el !== null) papi.removeElement(pageEl, child.el)
      unlink(child)
      child = next
    }
    papi.scheduleFlush()
  }
}
