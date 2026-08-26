/**
 * Bench API contract exposed as `window.__bench` by every target page.
 *
 * Timing protocol (identical for all libraries):
 *   - Every operation measures performance.now() around the mutation work
 *     AND waits one requestAnimationFrame. Libraries register their own
 *     rAF-drawn redraw BEFORE our wait rAF (mutation code runs first), and
 *     rAF callbacks execute in registration order within the same frame —
 *     so the measured time always includes the library's full draw pass.
 *   - Composite/paint of the resulting pixels is excluded: the scene spec is
 *     pixel-identical across targets, so raster cost is a shared constant;
 *     including it would only quantize sub-frame operations to frame
 *     boundaries and drown the actual differences in noise.
 */

import { CANVAS_W, CANVAS_H, type ShapeSpec } from '../shared/spec'

export interface AnimResult {
  /** Total rAF ticks observed (including warmup frames). */
  frames: number
  /** Mean frame interval in ms (warmup frames excluded). */
  avgFrameMs: number
  /** 95th percentile frame interval in ms (warmup frames excluded). */
  p95FrameMs: number
  /** 99th percentile frame interval in ms. */
  p99FrameMs: number
  /** Worst frame interval in ms. */
  maxFrameMs: number
  /** Share of frames slower than 25 ms (visibly janky), in percent. */
  jankPct: number
  /** 1000 / avgFrameMs. */
  avgFps: number
}

export interface BenchAPI {
  /** Build the scene with `count` shapes. Resolves to elapsed ms incl. draw. */
  create(count: number): Promise<number>
  /** Apply the shared update rule to every 10th shape. Elapsed ms incl. draw. */
  updateEvery10th(): Promise<number>
  /** Remove all shapes. Elapsed ms incl. draw. */
  clear(): Promise<number>
  /**
   * Create the scene with `count` shapes, then animate all of them (shared
   * velocity/bounce rule) for `durationMs`, collecting frame statistics.
   */
  animate(durationMs: number, count?: number): Promise<AnimResult>
  /**
   * Debug hook for render-equivalence verification: advance the shared
   * animation model `steps` frames and guarantee the result is fully drawn
   * before resolving. Lets external tools place every target at an IDENTICAL
   * logical state and compare actual rendered pixels.
   */
  debugStep(steps: number): Promise<void>
  /**
   * Interaction scenario: run `count` deterministic point queries against
   * the current scene (topmost-shape hit test each), returning elapsed ms
   * and how many queries hit a shape. Pure CPU — no paint involved.
   * Optional: targets whose tuning sacrifices built-in hit support omit it.
   */
  hitQuery?(count: number): { ms: number; hits: number }
}

declare global {
  interface Window {
    __bench: BenchAPI
  }
}

/** Wait until the next frame's rAF batch has run (library draws included). */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

/** Time a synchronous mutation + the library's resulting draw pass. */
export async function timed(mutate: () => void): Promise<number> {
  const t0 = performance.now()
  mutate()
  await nextPaint()
  return performance.now() - t0
}

const WARMUP_FRAMES = 5

/** Collect frame intervals for `durationMs` and compute stats. */
export async function measureAnimation(
  durationMs: number,
  tick: () => void
): Promise<AnimResult> {
  const deltas: number[] = []
  let last = performance.now()
  const start = last
  return new Promise((resolve) => {
    const loop = () => {
      tick()
      const now = performance.now()
      deltas.push(now - last)
      last = now
      if (now - start < durationMs) {
        requestAnimationFrame(loop)
      } else {
        const measured = deltas.slice(WARMUP_FRAMES)
        const sorted = [...measured].sort((a, b) => a - b)
        const avgFrameMs =
          measured.reduce((sum, d) => sum + d, 0) / measured.length
        const p95FrameMs = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]
        const p99FrameMs = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.99) - 1)]
        const maxFrameMs = sorted[sorted.length - 1]
        const jankPct =
          (measured.filter((d) => d > 25).length / measured.length) * 100
        resolve({
          frames: deltas.length,
          avgFrameMs,
          p95FrameMs,
          p99FrameMs,
          maxFrameMs,
          jankPct,
          avgFps: 1000 / avgFrameMs
        })
      }
    }
    requestAnimationFrame(loop)
  })
}

/** Shared minimal page shell: mount point + fixed-size canvas element. */
export function installCanvas(): HTMLCanvasElement {
  const host = document.getElementById('app')!
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_W
  canvas.height = CANVAS_H
  canvas.style.width = `${CANVAS_W}px`
  canvas.style.height = `${CANVAS_H}px`
  host.appendChild(canvas)
  return canvas
}

export type { ShapeSpec }
