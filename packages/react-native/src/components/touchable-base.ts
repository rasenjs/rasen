/**
 * Shared base for the Touchable* family (TouchableOpacity / TouchableHighlight /
 * TouchableWithoutFeedback).
 *
 * RN's Touchable* components are JS-only (they render a View + Pressability).
 * rn-dom synthesizes the press series from Fabric touch events, so this base
 * consumes those events to maintain a `pressed` state and applies the
 * component-specific visual feedback (opacity / underlay color).
 */

import { getReactiveRuntime, type Mountable } from '@rasenjs/core'
import type { RNNode } from '@rasenjs/rn-dom'
import { renderChildren, type Child } from '../element'
import { usePressability } from '../tools/use-pressability'
import { resolveStyle, applyStyleToNode, type StyleProp } from '../utils/style'

export interface TouchableState {
  pressed: boolean
}

export interface TouchableProps {
  disabled?: boolean
  onPress?: (e?: unknown) => void
  onLongPress?: (e?: unknown) => void
  onPressIn?: (e?: unknown) => void
  onPressMove?: (e?: unknown) => void
  onPressOut?: (e?: unknown) => void
  style?: StyleProp<TouchableState>
  testID?: string
  accessibilityLabel?: string
  accessibilityState?: Record<string, unknown>
  accessible?: boolean
  children?: Child | Child[]
  [key: string]: unknown
}

export interface TouchableFeedback {
  /** Opacity applied while pressed (default 1 = no change). */
  activeOpacity?: number
  /** Background color applied while pressed (default none). */
  underlayColor?: string
}

/**
 * Build a Touchable* component renderer.
 *
 * @param props   - component props
 * @param feedback - visual feedback config (opacity / underlay)
 */
export function createTouchable(
  props: TouchableProps,
  feedback: TouchableFeedback,
): Mountable<RNNode> {
  const runtime = getReactiveRuntime()
  const { pressed, pressEvents } = usePressability({
    onPressIn: props.onPressIn,
    onPressOut: props.onPressOut,
    onPress: props.onPress,
    onLongPress: props.onLongPress,
  })

  return (host: RNNode) => {
    const el = host.ownerDocument.createElement('View')
    host.appendChild(el)
    const cleanups: (() => void)[] = []

    // ── Style: user style + pressed feedback ──────────────────────
    let styleCleanup: (() => void) | null = null
    const apply = (): void => {
      styleCleanup?.()
      const userStyle = resolveStyle(props.style, { pressed: runtime.unref(pressed) })
      const feedbackStyle: Record<string, unknown> = {}
      if (feedback.underlayColor && runtime.unref(pressed)) {
        feedbackStyle.backgroundColor = feedback.underlayColor
      }
      if (feedback.activeOpacity !== undefined) {
        feedbackStyle.opacity = runtime.unref(pressed) ? feedback.activeOpacity : 1
      }
      styleCleanup = applyStyleToNode(el, { ...userStyle, ...feedbackStyle })
    }
    apply()

    // Re-apply when pressed changes (function styles / feedback).
    const stop = runtime.watch(
      () => {
        resolveStyle(props.style, { pressed: runtime.unref(pressed) })
        return runtime.unref(pressed)
      },
      apply,
    )
    cleanups.push(() => { stop(); styleCleanup?.() })

    // ── Attributes & events ────────────────────────────────────────
    if (props.disabled !== undefined) el.setAttribute('disabled', props.disabled)
    el.setAttribute('accessible', props.accessible !== false)
    if (props.accessibilityLabel !== undefined) {
      el.setAttribute('accessibilityLabel', props.accessibilityLabel)
    }
    if (props.accessibilityState !== undefined) {
      el.setAttribute('accessibilityState', props.accessibilityState)
    }
    el.setAttribute('onPressIn', pressEvents.onPressIn)
    el.setAttribute('onPressOut', pressEvents.onPressOut)
    el.setAttribute('onPress', pressEvents.onPress ?? null)
    el.setAttribute('onLongPress', pressEvents.onLongPress ?? null)
    if (props.onPressMove !== undefined) el.setAttribute('onPressMove', props.onPressMove)
    if (props.testID !== undefined) el.setAttribute('testID', props.testID)

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