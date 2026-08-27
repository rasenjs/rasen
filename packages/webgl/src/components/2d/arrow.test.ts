/**
 * Arrow component tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import type { GlContext, GlNode } from '../../node'
import { createRoot } from '../../node'
import { arrow } from './arrow'
import { createMockWebGLContext, createMockReactiveRuntime } from '../../test-utils'

describe('arrow', () => {
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

  it('should create arrow component', () => {
    const component = arrow({
      x1: 50,
      y1: 50,
      x2: 150,
      y2: 150,
      fill: '#ff0088',
      arrowSize: 10
    })

    expect(component).toBeDefined()
    const cleanup = component(root, undefined)
    cleanupFns.push(cleanup)
  })

  it('should support different head sizes', () => {
    const component = arrow({
      x1: 50,
      y1: 50,
      x2: 150,
      y2: 150,
      fill: '#ff0088',
      arrowSize: 20
    })

    const cleanup = component(root, undefined)
    cleanupFns.push(cleanup)
    expect(cleanup).toBeDefined()
  })
})
