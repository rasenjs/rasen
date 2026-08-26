/**
 * KeyboardAvoidingView — RN KeyboardAvoidingView equivalent for Rasen.
 *
 * RN's KeyboardAvoidingView is a pure JS component (View + keyboard event
 * listeners, no dedicated native ViewManager). This implementation matches
 * RN's padding behavior:
 *
 *  - behavior='padding' (or default) adds paddingBottom when the keyboard shows
 *  - keyboardVerticalOffset is subtracted from the keyboard height
 *  - enabled=false disables the response entirely
 *
 * Note: RN's position/height behaviors rely on Animated + measure internally;
 * this implementation approximates with padding (as the web implementation
 * does) — prefer `padding` for complex layouts.
 */

import { Platform, Keyboard } from 'react-native'
import { getReactiveRuntime, ref, type Mountable } from '@rasenjs/core'
import type { RNNode } from '@rasenjs/rn-dom'
import { renderChildren, type Child } from '../element'
import { resolveStyle, applyStyleToNode, type StyleProp } from '../utils/style'

const baseStyle = {
  alignItems: 'stretch',
  backgroundColor: 'transparent',
  borderWidth: 0,
  borderStyle: 'solid',
  boxSizing: 'border-box',
  display: 'flex',
  flexBasis: 'auto',
  flexDirection: 'column',
  flexShrink: 0,
  margin: 0,
  minHeight: 0,
  minWidth: 0,
  padding: 0,
  position: 'relative',
  zIndex: 0,
}

export interface KeyboardAvoidingViewProps {
  behavior?: 'height' | 'position' | 'padding'
  keyboardVerticalOffset?: number
  enabled?: boolean
  style?: StyleProp
  children?: Child | Child[]
  [key: string]: unknown
}

export function KeyboardAvoidingView(props: KeyboardAvoidingViewProps): Mountable<RNNode> {
  const runtime = getReactiveRuntime()
  const keyboardHeight = ref(0)

  return (host: RNNode) => {
    const el = host.ownerDocument.createElement('View')
    host.appendChild(el)
    const cleanups: (() => void)[] = []

    // ── Style: base + paddingBottom + user style ──────────────────
    let styleCleanup: (() => void) | null = null
    const apply = (): void => {
      styleCleanup?.()
      const usePadding = props.behavior === 'padding' || props.behavior === undefined
      const userStyle = resolveStyle(props.style, {})
      const merged = {
        ...baseStyle,
        ...(usePadding ? { paddingBottom: runtime.unref(keyboardHeight) } : {}),
        ...userStyle,
      }
      styleCleanup = applyStyleToNode(el, merged)
    }
    apply()

    const stop = runtime.subscribe(() => runtime.unref(keyboardHeight), apply)
    cleanups.push(() => { stop(); styleCleanup?.() })

    // ── Keyboard listeners ─────────────────────────────────────────
    if (props.enabled !== false) {
      const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
      const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
      const subs = [
        Keyboard.addListener(showEvent, (e: { endCoordinates?: { height?: number } }) => {
          const h = e?.endCoordinates?.height ?? 0
          runtime.setValue(
            keyboardHeight,
            Math.max(0, h - (props.keyboardVerticalOffset ?? 0)),
          )
        }),
        Keyboard.addListener(hideEvent, () => {
          runtime.setValue(keyboardHeight, 0)
        }),
      ]
      cleanups.push(() => { for (const s of subs) s.remove() })
    }

    // ── Children ───────────────────────────────────────────────────
    if (props.children !== undefined) {
      cleanups.push(...renderChildren(el, props.children as Child | Child[]))
    }

    // ── Cleanup ────────────────────────────────────────────────────
    const unmount = () => {
      for (let i = cleanups.length - 1; i >= 0; i--) cleanups[i]()
      if (el.parentNode) el.parentNode.removeChild(el)
    }
    ;(unmount as { node?: RNNode }).node = el
    return unmount
  }
}