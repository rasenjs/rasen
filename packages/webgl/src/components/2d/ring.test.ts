/**
 * Ring component tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { ring } from './ring'
import { createMockWebGLContext, createMockReactiveRuntime } from '../../test-utils'

describe('ring', () => {
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

  it('should create ring component', () => {
    const component = ring({
      x: 100,
      y: 100,
      innerRadius: 30,
      outerRadius: 50,
      fill: '#00ffff'
    })

    expect(component).toBeDefined()
    const cleanup = component(gl)
    cleanupFns.push(cleanup)
  })

  it('should support angle range', () => {
    const component = ring({
      x: 100,
      y: 100,
      innerRadius: 30,
      outerRadius: 50,
      fill: '#00ffff',
      startAngle: 0,
      endAngle: Math.PI
    })

    const cleanup = component(gl)
    cleanupFns.push(cleanup)
    expect(cleanup).toBeDefined()
  })
})
