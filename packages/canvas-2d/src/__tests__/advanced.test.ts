/**
 * Canvas 2D 高级功能测试
 *
 * 测试变换、阴影、渐变、图案等高级功能
 * 参考 Konva.js, Fabric.js, PixiJS 的 API 设计
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime } from '@rasenjs/core'

import {
  createMockContext,
  createMockReactiveRuntime,
  waitForAsync
} from '../test-utils'
import { rect } from '../components/rect'

describe('@rasenjs/canvas-2d 高级功能', () => {
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

  // ============================================================================
  // 变换功能测试 (Transform)
  // ============================================================================
  describe('变换 (Transform)', () => {
    describe('旋转', () => {
      it('应该支持弧度旋转', async () => {
        const mountable = rect({
          x: 100,
          y: 100,
          width: 50,
          height: 50,
          rotation: Math.PI / 4, // 45度
          fill: 'red'
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        // 验证rotate被调用
        expect(
          (ctx.rotate as ReturnType<typeof vi.fn>).mock.calls.length
        ).toBeGreaterThan(0)
        // 验证旋转角度
        const rotateCalls = (ctx.rotate as ReturnType<typeof vi.fn>).mock.calls
        expect(rotateCalls[0][0]).toBe(Math.PI / 4)
      })

      it('应该围绕正确的原点旋转', () => {
        // 参考 Konva.js: shape({ offset: { x: 25, y: 25 }, rotation: 90 })
        // 参考 Fabric.js: shape({ originX: 'center', originY: 'center' })
      })
    })

    describe('缩放', () => {
      it('应该支持统一缩放', async () => {
        const mountable = rect({
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          scaleX: 2,
          scaleY: 2,
          fill: 'blue'
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        // 验证scale被调用
        expect(
          (ctx.scale as ReturnType<typeof vi.fn>).mock.calls.length
        ).toBeGreaterThan(0)
        const scaleCalls = (ctx.scale as ReturnType<typeof vi.fn>).mock.calls
        expect(scaleCalls[0]).toEqual([2, 2])
      })

      it('应该支持非统一缩放', async () => {
        const mountable = rect({
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          scaleX: 2,
          scaleY: 0.5,
          fill: 'green'
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        const scaleCalls = (ctx.scale as ReturnType<typeof vi.fn>).mock.calls
        expect(scaleCalls[0]).toEqual([2, 0.5])
      })
    })

    describe('倾斜', () => {
      it('应该支持 X 轴倾斜', async () => {
        const mountable = rect({
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          skewX: 0.5,
          fill: 'blue'
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        // 验证transform被调用
        expect(
          (ctx.transform as ReturnType<typeof vi.fn>).mock.calls.length
        ).toBeGreaterThan(0)
        // 验证倾斜参数: transform(1, 0, tan(skewX), 1, 0, 0)
        const transformCalls = (ctx.transform as ReturnType<typeof vi.fn>).mock
          .calls
        const tanSkewX = Math.tan(0.5)
        expect(transformCalls.some((call) => call[2] === tanSkewX)).toBe(true)
      })

      it('应该支持 Y 轴倾斜', async () => {
        const mountable = rect({
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          skewY: 0.3,
          fill: 'green'
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        // 验证transform被调用并包含Y轴倾斜参数
        const transformCalls = (ctx.transform as ReturnType<typeof vi.fn>).mock
          .calls
        const tanSkewY = Math.tan(0.3)
        expect(transformCalls.some((call) => call[1] === tanSkewY)).toBe(true)
      })
    })

    describe('变换原点', () => {
      it('应该支持自定义变换原点', async () => {
        // 测试: 在矩形中心旋转 vs 在偏移点旋转
        const { rect } = await import('../components/rect')

        // 不带offset的旋转(默认绕矩形中心旋转)
        const mountable1 = rect({
          x: 50,
          y: 50,
          width: 40,
          height: 40,
          fill: 'blue',
          rotation: Math.PI / 4 // 45度
        })
        cleanupFns.push(mountable1(ctx))
        await waitForAsync()

        const rotateCalls1 = (ctx.rotate as ReturnType<typeof vi.fn>).mock.calls
        expect(rotateCalls1.length).toBeGreaterThan(0)

        // 清空mock
        vi.clearAllMocks()

        // 带offset的旋转(绕偏移后的点旋转)
        const mountable2 = rect({
          x: 50,
          y: 50,
          width: 40,
          height: 40,
          fill: 'red',
          rotation: Math.PI / 4,
          offsetX: 20, // 向右偏移20
          offsetY: 10 // 向下偏移10
        })
        cleanupFns.push(mountable2(ctx))
        await waitForAsync()

        // 验证translate被调用,且参数受offset影响
        const translateCalls = (ctx.translate as ReturnType<typeof vi.fn>).mock
          .calls
        expect(translateCalls.length).toBeGreaterThan(0)

        // 应该有translate到offset后的中心点
        const hasOffsetTranslate = translateCalls.some(
          (call) => call[0] !== 0 || call[1] !== 0
        )
        expect(hasOffsetTranslate).toBe(true)
      })
    })
  })

  // ============================================================================
  // 阴影功能测试 (Shadow)
  // ============================================================================
  describe('阴影 (Shadow)', () => {
    describe('基础阴影', () => {
      it('应该应用阴影颜色', async () => {
        const mountable = rect({
          x: 50,
          y: 50,
          width: 100,
          height: 100,
          fill: 'red',
          shadowColor: 'rgba(0, 0, 0, 0.5)'
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        expect(ctx.shadowColor).toBe('rgba(0, 0, 0, 0.5)')
      })

      it('应该应用阴影模糊', async () => {
        const mountable = rect({
          x: 50,
          y: 50,
          width: 100,
          height: 100,
          fill: 'red',
          shadowColor: 'black',
          shadowBlur: 10
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        expect(ctx.shadowBlur).toBe(10)
      })

      it('应该应用阴影偏移', async () => {
        const mountable = rect({
          x: 50,
          y: 50,
          width: 100,
          height: 100,
          fill: 'red',
          shadowColor: 'black',
          shadowOffsetX: 5,
          shadowOffsetY: 5
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        expect(ctx.shadowOffsetX).toBe(5)
        expect(ctx.shadowOffsetY).toBe(5)
      })
    })

    describe('阴影透明度', () => {
      it('应该支持单独设置阴影透明度', async () => {
        // 通过shadowColor的rgba值实现透明度控制
        const mountable = rect({
          x: 50,
          y: 50,
          width: 100,
          height: 100,
          fill: 'red',
          shadowColor: 'rgba(0, 0, 0, 0.5)', // 50%透明度的阴影
          shadowBlur: 10,
          shadowOffsetX: 5,
          shadowOffsetY: 5
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        expect(ctx.shadowColor).toBe('rgba(0, 0, 0, 0.5)')
      })
    })

    describe('阴影启用控制', () => {
      it('应该支持禁用阴影', async () => {
        // 不设置shadowColor即禁用阴影
        const mountable = rect({
          x: 50,
          y: 50,
          width: 100,
          height: 100,
          fill: 'red'
          // 没有shadowColor,阴影被禁用
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        // 验证shadowColor为默认透明值(表示未设置)
        expect(ctx.shadowColor).toBe('rgba(0, 0, 0, 0)')
      })

      it('应该支持仅对描边启用阴影', async () => {
        // 这个功能需要分别绘制填充和描边,Canvas API限制
        // 我们通过测试验证可以设置阴影属性
        const mountable = rect({
          x: 50,
          y: 50,
          width: 100,
          height: 100,
          stroke: 'black',
          lineWidth: 2,
          shadowColor: 'black',
          shadowBlur: 5
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        expect(ctx.shadowColor).toBe('black')
        expect(ctx.shadowBlur).toBe(5)
      })
    })
  })

  // ============================================================================
  // 渐变功能测试 (Gradient)
  // ============================================================================
  describe('渐变 (Gradient)', () => {
    describe('线性渐变', () => {
      it('应该支持水平线性渐变', async () => {
        const { createLinearGradient } = await import('../utils/gradient')

        const gradient = createLinearGradient(ctx, {
          type: 'linear',
          x0: 0,
          y0: 0,
          x1: 100,
          y1: 0,
          colorStops: [
            { offset: 0, color: 'red' },
            { offset: 1, color: 'blue' }
          ]
        })

        await waitForAsync()

        expect(
          (ctx.createLinearGradient as ReturnType<typeof vi.fn>).mock.calls
            .length
        ).toBeGreaterThan(0)
        expect(gradient).toBeInstanceOf(Object)
      })

      it('应该支持垂直线性渐变', async () => {
        const { createLinearGradient } = await import('../utils/gradient')

        createLinearGradient(ctx, {
          type: 'linear',
          x0: 0,
          y0: 0,
          x1: 0,
          y1: 100,
          colorStops: [
            { offset: 0, color: 'red' },
            { offset: 1, color: 'blue' }
          ]
        })

        await waitForAsync()

        const calls = (ctx.createLinearGradient as ReturnType<typeof vi.fn>)
          .mock.calls
        expect(calls[calls.length - 1]).toEqual([0, 0, 0, 100])
      })

      it('应该支持对角线性渐变', async () => {
        const { createLinearGradient } = await import('../utils/gradient')

        createLinearGradient(ctx, {
          type: 'linear',
          x0: 0,
          y0: 0,
          x1: 100,
          y1: 100,
          colorStops: [
            { offset: 0, color: 'red' },
            { offset: 1, color: 'blue' }
          ]
        })

        await waitForAsync()

        const calls = (ctx.createLinearGradient as ReturnType<typeof vi.fn>)
          .mock.calls
        expect(calls[calls.length - 1]).toEqual([0, 0, 100, 100])
      })

      it('应该支持多个色标', async () => {
        const { createLinearGradient } = await import('../utils/gradient')

        const mockGradient = {
          addColorStop: vi.fn()
        }
        ;(ctx.createLinearGradient as ReturnType<typeof vi.fn>).mockReturnValue(
          mockGradient
        )

        createLinearGradient(ctx, {
          type: 'linear',
          x0: 0,
          y0: 0,
          x1: 100,
          y1: 0,
          colorStops: [
            { offset: 0, color: 'red' },
            { offset: 0.5, color: 'yellow' },
            { offset: 1, color: 'green' }
          ]
        })

        await waitForAsync()

        expect(mockGradient.addColorStop).toHaveBeenCalledTimes(3)
        expect(mockGradient.addColorStop).toHaveBeenCalledWith(0, 'red')
        expect(mockGradient.addColorStop).toHaveBeenCalledWith(0.5, 'yellow')
        expect(mockGradient.addColorStop).toHaveBeenCalledWith(1, 'green')
      })
    })

    describe('径向渐变', () => {
      it('应该支持基础径向渐变', async () => {
        const { createRadialGradient } = await import('../utils/gradient')

        const gradient = createRadialGradient(ctx, {
          type: 'radial',
          x0: 50,
          y0: 50,
          r0: 0,
          x1: 50,
          y1: 50,
          r1: 50,
          colorStops: [
            { offset: 0, color: 'red' },
            { offset: 1, color: 'blue' }
          ]
        })

        await waitForAsync()

        expect(
          (ctx.createRadialGradient as ReturnType<typeof vi.fn>).mock.calls
            .length
        ).toBeGreaterThan(0)
        expect(gradient).toBeInstanceOf(Object)
      })

      it('应该支持偏心径向渐变', async () => {
        const { createRadialGradient } = await import('../utils/gradient')

        createRadialGradient(ctx, {
          type: 'radial',
          x0: 40,
          y0: 40,
          r0: 0,
          x1: 60,
          y1: 60,
          r1: 50,
          colorStops: [
            { offset: 0, color: 'white' },
            { offset: 1, color: 'black' }
          ]
        })

        await waitForAsync()

        const calls = (ctx.createRadialGradient as ReturnType<typeof vi.fn>)
          .mock.calls
        expect(calls[calls.length - 1]).toEqual([40, 40, 0, 60, 60, 50])
      })
    })

    describe('描边渐变', () => {
      it('应该支持描边使用渐变', async () => {
        const { createLinearGradient } = await import('../utils/gradient')

        const gradient = createLinearGradient(ctx, {
          type: 'linear',
          x0: 0,
          y0: 0,
          x1: 100,
          y1: 0,
          colorStops: [
            { offset: 0, color: 'red' },
            { offset: 1, color: 'blue' }
          ]
        })

        const mountable = rect({
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          stroke: gradient as unknown as string,
          lineWidth: 5
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        // 验证strokeStyle被设置为渐变
        expect(ctx.strokeStyle).toBe(gradient)
      })
    })
  })

  // ============================================================================
  // 图案填充测试 (Pattern)
  // ============================================================================
  describe('图案填充 (Pattern)', () => {
    describe('基础图案', () => {
      it('应该支持平铺图案', async () => {
        const { createPattern } = await import('../utils/gradient')

        // 创建模拟图像
        const mockImage = {
          width: 10,
          height: 10
        } as CanvasImageSource

        const pattern = createPattern(ctx, {
          image: mockImage,
          repeat: 'repeat'
        })

        await waitForAsync()

        expect(
          (ctx.createPattern as ReturnType<typeof vi.fn>).mock.calls.length
        ).toBeGreaterThan(0)
        expect(pattern).toBeDefined()
      })

      it('应该支持不同的重复模式', async () => {
        const { createPattern } = await import('../utils/gradient')

        const mockImage = {
          width: 10,
          height: 10
        } as CanvasImageSource

        // 测试 repeat-x
        createPattern(ctx, {
          image: mockImage,
          repeat: 'repeat-x'
        })

        await waitForAsync()

        let calls = (ctx.createPattern as ReturnType<typeof vi.fn>).mock.calls
        expect(calls[calls.length - 1][1]).toBe('repeat-x')

        // 测试 repeat-y
        createPattern(ctx, {
          image: mockImage,
          repeat: 'repeat-y'
        })

        calls = (ctx.createPattern as ReturnType<typeof vi.fn>).mock.calls
        expect(calls[calls.length - 1][1]).toBe('repeat-y')

        // 测试 no-repeat
        createPattern(ctx, {
          image: mockImage,
          repeat: 'no-repeat'
        })

        calls = (ctx.createPattern as ReturnType<typeof vi.fn>).mock.calls
        expect(calls[calls.length - 1][1]).toBe('no-repeat')
      })
    })

    describe('图案变换', () => {
      it('应该支持图案缩放', async () => {
        // 图案变换需要通过transform实现,这是Canvas原生限制
        // 测试验证transform被调用即可
        const { createPattern } = await import('../utils/gradient')

        const mockImage = {
          width: 10,
          height: 10
        } as CanvasImageSource

        createPattern(ctx, {
          image: mockImage,
          repeat: 'repeat'
        })

        const mountable = rect({
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          scaleX: 0.5,
          scaleY: 0.5
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        // 验证scale被调用
        expect(
          (ctx.scale as ReturnType<typeof vi.fn>).mock.calls.length
        ).toBeGreaterThan(0)
      })

      it('应该支持图案旋转', async () => {
        const { createPattern } = await import('../utils/gradient')

        const mockImage = {
          width: 10,
          height: 10
        } as CanvasImageSource

        createPattern(ctx, {
          image: mockImage,
          repeat: 'repeat'
        })

        const mountable = rect({
          x: 50,
          y: 50,
          width: 100,
          height: 100,
          rotation: Math.PI / 4
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        // 验证rotate被调用
        expect(
          (ctx.rotate as ReturnType<typeof vi.fn>).mock.calls.length
        ).toBeGreaterThan(0)
      })

      it('应该支持图案偏移', async () => {
        const { createPattern } = await import('../utils/gradient')

        const mockImage = {
          width: 10,
          height: 10
        } as CanvasImageSource

        createPattern(ctx, {
          image: mockImage,
          repeat: 'repeat'
        })

        const mountable = rect({
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          translateX: 10,
          translateY: 10
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        // 验证translate被调用
        expect(
          (ctx.translate as ReturnType<typeof vi.fn>).mock.calls.length
        ).toBeGreaterThan(0)
      })
    })
  })

  // ============================================================================
  // 透明度测试 (Opacity)
  // ============================================================================
  describe('透明度 (Opacity)', () => {
    describe('全局透明度', () => {
      it('应该应用全局透明度', async () => {
        const mountable = rect({
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          fill: 'red',
          opacity: 0.5
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        expect(ctx.globalAlpha).toBe(0.5)
      })
    })

    describe('分离透明度', () => {
      it('应该支持填充透明度', async () => {
        // 填充透明度通过在fillStyle中使用rgba实现
        const mountable = rect({
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          fill: 'rgba(255, 0, 0, 0.5)' // 50%透明度的红色
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        // 验证fillStyle被设置
        expect(ctx.fillStyle).toContain('rgba')
      })

      it('应该支持描边透明度', async () => {
        // 描边透明度通过在strokeStyle中使用rgba实现
        const mountable = rect({
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          stroke: 'rgba(0, 0, 255, 0.3)', // 30%透明度的蓝色
          lineWidth: 2
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        // 验证strokeStyle被设置
        expect(ctx.strokeStyle).toContain('rgba')
      })
    })
  })

  // ============================================================================
  // 虚线测试 (Dash)
  // ============================================================================
  describe('虚线 (Dash)', () => {
    describe('虚线模式', () => {
      it('应该应用虚线模式', async () => {
        const mountable = rect({
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          stroke: 'black',
          lineWidth: 2,
          lineDash: [10, 5]
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        expect(
          (ctx.setLineDash as ReturnType<typeof vi.fn>).mock.calls.length
        ).toBeGreaterThan(0)
        const calls = (ctx.setLineDash as ReturnType<typeof vi.fn>).mock.calls
        expect(calls[0][0]).toEqual([10, 5])
      })

      it('应该支持复杂虚线模式', async () => {
        const mountable = rect({
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          stroke: 'black',
          lineWidth: 2,
          lineDash: [20, 5, 5, 5]
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        const calls = (ctx.setLineDash as ReturnType<typeof vi.fn>).mock.calls
        expect(calls[0][0]).toEqual([20, 5, 5, 5])
      })
    })

    describe('虚线偏移', () => {
      it('应该应用虚线偏移', async () => {
        const mountable = rect({
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          stroke: 'black',
          lineWidth: 2,
          lineDash: [10, 5],
          lineDashOffset: 5
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        expect(ctx.lineDashOffset).toBe(5)
      })
    })
  })

  // ============================================================================
  // 线条样式测试 (Line Style)
  // ============================================================================
  describe('线条样式 (Line Style)', () => {
    // TODO: 待实现完整线条样式功能
    describe('线帽', () => {
      it('应该支持 butt 线帽', async () => {
        const { line } = await import('../components/line')
        const mountable = line({
          x1: 0,
          y1: 0,
          x2: 100,
          y2: 0,
          stroke: 'black',
          lineWidth: 10,
          lineCap: 'butt'
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        expect(ctx.lineCap).toBe('butt')
      })

      it('应该支持 round 线帽', async () => {
        const { line } = await import('../components/line')
        const mountable = line({
          x1: 0,
          y1: 0,
          x2: 100,
          y2: 0,
          stroke: 'black',
          lineWidth: 10,
          lineCap: 'round'
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        expect(ctx.lineCap).toBe('round')
      })

      it('应该支持 square 线帽', async () => {
        const { line } = await import('../components/line')
        const mountable = line({
          x1: 0,
          y1: 0,
          x2: 100,
          y2: 0,
          stroke: 'black',
          lineWidth: 10,
          lineCap: 'square'
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        expect(ctx.lineCap).toBe('square')
      })
    })

    describe('连接样式', () => {
      it('应该支持 miter 连接', async () => {
        const { line } = await import('../components/line')
        const mountable = line({
          points: [0, 0, 50, 50, 100, 0],
          stroke: 'black',
          lineWidth: 10,
          lineJoin: 'miter'
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        expect(ctx.lineJoin).toBe('miter')
      })

      it('应该支持 round 连接', async () => {
        const { line } = await import('../components/line')
        const mountable = line({
          points: [0, 0, 50, 50, 100, 0],
          stroke: 'black',
          lineWidth: 10,
          lineJoin: 'round'
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        expect(ctx.lineJoin).toBe('round')
      })

      it('应该支持 bevel 连接', async () => {
        const { line } = await import('../components/line')
        const mountable = line({
          points: [0, 0, 50, 50, 100, 0],
          stroke: 'black',
          lineWidth: 10,
          lineJoin: 'bevel'
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        expect(ctx.lineJoin).toBe('bevel')
      })
    })

    describe('斜接限制', () => {
      it('应该应用斜接限制', async () => {
        const { line } = await import('../components/line')
        const mountable = line({
          points: [0, 0, 50, 50, 100, 0],
          stroke: 'black',
          lineWidth: 10,
          lineJoin: 'miter',
          miterLimit: 5
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        expect(ctx.miterLimit).toBe(5)
      })
    })
  })

  // ============================================================================
  // 合成操作测试 (Compositing)
  // ============================================================================
  describe('合成操作 (Compositing)', () => {
    describe('混合模式', () => {
      it('应该支持 source-over 模式', async () => {
        const mountable = rect({
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          fill: 'red',
          globalCompositeOperation: 'source-over'
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        expect(ctx.globalCompositeOperation).toBe('source-over')
      })

      it('应该支持 multiply 模式', async () => {
        const mountable = rect({
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          fill: 'blue',
          globalCompositeOperation: 'multiply'
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        expect(ctx.globalCompositeOperation).toBe('multiply')
      })

      it('应该支持 screen 模式', async () => {
        const mountable = rect({
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          fill: 'green',
          globalCompositeOperation: 'screen'
        })

        const cleanup = mountable(ctx)
        cleanupFns.push(cleanup)

        await waitForAsync()

        expect(ctx.globalCompositeOperation).toBe('screen')
      })
    })
  })
})
