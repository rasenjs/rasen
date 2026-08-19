/**
 * TouchableWithoutFeedback — RN TouchableWithoutFeedback equivalent for Rasen.
 *
 * No visual feedback — only press events (onPress / onLongPress / onPressIn /
 * onPressOut). Aligned with RN's TouchableWithoutFeedback.
 */

import type { Mountable } from '@rasenjs/core'
import type { RNNode } from '@rasenjs/rn-dom'
import { createTouchable, type TouchableProps } from './touchable-base'

export interface TouchableWithoutFeedbackProps extends TouchableProps {}

export function TouchableWithoutFeedback(
  props: TouchableWithoutFeedbackProps,
): Mountable<RNNode> {
  return createTouchable(props, {})
}