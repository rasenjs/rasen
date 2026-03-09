/**
 * Sprite 组件测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'

import {
  createMockContext,
  createMockReactiveRuntime,
  waitForAsync
} from '../test-utils/mock'
import { sprite } from './sprite'

describe('sprite', () => {
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
    it('应该绘制精灵帧', async () => {
      const mockImage = {
        width: 512,
        height: 512
      } as CanvasImageSource

      const mountable = sprite({
        image: mockImage,
        x: 0,
        y: 0,
        frameWidth: 128,
        frameHeight: 128,
        frame: 0,
        columns: 4
      })

      const cleanup = mountable(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      const drawImageCalls = (ctx.drawImage as ReturnType<typeof vi.fn>).mock
        .calls
      expect(drawImageCalls.length).toBeGreaterThan(0)
      
      // 验证drawImage被调用: drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh)
      expect(drawImageCalls[0][0]).toBe(mockImage)
      expect(drawImageCalls[0][1]).toBe(0) // sx = col * frameWidth = 0 * 128 = 0
      expect(drawImageCalls[0][2]).toBe(0) // sy = row * frameHeight = 0 * 128 = 0
      expect(drawImageCalls[0][3]).toBe(128) // sw = frameWidth
      expect(drawImageCalls[0][4]).toBe(128) // sh = frameHeight
      expect(drawImageCalls[0][5]).toBe(0) // dx = x
      expect(drawImageCalls[0][6]).toBe(0) // dy = y
      expect(drawImageCalls[0][7]).toBe(128) // dw = width (默认 frameWidth)
      expect(drawImageCalls[0][8]).toBe(128) // dh = height (默认 frameHeight)
    })

    it('应该正确计算帧位置 - 第5帧', async () => {
      const mockImage = {
        width: 512,
        height: 512
      } as CanvasImageSource

      // 测试第 5 帧 (col=1, row=1)
      const mountable = sprite({
        image: mockImage,
        x: 100,
        y: 100,
        frameWidth: 128,
        frameHeight: 128,
        frame: 5,
        columns: 4
      })

      const cleanup = mountable(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      const drawImageCalls = (ctx.drawImage as ReturnType<typeof vi.fn>).mock
        .calls
      expect(drawImageCalls.length).toBeGreaterThan(0)
      
      // frame 5: col = 5 % 4 = 1, row = Math.floor(5 / 4) = 1
      // sx = 1 * 128 = 128, sy = 1 * 128 = 128
      expect(drawImageCalls[0][1]).toBe(128) // sx
      expect(drawImageCalls[0][2]).toBe(128) // sy
      expect(drawImageCalls[0][5]).toBe(100) // dx
      expect(drawImageCalls[0][6]).toBe(100) // dy
    })

    it('应该正确计算帧位置 - 第10帧', async () => {
      const mockImage = {
        width: 512,
        height: 512
      } as CanvasImageSource

      // 测试第 10 帧 (col=2, row=2)
      const mountable = sprite({
        image: mockImage,
        x: 0,
        y: 0,
        frameWidth: 128,
        frameHeight: 128,
        frame: 10,
        columns: 4
      })

      const cleanup = mountable(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      const drawImageCalls = (ctx.drawImage as ReturnType<typeof vi.fn>).mock
        .calls
      // frame 10: col = 10 % 4 = 2, row = Math.floor(10 / 4) = 2
      expect(drawImageCalls[0][1]).toBe(256) // sx = 2 * 128 = 256
      expect(drawImageCalls[0][2]).toBe(256) // sy = 2 * 128 = 256
    })

    it('应该支持自定义宽高', async () => {
      const mockImage = {
        width: 512,
        height: 512
      } as CanvasImageSource

      const mountable = sprite({
        image: mockImage,
        x: 0,
        y: 0,
        frameWidth: 128,
        frameHeight: 128,
        frame: 0,
        columns: 4,
        width: 256,
        height: 256
      })

      const cleanup = mountable(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      const drawImageCalls = (ctx.drawImage as ReturnType<typeof vi.fn>).mock
        .calls
      expect(drawImageCalls[0][7]).toBe(256) // dw = width
      expect(drawImageCalls[0][8]).toBe(256) // dh = height
    })

    it('应该支持默认 columns=1', async () => {
      const mockImage = {
        width: 128,
        height: 512
      } as CanvasImageSource

      const mountable = sprite({
        image: mockImage,
        x: 0,
        y: 0,
        frameWidth: 128,
        frameHeight: 128,
        frame: 2
        // columns 默认为 1
      })

      const cleanup = mountable(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      const drawImageCalls = (ctx.drawImage as ReturnType<typeof vi.fn>).mock
        .calls
      // frame 2, columns 1: col = 2 % 1 = 0, row = Math.floor(2 / 1) = 2
      expect(drawImageCalls[0][1]).toBe(0) // sx = 0
      expect(drawImageCalls[0][2]).toBe(256) // sy = 2 * 128 = 256
    })
  })

  describe('边界计算', () => {
    it('应该使用 frameWidth/frameHeight 作为默认宽高', async () => {
      const mockImage = {
        width: 512,
        height: 512
      } as CanvasImageSource

      const mountable = sprite({
        image: mockImage,
        x: 50,
        y: 50,
        frameWidth: 64,
        frameHeight: 64,
        frame: 0,
        columns: 4
      })

      const cleanup = mountable(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      const drawImageCalls = (ctx.drawImage as ReturnType<typeof vi.fn>).mock
        .calls
      expect(drawImageCalls[0][3]).toBe(64) // sw = frameWidth
      expect(drawImageCalls[0][4]).toBe(64) // sh = frameHeight
      expect(drawImageCalls[0][7]).toBe(64) // dw = frameWidth (默认)
      expect(drawImageCalls[0][8]).toBe(64) // dh = frameHeight (默认)
    })
  })
})
