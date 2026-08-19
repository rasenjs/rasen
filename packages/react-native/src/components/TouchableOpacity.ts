/**
 * TouchableOpacity — RN TouchableOpacity equivalent for Rasen.
 *
 * Press feedback: the view's opacity drops to `activeOpacity` (default 0.2)
 * while pressed, restoring to 1 on release. Aligned with RN's
 * TouchableOpacity (which renders a View + Pressability).
 */

import type { Mountable } from '@rasenjs/core'
import type { RNNode } from '@rasenjs/rn-dom'
import { createTouchable, type TouchableProps } from './touchable-base'

export interface TouchableOpacityProps extends TouchableProps {
  /** Opacity applied while pressed (default 0.2). */
  activeOpacity?: number
}

export function TouchableOpacity(props: TouchableOpacityProps): Mountable<RNNode> {
  return createTouchable(props, { activeOpacity: props.activeOpacity ?? 0.2 })
}