/**
 * Line 组件测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, setReactiveRuntime } from '@rasenjs/core'
import {
  createMockContext,
  getCallArgs,
  wasCalled,
  createMockReactiveRuntime,
  waitForAsync
} from '../test-utils'
import { line } from './line'

describe('line', () => {
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
    it('应该使用正确的参数绘制线条', async () => {
      const mountable = line({
        x1: 10,
        y1: 20,
        x2: 100,
        y2: 80,
        stroke: '#000000'
      })

      const cleanup = mount(mountable, ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(wasCalled(ctx.beginPath as ReturnType<typeof vi.fn>)).toBe(true)
      expect(wasCalled(ctx.moveTo as ReturnType<typeof vi.fn>)).toBe(true)
      expect(getCallArgs(ctx.moveTo as ReturnType<typeof vi.fn>)).toEqual([
        10, 20
      ])
      expect(wasCalled(ctx.lineTo as ReturnType<typeof vi.fn>)).toBe(true)
      expect(getCallArgs(ctx.lineTo as ReturnType<typeof vi.fn>)).toEqual([
        100, 80
      ])
      expect(wasCalled(ctx.stroke as ReturnType<typeof vi.fn>)).toBe(true)
    })

    it('应该支持自定义线条宽度', async () => {
      const mountable = line({
        x1: 0,
        y1: 0,
        x2: 100,
        y2: 100,
        stroke: 'red',
        lineWidth: 5
      })

      const cleanup = mount(mountable, ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(ctx.lineWidth).toBe(5)
      expect(ctx.strokeStyle).toBe('red')
    })
  })

  describe('默认值', () => {
    it('描边颜色默认应该为黑色', async () => {
      const mountable = line({
        x1: 0,
        y1: 0,
        x2: 100,
        y2: 100
      })

      const cleanup = mount(mountable, ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(ctx.strokeStyle).toBe('#000000')
    })

    it('线条宽度默认应该为 1', async () => {
      const mountable = line({
        x1: 0,
        y1: 0,
        x2: 100,
        y2: 100
      })

      const cleanup = mount(mountable, ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(ctx.lineWidth).toBe(1)
    })
  })

  describe('多点线条', () => {
    it('应该支持多个点的线条', async () => {
      const mountable = line({
        points: [0, 0, 50, 50, 100, 0],
        stroke: 'red'
      })

      const cleanup = mount(mountable, ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      // 验证使用了正确的绘制方法
      expect(wasCalled(ctx.moveTo as ReturnType<typeof vi.fn>)).toBe(true)
      expect(wasCalled(ctx.lineTo as ReturnType<typeof vi.fn>)).toBe(true)
      expect(wasCalled(ctx.stroke as ReturnType<typeof vi.fn>)).toBe(true)

      // 验证moveTo到第一个点
      const moveToArgs = getCallArgs(ctx.moveTo as ReturnType<typeof vi.fn>)
      expect(moveToArgs).toEqual([0, 0])

      // 验证lineTo被调用了2次（从第二个点开始）
      const lineToCalls = (ctx.lineTo as ReturnType<typeof vi.fn>).mock.calls
      expect(lineToCalls.length).toBe(2)
      expect(lineToCalls[0]).toEqual([50, 50])
      expect(lineToCalls[1]).toEqual([100, 0])
    })

    it('应该支持闭合路径', async () => {
      const mountable = line({
        points: [10, 10, 50, 50, 90, 10],
        stroke: 'blue',
        closed: true
      })

      const cleanup = mount(mountable, ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      // 验证closePath被调用
      expect(wasCalled(ctx.closePath as ReturnType<typeof vi.fn>)).toBe(true)
    })

    it('应该支持曲线张力', async () => {
      const mountable = line({
        points: [0, 0, 50, 100, 100, 0, 150, 100],
        tension: 0.5,
        stroke: 'blue'
      })
      cleanupFns.push(mount(mountable, ctx))
      await waitForAsync()

      expect(ctx.beginPath).toHaveBeenCalled()
      expect(ctx.moveTo).toHaveBeenCalledWith(0, 0)
      // 有张力时使用 bezierCurveTo
      expect(ctx.bezierCurveTo).toHaveBeenCalled()
      expect(ctx.stroke).toHaveBeenCalled()
    })
  })

  describe('虚线', () => {
    it('应该支持虚线模式', async () => {
      const mountable = line({
        x1: 0,
        y1: 0,
        x2: 100,
        y2: 100,
        stroke: 'red',
        lineDash: [10, 5]
      })

      const cleanup = mount(mountable, ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      // 验证setLineDash被调用
      expect(wasCalled(ctx.setLineDash as ReturnType<typeof vi.fn>)).toBe(true)
      expect(getCallArgs(ctx.setLineDash as ReturnType<typeof vi.fn>)).toEqual([
        [10, 5]
      ])
    })

    it('应该支持虚线偏移', async () => {
      const mountable = line({
        x1: 0,
        y1: 0,
        x2: 100,
        y2: 100,
        stroke: 'blue',
        lineDash: [10, 5],
        lineDashOffset: 5
      })

      const cleanup = mount(mountable, ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      // 验证setLineDash和lineDashOffset被设置
      expect(wasCalled(ctx.setLineDash as ReturnType<typeof vi.fn>)).toBe(true)
      expect(ctx.lineDashOffset).toBe(5)
    })
  })
})
