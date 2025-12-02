/**
 * Wedge 组件测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, setReactiveRuntime } from '@rasenjs/core'
import {
  createMockContext,
  createMockReactiveRuntime,
  waitForAsync
} from '../test-utils'
import { wedge } from './wedge'

describe('wedge', () => {
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
    it('应该绘制楔形（扇形）', async () => {
      const mountable = wedge({
        x: 100,
        y: 100,
        radius: 70,
        angle: 60,
        fill: 'red'
      })

      const cleanup = mount(mountable, ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(
        (ctx.arc as ReturnType<typeof vi.fn>).mock.calls.length
      ).toBeGreaterThan(0)
      const arcCalls = (ctx.arc as ReturnType<typeof vi.fn>).mock.calls
      // 验证arc参数: x, y, radius, startAngle, endAngle
      expect(arcCalls[0][0]).toBe(100) // x
      expect(arcCalls[0][1]).toBe(100) // y
      expect(arcCalls[0][2]).toBe(70) // radius
      expect(arcCalls[0][3]).toBe(0) // startAngle
      expect(arcCalls[0][4]).toBeCloseTo((60 * Math.PI) / 180) // endAngle (60度转弧度)
    })
  })
})
