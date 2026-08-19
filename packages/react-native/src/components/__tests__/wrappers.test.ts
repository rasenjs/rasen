/**
 * Simple wrapper component tests: SafeAreaView, ImageBackground,
 * KeyboardAvoidingView, StatusBar.
 */
import { describe, it, expect } from 'vitest'
import { SafeAreaView } from '../SafeAreaView'
import { ImageBackground } from '../ImageBackground'
import { KeyboardAvoidingView } from '../KeyboardAvoidingView'
import { StatusBar } from '../StatusBar'
import { text } from '../../components'
import {
  mountComponent,
  nodeProps,
  findByTag,
  textContentOf,
  tick,
} from '../../__tests__/render-helper'
import { mockKeyboard, mockStatusBarStack } from '../../__tests__/setup'

describe('<SafeAreaView />', () => {
  it('renders a SafeAreaView with children', () => {
    const { root } = mountComponent(
      (p) => SafeAreaView({ children: text({ children: 'safe' }), ...p }),
    )
    expect(root.tagName).toBe('SafeAreaView')
    expect(textContentOf(root)).toBe('safe')
  })

  it('passes style and testID', () => {
    const { root } = mountComponent(
      (p) => SafeAreaView({ style: { flex: 1 }, testID: 'safe', ...p }),
    )
    expect(nodeProps(root).testID).toBe('safe')
    expect(JSON.stringify(nodeProps(root).style)).toContain('"flex":1')
  })
})

describe('<ImageBackground />', () => {
  it('renders a View with an absolute-fill Image and children', () => {
    const { root } = mountComponent(
      (p) => ImageBackground({
        source: { uri: 'https://example.com/bg.png' },
        children: text({ children: 'overlay' }),
        ...p,
      }),
    )
    expect(root.tagName).toBe('View')
    const image = findByTag(root, 'Image')
    expect(image).not.toBeNull()
    expect(nodeProps(image!).source).toEqual({ uri: 'https://example.com/bg.png' })
    // Image is absolute-fill.
    expect(JSON.stringify(nodeProps(image!).style)).toContain('"position":"absolute"')
    // Children render on top.
    expect(textContentOf(root)).toBe('overlay')
  })

  it('passes imageStyle to the background Image', () => {
    const { root } = mountComponent(
      (p) => ImageBackground({ source: { uri: 'x' }, imageStyle: { opacity: 0.5 }, ...p }),
    )
    const image = findByTag(root, 'Image')
    expect(JSON.stringify(nodeProps(image!).style)).toContain('"opacity":0.5')
  })
})

describe('<KeyboardAvoidingView />', () => {
  it('renders a View with children', () => {
    const { root } = mountComponent(
      (p) => KeyboardAvoidingView({ children: text({ children: 'k' }), ...p }),
    )
    expect(root.tagName).toBe('View')
    expect(textContentOf(root)).toBe('k')
  })

  it('adds paddingBottom when keyboard shows (padding behavior)', async () => {
    const { root } = mountComponent(
      (p) => KeyboardAvoidingView({ behavior: 'padding', ...p }),
    )
    expect(JSON.stringify(nodeProps(root).style)).toContain('"paddingBottom":0')
    mockKeyboard._emit('keyboardWillShow', { endCoordinates: { height: 300 } })
    await tick()
    expect(JSON.stringify(nodeProps(root).style)).toContain('"paddingBottom":300')
    mockKeyboard._emit('keyboardWillHide', {})
    await tick()
    expect(JSON.stringify(nodeProps(root).style)).toContain('"paddingBottom":0')
  })

  it('subtracts keyboardVerticalOffset', async () => {
    const { root } = mountComponent(
      (p) => KeyboardAvoidingView({ behavior: 'padding', keyboardVerticalOffset: 50, ...p }),
    )
    mockKeyboard._emit('keyboardWillShow', { endCoordinates: { height: 300 } })
    await tick()
    expect(JSON.stringify(nodeProps(root).style)).toContain('"paddingBottom":250')
  })

  it('does not respond when enabled=false', async () => {
    const { root } = mountComponent(
      (p) => KeyboardAvoidingView({ behavior: 'padding', enabled: false, ...p }),
    )
    mockKeyboard._emit('keyboardWillShow', { endCoordinates: { height: 300 } })
    await tick()
    expect(JSON.stringify(nodeProps(root).style)).toContain('"paddingBottom":0')
  })
})

describe('<StatusBar />', () => {
  it('pushes an entry on mount and pops on unmount', () => {
    mockStatusBarStack.entries.length = 0
    const { unmount } = mountComponent(
      (p) => StatusBar({ barStyle: 'light-content', backgroundColor: '#000', ...p }),
    )
    expect(mockStatusBarStack.pushStackEntry).toHaveBeenCalledWith(
      expect.objectContaining({ barStyle: 'light-content' }),
    )
    expect(mockStatusBarStack.entries).toHaveLength(1)
    unmount()
    expect(mockStatusBarStack.entries).toHaveLength(0)
  })
})