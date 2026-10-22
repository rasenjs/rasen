/**
 * Device-pixel resolution: the host sizes the backing store to
 * `cssSize * dpr`, and the renderer must divide by that ratio when it draws or
 * every shape lands at `1/dpr` size in the top-left corner.
 *
 * This is the contract the DOM canvas bridge relies on when it passes
 * `resolution: devicePixelRatio`; a screenshot on a Retina display is the
 * failure mode, so it is pinned here rather than left to a manual check.
 */

import { describe, expect, it, vi } from 'vitest'
import { RenderContext } from '../render-context'

/** A context that records the transform and clear calls it receives. */
function recordingContext(width: number, height: number) {
  const calls: Array<[string, ...unknown[]]> = []
  const ctx = {
    canvas: { width, height } as HTMLCanvasElement,
    setTransform: (...args: unknown[]) => calls.push(['setTransform', ...args]),
    clearRect: (...args: unknown[]) => calls.push(['clearRect', ...args]),
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
  }
  return { ctx, calls }
}

describe('the renderer\'s device-pixel base transform', () => {
  it('scales drawing to the backing store and clears in CSS pixels', () => {
    const { ctx, calls } = recordingContext(400, 200)
    const render = new RenderContext(ctx as never, { resolution: 2, schedule: (fn) => (fn(), () => {}) })
    ;(render as unknown as { draw(): void }).draw()
    expect(calls).toContainEqual(['setTransform', 2, 0, 0, 2, 0, 0])
    // 400x200 buffer at resolution 2 is a 200x100 CSS surface.
    expect(calls).toContainEqual(['clearRect', 0, 0, 200, 100])
  })

  it('leaves the transform alone at resolution 1', () => {
    const { ctx, calls } = recordingContext(200, 100)
    const render = new RenderContext(ctx as never, { schedule: (fn) => (fn(), () => {}) })
    ;(render as unknown as { draw(): void }).draw()
    expect(calls.some(([name]) => name === 'setTransform')).toBe(false)
  })
})
