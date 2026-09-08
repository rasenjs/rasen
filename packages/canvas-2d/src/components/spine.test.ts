/**
 * Spine clipping wiring in the canvas-2d renderer: a `clipping` attachment
 * must start a clip path built from its world polygon, cut every subsequent
 * slot in draw order, and end after the end slot has been drawn (official
 * SkeletonClipping semantics).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'

import { createMockContext, createMockReactiveRuntime, waitForAsync } from '../test-utils'
import { createRoot } from '../node'
import type { CanvasNode, Context2D } from '../node'
import { spine } from './spine'
import { Skeleton } from '@rasenjs/assets'
import type { SkeletonData, SpineAtlas } from '@rasenjs/assets'

function makeSkeletonData(): SkeletonData {
  const mesh = (ox: number, oy: number) => ({
    type: 'mesh' as const,
    uvs: [0, 0, 1, 0, 1, 1],
    triangles: [0, 1, 2],
    vertices: [ox, oy, ox + 10, oy, ox, oy + 10]
  })
  return {
    format: 'spine',
    version: '4.1.0',
    bones: [{ name: 'root' }],
    slots: [
      { name: 'clip', bone: 'root', attachment: 'clip' },
      { name: 'pod', bone: 'root', attachment: 'pod' },
      { name: 'after', bone: 'root', attachment: 'after' }
    ],
    skins: [
      {
        name: 'default',
        attachments: {
          clip: {
            clip: {
              type: 'clipping',
              end: 'after',
              vertexCount: 3,
              vertices: [0, 0, 10, 0, 0, 10]
            }
          },
          pod: { pod: mesh(20, 20) },
          after: { after: mesh(40, 40) }
        }
      }
    ],
    animations: {}
  }
}

const stubAtlas = { regions: {}, pages: [] } as unknown as SpineAtlas

describe('spine component — clipping', () => {
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

  it('clips the slots between the clip attachment and its end slot', async () => {
    const mountable = spine({
      skeleton: new Skeleton(makeSkeletonData()),
      atlas: stubAtlas,
      atlasImg: {} as HTMLImageElement,
      state: null,
      frame: 1,
      width: 100,
      height: 100
    })
    cleanupFns.push(mountable(root, undefined))
    await waitForAsync()

    // Clip calls: 1 polygon clip per clipped slot (pod AND after — the end
    // slot itself is still clipped, official clipEndWithSlot semantics) +
    // 1 per drawn triangle. A clip leaking PAST the end slot → 5.
    expect(ctx.clip).toHaveBeenCalledTimes(4)

    // The clip polygon path is built from the clipping attachment's world
    // vertices: moveTo(0,0) → lineTo(10,0) → lineTo(0,10). The pod/after
    // triangles use different coordinates, so those vertices can only come
    // from the clip polygon. (Bone world matrices go through cos/sin —
    // epsilon compare.)
    const lineToCalls = (ctx.lineTo as ReturnType<typeof vi.fn>).mock.calls as number[][]
    expect(lineToCalls.some(([x, y]) => Math.abs(x - 10) < 1e-6 && Math.abs(y) < 1e-6)).toBe(true)
    expect(lineToCalls.some(([x, y]) => Math.abs(x) < 1e-6 && Math.abs(y - 10) < 1e-6)).toBe(true)

    // save/restore pairing: 1 transform save + per clipped slot 1 outer save
    // (pod, after) + 1 per-triangle save (2) = 5.
    expect(ctx.save).toHaveBeenCalledTimes(5)
    expect(ctx.restore).toHaveBeenCalledTimes(5)

    // The clipping attachment itself draws nothing — exactly 2 textured
    // triangles (pod, after).
    expect(ctx.drawImage).toHaveBeenCalledTimes(2)
  })

  it('draws without an outer clip when the skeleton has no clipping attachment', async () => {
    const data = makeSkeletonData()
    data.skins[0].attachments.clip.clip = {
      type: 'clipping',
      end: 'after',
      vertexCount: 3,
      vertices: [0, 0, 10, 0, 0, 10]
    }
    // Detach the clip attachment from its slot — no clip in effect.
    ;(data.slots[0] as { attachment?: string }).attachment = undefined

    const mountable = spine({
      skeleton: new Skeleton(data),
      atlas: stubAtlas,
      atlasImg: {} as HTMLImageElement,
      state: null,
      frame: 1,
      width: 100,
      height: 100
    })
    cleanupFns.push(mountable(root, undefined))
    await waitForAsync()

    expect(ctx.clip).toHaveBeenCalledTimes(2) // one per drawn triangle only
    expect(ctx.save).toHaveBeenCalledTimes(3) // transform + 2 triangles
    expect(ctx.restore).toHaveBeenCalledTimes(3)
  })
})
