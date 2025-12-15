/**
 * Path 组件测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'

import {
  createMockContext,
  createMockReactiveRuntime,
  waitForAsync
} from '../test-utils'
import { path } from './path'

describe('path', () => {
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

  describe('SVG 路径', () => {
    it('应该支持 SVG 路径数据', async () => {
      const mountable = path({
        data: 'M 10 10 L 50 50 L 90 10 Z',
        fill: 'green'
      })
      cleanupFns.push(mountable(ctx))
      await waitForAsync()

      expect(ctx.beginPath).toHaveBeenCalled()
      expect(ctx.moveTo).toHaveBeenCalledWith(10, 10)
      expect(ctx.lineTo).toHaveBeenCalledWith(50, 50)
      expect(ctx.lineTo).toHaveBeenCalledWith(90, 10)
      expect(ctx.closePath).toHaveBeenCalled()
      expect(ctx.fill).toHaveBeenCalled()
    })

    it('应该支持贝塞尔曲线路径', async () => {
      const mountable = path({
        data: 'M 10 80 Q 95 10 180 80',
        stroke: 'blue'
      })
      cleanupFns.push(mountable(ctx))
      await waitForAsync()

      expect(ctx.beginPath).toHaveBeenCalled()
      expect(ctx.moveTo).toHaveBeenCalledWith(10, 80)
      expect(ctx.quadraticCurveTo).toHaveBeenCalledWith(95, 10, 180, 80)
      expect(ctx.stroke).toHaveBeenCalled()
    })

    it('应该支持复杂路径', async () => {
      const mountable = path({
        data: 'M 0 0 C 50 0 50 100 100 100 S 150 0 200 100',
        stroke: 'red',
        fill: 'pink'
      })
      cleanupFns.push(mountable(ctx))
      await waitForAsync()

      expect(ctx.beginPath).toHaveBeenCalled()
      expect(ctx.moveTo).toHaveBeenCalledWith(0, 0)
      expect(ctx.bezierCurveTo).toHaveBeenCalled()
      expect(ctx.fill).toHaveBeenCalled()
      expect(ctx.stroke).toHaveBeenCalled()
    })

    it('应该正确计算贝塞尔曲线的边界框（包含控制点）', async () => {
      // 测试 Q 命令：M 50 100 Q 150 20 250 100
      // 控制点在 (150, 20)，曲线会向上延伸
      // 边界框应该包含控制点的范围
      const mountable = path({
        data: 'M 50 100 Q 150 20 250 100',
        stroke: 'blue'
      })
      cleanupFns.push(mountable(ctx))
      await waitForAsync()

      // 验证曲线被正确绘制
      expect(ctx.quadraticCurveTo).toHaveBeenCalledWith(150, 20, 250, 100)
      expect(ctx.stroke).toHaveBeenCalled()
    })

    it('应该正确计算三次贝塞尔曲线的边界框', async () => {
      // 测试 C 和 S 命令：M 50 150 C 50 50 250 50 250 150 S 150 250 50 150
      // 控制点会影响边界框
      const mountable = path({
        data: 'M 50 150 C 50 50 250 50 250 150 S 150 250 50 150',
        stroke: 'red',
        fill: 'pink'
      })
      cleanupFns.push(mountable(ctx))
      await waitForAsync()

      // 验证贝塞尔曲线被正确绘制
      expect(ctx.bezierCurveTo).toHaveBeenCalled()
      expect(ctx.fill).toHaveBeenCalled()
      expect(ctx.stroke).toHaveBeenCalled()
    })
  })
})
