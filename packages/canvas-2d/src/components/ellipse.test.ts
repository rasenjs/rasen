/**
 * Ellipse 组件测试
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
import { ellipse } from './ellipse'

describe('ellipse', () => {
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
    it('应该使用正确的参数绘制填充椭圆', async () => {
      const mountable = ellipse({
        x: 100,
        y: 100,
        radiusX: 50,
        radiusY: 25,
        fill: '#ff0000'
      })

      const cleanup = mount(mountable, ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(wasCalled(ctx.beginPath as ReturnType<typeof vi.fn>)).toBe(true)
      expect(wasCalled(ctx.ellipse as ReturnType<typeof vi.fn>)).toBe(true)
      expect(getCallArgs(ctx.ellipse as ReturnType<typeof vi.fn>)).toEqual([
        100,
        100,
        50,
        25,
        0,
        0,
        Math.PI * 2,
        false
      ])
      expect(wasCalled(ctx.fill as ReturnType<typeof vi.fn>)).toBe(true)
      expect(ctx.fillStyle).toBe('#ff0000')
    })

    it('应该使用正确的参数绘制描边椭圆', async () => {
      const mountable = ellipse({
        x: 100,
        y: 100,
        radiusX: 60,
        radiusY: 30,
        stroke: '#00ff00',
        lineWidth: 5
      })

      const cleanup = mount(mountable, ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(wasCalled(ctx.stroke as ReturnType<typeof vi.fn>)).toBe(true)
      expect(ctx.strokeStyle).toBe('#00ff00')
      expect(ctx.lineWidth).toBe(5)
    })

    it('应该同时支持填充和描边', async () => {
      const mountable = ellipse({
        x: 100,
        y: 100,
        radiusX: 50,
        radiusY: 25,
        fill: 'red',
        stroke: 'blue',
        lineWidth: 2
      })

      const cleanup = mount(mountable, ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(wasCalled(ctx.fill as ReturnType<typeof vi.fn>)).toBe(true)
      expect(wasCalled(ctx.stroke as ReturnType<typeof vi.fn>)).toBe(true)
    })
  })

  describe('椭圆弧', () => {
    it('应该支持起始和结束角度', async () => {
      const mountable = ellipse({
        x: 100,
        y: 100,
        radiusX: 50,
        radiusY: 25,
        fill: 'red',
        startAngle: 0,
        endAngle: Math.PI
      })

      const cleanup = mount(mountable, ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(wasCalled(ctx.ellipse as ReturnType<typeof vi.fn>)).toBe(true)
      const ellipseArgs = getCallArgs(ctx.ellipse as ReturnType<typeof vi.fn>)

      // 验证起始角度和结束角度
      expect(ellipseArgs[5]).toBe(0) // startAngle
      expect(ellipseArgs[6]).toBe(Math.PI) // endAngle
      expect(ellipseArgs[7]).toBe(false) // anticlockwise 默认为 false
    })

    it('应该支持逆时针绘制', async () => {
      const mountable = ellipse({
        x: 100,
        y: 100,
        radiusX: 50,
        radiusY: 25,
        stroke: 'blue',
        startAngle: 0,
        endAngle: Math.PI,
        anticlockwise: true
      })

      const cleanup = mount(mountable, ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(wasCalled(ctx.ellipse as ReturnType<typeof vi.fn>)).toBe(true)
      const ellipseArgs = getCallArgs(ctx.ellipse as ReturnType<typeof vi.fn>)

      // 验证逆时针参数
      expect(ellipseArgs[7]).toBe(true) // anticlockwise
    })
  })

  describe('默认值', () => {
    it('描边宽度默认应该为 1', async () => {
      const mountable = ellipse({
        x: 100,
        y: 100,
        radiusX: 50,
        radiusY: 25,
        stroke: 'black'
      })

      const cleanup = mount(mountable, ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(ctx.lineWidth).toBe(1)
    })
  })
})
