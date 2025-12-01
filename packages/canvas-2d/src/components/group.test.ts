/**
 * Group 组件测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime, fragment, each } from '@rasenjs/core'
import {
  createMockContext,
  createMockReactiveRuntime,
  waitForAsync
} from '../test-utils'
import { group } from './group'
import { rect } from './rect'
import { circle } from './circle'

describe('group', () => {
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

  describe('基础组合', () => {
    it('应该组合多个子组件', async () => {
      const mount = group({
        children: [
          rect({ x: 10, y: 10, width: 20, height: 20, fill: 'red' }),
          circle({ x: 50, y: 50, radius: 15, fill: 'blue' })
        ]
      })
      cleanupFns.push(mount(ctx))
      await waitForAsync()

      // 验证两个形状都被绘制
      expect(ctx.fillRect).toHaveBeenCalledWith(10, 10, 20, 20)
      expect(ctx.arc).toHaveBeenCalled()
    })

    it('应该支持位置偏移', async () => {
      const mount = group({
        x: 50,
        y: 50,
        children: [
          rect({ x: 0, y: 0, width: 20, height: 20, fill: 'red' }),
          rect({ x: 30, y: 0, width: 20, height: 20, fill: 'blue' })
        ]
      })
      cleanupFns.push(mount(ctx))
      await waitForAsync()

      // 验证translate被调用
      expect(ctx.translate).toHaveBeenCalledWith(50, 50)
      expect(ctx.save).toHaveBeenCalled()
      expect(ctx.restore).toHaveBeenCalled()
    })
  })

  describe('共享变换', () => {
    it('应该对所有子组件应用相同的旋转', async () => {
      const mount = group({
        x: 100,
        y: 100,
        rotation: Math.PI / 4,
        children: [rect({ x: -25, y: -25, width: 50, height: 50, fill: 'red' })]
      })
      cleanupFns.push(mount(ctx))
      await waitForAsync()

      // 验证变换被应用
      expect(ctx.translate).toHaveBeenCalledWith(100, 100)
      expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 4)
    })

    it('应该对所有子组件应用相同的缩放', async () => {
      const mount = group({
        scaleX: 2,
        scaleY: 0.5,
        children: [circle({ x: 50, y: 50, radius: 20, fill: 'blue' })]
      })
      cleanupFns.push(mount(ctx))
      await waitForAsync()

      // 验证缩放被应用
      expect(ctx.scale).toHaveBeenCalledWith(2, 0.5)
    })
  })

  describe('共享效果', () => {
    it('应该对所有子组件应用相同的透明度', async () => {
      const mount = group({
        opacity: 0.5,
        children: [
          rect({ x: 10, y: 10, width: 30, height: 30, fill: 'red' }),
          rect({ x: 50, y: 10, width: 30, height: 30, fill: 'blue' })
        ]
      })
      cleanupFns.push(mount(ctx))
      await waitForAsync()

      // 验证透明度被设置
      expect(ctx.globalAlpha).toBe(0.5)
    })

    it('应该支持裁剪区域', async () => {
      const mount = group({
        clip: { x: 20, y: 20, width: 60, height: 60 },
        children: [rect({ x: 0, y: 0, width: 100, height: 100, fill: 'red' })]
      })
      cleanupFns.push(mount(ctx))
      await waitForAsync()

      // 验证裁剪路径被创建
      expect(ctx.clip).toHaveBeenCalled()
      const rectCalls = (ctx.rect as ReturnType<typeof vi.fn>).mock.calls
      const clipCall = rectCalls.find(
        (call) =>
          call[0] === 20 && call[1] === 20 && call[2] === 60 && call[3] === 60
      )
      expect(clipCall).toBeDefined()
    })
  })

  describe('使用 each 和 fragment', () => {
    it('应该使用each组件迭代列表', async () => {
      const shapes = [
        { id: 1, x: 10, y: 10, width: 20, height: 20, fill: 'red' },
        { id: 2, x: 40, y: 10, width: 20, height: 20, fill: 'blue' }
      ]

      const mount = each(shapes, (shape) => rect(shape))
      cleanupFns.push(mount(ctx))
      await waitForAsync()

      // 验证两个矩形都被绘制
      expect(ctx.fillRect).toHaveBeenCalledWith(10, 10, 20, 20)
      expect(ctx.fillRect).toHaveBeenCalledWith(40, 10, 20, 20)
    })

    it('应该使用fragment组合静态子组件', async () => {
      const mount = fragment({
        children: [
          rect({ x: 10, y: 10, width: 20, height: 20, fill: 'red' }),
          circle({ x: 50, y: 50, radius: 15, fill: 'blue' })
        ]
      })
      cleanupFns.push(mount(ctx))
      await waitForAsync()

      // 验证两个形状都被绘制
      expect(ctx.fillRect).toHaveBeenCalledWith(10, 10, 20, 20)
      expect(ctx.arc).toHaveBeenCalled()
    })
  })
})
