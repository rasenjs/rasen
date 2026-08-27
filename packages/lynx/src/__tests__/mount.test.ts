/**
 * mountLynx entry tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { mountLynx, view, text } from '../index'
import { createPage, flushLynx } from '../papi'
import {
  installMockPapi,
  uninstallMockPapi,
  type MockPapi,
} from './mock-papi'
import { createMockReactiveRuntime } from './mock-runtime'

describe('mountLynx', () => {
  let mock: MockPapi

  beforeEach(() => {
    mock = installMockPapi().mock
    setReactiveRuntime(createMockReactiveRuntime())
  })

  afterEach(() => {
    uninstallMockPapi()
  })

  it('creates a page and commits via __FlushElementTree', () => {
    const unmount = mountLynx(view({ children: text({ children: 'hi' }) }))
    flushLynx()

    expect(mock.pages.length).toBe(1)
    expect(mock.pages[0].tag).toBe('page')
    expect(mock.flushCount).toBeGreaterThanOrEqual(1)

    unmount()
  })

  it('adopts an existing page element without creating a new one', () => {
    // Create a page directly through the (mocked) PAPI layer
    const existing = createPage('page', 0)

    mountLynx(view({ id: 'adopted' }), existing)

    // No additional page must have been created; content lands in the adopted one
    expect(mock.pages.length).toBe(1)
    expect(mock.pages[0].children[0].id).toBe('adopted')
  })

  it('unmount clears remaining root children', () => {
    const unmount = mountLynx(
      view({ children: [text({ children: 'a' }), text({ children: 'b' })] })
    )
    const pageEl = mock.pages[0]
    expect(pageEl.children.length).toBe(1)

    unmount()
    expect(pageEl.children.length).toBe(0)
  })
})
