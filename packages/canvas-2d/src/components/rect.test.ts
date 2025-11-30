/**
 * Rect 组件测试
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
import { rect } from './rect'

describe('rect', () => {
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
    it('应该使用正确的参数绘制填充矩形', async () => {
      const mount = rect({
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        fill: '#ff0000'
      })

      const cleanup = mount(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(ctx.fillStyle).toBe('#ff0000')
      expect(wasCalled(ctx.fillRect as ReturnType<typeof vi.fn>)).toBe(true)
      expect(getCallArgs(ctx.fillRect as ReturnType<typeof vi.fn>)).toEqual([
        10, 20, 100, 50
      ])
    })

    it('应该使用正确的参数绘制描边矩形', async () => {
      const mount = rect({
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        stroke: '#00ff00',
        lineWidth: 2
      })

      const cleanup = mount(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(ctx.strokeStyle).toBe('#00ff00')
      expect(ctx.lineWidth).toBe(2)
      expect(wasCalled(ctx.strokeRect as ReturnType<typeof vi.fn>)).toBe(true)
      expect(getCallArgs(ctx.strokeRect as ReturnType<typeof vi.fn>)).toEqual([
        10, 20, 100, 50
      ])
    })

    it('应该同时支持填充和描边', async () => {
      const mount = rect({
        x: 0,
        y: 0,
        width: 50,
        height: 50,
        fill: 'blue',
        stroke: 'red',
        lineWidth: 3
      })

      const cleanup = mount(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(wasCalled(ctx.fillRect as ReturnType<typeof vi.fn>)).toBe(true)
      expect(wasCalled(ctx.strokeRect as ReturnType<typeof vi.fn>)).toBe(true)
    })
  })

  describe('默认值', () => {
    it('描边宽度默认应该为 1', async () => {
      const mount = rect({
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        stroke: 'black'
      })

      const cleanup = mount(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(ctx.lineWidth).toBe(1)
    })
  })

  describe('圆角矩形', () => {
    it('应该支持单一圆角半径', async () => {
      const cornerRadius = 10
      const mount = rect({
        x: 10,
        y: 10,
        width: 100,
        height: 80,
        fill: 'blue',
        cornerRadius
      })

      const cleanup = mount(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      // 验证使用了路径绘制而非fillRect
      expect(wasCalled(ctx.beginPath as ReturnType<typeof vi.fn>)).toBe(true)
      expect(wasCalled(ctx.arcTo as ReturnType<typeof vi.fn>)).toBe(true)
      expect(wasCalled(ctx.fill as ReturnType<typeof vi.fn>)).toBe(true)
      expect(wasCalled(ctx.closePath as ReturnType<typeof vi.fn>)).toBe(true)

      // 验证arcTo被调用了4次（四个角）
      const arcToCalls = (ctx.arcTo as ReturnType<typeof vi.fn>).mock.calls
      expect(arcToCalls.length).toBe(4)

      // 验证所有圆角半径都是10
      arcToCalls.forEach((call: unknown[]) => {
        expect(call[4]).toBe(cornerRadius) // arcTo的第5个参数是radius
      })
    })

    it('应该支持四个角独立圆角半径', async () => {
      const cornerRadius = [10, 20, 30, 40] // 左上、右上、右下、左下
      const mount = rect({
        x: 10,
        y: 10,
        width: 100,
        height: 80,
        fill: 'green',
        cornerRadius
      })

      const cleanup = mount(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      // 验证使用了路径绘制
      expect(wasCalled(ctx.beginPath as ReturnType<typeof vi.fn>)).toBe(true)
      expect(wasCalled(ctx.arcTo as ReturnType<typeof vi.fn>)).toBe(true)
      expect(wasCalled(ctx.fill as ReturnType<typeof vi.fn>)).toBe(true)

      // 验证arcTo被调用了4次，每次半径不同
      const arcToCalls = (ctx.arcTo as ReturnType<typeof vi.fn>).mock.calls
      expect(arcToCalls.length).toBe(4)

      // 验证每个角的半径（绘制顺序：右上、右下、左下、左上）
      expect(arcToCalls[0][4]).toBe(cornerRadius[1]) // 右上
      expect(arcToCalls[1][4]).toBe(cornerRadius[2]) // 右下
      expect(arcToCalls[2][4]).toBe(cornerRadius[3]) // 左下
      expect(arcToCalls[3][4]).toBe(cornerRadius[0]) // 左上
    })
  })
})
