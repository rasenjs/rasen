/**
 * Arc 组件测试
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
import { arc } from './arc'

describe('arc', () => {
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
    it('应该使用正确的参数绘制圆弧', async () => {
      const mount = arc({
        x: 100,
        y: 100,
        radius: 50,
        startAngle: 0,
        endAngle: Math.PI,
        stroke: '#ff0000'
      })

      const cleanup = mount(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(wasCalled(ctx.beginPath as ReturnType<typeof vi.fn>)).toBe(true)
      expect(wasCalled(ctx.arc as ReturnType<typeof vi.fn>)).toBe(true)
      expect(getCallArgs(ctx.arc as ReturnType<typeof vi.fn>)).toEqual([
        100,
        100,
        50,
        0,
        Math.PI,
        false
      ])
      expect(wasCalled(ctx.stroke as ReturnType<typeof vi.fn>)).toBe(true)
    })

    it('应该支持填充扇形', async () => {
      const mount = arc({
        x: 100,
        y: 100,
        radius: 50,
        startAngle: 0,
        endAngle: Math.PI / 2,
        fill: 'red'
      })

      const cleanup = mount(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      // 填充时应该连接到中心点
      expect(wasCalled(ctx.lineTo as ReturnType<typeof vi.fn>)).toBe(true)
      expect(wasCalled(ctx.closePath as ReturnType<typeof vi.fn>)).toBe(true)
      expect(wasCalled(ctx.fill as ReturnType<typeof vi.fn>)).toBe(true)
      expect(ctx.fillStyle).toBe('red')
    })

    it('应该支持逆时针绘制', async () => {
      const mount = arc({
        x: 100,
        y: 100,
        radius: 50,
        startAngle: 0,
        endAngle: Math.PI,
        anticlockwise: true,
        stroke: 'blue'
      })

      const cleanup = mount(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      const arcArgs = getCallArgs(ctx.arc as ReturnType<typeof vi.fn>)
      expect(arcArgs[5]).toBe(true) // anticlockwise
    })
  })
})
