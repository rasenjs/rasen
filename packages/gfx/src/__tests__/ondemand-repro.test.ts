/* eslint-disable */
/**
 * Minimal repro: on-demand render path (continuousRender:false) with the REAL
 * Vue reactive runtime — mimics the spine bench page wiring:
 *   createRoot → element with deps(frame ref) → bump frame → pump → draw?
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot, createNode } from '../index'
import { useReactiveRuntime, ref } from '@rasenjs/reactive-vue'
import { createMockWebGLContext } from '../test-utils'

useReactiveRuntime()

describe('on-demand render path with real vue runtime', () => {
  let rafCallbacks: Array<() => void>

  beforeEach(() => {
    rafCallbacks = []
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafCallbacks.push(() => cb(0))
      return rafCallbacks.length
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const pump = (): void => {
    const cbs = rafCallbacks.splice(0)
    for (const cb of cbs) cb()
  }

  it('deps(frame ref) bump triggers a redraw', () => {
    const gl = createMockWebGLContext() as unknown as WebGL2RenderingContext
    const frame = ref(0)
    let drawCount = 0

    const root = createRoot(gl, { continuousRender: false })
    createNode(root, {
      draw: () => {
        drawCount++
      },
      deps: () => [frame.value]
    })
    pump()
    expect(drawCount).toBe(1)

    // bump frame → watch → markDirty → scheduleDraw → rAF → draw
    frame.value++
    pump()
    expect(drawCount).toBe(2)

    frame.value++
    pump()
    expect(drawCount).toBe(3)
  })
})

