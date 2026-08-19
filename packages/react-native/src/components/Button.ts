/**
 * Button — RN Button equivalent for Rasen.
 *
 * RN's Button is a pure JS component (no dedicated native ViewManager):
 * Android → TouchableNativeFeedback + View + Text, iOS → TouchableOpacity.
 * Here it's assembled with a View + Text (hitting rn-dom's press synthesis),
 * with an API matching RN:
 *
 *  - Android: background #2196F3 + elevation 4 + borderRadius 2, uppercase title
 *  - iOS: text color #007AFF + fontSize 18
 *  - `color` prop is platform-split (iOS text color / Android background)
 *  - disabled styles (Android #dfdfdf / iOS text #cdcdcd)
 */

import { Platform } from 'react-native'
import type { Mountable } from '@rasenjs/core'
import type { RNNode } from '@rasenjs/rn-dom'
import { element, type Child } from '../element'
import { createTouchable, type TouchableProps, type TouchableState } from './touchable-base'
import type { StyleValue } from '../utils/style'

type StyleEntry = Record<string, unknown> | ((state: TouchableState) => StyleValue)

const buttonStyles = {
  button: Platform.select({
    ios: {},
    android: { elevation: 4, backgroundColor: '#2196F3', borderRadius: 2 },
  }),
  text: {
    textAlign: 'center' as const,
    margin: 8,
    ...Platform.select({
      ios: { color: '#007AFF', fontSize: 18 },
      android: { color: 'white', fontWeight: '500' as const },
    }),
  },
  buttonDisabled: Platform.select({
    ios: {},
    android: { elevation: 0, backgroundColor: '#dfdfdf' },
  }),
  textDisabled: Platform.select({
    ios: { color: '#cdcdcd' },
    android: { color: '#a1a1a1' },
  }),
}

export interface ButtonProps extends TouchableProps {
  title: string
  /** Text color (iOS) / background color (Android), same as RN. */
  color?: string
  /** @platform android */
  touchSoundDisabled?: boolean
  importantForAccessibility?: string
}

export function Button(props: ButtonProps): Mountable<RNNode> {
  const {
    title,
    onPress,
    onLongPress,
    color,
    disabled,
    accessibilityLabel,
    accessibilityState,
    testID,
    style,
    ...rest
  } = props

  const buttonStyle: StyleEntry[] = [buttonStyles.button ?? {}]
  const textStyle: Record<string, unknown>[] = [buttonStyles.text ?? {}]
  if (color) {
    if (Platform.OS === 'ios') textStyle.push({ color })
    else buttonStyle.push({ backgroundColor: color })
  }
  if (disabled) {
    buttonStyle.push(buttonStyles.buttonDisabled ?? {})
    textStyle.push(buttonStyles.textDisabled ?? {})
  }
  if (style) {
    if (Array.isArray(style)) buttonStyle.push(...style as StyleEntry[])
    else buttonStyle.push(style as StyleEntry)
  }

  const formattedTitle = Platform.OS === 'android' ? title.toUpperCase() : title

  const children: Child = element('Text', {
    style: textStyle,
    children: formattedTitle,
  })

  return createTouchable(
    {
      ...rest,
      onPress,
      onLongPress,
      disabled,
      accessibilityLabel,
      accessibilityState,
      testID,
      style: buttonStyle,
      children,
    },
    {},
  )
}