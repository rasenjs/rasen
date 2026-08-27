/**
 * Rect component tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import type { GlContext, GlNode } from '../../node'
import { createRoot } from '../../node'
import { rect } from './rect'
import { createMockWebGLContext, createMockReactiveRuntime, waitForAsync } from '../../test-utils'

describe('rect', () => {
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

  describe('basic rendering', () => {
    it('should create rect component', () => {
      const component = rect({
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        fill: '#ff0000'
      })

      expect(component).toBeDefined()
      expect(typeof component).toBe('function')
    })

    it('should mount and cleanup', () => {
      const component = rect({
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        fill: '#ff0000'
      })

      const cleanup = component(root, undefined)
      expect(cleanup).toBeDefined()
      
      if (cleanup) {
        cleanup()
      }
    })

    it('should handle reactive properties', async () => {
      const runtime = createMockReactiveRuntime()
      setReactiveRuntime(runtime)
      
      const x = runtime.ref(10)
      const component = rect({
        x,
        y: 20,
        width: 100,
        height: 50,
        fill: '#ff0000'
      })

      const cleanup = component(root, undefined)
      cleanupFns.push(cleanup)

      await waitForAsync()

      // Update value
      runtime.setValue(x, 50)

      await waitForAsync()

      expect(runtime.unref(x)).toBe(50)
    })
  })

  describe('properties', () => {
    it('should support cornerRadius', () => {
      const component = rect({
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        fill: '#ff0000',
        cornerRadius: 10
      })

      const cleanup = component(root, undefined)
      cleanupFns.push(cleanup)
      
      expect(cleanup).toBeDefined()
    })

    it('should support stroke', () => {
      const component = rect({
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        stroke: '#000000',
        lineWidth: 2
      })

      const cleanup = component(root, undefined)
      cleanupFns.push(cleanup)
      
      expect(cleanup).toBeDefined()
    })

    it('should support visibility', () => {
      const component = rect({
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        fill: '#ff0000',
        visible: false
      })

      const cleanup = component(root, undefined)
      cleanupFns.push(cleanup)
      
      expect(cleanup).toBeDefined()
    })

    it('should support opacity', () => {
      const component = rect({
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        fill: '#ff0000',
        opacity: 0.5
      })

      const cleanup = component(root, undefined)
      cleanupFns.push(cleanup)
      
      expect(cleanup).toBeDefined()
    })
  })
})
