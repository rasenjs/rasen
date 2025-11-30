/**
 * Ring 组件测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import {
  createMockContext,
  wasCalled,
  createMockReactiveRuntime,
  waitForAsync
} from '../test-utils'
import { ring } from './ring'

describe('ring', () => {
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
    it('应该使用正确的参数绘制圆环', async () => {
      const mount = ring({
        x: 100,
        y: 100,
        innerRadius: 30,
        outerRadius: 50,
        fill: '#ff0000'
      })

      const cleanup = mount(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(wasCalled(ctx.beginPath as ReturnType<typeof vi.fn>)).toBe(true)
      expect(wasCalled(ctx.arc as ReturnType<typeof vi.fn>)).toBe(true)

      // arc应该被调用两次（外圆和内圆）
      const arcCalls = (ctx.arc as ReturnType<typeof vi.fn>).mock.calls
      expect(arcCalls.length).toBe(2)

      // 外圆（顺时针）
      expect(arcCalls[0]).toEqual([100, 100, 50, 0, Math.PI * 2, false])
      // 内圆（逆时针）
      expect(arcCalls[1]).toEqual([100, 100, 30, 0, Math.PI * 2, true])

      expect(wasCalled(ctx.closePath as ReturnType<typeof vi.fn>)).toBe(true)
      expect(wasCalled(ctx.fill as ReturnType<typeof vi.fn>)).toBe(true)
    })

    it('应该支持描边', async () => {
      const mount = ring({
        x: 100,
        y: 100,
        innerRadius: 30,
        outerRadius: 50,
        stroke: 'blue',
        lineWidth: 2
      })

      const cleanup = mount(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(wasCalled(ctx.stroke as ReturnType<typeof vi.fn>)).toBe(true)
      expect(ctx.strokeStyle).toBe('blue')
      expect(ctx.lineWidth).toBe(2)
    })

    it('应该同时支持填充和描边', async () => {
      const mount = ring({
        x: 100,
        y: 100,
        innerRadius: 25,
        outerRadius: 50,
        fill: 'red',
        stroke: 'black',
        lineWidth: 1
      })

      const cleanup = mount(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(wasCalled(ctx.fill as ReturnType<typeof vi.fn>)).toBe(true)
      expect(wasCalled(ctx.stroke as ReturnType<typeof vi.fn>)).toBe(true)
    })
  })
})
