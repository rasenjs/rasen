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
      const mount = path({
        data: 'M 10 10 L 50 50 L 90 10 Z',
        fill: 'green'
      })
      cleanupFns.push(mount(ctx))
      await waitForAsync()

      expect(ctx.beginPath).toHaveBeenCalled()
      expect(ctx.moveTo).toHaveBeenCalledWith(10, 10)
      expect(ctx.lineTo).toHaveBeenCalledWith(50, 50)
      expect(ctx.lineTo).toHaveBeenCalledWith(90, 10)
      expect(ctx.closePath).toHaveBeenCalled()
      expect(ctx.fill).toHaveBeenCalled()
    })

    it('应该支持贝塞尔曲线路径', async () => {
      const mount = path({
        data: 'M 10 80 Q 95 10 180 80',
        stroke: 'blue'
      })
      cleanupFns.push(mount(ctx))
      await waitForAsync()

      expect(ctx.beginPath).toHaveBeenCalled()
      expect(ctx.moveTo).toHaveBeenCalledWith(10, 80)
      expect(ctx.quadraticCurveTo).toHaveBeenCalledWith(95, 10, 180, 80)
      expect(ctx.stroke).toHaveBeenCalled()
    })

    it('应该支持复杂路径', async () => {
      const mount = path({
        data: 'M 0 0 C 50 0 50 100 100 100 S 150 0 200 100',
        stroke: 'red',
        fill: 'pink'
      })
      cleanupFns.push(mount(ctx))
      await waitForAsync()

      expect(ctx.beginPath).toHaveBeenCalled()
      expect(ctx.moveTo).toHaveBeenCalledWith(0, 0)
      expect(ctx.bezierCurveTo).toHaveBeenCalled()
      expect(ctx.fill).toHaveBeenCalled()
      expect(ctx.stroke).toHaveBeenCalled()
    })
  })
})
