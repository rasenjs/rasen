/**
 * Ellipse component tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import type { GlContext, GlNode } from '../../node'
import { createRoot } from '../../node'
import { ellipse } from './ellipse'
import { createMockWebGLContext, createMockReactiveRuntime } from '../../test-utils'

describe('ellipse', () => {
  let gl: GlContext
  let root: GlNode
  let cleanupFns: Array<(() => void) | undefined>

  beforeEach(() => {
    setReactiveRuntime(createMockReactiveRuntime())
    gl = createMockWebGLContext()
    root = createRoot(gl)
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

  it('should create ellipse component', () => {
    const component = ellipse({
      x: 100,
      y: 100,
      radiusX: 80,
      radiusY: 50,
      fill: '#0000ff'
    })

    expect(component).toBeDefined()
    const cleanup = component(root, undefined)
    cleanupFns.push(cleanup)
  })

  it('should support rotation', () => {
    const component = ellipse({
      x: 100,
      y: 100,
      radiusX: 80,
      radiusY: 50,
      fill: '#0000ff',
      rotation: Math.PI / 4
    })

    const cleanup = component(root, undefined)
    cleanupFns.push(cleanup)
    expect(cleanup).toBeDefined()
  })
})
