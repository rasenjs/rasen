/**
 * Host hooks integration tests — core's when/each running on Lynx hooks
 *
 * Key assertion: structural markers are pure-JS nodes and never appear in
 * the native tree; native child order always equals logical order.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime, each, when, type Ref } from '@rasenjs/core'
import { mountLynx, view, text } from '../index'
import {
  installMockPapi,
  uninstallMockPapi,
  type MockPapi,
} from './mock-papi'
import { createMockReactiveRuntime } from './mock-runtime'

/** Native tags of a mock element's children */
function tagsOf(el: { children: Array<{ tag: string }> }): string[] {
  return el.children.map((c) => c.tag)
}

describe('lynx host hooks + core structural components', () => {
  let mock: MockPapi

  beforeEach(() => {
    mock = installMockPapi().mock
    setReactiveRuntime(createMockReactiveRuntime())
  })

  afterEach(() => {
    uninstallMockPapi()
  })

  describe('when', () => {
    it('swaps branches in place without leaving marker elements', () => {
      const runtime = createMockReactiveRuntime()
      setReactiveRuntime(runtime)
      const show = runtime.ref(true)

      mountLynx(
        view({
          children: [
            text({ children: 'header' }),
            when({
              condition: show as Ref<boolean>,
              then: () => view({ id: 'then-branch' }),
              else: () => view({ id: 'else-branch' }),
            }),
            text({ children: 'footer' }),
          ],
        })
      )

      const container = mock.pages[0].children[0]
      const [header, branch, footer] = container.children

      expect(tagsOf(container)).toEqual(['text', 'view', 'text'])
      expect(branch.id).toBe('then-branch')

      runtime.setValue(show, false)
      runtime.triggerWatchers()

      // Same position: header stays first, footer last, no stray views
      expect(tagsOf(container)).toEqual(['text', 'view', 'text'])
      expect(container.children[0]).toBe(header)
      expect(container.children[2]).toBe(footer)
      expect(container.children[1].id).toBe('else-branch')
    })

    it('unmounts content when the condition turns false with no else', () => {
      const runtime = createMockReactiveRuntime()
      setReactiveRuntime(runtime)
      const show = runtime.ref(true)

      mountLynx(
        view({
          children: [when({ condition: show as Ref<boolean>, then: () => text({ children: 'x' }) })],
        })
      )

      const container = mock.pages[0].children[0]
      expect(tagsOf(container)).toEqual(['text'])

      runtime.setValue(show, false)
      runtime.triggerWatchers()
      expect(container.children.length).toBe(0)
    })
  })

  describe('each', () => {
    interface Item {
      id: number
    }

    function renderList(items: Ref<Item[]>): void {
      mountLynx(
        view({
          children: [
            each(items, (item) =>
              view({ id: `row-${item.id}`, children: [text({ children: String(item.id) })] })
            ),
          ],
        })
      )
    }

    function rowIds(): string[] {
      return mock.pages[0].children[0].children.map((c) => c.id)
    }

    it('renders rows keyed by object reference', () => {
      const runtime = createMockReactiveRuntime()
      setReactiveRuntime(runtime)
      const items = runtime.ref<Item[]>([{ id: 1 }, { id: 2 }, { id: 3 }])

      renderList(items)
      expect(rowIds()).toEqual(['row-1', 'row-2', 'row-3'])
    })

    it('moves rows correctly on reorder (LIS path)', () => {
      const runtime = createMockReactiveRuntime()
      setReactiveRuntime(runtime)
      const a = { id: 1 }
      const b = { id: 2 }
      const c = { id: 3 }
      const items = runtime.ref<Item[]>([a, b, c])

      renderList(items)

      runtime.setValue(items, [c, a, b])
      runtime.triggerWatchers()
      expect(rowIds()).toEqual(['row-3', 'row-1', 'row-2'])

      runtime.setValue(items, [b, c])
      runtime.triggerWatchers()
      expect(rowIds()).toEqual(['row-2', 'row-3'])
    })

    it('clears all rows when the array empties', () => {
      const runtime = createMockReactiveRuntime()
      setReactiveRuntime(runtime)
      const items = runtime.ref<Item[]>([{ id: 1 }, { id: 2 }])

      renderList(items)
      expect(mock.pages[0].children[0].children.length).toBe(2)

      runtime.setValue(items, [])
      runtime.triggerWatchers()
      expect(mock.pages[0].children[0].children.length).toBe(0)
    })

    it('never allocates native objects for markers', () => {
      const runtime = createMockReactiveRuntime()
      setReactiveRuntime(runtime)
      const items = runtime.ref<Item[]>([{ id: 1 }, { id: 2 }, { id: 3 }])

      renderList(items)
      runtime.setValue(items, [{ id: 4 }])
      runtime.triggerWatchers()

      // Only page > container > row-view (+ its text/raw-text) exist natively;
      // every element the engine saw is one of these — zero marker views.
      const nativeTags = mock.elements.map((e) => e.tag)
      const unexpected = nativeTags.filter(
        (t) => t !== 'page' && t !== 'view' && t !== 'text' && t !== 'raw-text'
      )
      expect(unexpected).toEqual([])
    })
  })
})
