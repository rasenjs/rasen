/**
 * Circle component tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { circle } from './circle'
import { createMockWebGLContext, createMockReactiveRuntime, waitForAsync } from '../test-utils'

describe('circle', () => {
  let gl: WebGLRenderingContext
  let cleanupFns: Array<(() => void) | undefined>

  beforeEach(() => {
    setReactiveRuntime(createMockReactiveRuntime())
    gl = createMockWebGLContext()
    cleanupFns = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      setTimeout(() => cb(performance.now()), 0)
      return 1
    })
  })

  afterEach(() => {
    cleanupFns.forEach((fn) => fn?.())
    vi.unstubAllGlobals()
  })

  it('should create circle component', () => {
    const component = circle({
      x: 100,
      y: 100,
      radius: 50,
      fill: '#00ff00'
    })

    expect(component).toBeDefined()
    const cleanup = component(gl)
    cleanupFns.push(cleanup)
  })

  it('should handle reactive radius', async () => {
    const runtime = createMockReactiveRuntime()
    setReactiveRuntime(runtime)
    
    const radius = runtime.ref(50)
    const component = circle({
      x: 100,
      y: 100,
      radius,
      fill: '#00ff00'
    })

    const cleanup = component(gl)
    cleanupFns.push(cleanup)

    await waitForAsync()
    radius.value = 100
    await waitForAsync()

    expect(radius.value).toBe(100)
  })

  it('should support segments', () => {
    const component = circle({
      x: 100,
      y: 100,
      radius: 50,
      fill: '#00ff00',
      segments: 16
    })

    const cleanup = component(gl)
    cleanupFns.push(cleanup)
    expect(cleanup).toBeDefined()
  })
})
