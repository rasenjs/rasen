/**
 * Element component - base for all WebGL 2D components
 *
 * Thin adapter over the node mechanism: mounting creates a GlNode attached
 * to the received host (a group node becomes its parent; a top-level raw
 * host registers as a render root). Reactive deps → markDirty is handled
 * by createNode.
 */

import { com, type Mountable } from '@rasenjs/core'
import { createNode, type GlNode } from '../node'
import type { Bounds } from '../types'

export interface ElementProps {
  /**
   * Calculate component bounds.
   * Return `null` for 3D components (depth/camera dependent) — the
   * RenderContext falls back to full redraws for them.
   */
  getBounds: () => Bounds | null
  /** Draw function */
  draw: (gl: GlNode['ctx']) => void
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
  (props: ElementProps): Mountable<GlNode> => {
    return (parentNode: GlNode) => {
      const node = createNode(parentNode, {
        draw: () => props.draw(parentNode.ctx),
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
