/**
 * Touchable* component tests — press feedback semantics:
 *  - TouchableOpacity: opacity drops to activeOpacity while pressed
 *  - TouchableHighlight: underlayColor + activeOpacity while pressed
 *  - TouchableWithoutFeedback: no visual feedback, events still fire
 */
import { describe, it, expect, vi } from 'vitest'
import { TouchableOpacity } from '../TouchableOpacity'
import { TouchableHighlight } from '../TouchableHighlight'
import { TouchableWithoutFeedback } from '../TouchableWithoutFeedback'
import { text } from '../../components'
import {
  mountComponent,
  nodeProps,
  firePress,
  firePressIn,
  firePressOut,
  tick,
} from '../../__tests__/render-helper'

function mountTouchable(
  factory: (props: Record<string, unknown>) => ReturnType<typeof TouchableOpacity>,
  props: Record<string, unknown> = {},
) {
  return mountComponent(
    (p) => factory({ children: text({ children: 'tap' }), ...p }),
    props,
  )
}

describe('<TouchableOpacity />', () => {
  it('renders a View with child', () => {
    const { root } = mountTouchable(TouchableOpacity)
    expect(root.tagName).toBe('View')
    expect(root.firstChild).not.toBeNull()
  })

  it('applies activeOpacity while pressed and restores on release', async () => {
    const { root } = mountTouchable(TouchableOpacity, { activeOpacity: 0.4 })
    expect(JSON.stringify(nodeProps(root).style)).toContain('"opacity":1')
    firePressIn(root)
    await tick()
    expect(JSON.stringify(nodeProps(root).style)).toContain('"opacity":0.4')
    firePressOut(root)
    await tick()
    expect(JSON.stringify(nodeProps(root).style)).toContain('"opacity":1')
  })

  it('defaults activeOpacity to 0.2', async () => {
    const { root } = mountTouchable(TouchableOpacity)
    firePressIn(root)
    await tick()
    expect(JSON.stringify(nodeProps(root).style)).toContain('"opacity":0.2')
  })

  it('fires onPress on full press', async () => {
    const onPress = vi.fn()
    const { root } = mountTouchable(TouchableOpacity, { onPress })
    firePress(root)
    await tick()
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('merges user style with feedback style', async () => {
    const { root } = mountTouchable(TouchableOpacity, {
      style: { backgroundColor: 'red' },
    })
    const style = JSON.stringify(nodeProps(root).style)
    expect(style).toContain('"backgroundColor":"red"')
    expect(style).toContain('"opacity":1')
  })
})

describe('<TouchableHighlight />', () => {
  it('applies underlayColor while pressed', async () => {
    const { root } = mountTouchable(TouchableHighlight, { underlayColor: '#00ff00' })
    expect(JSON.stringify(nodeProps(root).style)).not.toContain('"backgroundColor":"#00ff00"')
    firePressIn(root)
    await tick()
    expect(JSON.stringify(nodeProps(root).style)).toContain('"backgroundColor":"#00ff00"')
    firePressOut(root)
    await tick()
    expect(JSON.stringify(nodeProps(root).style)).not.toContain('"backgroundColor":"#00ff00"')
  })

  it('defaults underlayColor to black and activeOpacity to 0.85', async () => {
    const { root } = mountTouchable(TouchableHighlight)
    firePressIn(root)
    await tick()
    const style = JSON.stringify(nodeProps(root).style)
    expect(style).toContain('"backgroundColor":"black"')
    expect(style).toContain('"opacity":0.85')
  })

  it('fires onPress', async () => {
    const onPress = vi.fn()
    const { root } = mountTouchable(TouchableHighlight, { onPress })
    firePress(root)
    await tick()
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})

describe('<TouchableWithoutFeedback />', () => {
  it('renders a View with no feedback style', async () => {
    const { root } = mountTouchable(TouchableWithoutFeedback)
    firePressIn(root)
    await tick()
    const style = nodeProps(root).style as Record<string, unknown> | undefined
    // No feedback → no opacity/backgroundColor injected.
    expect(style == null || !('opacity' in style)).toBe(true)
    expect(style == null || !('backgroundColor' in style)).toBe(true)
  })

  it('still fires press events', async () => {
    const onPress = vi.fn()
    const onPressIn = vi.fn()
    const { root } = mountTouchable(TouchableWithoutFeedback, { onPress, onPressIn })
    firePress(root)
    await tick()
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(onPressIn).toHaveBeenCalledTimes(1)
  })
})