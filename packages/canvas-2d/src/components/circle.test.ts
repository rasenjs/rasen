/**
 * Circle 组件测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'

import {
  createMockContext,
  getCallArgs,
  wasCalled,
  createMockReactiveRuntime,
  waitForAsync
} from '../test-utils'
import { circle } from './circle'

describe('circle', () => {
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
    it('应该使用正确的参数绘制填充圆形', async () => {
      const mountable = circle({
        x: 100,
        y: 100,
        radius: 50,
        fill: '#ff0000'
      })

      const cleanup = mountable(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(wasCalled(ctx.beginPath as ReturnType<typeof vi.fn>)).toBe(true)
      expect(wasCalled(ctx.arc as ReturnType<typeof vi.fn>)).toBe(true)
      expect(getCallArgs(ctx.arc as ReturnType<typeof vi.fn>)).toEqual([
        100,
        100,
        50,
        0,
        Math.PI * 2,
        false
      ])
      expect(wasCalled(ctx.fill as ReturnType<typeof vi.fn>)).toBe(true)
      expect(ctx.fillStyle).toBe('#ff0000')
    })

    it('应该使用正确的参数绘制描边圆形', async () => {
      const mountable = circle({
        x: 100,
        y: 100,
        radius: 50,
        stroke: '#00ff00',
        lineWidth: 5
      })

      const cleanup = mountable(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(wasCalled(ctx.stroke as ReturnType<typeof vi.fn>)).toBe(true)
      expect(ctx.strokeStyle).toBe('#00ff00')
      expect(ctx.lineWidth).toBe(5)
    })
  })

  describe('默认值', () => {
    it('描边宽度默认应该为 1', async () => {
      const mountable = circle({
        x: 0,
        y: 0,
        radius: 10,
        stroke: 'black'
      })

      const cleanup = mountable(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(ctx.lineWidth).toBe(1)
    })
  })

  describe('圆弧', () => {
    it('应该支持起始和结束角度', async () => {
      const mountable = circle({
        x: 100,
        y: 100,
        radius: 50,
        fill: 'red',
        startAngle: 0,
        endAngle: Math.PI
      })

      const cleanup = mountable(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(wasCalled(ctx.arc as ReturnType<typeof vi.fn>)).toBe(true)
      const arcArgs = getCallArgs(ctx.arc as ReturnType<typeof vi.fn>)

      // 验证起始角度和结束角度
      expect(arcArgs[3]).toBe(0) // startAngle
      expect(arcArgs[4]).toBe(Math.PI) // endAngle
      expect(arcArgs[5]).toBe(false) // anticlockwise 默认为 false
    })

    it('应该支持逆时针绘制', async () => {
      const mountable = circle({
        x: 100,
        y: 100,
        radius: 50,
        stroke: 'blue',
        startAngle: 0,
        endAngle: Math.PI,
        anticlockwise: true
      })

      const cleanup = mountable(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(wasCalled(ctx.arc as ReturnType<typeof vi.fn>)).toBe(true)
      const arcArgs = getCallArgs(ctx.arc as ReturnType<typeof vi.fn>)

      // 验证逆时针参数
      expect(arcArgs[5]).toBe(true) // anticlockwise
    })
  })
})
