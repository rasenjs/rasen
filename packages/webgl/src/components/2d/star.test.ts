/**
 * Star component tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { star } from './star'
import { createMockWebGLContext, createMockReactiveRuntime } from '../../test-utils'

describe('star', () => {
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

  it('should create star component', () => {
    const component = star({
      x: 100,
      y: 100,
      points: 5,
      innerRadius: 30,
      outerRadius: 60,
      fill: '#ffff00'
    })

    expect(component).toBeDefined()
    const cleanup = component(gl)
    cleanupFns.push(cleanup)
  })

  it('should support different point counts', () => {
    const component = star({
      x: 100,
      y: 100,
      points: 8,
      innerRadius: 30,
      outerRadius: 60,
      fill: '#ffff00'
    })

    const cleanup = component(gl)
    cleanupFns.push(cleanup)
    expect(cleanup).toBeDefined()
  })
})
