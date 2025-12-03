/**
 * Star 组件测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'

import {
  createMockContext,
  wasCalled,
  createMockReactiveRuntime,
  waitForAsync
} from '../test-utils'
import { star } from './star'

describe('star', () => {
  let ctx: CanvasRenderingContext2D
  let cleanupFns: Array<(() => void) | undefined>

  beforeEach(() => {
    setReactiveRuntime(createMockReactiveRuntime())
    ctx = createMockContext()
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

  describe('基础绘制', () => {
    it('应该绘制五角星', async () => {
      const mountable = star({
        x: 100,
        y: 100,
        numPoints: 5,
        innerRadius: 25,
        outerRadius: 50,
        fill: 'yellow'
      })

      const cleanup = mountable(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(wasCalled(ctx.beginPath as ReturnType<typeof vi.fn>)).toBe(true)
      expect(wasCalled(ctx.moveTo as ReturnType<typeof vi.fn>)).toBe(true)
      expect(wasCalled(ctx.lineTo as ReturnType<typeof vi.fn>)).toBe(true)
      expect(wasCalled(ctx.closePath as ReturnType<typeof vi.fn>)).toBe(true)
      expect(wasCalled(ctx.fill as ReturnType<typeof vi.fn>)).toBe(true)

      // 五角星应该有10条线（5个外点 + 5个内点）
      const lineToCalls = (ctx.lineTo as ReturnType<typeof vi.fn>).mock.calls
      expect(lineToCalls.length).toBe(10)
    })

    it('应该支持不同角数的星形', async () => {
      const mountable = star({
        x: 100,
        y: 100,
        numPoints: 6, // 六角星
        innerRadius: 30,
        outerRadius: 60,
        fill: 'blue'
      })

      const cleanup = mountable(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      // 六角星应该有12条线
      const lineToCalls = (ctx.lineTo as ReturnType<typeof vi.fn>).mock.calls
      expect(lineToCalls.length).toBe(12)
    })

    it('应该同时支持填充和描边', async () => {
      const mountable = star({
        x: 100,
        y: 100,
        numPoints: 5,
        innerRadius: 20,
        outerRadius: 40,
        fill: 'red',
        stroke: 'black',
        lineWidth: 2
      })

      const cleanup = mountable(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(wasCalled(ctx.fill as ReturnType<typeof vi.fn>)).toBe(true)
      expect(wasCalled(ctx.stroke as ReturnType<typeof vi.fn>)).toBe(true)
      expect(ctx.lineWidth).toBe(2)
    })
  })
})
