/**
 * Polygon component tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { polygon } from './polygon'
import { createMockWebGLContext, createMockReactiveRuntime } from '../test-utils'

describe('polygon', () => {
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

  it('should create polygon component', () => {
    const component = polygon({
      points: [
        { x: 100, y: 50 },
        { x: 150, y: 100 },
        { x: 50, y: 100 }
      ],
      fill: '#00ff88'
    })

    expect(component).toBeDefined()
    const cleanup = component(gl)
    cleanupFns.push(cleanup)
  })

  it('should support complex polygons', () => {
    const component = polygon({
      points: [
        { x: 100, y: 50 },
        { x: 120, y: 80 },
        { x: 150, y: 90 },
        { x: 130, y: 110 },
        { x: 100, y: 120 },
        { x: 70, y: 110 },
        { x: 50, y: 90 },
        { x: 80, y: 80 }
      ],
      fill: '#00ff88'
    })

    const cleanup = component(gl)
    cleanupFns.push(cleanup)
    expect(cleanup).toBeDefined()
  })
})
