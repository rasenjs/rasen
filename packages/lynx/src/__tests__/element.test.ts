/**
 * element() factory tests — static props, reactive props, events, unmount
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime, type Ref } from '@rasenjs/core'
import { mountLynx, view, text, image } from '../index'
import { flushLynx } from '../papi'
import {
  installMockPapi,
  uninstallMockPapi,
  renderTree,
  type MockPapi,
} from './mock-papi'
import { createMockReactiveRuntime } from './mock-runtime'

describe('element', () => {
  let mock: MockPapi

  beforeEach(() => {
    mock = installMockPapi().mock
    setReactiveRuntime(createMockReactiveRuntime())
  })

  afterEach(() => {
    uninstallMockPapi()
  })

  it('mounts static props and children onto the page', () => {
    mountLynx(
      view({
        class: 'container',
        id: 'root',
        style: { flex: '1', backgroundColor: '#fff' },
        dataset: { testid: 'root-view' },
        src: undefined,
        children: [
          text({ children: ['Hello ', 123] }),
          image({ src: 'logo.png' }),
        ],
      })
    )
    flushLynx()

    expect(mock.pages.length).toBe(1)
    const pageEl = mock.pages[0]
    expect(pageEl.children.length).toBe(1)

    const container = pageEl.children[0]
    expect(container.tag).toBe('view')
    expect(container.classes).toBe('container')
    expect(container.id).toBe('root')
    expect(container.styles).toEqual({ flex: '1', 'background-color': '#fff' })
    expect(container.datasets).toEqual({ testid: 'root-view' })

    const [textEl, imgEl] = container.children
    expect(textEl.tag).toBe('text')
    expect(textEl.children.length).toBe(2)
    expect(textEl.children[0].tag).toBe('raw-text')
    expect(textEl.children[0].text).toBe('Hello ')
    expect(textEl.children[1].text).toBe('123')
    expect(imgEl.tag).toBe('image')
    expect(imgEl.attrs.src).toBe('logo.png')

    // Debug snapshot of the native tree
    expect(renderTree(pageEl)).toContain('<view>')
  })

  it('updates reactive style and text children', () => {
    const runtime = createMockReactiveRuntime()
    setReactiveRuntime(runtime)
    const count = runtime.ref(0)
    const dark = runtime.ref(false)

    mountLynx(
      view({
        style: () => ({ backgroundColor: runtime.unref(dark) ? 'black' : 'white' }),
        children: [
          text({ children: [count as Ref<number>] }),
          text({ children: [() => `n=${runtime.unref(count)}`] }),
        ],
      })
    )

    const pageEl = mock.pages[0]
    const container = pageEl.children[0]
    const [refText, getterText] = container.children

    expect(container.styles['background-color']).toBe('white')
    expect(refText.children[0].text).toBe('0')
    expect(getterText.children[0].text).toBe('n=0')

    runtime.setValue(count, 42)
    runtime.setValue(dark, true)
    runtime.triggerWatchers()

    expect(container.styles['background-color']).toBe('black')
    expect(refText.children[0].text).toBe('42')
    expect(getterText.children[0].text).toBe('n=42')
  })

  it('binds and unbinds events via bind*/catch*/on* props', () => {
    const taps: number[] = []
    const handler = (): void => {
      taps.push(1)
    }

    const unmount = mountLynx(
      view({
        bindTap: handler,
        catchLongPress: () => taps.push(2),
        onTouchStart: () => taps.push(3),
        once: 'not-an-event',
      })
    )

    const container = mock.pages[0].children[0]
    expect(container.listeners.get('tap')?.has(handler)).toBe(true)
    expect(container.listeners.has('longpress')).toBe(true)
    expect(container.listeners.has('touchstart')).toBe(true)
    // `once` must stay an attribute, never become an event
    expect(container.attrs.once).toBe('not-an-event')
    expect(container.listeners.has('ce')).toBe(false)

    unmount()
    expect(container.listeners.get('tap')?.has(handler)).toBe(false)
  })

  it('unmount detaches the subtree and stops subscriptions', () => {
    const runtime = createMockReactiveRuntime()
    setReactiveRuntime(runtime)
    const label = runtime.ref('a')

    const unmount = mountLynx(
      view({ children: [text({ children: [label] })] })
    )

    const pageEl = mock.pages[0]
    const container = pageEl.children[0]
    const rawText = container.children[0].children[0]
    expect(pageEl.children.length).toBe(1)

    unmount()
    expect(pageEl.children.length).toBe(0)
    // The detached node keeps its last rendered content; further updates
    // must not reach it because the subscription was stopped.
    runtime.setValue(label, 'b')
    runtime.triggerWatchers()
    expect(rawText.text).toBe('a')
  })
})
