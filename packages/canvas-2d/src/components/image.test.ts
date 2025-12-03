/**
 * Image 组件测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'

import {
  createMockContext,
  createMockReactiveRuntime,
  waitForAsync
} from '../test-utils'
import { image } from './image'

describe('image', () => {
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
    it('应该绘制图片', async () => {
      const mockImage = {
        width: 200,
        height: 150
      } as CanvasImageSource

      const mountable = image({
        image: mockImage,
        x: 0,
        y: 0,
        width: 100,
        height: 100
      })

      const cleanup = mountable(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(
        (ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls.length
      ).toBeGreaterThan(0)
      const drawImageCalls = (ctx.drawImage as ReturnType<typeof vi.fn>).mock
        .calls
      // 验证drawImage被调用: drawImage(image, x, y, width, height)
      expect(drawImageCalls[0][0]).toBe(mockImage)
      expect(drawImageCalls[0][1]).toBe(0) // x
      expect(drawImageCalls[0][2]).toBe(0) // y
      expect(drawImageCalls[0][3]).toBe(100) // width
      expect(drawImageCalls[0][4]).toBe(100) // height
    })

    it('应该支持图片裁剪', async () => {
      const mockImage = {
        width: 200,
        height: 150
      } as CanvasImageSource

      const mountable = image({
        image: mockImage,
        x: 0,
        y: 0,
        width: 80,
        height: 80,
        crop: { x: 10, y: 10, width: 80, height: 80 }
      })

      const cleanup = mountable(ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      const drawImageCalls = (ctx.drawImage as ReturnType<typeof vi.fn>).mock
        .calls
      // 验证drawImage被调用: drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh)
      expect(drawImageCalls[0].length).toBe(9) // 9个参数表示使用了裁剪
      expect(drawImageCalls[0][1]).toBe(10) // sx
      expect(drawImageCalls[0][2]).toBe(10) // sy
      expect(drawImageCalls[0][3]).toBe(80) // sw
      expect(drawImageCalls[0][4]).toBe(80) // sh
    })
  })
})
