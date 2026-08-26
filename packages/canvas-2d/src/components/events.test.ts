/**
 * Delegated pointer event dispatch tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'

import {
  createMockContext,
  createMockReactiveRuntime,
  waitForAsync
} from '../test-utils'
import { rect } from './rect'
import { circle } from './circle'
import type { CanvasPointerEvent } from '../events'

/** Mock context whose canvas surface supports delegated DOM listeners. */
function createEventedContext() {
  const ctx = createMockContext()
  const listeners = new Map<string, (e: unknown) => void>()
  ;(ctx.canvas as unknown as Record<string, unknown>).addEventListener = (
    type: string,
    h: (e: unknown) => void
  ) => {
    listeners.set(type, h)
  }
  return { ctx, listeners }
}

describe('delegated pointer events', () => {
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
    const { ctx, listeners } = createEventedContext()
    const onClick = vi.fn()
    cleanupFns.push(
      rect({ x: 10, y: 10, width: 100, height: 50, fill: '#f00', onClick })(ctx)
    )
    await waitForAsync()

    expect(listeners.has('click')).toBe(true)
    listeners.get('click')!({ offsetX: 50, offsetY: 30 })

    expect(onClick).toHaveBeenCalledTimes(1)
    const e = onClick.mock.calls[0][0] as CanvasPointerEvent
    expect(e.x).toBe(50)
    expect(e.y).toBe(30)
    expect(e.node).not.toBeNull()
  })

  it('does not fire when the point misses every shape', async () => {
    const { ctx, listeners } = createEventedContext()
    const onClick = vi.fn()
    cleanupFns.push(
      rect({ x: 10, y: 10, width: 100, height: 50, fill: '#f00', onClick })(ctx)
    )
    await waitForAsync()

    listeners.get('click')!({ offsetX: 500, offsetY: 500 })
    expect(onClick).not.toHaveBeenCalled()
  })

  it('supports pointerdown/up/move handler types', async () => {
    const { ctx, listeners } = createEventedContext()
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
      })(ctx)
    )
    await waitForAsync()

    expect(listeners.has('pointerdown')).toBe(true)
    expect(listeners.has('pointerup')).toBe(true)
    expect(listeners.has('pointermove')).toBe(true)

    listeners.get('pointerdown')!({ offsetX: 100, offsetY: 100 })
    listeners.get('pointerup')!({ offsetX: 100, offsetY: 100 })
    listeners.get('pointermove')!({ offsetX: 110, offsetY: 110 })

    expect(down).toHaveBeenCalledTimes(1)
    expect(up).toHaveBeenCalledTimes(1)
    expect(move).toHaveBeenCalledTimes(1)
  })

  it('topmost shape wins for overlapping shapes', async () => {
    const { ctx, listeners } = createEventedContext()
    const bottomClick = vi.fn()
    const topClick = vi.fn()
    cleanupFns.push(
      rect({ x: 0, y: 0, width: 300, height: 300, fill: '#00f', onClick: bottomClick })(ctx)
    )
    cleanupFns.push(
      rect({ x: 250, y: 250, width: 40, height: 40, fill: '#f00', onClick: topClick })(ctx)
    )
    await waitForAsync()

    // Point inside BOTH rects → only the topmost handler fires.
    listeners.get('click')!({ offsetX: 260, offsetY: 260 })
    expect(topClick).toHaveBeenCalledTimes(1)
    expect(bottomClick).not.toHaveBeenCalled()

    // Point inside the bottom rect only.
    listeners.get('click')!({ offsetX: 10, offsetY: 10 })
    expect(bottomClick).toHaveBeenCalledTimes(1)
  })

  it('attaches no listeners for scenes without handlers', async () => {
    const { ctx, listeners } = createEventedContext()
    cleanupFns.push(rect({ x: 0, y: 0, width: 10, height: 10, fill: '#000' })(ctx))
    await waitForAsync()
    expect(listeners.size).toBe(0)
  })
})
