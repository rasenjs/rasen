/**
 * Ring component tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import type { GlContext, GlNode } from '../../node'
import { createRoot } from '../../node'
import { ring } from './ring'
import { createMockWebGLContext, createMockReactiveRuntime } from '../../test-utils'

describe('ring', () => {
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

  it('should create ring component', () => {
    const component = ring({
      x: 100,
      y: 100,
      innerRadius: 30,
      outerRadius: 50,
      fill: '#00ffff'
    })

    expect(component).toBeDefined()
    const cleanup = component(root, undefined)
    cleanupFns.push(cleanup)
  })

  it('should support segments', () => {
    const component = ring({
      x: 100,
      y: 100,
      innerRadius: 30,
      outerRadius: 50,
      fill: '#00ffff',
      segments: 48
    })

    const cleanup = component(root, undefined)
    cleanupFns.push(cleanup)
    expect(cleanup).toBeDefined()
  })
})
