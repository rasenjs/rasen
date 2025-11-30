/**
 * Arrow 组件测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'
import {
  createMockContext,
  createMockReactiveRuntime,
  waitForAsync
} from '../test-utils'
import { arrow } from './arrow'

describe('arrow', () => {
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
    it('应该绘制带箭头的线条', async () => {
      const mount = arrow({
        points: [0, 0, 100, 100],
        pointerLength: 20,
        pointerWidth: 20,
        fill: 'black',
        stroke: 'black',
        lineWidth: 2
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
      // 验证绘制了箭头（会有多次beginPath调用）
      expect(
        (ctx.beginPath as ReturnType<typeof vi.fn>).mock.calls.length
      ).toBeGreaterThanOrEqual(2) // 线条 + 箭头
    })

    it('应该支持双向箭头', async () => {
      const mount = arrow({
        points: [0, 0, 100, 100],
        pointerLength: 15,
        pointerWidth: 15,
        pointerAtBeginning: true,
        pointerAtEnding: true,
        stroke: 'black',
        lineWidth: 2
      })

      const cleanup = mount(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      // 验证绘制了两个箭头
      expect(
        (ctx.beginPath as ReturnType<typeof vi.fn>).mock.calls.length
      ).toBeGreaterThanOrEqual(3) // 线条 + 起点箭头 + 终点箭头
    })
  })
})
