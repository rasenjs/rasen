/**
 * Mount functions for React Native
 * @deprecated Use direct app mount to node: app(node) instead
 */

import type { Mountable } from '@rasenjs/core'
import type { Host } from './components/component'

/**
 * Mount a Rasen component to React Native
 * @deprecated Use direct app mount to node: app(node) instead
 */
export function mount(
  app: Mountable<Host>,
  parentNode: Host
): () => void {
  return app(parentNode)
}

export type { Host }
