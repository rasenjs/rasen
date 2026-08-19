/**
 * RenderContext lifecycle tests.
 *
 * register()/unregister() must SYMMETRICALLY trigger redraws so that:
 *  - newly-mounted components appear on screen, and
 *  - removed components disappear (regression: unregister() never scheduled
 *    a redraw, leaving stale pixels / frozen billboards on screen after a
 *    reactive list removed an item).
 *
 * requestAnimationFrame is stubbed to capture callbacks so the scheduling
 * contract is asserted deterministically (no real frames).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { RenderContext } from '../render-context'
import { createMockWebGLContext } from '../test-utils'

describe('RenderContext lifecycle', () => {
  let gl: WebGLRenderingContext
  let rafCallbacks: Array<() => void>
  let rafSpy: ReturnType<typeof vi.spyOn>

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

  it('register schedules a redraw so new components appear', () => {
    const rc = new RenderContext(gl)
    let drawCount = 0
    rc.register({ bounds: () => null, draw: () => { drawCount++ } })
    expect(rafCallbacks.length).toBe(1)
    flushFrames()
    expect(drawCount).toBe(1)
  })

  it('unregister schedules a redraw so removed components disappear', () => {
    const rc = new RenderContext(gl)
    let drawCount = 0
    const id = rc.register({ bounds: () => null, draw: () => { drawCount++ } })
    flushFrames()
    expect(drawCount).toBe(1)

    rc.unregister(id)
    // Removal must schedule another redraw — THIS was the regression.
    expect(rafCallbacks.length).toBe(1)
    flushFrames()
    // The removed component is no longer drawn.
    expect(drawCount).toBe(1)
  })

  it('unregister removes the component from the draw set immediately', () => {
    const rc = new RenderContext(gl)
    let drawCount = 0
    const id = rc.register({ bounds: () => null, draw: () => { drawCount++ } })
    rc.unregister(id)
    flushFrames()
    expect(drawCount).toBe(0)
  })

  it('continuousRender mode redraws every frame without dirty events', () => {
    const rc = new RenderContext(gl, { continuousRender: true })
    let drawCount = 0
    const id = rc.register({ bounds: () => null, draw: () => { drawCount++ } })
    flushFrames()
    expect(drawCount).toBe(1)
    // The loop re-arms itself after each frame.
    expect(rafCallbacks.length).toBe(1)
    flushFrames()
    expect(drawCount).toBe(2)
    rc.unregister(id)
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
