/**
 * tools/android-ripple — Pressable `android_ripple` support.
 *
 * Aligned with RN Pressable.js's useAndroidRippleForView (ported without
 * React hooks). RN's hook returns { viewProps, onPressIn, onPressMove,
 * onPressOut }:
 *  - viewProps: nativeBackgroundAndroid / nativeForegroundAndroid (ripple drawable)
 *  - onPressIn / onPressMove / onPressOut: dispatch native commands
 *    hotspotUpdate (ripple hotspot follows the finger) + setPressed
 *    (pressed scale state), matching ViewNativeComponent's supportedCommands
 *    ['focus', 'blur', 'hotspotUpdate', 'setPressed'].
 *
 * Commands are dispatched through rn-dom's dispatchCommand(node, name, args).
 */

import { Platform } from 'react-native'
import { dispatchCommand, type RNNode } from '@rasenjs/rn-dom'

/** PressableAndroidRippleConfig (aligned with RN useAndroidRippleForView.js). */
export interface PressableAndroidRippleConfig {
  color?: string | number
  borderless?: boolean
  radius?: number
  foreground?: boolean
  alpha?: number
}

/** Android drawable description (nativeBackgroundAndroid / nativeForegroundAndroid value). */
export interface NativeBackgroundAndroid {
  type: 'RippleAndroid'
  color: number | null
  borderless: boolean
  rippleRadius: number | undefined
  alpha: number | null
}

/** Approximate processColor (RN processColor: color string → ARGB number). */
export function processColor(color: string | number | undefined): number | null {
  if (color == null) return null
  if (typeof color === 'number') return color
  const s = color.trim()
  // #RGB / #RGBA / #RRGGBB / #AARRGGBB (RN/Android: 8-digit alpha comes first)
  const hex = s.replace(/^#/, '')
  if (
    /^[0-9a-fA-F]+$/.test(hex) &&
    (hex.length === 3 || hex.length === 4 || hex.length === 6 || hex.length === 8)
  ) {
    let r = 0, g = 0, b = 0, a = 255
    if (hex.length === 3 || hex.length === 4) {
      r = parseInt(hex[0] + hex[0], 16)
      g = parseInt(hex[1] + hex[1], 16)
      b = parseInt(hex[2] + hex[2], 16)
      if (hex.length === 4) a = parseInt(hex[3] + hex[3], 16)
    } else if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16)
      g = parseInt(hex.slice(2, 4), 16)
      b = parseInt(hex.slice(4, 6), 16)
    } else {
      // 8-digit: #AARRGGBB (alpha first, aligned with RN processColor).
      a = parseInt(hex.slice(0, 2), 16)
      r = parseInt(hex.slice(2, 4), 16)
      g = parseInt(hex.slice(4, 6), 16)
      b = parseInt(hex.slice(6, 8), 16)
    }
    // Android colors are ARGB (0xAARRGGBB).
    return ((a << 24) | (r << 16) | (g << 8) | b) >>> 0
  }
  // Named colors (rgba()/rgb()/named): simplify to null, let native use default.
  return null
}

/**
 * Convert android_ripple → View's nativeBackgroundAndroid / nativeForegroundAndroid.
 * Only returns on Android when color/borderless/radius is explicitly set
 * (aligned with RN); otherwise null.
 */
export function androidRippleToViewProps(
  rippleConfig: PressableAndroidRippleConfig | null | undefined,
): Record<string, unknown> | null {
  if (Platform.OS !== 'android') return null
  const { color, borderless, radius, foreground, alpha } = rippleConfig ?? {}
  if (color == null && borderless == null && radius == null) return null

  const nativeRippleValue: NativeBackgroundAndroid = {
    type: 'RippleAndroid',
    color: processColor(color),
    borderless: borderless === true,
    rippleRadius: radius,
    alpha: alpha ?? null,
  }
  return foreground === true
    ? { nativeForegroundAndroid: nativeRippleValue }
    : { nativeBackgroundAndroid: nativeRippleValue }
}

/** Ripple command handlers (aligned with RN useAndroidRippleForView callbacks). */
export interface AndroidRippleHandlers {
  onPressIn: (e?: unknown) => void
  onPressMove: (e?: unknown) => void
  onPressOut: (e?: unknown) => void
}

/** Read the touch location from a press event (event.nativeEvent.locationX/Y). */
function readLocation(e: unknown): { x: number; y: number } {
  const nativeEvent = (e as { nativeEvent?: { locationX?: number; locationY?: number } })?.nativeEvent
  return {
    x: nativeEvent?.locationX ?? 0,
    y: nativeEvent?.locationY ?? 0,
  }
}

/**
 * Generate command handlers for android_ripple (hotspotUpdate + setPressed).
 * Only returns on Android when color/borderless/radius is explicitly set;
 * otherwise null. getViewNode returns the rendered View node (command target) —
 * read at event time (aligned with RN's hook reading viewRef.current after mount).
 */
export function createAndroidRippleHandlers(
  rippleConfig: PressableAndroidRippleConfig | null | undefined,
  getViewNode: () => RNNode | null,
): AndroidRippleHandlers | null {
  if (Platform.OS !== 'android') return null
  const { color, borderless, radius } = rippleConfig ?? {}
  if (color == null && borderless == null && radius == null) return null

  return {
    onPressIn(e?: unknown): void {
      const { x, y } = readLocation(e)
      const viewNode = getViewNode()
      if (viewNode) {
        dispatchCommand(viewNode, 'hotspotUpdate', [x, y])
        dispatchCommand(viewNode, 'setPressed', [true])
      }
    },
    onPressMove(e?: unknown): void {
      const { x, y } = readLocation(e)
      const viewNode = getViewNode()
      if (viewNode) {
        dispatchCommand(viewNode, 'hotspotUpdate', [x, y])
      }
    },
    onPressOut(_e?: unknown): void {
      const viewNode = getViewNode()
      if (viewNode) {
        dispatchCommand(viewNode, 'setPressed', [false])
      }
    },
  }
}