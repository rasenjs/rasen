/**
 * @rasenjs/react-native — core API smoke tests.
 *
 * Validates that the package's existing surface (element / tag aliases /
 * control-flow / registerApp) renders into rn-dom's Fabric node tree under
 * the mocked environment. This is the entry point for the new test
 * infrastructure.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  element,
  tag,
  view,
  text,
  each,
  when,
  match,
  registerApp,
} from '../index'
import { ref } from '@vue/reactivity'
import {
  mountComponent,
  nodeProps,
  textContentOf,
  tick,
} from './render-helper'
import { mockAppRegistry } from './setup'
import { RNDocument } from '@rasenjs/rn-dom'

describe('element', () => {
  it('creates an RN node with tag name', () => {
    const { root } = mountComponent(() => element('View', { testID: 'root' }))
    expect(root.tagName).toBe('View')
    expect(nodeProps(root).testID).toBe('root')
  })

  it('renders string children as text nodes', () => {
    const { root } = mountComponent(() =>
      element('Text', { children: 'Hello Rasen' }),
    )
    expect(textContentOf(root)).toBe('Hello Rasen')
  })

  it('renders nested elements', () => {
    const { root } = mountComponent(() =>
      element('View', {
        children: [
          element('Text', { children: 'a' }),
          element('Text', { children: 'b' }),
        ],
      }),
    )
    expect(root.childElementCount).toBe(2)
    expect(textContentOf(root)).toBe('ab')
  })

  it('reactively updates text bound to a ref', async () => {
    const count = ref(0)
    const { root, unmount } = mountComponent(() =>
      element('Text', { children: count }),
    )
    expect(textContentOf(root)).toBe('0')
    count.value = 42
    await tick()
    expect(textContentOf(root)).toBe('42')
    unmount()
  })

  it('reactively updates function styles', async () => {
    const active = ref(false)
    const { root } = mountComponent(() =>
      element('View', { style: () => ({ opacity: active.value ? 0.5 : 1 }) }),
    )
    expect(JSON.stringify(nodeProps(root).style)).toContain('"opacity":1')
    active.value = true
    await tick()
    expect(JSON.stringify(nodeProps(root).style)).toContain('"opacity":0.5')
  })
})

describe('tag aliases', () => {
  it('view/text render with correct tags', () => {
    const { root } = mountComponent(() =>
      view({ children: text({ children: 'hi' }) }),
    )
    expect(root.tagName).toBe('View')
    expect(textContentOf(root)).toBe('hi')
  })

  it('tag() creates a typed custom tag factory', () => {
    const myTag = tag('View')
    const { root } = mountComponent(() => myTag({ testID: 'custom' }))
    expect(root.tagName).toBe('View')
    expect(nodeProps(root).testID).toBe('custom')
  })
})

describe('control flow', () => {
  it('each renders a list and updates reactively', async () => {
    const items = ref([{ id: 1, name: 'a' }, { id: 2, name: 'b' }])
    const { root } = mountComponent(() =>
      view({
        children: each(items, (item) =>
          text({ children: item.name }),
        ),
      }),
    )
    expect(textContentOf(root)).toBe('ab')

    items.value = [...items.value, { id: 3, name: 'c' }]
    await tick()
    expect(textContentOf(root)).toBe('abc')
  })

  it('when toggles branches reactively', async () => {
    const show = ref(true)
    const { root } = mountComponent(() =>
      view({
        children: when({
          condition: show,
          then: () => text({ children: 'yes' }),
          else: () => text({ children: 'no' }),
        }),
      }),
    )
    expect(textContentOf(root)).toBe('yes')
    show.value = false
    await tick()
    expect(textContentOf(root)).toBe('no')
  })

  it('match switches cases by value', async () => {
    const tab = ref<'home' | 'profile'>('home')
    const { root } = mountComponent(() =>
      view({
        children: match({
          value: tab,
          cases: {
            home: () => text({ children: 'Home' }),
            profile: () => text({ children: 'Profile' }),
          },
        }),
      }),
    )
    expect(textContentOf(root)).toBe('Home')
    tab.value = 'profile'
    await tick()
    expect(textContentOf(root)).toBe('Profile')
  })
})

describe('registerApp', () => {
  beforeEach(() => {
    mockAppRegistry.registerRunnable.mockClear()
  })

  it('registers a runnable that mounts into the root tag', () => {
    const App = () => view({ children: text({ children: 'App' }) })
    const rerender = registerApp('SmokeApp', App)

    expect(mockAppRegistry.registerRunnable).toHaveBeenCalledWith(
      'SmokeApp',
      expect.any(Function),
    )

    // Simulate RN calling the runnable with a root tag.
    const runnable = mockAppRegistry.registerRunnable.mock.calls[0][1]
    RNDocument.reset()
    runnable({ rootTag: 1 })

    const doc = RNDocument.getOrCreate(1)
    expect(doc.body.firstChild).not.toBeNull()
    expect(typeof rerender).toBe('function')
  })

  it('returns a rerender function', () => {
    const rerender = registerApp('SmokeApp2', () => view({}))
    expect(typeof rerender).toBe('function')
  })
})
