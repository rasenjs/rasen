/**
 * 最小复现：mario 例子 StaticLayer 的场景 ——
 * image 节点绑定 getter（`() => ref.value` / `() => ref`），ref 换 canvas
 * 后节点是否被标脏重绘。
 *
 * 用真实 reactive-signals runtime（TC39 Signals），不是 mock。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
// @ts-expect-error workspace 依赖在仓库根可用
import { createReactiveRuntime } from '@rasenjs/reactive-signals'

import { createMockContext, waitForAsync } from '../test-utils'
import { createRoot } from '../node'
import type { CanvasNode, Context2D } from '../node'
import { group } from '../components/group'
import { rect } from '../components/rect'
import { image } from './image'

describe('static-layer repro (real signals runtime)', () => {
  let ctx: Context2D
  let root: CanvasNode
  const cleanups: Array<(() => void) | undefined> = []

  beforeEach(() => {
    setReactiveRuntime(createReactiveRuntime())
    ctx = createMockContext()
    root = createRoot(ctx)
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      setTimeout(() => cb(performance.now()), 0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    cleanups.forEach((fn) => fn?.())
    vi.unstubAllGlobals()
  })

  it('getter `() => ref.value` 换 canvas 后应重绘', async () => {
    // 模拟 game 的两个 ref（TC39 Signal.State）
    const runtime = (globalThis as any).__signalsRuntime ?? createReactiveRuntime()
    const staticLayer = runtime.ref(makeCanvas(3392))
    const camRenderX = runtime.ref(0)

    const drawCalls = () => (ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls

    const mountable = group({
      children: [
        rect({
          x: 0, y: 0, width: 256, height: 240,
          fill: '#9c9bff',
        }),
        image({
          // 与 StaticLayer.tsx 相同的绑定方式
          image: () => staticLayer.value,
          x: () => camRenderX.value,
          y: 0,
        }),
      ] as never,
    })

    const cleanup = mountable(root, undefined)
    cleanups.push(cleanup)
    await waitForAsync()
    const initial = drawCalls().length
    expect(initial).toBeGreaterThan(0)

    // 换 canvas —— StaticLayer 场景：loadLevel 后新 canvas
    staticLayer.value = makeCanvas(3392)
    await waitForAsync()
    await waitForAsync()

    expect(drawCalls().length).toBeGreaterThan(initial)
  })

  it('getter `() => ref`（返回 Ref 实例）换 canvas 后应重绘', async () => {
    const runtime = createReactiveRuntime()
    const staticLayer = runtime.ref(makeCanvas(3392))

    const drawCalls = () => (ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls

    const mountable = image({
      // 旧版绑定方式：getter 返回 Ref 实例本身
      image: (() => staticLayer) as never,
      x: 0,
      y: 0,
    })

    const cleanup = mountable(root, undefined)
    cleanups.push(cleanup)
    await waitForAsync()
    const initial = drawCalls().length
    expect(initial).toBeGreaterThan(0)

    staticLayer.value = makeCanvas(3392)
    await waitForAsync()
    await waitForAsync()

    expect(drawCalls().length).toBeGreaterThan(initial)
  })
})

function makeCanvas(width: number): HTMLCanvasElement {
  // jsdom 无真实 2D context —— image 组件的 draw 只是把 img 传给
  // mock ctx.drawImage，因此仅需 width/height 属性的假对象即可。
  return { width, height: 240 } as unknown as HTMLCanvasElement
}
