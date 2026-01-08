/**
 * Tests for useScrollRestoration
 */

import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest'
import { createRouter, route, template } from '@rasenjs/router'
import { setReactiveRuntime } from '@rasenjs/core'
import { useReactiveRuntime } from '@rasenjs/reactive-signals'
import { useScrollRestoration } from '../scroll-restoration'

// 初始化响应式运行时
beforeAll(() => {
  useReactiveRuntime()
})

describe('useScrollRestoration', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let router: any

  beforeEach(() => {
    // Create test router
    router = createRouter({
      home: template`/`,
      about: template`/about`,
      contact: template`/contact`
    })

    // Mock window scroll methods
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    vi.spyOn(window, 'scrollX', 'get').mockReturnValue(0)
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(0)
    vi.spyOn(window, 'pageXOffset', 'get').mockReturnValue(0)
    vi.spyOn(window, 'pageYOffset', 'get').mockReturnValue(0)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should initialize with empty position map', () => {
    const { positionMap } = useScrollRestoration(router)
    expect(positionMap.size).toBe(0)
  })

  it('should save scroll position when navigating away', async () => {
    // Mock initial scroll position
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(100)
    vi.spyOn(window, 'scrollX', 'get').mockReturnValue(10)

    const { positionMap } = useScrollRestoration(router)

    // First navigation sets currentPath to '/'
    await router.push('home', {})

    // Now navigate away to about
    await router.push('about', {})

    // Position of '/' should be saved
    expect(positionMap.size).toBeGreaterThan(0)
  })

  it('should handle multiple navigations and save positions', async () => {
    const { positionMap } = useScrollRestoration(router)

    // Initialize at home
    await router.push('home', {})

    // First navigation - home to about
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(100)
    vi.spyOn(window, 'scrollX', 'get').mockReturnValue(10)
    await router.push('about', {})

    expect(positionMap.size).toBeGreaterThan(0)

    // Second navigation - about to contact
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(200)
    vi.spyOn(window, 'scrollX', 'get').mockReturnValue(20)
    await router.push('contact', {})

    expect(positionMap.size).toBeGreaterThan(1)
  })

  it('should call scrollTo when navigating', async () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo')
    useScrollRestoration(router)

    // Navigate to new route (should scroll to top)
    await router.push('about', {})

    // Wait for requestAnimationFrame
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(scrollToSpy).toHaveBeenCalled()
  })
})
