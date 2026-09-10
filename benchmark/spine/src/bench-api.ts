/**
 * Bench API contract exposed as `window.__bench` by every target page.
 *
 * Timing protocol (identical for all libraries):
 *   - Ops measure performance.now() around the work AND wait one
 *     requestAnimationFrame, so the measured time includes the library's
 *     full draw pass registered before our wait rAF.
 *   - Animation runs use DETERMINISTIC time stepping: every rAF tick advances
 *     the animation clock by FIXED_DELTA (1/60 s), independent of wall-clock
 *     jitter. Frame statistics are collected in wall time. All targets do
 *     identical logical work per frame.
 *   - poseOnly measures the animation/pose solve WITHOUT any render pass —
 *     isolating CPU solve cost from draw cost.
 */

import { CANVAS_W, CANVAS_H, FIXED_DELTA, ANIM_NAME } from '../shared/spec'

export interface AnimResult {
  frames: number
  avgFrameMs: number
  p95FrameMs: number
  p99FrameMs: number
  maxFrameMs: number
  jankPct: number
  avgFps: number
}

export interface BenchAPI {
  /**
   * Fetch + parse skeleton/atlas + create the first instance. Resolves to
   * elapsed ms. Parsing is done by each runtime's own parser (part of the
   * real-world load path being measured).
   */
  load(): Promise<number>
  /** Create `n` additional instances (total n). Elapsed ms incl. first draw. */
  createInstances(n: number): Promise<number>
  /** Number of live instances. Optional; used by probe diagnostics only. */
  instanceCount?(): number
  /**
   * Run ONLY the pose solve for `ticks` ticks (update/apply/
   * updateWorldTransform), no rendering. Returns elapsed ms per tick.
   * Targets whose runtime couples pose+render (pixi-spine) measure their
   * coupled advance without triggering the renderer flush.
   */
  poseOnly(ticks: number): Promise<number>
  /** Animate `n` instances for `durationMs`, collecting frame statistics. */
  animate(durationMs: number, n: number): Promise<AnimResult>
  /**
   * Debug hook for render-equivalence verification: advance the shared
   * animation clock `steps` fixed-delta ticks and guarantee the result is
   * fully drawn before resolving. All targets land at an IDENTICAL pose.
   */
  debugStep(steps: number): Promise<void>
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

/** Time a synchronous (or async) mutation + the library's resulting draw. */
export async function timed(mutate: () => void | Promise<void>): Promise<number> {
  const t0 = performance.now()
  await mutate()
  await nextPaint()
  return performance.now() - t0
}

const WARMUP_FRAMES = 5

/** Deterministic animation loop: fixed delta per tick, stats in wall time. */
export async function measureAnimation(
  durationMs: number,
  n: number,
  tick: (delta: number) => void
): Promise<AnimResult> {
  const deltas: number[] = []
  let last = performance.now()
  const start = last
  return new Promise((resolve) => {
    const loop = () => {
      tick(FIXED_DELTA)
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
        const p95FrameMs =
          sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]
        const p99FrameMs =
          sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.99) - 1)]
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

/** Shared page shell: mount point + fixed-size container. */
export function installStage(): HTMLDivElement {
  const host = document.getElementById('app')!
  const el = document.createElement('div')
  el.style.width = `${CANVAS_W}px`
  el.style.height = `${CANVAS_H}px`
  host.appendChild(el)
  return el
}

/**
 * Skeleton asset for every target page.
 *
 * `?skel=<id>` overrides the spec default so one harness can sweep RIG SIZE
 * (c310 is 204 bones / 181 slots, c233 is 685 / 563). Bone count drives
 * updateWorldTransform while track count drives the timeline appliers, so
 * sweeping both isolates per-bone cost, per-track cost and the fixed per-apply
 * overhead from each other — three different fixes that a total cannot separate.
 */
export function pickAsset(id: string): string {
  if (typeof location !== 'undefined' && typeof location.search === 'string') {
    const m = /[?&]skel=([^&]+)/.exec(location.search)
    if (m) return `/${decodeURIComponent(m[1])}`
  }
  return id
}

/**
 * Animation name for every target page.
 *
 * `?anim=<name>` overrides the spec default so a single harness can sweep
 * animations of one skeleton (e.g. c310 ships 2-track and 189-track
 * animations). Comparing pose cost across track counts is what separates
 * PER-TRACK overhead from PER-APPLY fixed overhead — the two have completely
 * different fixes, and the total-only number cannot tell them apart.
 */
export function pickAnimation(names: string[]): string {
  let override: string | null = null
  if (typeof location !== 'undefined' && typeof location.search === 'string') {
    const m = /[?&]anim=([^&]+)/.exec(location.search)
    if (m) override = decodeURIComponent(m[1])
  }
  const wanted = override ?? ANIM_NAME
  if (wanted && names.includes(wanted)) return wanted
  return names[0] ?? ''
}
