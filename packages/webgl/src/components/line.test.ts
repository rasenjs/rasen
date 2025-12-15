/**
 * Line component tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { line } from './line'
import { createMockWebGLContext, createMockReactiveRuntime } from '../test-utils'

describe('line', () => {
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

  it('should create line component', () => {
    const component = line({
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 100,
      stroke: '#000000',
      lineWidth: 2
    })

    expect(component).toBeDefined()
    const cleanup = component(gl)
    cleanupFns.push(cleanup)
  })

  it('should handle different line widths', () => {
    const component = line({
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 100,
      stroke: '#000000',
      lineWidth: 5
    })

    const cleanup = component(gl)
    cleanupFns.push(cleanup)
    expect(cleanup).toBeDefined()
  })
})
