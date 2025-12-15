/**
 * Wedge component tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { wedge } from './wedge'
import { createMockWebGLContext, createMockReactiveRuntime } from '../test-utils'

describe('wedge', () => {
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

  it('should create wedge component', () => {
    const component = wedge({
      x: 100,
      y: 100,
      radius: 50,
      startAngle: 0,
      endAngle: Math.PI / 2,
      fill: '#ff8800'
    })

    expect(component).toBeDefined()
    const cleanup = component(gl)
    cleanupFns.push(cleanup)
  })

  it('should support full circle', () => {
    const component = wedge({
      x: 100,
      y: 100,
      radius: 50,
      startAngle: 0,
      endAngle: Math.PI * 2,
      fill: '#ff8800'
    })

    const cleanup = component(gl)
    cleanupFns.push(cleanup)
    expect(cleanup).toBeDefined()
  })
})
