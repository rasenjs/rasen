/**
 * TouchableHighlight — RN TouchableHighlight equivalent for Rasen.
 *
 * Press feedback: the view's background becomes `underlayColor` (default
 * 'black') and its opacity drops to `activeOpacity` (default 0.85) while
 * pressed, restoring on release. Aligned with RN's TouchableHighlight.
 */

import type { Mountable } from '@rasenjs/core'
import type { RNNode } from '@rasenjs/rn-dom'
import { createTouchable, type TouchableProps } from './touchable-base'

export interface TouchableHighlightProps extends TouchableProps {
  /** Opacity applied while pressed (default 0.85). */
  activeOpacity?: number
  /** Background color applied while pressed (default 'black'). */
  underlayColor?: string
}

export function TouchableHighlight(props: TouchableHighlightProps): Mountable<RNNode> {
  return createTouchable(props, {
    activeOpacity: props.activeOpacity ?? 0.85,
    underlayColor: props.underlayColor ?? 'black',
  })
}