/**
 * Regression guard: the clipped Spine path must not hand the batch a buffer it
 * goes on to reuse.
 *
 * ── The bug this locks down ───────────────────────────────────────────────
 * The 777 scene rendered as mostly empty under the gfx backends while canvas-2d
 * was correct. The cause was aliasing, not geometry: `addShape` stores the
 * vertices array BY REFERENCE and the renderer reads it at flush time, while
 * `maxBatchSize` (100000) is larger than one frame of this component, so nothing
 * is copied before the frame ends. The clipped path wrote every slot into ONE
 * shared scratch buffer, so all ~150 submissions pointed at the same memory and
 * only the last slot's triangles reached the GPU.
 *
 * It stayed hidden because the clipped path is only taken for skeletons that
 * carry clipping attachments — c010/c310/c233 have none and always use the fast
 * lane. 777 is an EventScene with two clipping attachments whose `end` slot is
 * their own slot, so the clip is active across the whole draw order and every
 * drawable takes the clipped path.
 *
 * ── What is asserted ──────────────────────────────────────────────────────
 * That the byte RANGES handed to the batch are pairwise disjoint.
 *
 * Neither obvious proxy works:
 *   - vertex counts and draw-call counts are IDENTICAL with the bug (each item
 *     records its own length, they just all read the last write);
 *   - array identity is useless because every submission is a fresh
 *     `subarray()` view over shared storage, so the views differ even when the
 *     bytes underneath overlap.
 *
 * Disjointness is the actual invariant: the renderer reads each item's range at
 * flush time, so two items may only share a buffer if their ranges do not
 * overlap. The fast lane satisfies this by reserving spans; the clipped path has
 * to satisfy it by taking a distinct pool slot.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRoot } from '../../index'
import { getRenderContext } from '../../renderer/gl/index'
import { createMockWebGLContext } from '../../test-utils'
import { spine } from '../../components/spine'
import { ref, useReactiveRuntime } from '@rasenjs/reactive-vue'
import {
  parseSpineBinary,
  parseSpineAtlas,
  Skeleton,
  AnimationState
} from '@rasenjs/assets'

useReactiveRuntime()

const FIXTURES = resolve(
  __dirname,
  '../../../../assets/src/spine/runtime/__fixtures__'
)

/** Byte span of one submitted array, for overlap testing. */
function spanOf(a: Float32Array): { buffer: ArrayBufferLike; start: number; end: number } {
  return { buffer: a.buffer, start: a.byteOffset, end: a.byteOffset + a.byteLength }
}

/**
 * Report pairs of submitted arrays whose byte ranges overlap.
 *
 * Only same-buffer pairs can overlap, so this buckets by buffer first — which
 * also keeps the check linear rather than quadratic over ~150 submissions.
 */
function overlappingPairs(arrays: Float32Array[]): string[] {
  const byBuffer = new Map<ArrayBufferLike, Array<{ start: number; end: number }>>()
  for (const a of arrays) {
    const s = spanOf(a)
    const bucket = byBuffer.get(s.buffer)
    if (bucket) bucket.push(s)
    else byBuffer.set(s.buffer, [s])
  }
  const hits: string[] = []
  for (const [, spans] of byBuffer) {
    if (spans.length < 2) continue
    spans.sort((x, y) => x.start - y.start)
    for (let i = 1; i < spans.length; i++) {
      if (spans[i].start < spans[i - 1].end) {
        hits.push(
          `range [${spans[i - 1].start},${spans[i - 1].end}) overlaps ` +
            `[${spans[i].start},${spans[i].end})`
        )
      }
    }
  }
  return hits
}

