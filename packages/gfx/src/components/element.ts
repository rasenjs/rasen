/**
 * Element component - base for all WebGL 2D components
 *
 * Thin adapter over the node mechanism: mounting creates a GlNode attached
 * to the received host (a group node becomes its parent; a top-level raw
 * host registers as a render root). Reactive deps → markDirty is handled
 * by createNode.
 */

import { com, type Mountable } from '@rasenjs/core'
import { createNode, type GfxNode } from '../node'
import type { Bounds } from '../types'

export interface ElementProps {
  /**
   * Calculate component bounds.
   * Return `null` for 3D components (depth/camera dependent) — the
   * RenderContext falls back to full redraws for them.
   */
  getBounds: () => Bounds | null
  /** Draw function */
  draw: (node: GfxNode) => void
  /** Collect reactive dependencies */
  deps: () => unknown[]
}

/**
 * Element component - base for all WebGL shapes
 *
 * Handles:
 * - Scene-tree attachment via createNode (RenderContext is ensured lazily)
 * - Reactive dependency tracking (deps → markDirty, by createNode)
 * - Cleanup (node removal detaches from the tree and stops subscriptions)
 */
export const element = com(
  (props: ElementProps): Mountable<GfxNode> => {
    return (parentNode: GfxNode) => {
      const node = createNode(parentNode, {
        // Submit through the element's OWN node, not the mount host.
        //
        // The host is only a placement target: under a bounded mount (each
        // with a boundary, i.e. insertion in the middle of a list) it is a
        // Proxy whose `get` trap re-binds every method it hands out. Passing
        // it here put that Proxy on the per-frame path — every
        // beginMesh/endMesh the component issues went through the trap and
        // allocated a bound function, ~1.3 ms/frame at 200 spine instances.
        // Both nodes share the renderer, so submissions are identical.
        draw: () => props.draw(node),
        bounds: props.getBounds,
        deps: props.deps
      })

      // Cleanup: detach from the tree and stop reactive subscriptions
      return () => {
        node.remove()
      }
    }
  }
)
