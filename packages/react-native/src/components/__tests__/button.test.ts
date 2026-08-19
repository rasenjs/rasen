/**
 * Button component tests — RN Button semantics:
 *  - renders a View + Text with the title
 *  - onPress fires
 *  - disabled blocks press
 *  - color prop is platform-split (iOS text color / Android background)
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { Platform } from 'react-native'
import { Button } from '../Button'
import { textContentOf, mountComponent, nodeProps, firePress, tick } from '../../__tests__/render-helper'

function mountButton(props: Record<string, unknown> = {}) {
  return mountComponent((p) => Button({ title: 'Press me', ...p }), props)
}

describe('<Button />', () => {
  it('renders a View with the title text', () => {
    const { root } = mountButton()
    expect(root.tagName).toBe('View')
    expect(textContentOf(root)).toBe('Press me')
  })

  it('fires onPress', async () => {
    const onPress = vi.fn()
    const { root } = mountButton({ onPress })
    firePress(root)
    await tick()
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not fire onPress when disabled', async () => {
    const onPress = vi.fn()
    const { root } = mountButton({ disabled: true, onPress })
    expect(nodeProps(root).disabled).toBe(true)
    firePress(root)
    await tick()
    expect(onPress).not.toHaveBeenCalled()
  })

  it('passes accessibilityLabel', () => {
    const { root } = mountButton({ accessibilityLabel: 'submit' })
    expect(nodeProps(root).accessibilityLabel).toBe('submit')
  })
})

describe('<Button /> platform styles', () => {
  it('iOS: color applies to text, title unchanged', () => {
    Platform.OS = 'ios'
    const { root } = mountButton({ color: '#123456' })
    const textNode = root.firstChild as { tagName: string }
    expect(textNode.tagName).toBe('Text')
    const textStyle = JSON.stringify(nodeProps(root.firstChild as never).style)
    expect(textStyle).toContain('"color":"#123456"')
    expect(textContentOf(root)).toBe('Press me')
  })

  it('Android: color applies to background, title uppercased', () => {
    Platform.OS = 'android'
    const { root } = mountButton({ color: '#123456' })
    const style = JSON.stringify(nodeProps(root).style)
    expect(style).toContain('"backgroundColor":"#123456"')
    expect(textContentOf(root)).toBe('PRESS ME')
  })

  afterEach(() => {
    Platform.OS = 'ios'
  })
})