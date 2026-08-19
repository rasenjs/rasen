/**
 * Pressable component tests — aligned with RN Pressable.js semantics:
 *  - disabled prop wins over accessibilityState.disabled (undefined when unset)
 *  - aria-* merged into accessibilityState (aria wins)
 *  - disabled blocks onPress
 *  - style as function ({ pressed }) => style
 *  - android_ripple → nativeBackgroundAndroid / nativeForegroundAndroid
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Platform } from 'react-native'
import { Pressable } from '../Pressable'
import { text } from '../../components'
import {
  mountComponent,
  nodeProps,
  firePress,
  firePressIn,
  firePressOut,
  tick,
} from '../../__tests__/render-helper'
import type { AccessibilityState } from '../Pressable'

function mountPressable(props: Record<string, unknown> = {}) {
  return mountComponent(
    (p) => Pressable({ children: text({ children: 'child' }), ...p }),
    props,
  )
}

describe('<Pressable />', () => {
  it('renders as a View wrapper with child', () => {
    const { root } = mountPressable()
    expect(root.tagName).toBe('View')
    expect(root.firstChild).not.toBeNull()
  })

  it('is disabled when disabled is true', () => {
    const { root } = mountPressable({ disabled: true })
    expect(nodeProps(root).disabled).toBe(true)
    expect((nodeProps(root).accessibilityState as AccessibilityState).disabled).toBe(true)
  })

  it('keeps accessibilityState keys when disabled is true', () => {
    const { root } = mountPressable({ disabled: true, accessibilityState: { checked: true } })
    const state = nodeProps(root).accessibilityState as AccessibilityState
    expect(state.disabled).toBe(true)
    expect(state.checked).toBe(true)
  })

  it('disabled prop overwrites accessibilityState.disabled', () => {
    const { root } = mountPressable({ disabled: true, accessibilityState: { disabled: false } })
    expect((nodeProps(root).accessibilityState as AccessibilityState).disabled).toBe(true)
  })

  it('disabled from accessibilityState also blocks press', async () => {
    const onPress = vi.fn()
    const { root } = mountPressable({ accessibilityState: { disabled: true }, onPress })
    expect(nodeProps(root).disabled).toBe(true)
    firePress(root)
    await tick()
    expect(onPress).not.toHaveBeenCalled()
  })

  it('onPress fires when enabled', async () => {
    const onPress = vi.fn()
    const { root } = mountPressable({ onPress })
    firePress(root)
    await tick()
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('aria-disabled merges into accessibilityState', () => {
    const { root } = mountPressable({ 'aria-disabled': true })
    expect((nodeProps(root).accessibilityState as AccessibilityState).disabled).toBe(true)
  })

  it('aria-label aliases accessibilityLabel', () => {
    const { root } = mountPressable({ 'aria-label': 'press' })
    expect(nodeProps(root).accessibilityLabel).toBe('press')
  })

  it('supports style as function ({ pressed }) => style', async () => {
    const { root } = mountPressable({
      style: (s: { pressed: boolean }) => ({ opacity: s.pressed ? 0.5 : 1 }),
    })
    expect(JSON.stringify(nodeProps(root).style)).toContain('"opacity":1')
    firePressIn(root)
    await tick()
    expect(JSON.stringify(nodeProps(root).style)).toContain('"opacity":0.5')
    firePressOut(root)
    await tick()
    expect(JSON.stringify(nodeProps(root).style)).toContain('"opacity":1')
  })

  it('accessible defaults to true', () => {
    const { root } = mountPressable()
    expect(nodeProps(root).accessible).toBe(true)
  })

  it('accessible=false is respected', () => {
    const { root } = mountPressable({ accessible: false })
    expect(nodeProps(root).accessible).toBe(false)
  })

  it('onPressIn / onPressOut fire', async () => {
    const onPressIn = vi.fn()
    const onPressOut = vi.fn()
    const { root } = mountPressable({ onPressIn, onPressOut })
    firePressIn(root)
    await tick()
    expect(onPressIn).toHaveBeenCalledTimes(1)
    firePressOut(root)
    await tick()
    expect(onPressOut).toHaveBeenCalledTimes(1)
  })
})

// ── android_ripple (Android only) ──────────────────────────────────────

describe('<Pressable android_ripple />', () => {
  beforeEach(() => {
    Platform.OS = 'android'
  })
  afterEach(() => {
    Platform.OS = 'ios'
  })

  it('sets nativeBackgroundAndroid with numeric color and alpha', () => {
    const { root } = mountPressable({ android_ripple: { color: '#FF0000', alpha: 0.5 } })
    const ripple = nodeProps(root).nativeBackgroundAndroid as {
      type: string
      color: number
      alpha: number
    }
    expect(ripple).toBeTruthy()
    expect(ripple.type).toBe('RippleAndroid')
    expect(ripple.color).toBe(0xffff0000)
    expect(ripple.alpha).toBe(0.5)
  })

  it('sets nativeBackgroundAndroid with borderless', () => {
    const { root } = mountPressable({ android_ripple: { color: '#00FF00', borderless: true } })
    const ripple = nodeProps(root).nativeBackgroundAndroid as {
      borderless: boolean
    }
    expect(ripple.borderless).toBe(true)
  })

  it('sets nativeForegroundAndroid when foreground is true', () => {
    const { root } = mountPressable({ android_ripple: { color: '#0000FF', foreground: true } })
    expect(nodeProps(root).nativeForegroundAndroid).toBeTruthy()
    expect(nodeProps(root).nativeBackgroundAndroid).toBeUndefined()
  })

  it('does not set ripple props when no color/borderless/radius', () => {
    const { root } = mountPressable({ android_ripple: {} })
    expect(nodeProps(root).nativeBackgroundAndroid).toBeUndefined()
  })
})

// ── iOS: no ripple props ───────────────────────────────────────────────

describe('<Pressable /> on iOS', () => {
  it('does not set ripple props on iOS', () => {
    const { root } = mountPressable({ android_ripple: { color: '#FF0000' } })
    expect(nodeProps(root).nativeBackgroundAndroid).toBeUndefined()
  })
})