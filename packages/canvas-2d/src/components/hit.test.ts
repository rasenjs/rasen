/**
 * RenderContext.hitTest + resolution option tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'

import {
  createMockContext,
  createMockReactiveRuntime,
  waitForAsync
} from '../test-utils'
import { createRoot } from '../node'
import type { CanvasNode, Context2D } from '../node'
import { getRenderContext } from '../render-context'
import { rect } from './rect'
import { circle } from './circle'
import { ellipse } from './ellipse'

describe('RenderContext.hitTest', () => {
  let ctx: Context2D
  let root: CanvasNode
  let cleanupFns: Array<(() => void) | undefined>

  beforeEach(() => {
    setReactiveRuntime(createMockReactiveRuntime())
    ctx = createMockContext()
    root = createRoot(ctx)
    cleanupFns = []

    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      setTimeout(() => cb(performance.now()), 0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    cleanupFns.forEach((fn) => fn?.())
    vi.unstubAllGlobals()
  })

  it('hits the exact geometry of a circle (inside yes, corner no)', async () => {
    cleanupFns.push(circle({ x: 100, y: 100, radius: 50, fill: '#f00' })(root, undefined))
    await waitForAsync()

    const rc = getRenderContext(ctx)
    expect(rc.hitTest(100, 100)).not.toBeNull() // center
    expect(rc.hitTest(135, 135)).not.toBeNull() // inside radius
    expect(rc.hitTest(140, 140)).toBeNull() // AABB corner, outside circle
    expect(rc.hitTest(200, 200)).toBeNull()
  })

  it('hits the exact geometry of a rect', async () => {
    cleanupFns.push(rect({ x: 10, y: 20, width: 100, height: 50, fill: '#0f0' })(root, undefined))
    await waitForAsync()

    const rc = getRenderContext(ctx)
    expect(rc.hitTest(10, 20)).not.toBeNull() // top-left corner inclusive
    expect(rc.hitTest(110, 70)).not.toBeNull() // bottom-right inclusive
    expect(rc.hitTest(111, 70)).toBeNull()
    expect(rc.hitTest(5, 5)).toBeNull()
  })

  it('returns the visually topmost shape (reverse draw order)', async () => {
    // A covers the whole area; B sits on top of A's corner.
    cleanupFns.push(rect({ x: 0, y: 0, width: 300, height: 300, fill: '#00f' })(root, undefined))
    cleanupFns.push(rect({ x: 250, y: 250, width: 40, height: 40, fill: '#f00' })(root, undefined))
    await waitForAsync()

    const rc = getRenderContext(ctx)
    const overlap = rc.hitTest(260, 260) // inside BOTH → topmost (B) wins
    const onlyA = rc.hitTest(10, 10) // inside A only
    expect(overlap).not.toBeNull()
    expect(onlyA).not.toBeNull()
    expect(overlap).not.toBe(onlyA)
  })

  it('falls back to bounds AABB for shapes without an exact hit closure', async () => {
    // ellipse has no hit closure yet → AABB fallback via its bounds
    cleanupFns.push(
      ellipse({ x: 100, y: 100, radiusX: 80, radiusY: 40, fill: '#ff0' })(root, undefined)
    )
    await waitForAsync()

    const rc = getRenderContext(ctx)
    // Inside the AABB but outside the ellipse — AABB fallback still hits.
    expect(rc.hitTest(170, 100)).not.toBeNull()
    expect(rc.hitTest(300, 300)).toBeNull()
  })
})