describe('spine clipped path buffer ownership', () => {
  let rafCallbacks: Array<() => void>

  beforeEach(() => {
    rafCallbacks = []
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(
      (cb: FrameRequestCallback) => {
        rafCallbacks.push(() => cb(0))
        return rafCallbacks.length
      }
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const pump = (): void => {
    const cbs = rafCallbacks.splice(0)
    for (const cb of cbs) cb()
  }

  it('gives every clipped submission its own vertex buffer (777 scene)', () => {
    const data = parseSpineBinary(
      new Uint8Array(readFileSync(resolve(FIXTURES, '777.skel')))
    )
    const atlas = parseSpineAtlas(readFileSync(resolve(FIXTURES, '777.atlas'), 'utf8'))

    const sk = new Skeleton(data, 'default')
    sk.setToSetupPose()
    sk.updateWorldTransform()
    sk.updateCache()
    const state = new AnimationState(sk)
    const names = state.animationNames
    state.setAnimation(names[0] ?? 'idle', true)
    state.update(0)
    state.apply()
    sk.updateWorldTransform()

    const gl = createMockWebGLContext()
    const root = createRoot(gl)

    // Observe the arrays handed to the batch, in submission order.
    const submitted: Float32Array[] = []
    // Observe what reaches the BATCH, not which node forwarded it: components
    // submit through their own element node (which delegates to the same
    // renderer as the root), so the renderer is the stable observation point.
    const rc = getRenderContext(gl) as unknown as {
      addShape: (...args: unknown[]) => void
    }
    const original = rc.addShape
    rc.addShape = function (this: unknown, ...args: unknown[]): void {
      if (typeof args[0] === 'string') submitted.push(args[1] as Float32Array)
      else submitted.push(args[0] as Float32Array)
      return original.apply(this, args)
    }

    const unmount = spine({
      skeleton: sk,
      atlas,
      // Only used to produce a texture handle; the mock does not inspect it.
      atlasImg: { width: 4, height: 4 } as unknown as object,
      state,
      frame: 0,
      width: 800,
      height: 600,
      skipTonemap: true
    })(root, undefined)

    pump()

    expect(submitted.length).toBeGreaterThan(50)
    // Every submission must own a byte range nobody else wrote.
    const overlaps = overlappingPairs(submitted)
    expect(overlaps).toEqual([])

    unmount?.()
  })

  it('reuses pooled storage across frames without crossing ownership', () => {
    const data = parseSpineBinary(
      new Uint8Array(readFileSync(resolve(FIXTURES, '777.skel')))
    )
    const atlas = parseSpineAtlas(readFileSync(resolve(FIXTURES, '777.atlas'), 'utf8'))

    const sk = new Skeleton(data, 'default')
    sk.setToSetupPose()
    sk.updateWorldTransform()
    sk.updateCache()
    const state = new AnimationState(sk)
    const names = state.animationNames
    state.setAnimation(names[0] ?? 'idle', true)
    state.update(0)
    state.apply()
    sk.updateWorldTransform()

    const gl = createMockWebGLContext()
    const root = createRoot(gl)

    const frames: Float32Array[][] = []
    let current: Float32Array[] = []
    const rc = getRenderContext(gl) as unknown as {
      addShape: (...args: unknown[]) => void
    }
    const original = rc.addShape
    rc.addShape = function (this: unknown, ...args: unknown[]): void {
      current.push((typeof args[0] === 'string' ? args[1] : args[0]) as Float32Array)
      return original.apply(this, args)
    }

    // A ref drives the redraw, and the POSE IS HELD FIXED so every frame clips
    // to the same sizes. Advancing the animation instead would change the clip
    // result per frame, occasionally forcing a pool buffer to grow — which is
    // correct behaviour but makes "was storage reused?" untestable.
    const frameRef = ref(0)
    const unmount = spine({
      skeleton: sk,
      atlas,
      atlasImg: { width: 4, height: 4 } as unknown as object,
      state,
      frame: frameRef,
      width: 800,
      height: 600,
      skipTonemap: true
    })(root, undefined)

    for (let f = 0; f < 3; f++) {
      current = []
      frameRef.value = f
      pump()
      frames.push(current)
      // Within a frame, ownership is exclusive: no two submissions write into
      // overlapping bytes.
      expect(overlappingPairs(current)).toEqual([])
    }

    expect(frames[0].length).toBeGreaterThan(50)
    // Across frames the same buffers are handed out again — that is the pool
    // working, and it is what keeps steady state allocation-free. Compared by
    // ArrayBuffer because each submission is a fresh `subarray()` view.
    const first = new Set(frames[0].map((b) => b.buffer))
    expect(frames[2].some((b) => first.has(b.buffer))).toBe(true)

    unmount?.()
  })
})
