/**
 * RenderContext lifecycle tests.
 *
 * The scene tree is the draw set: mounting a node registers it as a render
 * root (top-level) and must SYMMETRICALLY trigger redraws so that:
 *  - newly-mounted components appear on screen, and
 *  - removed components disappear (regression: removal never scheduled
 *    a redraw, leaving stale pixels / frozen billboards on screen after a
 *    reactive list removed an item).
 *
 * requestAnimationFrame is stubbed to capture callbacks so the scheduling
 * contract is asserted deterministically (no real frames).
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import { RenderContext } from '../render-context'
import { createNode, createRoot } from '../node'
import { createMockWebGLContext } from '../test-utils'
import type { GlContext } from '../node'

describe('RenderContext lifecycle', () => {
  let gl: GlContext
  let rafCallbacks: Array<() => void>
  let rafSpy: MockInstance<(callback: FrameRequestCallback) => number>

  beforeEach(() => {
    // jsdom may not define rAF — provide a real function before spying so the
    // RenderContext constructor (continuous mode) doesn't crash.
    if (typeof globalThis.requestAnimationFrame !== 'function') {
      ;(globalThis as unknown as { requestAnimationFrame: FrameRequestCallback }).requestAnimationFrame = () => 0
    }
    gl = createMockWebGLContext()
    rafCallbacks = []
    rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafCallbacks.push(() => cb(0))
      return rafCallbacks.length
    })
  })

  afterEach(() => {
    rafSpy.mockRestore()
  })

  /** Run all pending rAF callbacks synchronously (simulates frames). */
  const flushFrames = () => {
    const cbs = rafCallbacks.splice(0)
    for (const cb of cbs) cb()
  }

  it('mounting a top-level node schedules a redraw so it appears', () => {
    new RenderContext(gl)
    let drawCount = 0
    // Bare host ({ctx} without children) → the node becomes a render root.
    createNode(createRoot(gl), { draw: () => { drawCount++ } })
    expect(rafCallbacks.length).toBe(1)
    flushFrames()
    expect(drawCount).toBe(1)
  })

  it('removing a node schedules a redraw so it disappears', () => {
    new RenderContext(gl)
    let drawCount = 0
    const node = createNode(createRoot(gl), { draw: () => { drawCount++ } })
    flushFrames()
    expect(drawCount).toBe(1)

    node.remove()
    // Removal must schedule another redraw — THIS was the regression.
    expect(rafCallbacks.length).toBe(1)
    flushFrames()
    // The removed node is no longer drawn.
    expect(drawCount).toBe(1)
  })

  it('removed nodes are excluded from the draw set immediately', () => {
    new RenderContext(gl)
    let drawCount = 0
    const node = createNode(createRoot(gl), { draw: () => { drawCount++ } })
    node.remove()
    flushFrames()
    expect(drawCount).toBe(0)
  })

  it('draws roots in mount order (pre-order traversal)', () => {
    new RenderContext(gl)
    const order: string[] = []
    createNode(createRoot(gl), { draw: () => { order.push('a') } })
    createNode(createRoot(gl), { draw: () => { order.push('b') } })
    flushFrames()
    expect(order).toEqual(['a', 'b'])
  })

  it('continuousRender mode redraws every frame without dirty events', () => {
    new RenderContext(gl, { continuousRender: true })
    let drawCount = 0
    const node = createNode(createRoot(gl), { draw: () => { drawCount++ } })
    flushFrames()
    expect(drawCount).toBe(1)
    // The loop re-arms itself after each frame.
    expect(rafCallbacks.length).toBe(1)
    flushFrames()
    expect(drawCount).toBe(2)
    node.remove()
  })

  it('destroy cancels the continuous render loop', () => {
    const cancelSpy = vi.spyOn(globalThis, 'cancelAnimationFrame')
    const rc = new RenderContext(gl, { continuousRender: true })
    expect(cancelSpy).not.toHaveBeenCalled()
    rc.destroy()
    expect(cancelSpy).toHaveBeenCalled()
    cancelSpy.mockRestore()
  })
})
