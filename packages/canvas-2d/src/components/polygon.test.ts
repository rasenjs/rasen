/**
 * Polygon 组件测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import {
  createMockContext,
  createMockReactiveRuntime,
  waitForAsync
} from '../test-utils'
import { polygon } from './polygon'

describe('polygon', () => {
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

  describe('自定义多边形', () => {
    it('应该使用点数组绘制多边形', async () => {
      const mount = polygon({
        points: [23, 20, 40, 80, 5, 80],
        fill: 'red'
      })

      const cleanup = mount(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(
        (ctx.beginPath as ReturnType<typeof vi.fn>).mock.calls.length
      ).toBeGreaterThan(0)
      expect(
        (ctx.moveTo as ReturnType<typeof vi.fn>).mock.calls.length
      ).toBeGreaterThan(0)
      const moveToCalls = (ctx.moveTo as ReturnType<typeof vi.fn>).mock.calls
      expect(moveToCalls[0]).toEqual([23, 20])
      expect(
        (ctx.lineTo as ReturnType<typeof vi.fn>).mock.calls.length
      ).toBeGreaterThan(0)
      expect(
        (ctx.closePath as ReturnType<typeof vi.fn>).mock.calls.length
      ).toBeGreaterThan(0)
    })

    it('应该绘制不闭合的折线 (polyline)', async () => {
      const mount = polygon({
        points: [0, 0, 50, 50, 100, 0],
        stroke: 'black',
        lineWidth: 2,
        closed: false
      })

      const cleanup = mount(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(
        (ctx.moveTo as ReturnType<typeof vi.fn>).mock.calls.length
      ).toBeGreaterThan(0)
      expect(
        (ctx.lineTo as ReturnType<typeof vi.fn>).mock.calls.length
      ).toBeGreaterThan(0)
    })
  })

  describe('正多边形', () => {
    it('应该支持正三角形', async () => {
      const mount = polygon({
        x: 100,
        y: 100,
        sides: 3,
        radius: 50,
        fill: 'blue'
      })

      const cleanup = mount(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      // 验证绘制了3个顶点
      const lineToCall = (ctx.lineTo as ReturnType<typeof vi.fn>).mock.calls
      expect(lineToCall.length).toBeGreaterThanOrEqual(2) // 至少2条线（3个点需要2次lineTo）
    })

    it('应该支持正六边形', async () => {
      const mount = polygon({
        x: 100,
        y: 100,
        sides: 6,
        radius: 50,
        fill: 'green'
      })

      const cleanup = mount(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      // 验证绘制了6个顶点
      const lineToCalls = (ctx.lineTo as ReturnType<typeof vi.fn>).mock.calls
      expect(lineToCalls.length).toBeGreaterThanOrEqual(5) // 至少5条线（6个点需要5次lineTo）
    })

    it('应该支持圆角正多边形', async () => {
      const mount = polygon({
        x: 50,
        y: 50,
        sides: 6,
        radius: 40,
        cornerRadius: 5,
        fill: 'lightblue',
        stroke: 'darkblue'
      })
      cleanupFns.push(mount(ctx))
      await waitForAsync()

      expect(ctx.beginPath).toHaveBeenCalled()
      // 圆角多边形使用 arcTo 绘制圆角
      expect(ctx.arcTo).toHaveBeenCalled()
      expect(ctx.closePath).toHaveBeenCalled()
      expect(ctx.fill).toHaveBeenCalled()
      expect(ctx.stroke).toHaveBeenCalled()
    })
  })
})
