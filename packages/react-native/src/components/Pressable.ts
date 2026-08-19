/**
 * Pressable — RN Pressable equivalent for Rasen.
 *
 * RN's Pressable is Pressability + View (no dedicated native ViewManager).
 * Rasen's rn-dom synthesizes the press series (onPressIn/onPressOut/onPress/
 * onLongPress) from Fabric touch events, so this component consumes those
 * events to maintain a `pressed` state and supports:
 *
 *  - `style` as a function `(state) => style` (RN semantics)
 *  - `disabled` prop (overrides accessibilityState.disabled, RN semantics)
 *  - aria-* aliases merged into accessibilityState (aria wins)
 *  - `android_ripple` → nativeBackgroundAndroid / nativeForegroundAndroid
 *    + hotspotUpdate / setPressed commands (Android only)
 */

import { getReactiveRuntime, type Mountable } from '@rasenjs/core'
import type { RNNode } from '@rasenjs/rn-dom'
import { renderChildren, type Child } from '../element'
import { usePressability } from '../tools/use-pressability'
import {
  androidRippleToViewProps,
  createAndroidRippleHandlers,
  type PressableAndroidRippleConfig,
} from '../tools/android-ripple'
import { applyStyle, type StyleProp } from '../utils/style'

/** RN Pressable's pressed state object. */
export interface PressableState {
  pressed: boolean
}

export interface AccessibilityState {
  busy?: boolean
  checked?: boolean | 'mixed'
  disabled?: boolean
  expanded?: boolean
  selected?: boolean
  [key: string]: unknown
}

export interface PressableProps {
  /** RN semantics: `disabled` wins over accessibilityState.disabled. */
  disabled?: boolean
  onPress?: (e?: unknown) => void
  onLongPress?: (e?: unknown) => void
  onPressIn?: (e?: unknown) => void
  onPressMove?: (e?: unknown) => void
  onPressOut?: (e?: unknown) => void
  /** RN semantics: style may be a function `(state) => style`. */
  style?: StyleProp<PressableState>
  hitSlop?: unknown
  pressRetentionOffset?: unknown
  /** @platform android */
  android_ripple?: PressableAndroidRippleConfig
  testID?: string
  accessibilityLabel?: string
  accessibilityState?: AccessibilityState
  accessible?: boolean
  children?: Child | Child[]
  // aria aliases (merged into accessibilityState, aria wins).
  // Both camelCase and kebab-case keys are accepted (rasen props are plain
  // objects, so `aria-disabled` and `ariaDisabled` are distinct keys).
  ariaBusy?: boolean
  ariaChecked?: boolean | 'mixed'
  ariaDisabled?: boolean
  ariaExpanded?: boolean
  ariaSelected?: boolean
  ariaLabel?: string
  'aria-busy'?: boolean
  'aria-checked'?: boolean | 'mixed'
  'aria-disabled'?: boolean
  'aria-expanded'?: boolean
  'aria-selected'?: boolean
  'aria-label'?: string
  [key: string]: unknown
}

/** Read a prop that may be given in camelCase or kebab-case. */
function ariaProp<T>(props: PressableProps, camel: string, kebab: string): T | undefined {
  return (props[camel] as T | undefined) ?? (props[kebab] as T | undefined)
}

export function Pressable(props: PressableProps): Mountable<RNNode> {
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

    // ── Style (supports (state) => style function form) ────────────
    cleanups.push(
      applyStyle(el, props.style, () => ({ pressed: runtime.unref(pressed) })),
    )

    // ── Accessibility state (aria-* wins, disabled prop overrides) ─
    const ariaBusy = ariaProp<boolean>(props, 'ariaBusy', 'aria-busy')
    const ariaChecked = ariaProp<boolean | 'mixed'>(props, 'ariaChecked', 'aria-checked')
    const ariaDisabled = ariaProp<boolean>(props, 'ariaDisabled', 'aria-disabled')
    const ariaExpanded = ariaProp<boolean>(props, 'ariaExpanded', 'aria-expanded')
    const ariaSelected = ariaProp<boolean>(props, 'ariaSelected', 'aria-selected')
    const ariaLabel = ariaProp<string>(props, 'ariaLabel', 'aria-label')

    let accessibilityState: AccessibilityState = {
      busy: ariaBusy ?? props.accessibilityState?.busy,
      checked: ariaChecked ?? props.accessibilityState?.checked,
      disabled: ariaDisabled ?? props.accessibilityState?.disabled,
      expanded: ariaExpanded ?? props.accessibilityState?.expanded,
      selected: ariaSelected ?? props.accessibilityState?.selected,
    }
    const disabled =
      props.disabled !== undefined ? props.disabled : accessibilityState.disabled
    if (disabled !== accessibilityState.disabled) {
      accessibilityState = { ...accessibilityState, disabled }
    }
    const accessible = props.accessible !== false

    // ── android_ripple → native drawable + command handlers ────────
    const rippleViewProps = androidRippleToViewProps(props.android_ripple)
    const rippleHandlers = createAndroidRippleHandlers(props.android_ripple, () => el)

    const onPressIn = rippleHandlers
      ? (e?: unknown) => { rippleHandlers.onPressIn(e); pressEvents.onPressIn(e) }
      : pressEvents.onPressIn
    const onPressMove = rippleHandlers
      ? (e?: unknown) => { rippleHandlers.onPressMove(e); props.onPressMove?.(e) }
      : props.onPressMove
    const onPressOut = rippleHandlers
      ? (e?: unknown) => { rippleHandlers.onPressOut(e); pressEvents.onPressOut(e) }
      : pressEvents.onPressOut

    // ── Attributes & events ────────────────────────────────────────
    if (disabled !== undefined) el.setAttribute('disabled', disabled)
    el.setAttribute('accessibilityState', accessibilityState)
    el.setAttribute('accessible', accessible)
    el.setAttribute('accessibilityLabel', ariaLabel || props.accessibilityLabel)
    el.setAttribute('onPressIn', onPressIn)
    el.setAttribute('onPressMove', onPressMove)
    el.setAttribute('onPressOut', onPressOut)
    el.setAttribute('onPress', pressEvents.onPress ?? null)
    el.setAttribute('onLongPress', pressEvents.onLongPress ?? null)
    if (props.hitSlop !== undefined) el.setAttribute('hitSlop', props.hitSlop)
    if (props.pressRetentionOffset !== undefined) {
      el.setAttribute('pressRetentionOffset', props.pressRetentionOffset)
    }
    if (props.testID !== undefined) el.setAttribute('testID', props.testID)
    if (rippleViewProps) {
      for (const [k, v] of Object.entries(rippleViewProps)) el.setAttribute(k, v)
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