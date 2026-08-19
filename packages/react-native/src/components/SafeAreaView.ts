/**
 * SafeAreaView — RN SafeAreaView equivalent for Rasen.
 *
 * RN's SafeAreaView is a thin wrapper over the native RCTSafeAreaView (iOS
 * auto-avoids safe areas). rn-dom maps the 'SafeAreaView' tag to
 * 'RCTSafeAreaView' (iOS) / 'SafeAreaView' (Android). This component passes
 * props through and renders children.
 *
 * Note: RN 0.86 marks SafeAreaView deprecated (react-native-safe-area-context
 * is recommended), but RN still exports it — this wrapper keeps the API
 * complete.
 */

import type { Mountable } from '@rasenjs/core'
import type { RNNode } from '@rasenjs/rn-dom'
import { element, type Child } from '../element'

export interface SafeAreaViewProps {
  style?: Record<string, unknown> | Array<Record<string, unknown>> | (() => Record<string, unknown>)
  testID?: string
  accessible?: boolean
  onLayout?: (e?: unknown) => void
  children?: Child | Child[]
  [key: string]: unknown
}

export function SafeAreaView(props: SafeAreaViewProps): Mountable<RNNode> {
  const { children, ...rest } = props
  return element('SafeAreaView', {
    ...rest,
    children,
  })
}