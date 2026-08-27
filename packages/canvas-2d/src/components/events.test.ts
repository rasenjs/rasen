/**
 * Pointer event dispatch tests.
 *
 * The renderer exposes a pure `dispatchPointer(type, x, y)` entry — native
 * event listeners and coordinate translation live in the host adapter
 * (@rasenjs/dom). These tests drive that entry directly, exactly as the
 * adapter would.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'

import {
  createMockContext,
  createMockReactiveRuntime,
  waitForAsync
} from '../test-utils'
import { createRoot } from '../node'
import { getRenderContext } from '../render-context'
import { rect } from './rect'
import { circle } from './circle'
import type { CanvasPointerEvent } from '../events'

function createContext() {
  const ctx = createMockContext()
  const root = createRoot(ctx)
  return { ctx, root, rc: () => getRenderContext(ctx) }
}

describe('pointer event dispatch', () => {
  let cleanupFns: Array<(() => void) | undefined>

  beforeEach(() => {
    setReactiveRuntime(createMockReactiveRuntime())
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

  it('dispatches click to the hit shape with canvas coordinates', async () => {
    const { root, rc } = createContext()
    const onClick = vi.fn()
    cleanupFns.push(
      rect({ x: 10, y: 10, width: 100, height: 50, fill: '#f00', onClick })(root, undefined)
    )
    await waitForAsync()

    rc().dispatchPointer('click', 50, 30)

    expect(onClick).toHaveBeenCalledTimes(1)
    const e = onClick.mock.calls[0][0] as CanvasPointerEvent
    expect(e.x).toBe(50)
    expect(e.y).toBe(30)
    expect(e.node).not.toBeNull()
  })

  it('does not fire when the point misses every shape', async () => {
    const { root, rc } = createContext()
    const onClick = vi.fn()
    cleanupFns.push(
      rect({ x: 10, y: 10, width: 100, height: 50, fill: '#f00', onClick })(root, undefined)
    )
    await waitForAsync()

    rc().dispatchPointer('click', 500, 500)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('supports pointerdown/up/move handler types', async () => {
    const { root, rc } = createContext()
    const down = vi.fn()
    const up = vi.fn()
    const move = vi.fn()
    cleanupFns.push(
      circle({
        x: 100,
        y: 100,
        radius: 40,
        fill: '#00f',
        onPointerDown: down,
        onPointerUp: up,
        onPointerMove: move
      })(root, undefined)
    )
    await waitForAsync()

    rc().dispatchPointer('pointerdown', 100, 100)
    rc().dispatchPointer('pointerup', 100, 100)
    rc().dispatchPointer('pointermove', 110, 110)

    expect(down).toHaveBeenCalledTimes(1)
    expect(up).toHaveBeenCalledTimes(1)
    expect(move).toHaveBeenCalledTimes(1)
  })

  it('topmost shape wins for overlapping shapes', async () => {
    const { root, rc } = createContext()
    const bottomClick = vi.fn()
    const topClick = vi.fn()
    cleanupFns.push(
      rect({ x: 0, y: 0, width: 300, height: 300, fill: '#00f', onClick: bottomClick })(root, undefined)
    )
    cleanupFns.push(
      rect({ x: 250, y: 250, width: 40, height: 40, fill: '#f00', onClick: topClick })(root, undefined)
    )
    await waitForAsync()

    // Point inside BOTH rects → only the topmost handler fires.
    rc().dispatchPointer('click', 260, 260)
    expect(topClick).toHaveBeenCalledTimes(1)
    expect(bottomClick).not.toHaveBeenCalled()

    // Point inside the bottom rect only.
    rc().dispatchPointer('click', 10, 10)
    expect(bottomClick).toHaveBeenCalledTimes(1)
  })

  it('sets needsPointerEvents only when a node declares handlers', async () => {
    const { root, rc } = createContext()
    // No handlers → no binding signal.
    cleanupFns.push(rect({ x: 0, y: 0, width: 10, height: 10, fill: '#000' })(root, undefined))
    await waitForAsync()
    expect(rc().needsPointerEvents).toBe(false)

    // A node with a handler flips the flag → the host adapter binds listeners.
    cleanupFns.push(rect({ x: 20, y: 0, width: 10, height: 10, fill: '#00f', onClick: () => {} })(root, undefined))
    await waitForAsync()
    expect(rc().needsPointerEvents).toBe(true)
  })
})
