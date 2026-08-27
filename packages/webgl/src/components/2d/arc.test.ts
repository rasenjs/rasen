/**
 * Arc component tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import type { GlContext, GlNode } from '../../node'
import { createRoot } from '../../node'
import { arc } from './arc'
import { createMockWebGLContext, createMockReactiveRuntime } from '../../test-utils'

describe('arc', () => {
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

  it('should create arc component', () => {
    const component = arc({
      x: 100,
      y: 100,
      radius: 50,
      startAngle: 0,
      endAngle: Math.PI,
      stroke: '#ff00ff',
      lineWidth: 2
    })

    expect(component).toBeDefined()
    const cleanup = component(root, undefined)
    cleanupFns.push(cleanup)
  })

  it('should support filled pie slices', () => {
    const component = arc({
      x: 100,
      y: 100,
      radius: 50,
      startAngle: 0,
      endAngle: Math.PI,
      fill: '#ff00ff',
      lineWidth: 2
    })

    const cleanup = component(root, undefined)
    cleanupFns.push(cleanup)
    expect(cleanup).toBeDefined()
  })
})
