/**
 * Text 组件测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, setReactiveRuntime } from '@rasenjs/core'
import {
  createMockContext,
  getCallArgs,
  wasCalled,
  createMockReactiveRuntime,
  waitForAsync
} from '../test-utils'
import { text } from './text'

describe('text', () => {
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
    it('应该使用正确的参数绘制文本', async () => {
      const mountable = text({
        text: 'Hello World',
        x: 50,
        y: 100,
        fill: '#333333'
      })

      const cleanup = mount(mountable, ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(wasCalled(ctx.fillText as ReturnType<typeof vi.fn>)).toBe(true)
      expect(getCallArgs(ctx.fillText as ReturnType<typeof vi.fn>)).toEqual([
        'Hello World',
        50,
        100
      ])
      expect(ctx.fillStyle).toBe('#333333')
    })

    it('应该支持自定义字体', async () => {
      const mountable = text({
        text: 'Custom Font',
        x: 0,
        y: 0,
        font: '24px Arial',
        fill: 'black'
      })

      const cleanup = mount(mountable, ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(ctx.font).toBe('24px Arial')
    })
  })

  describe('文本对齐', () => {
    it('应该支持水平对齐', async () => {
      const mountable = text({
        text: 'Centered',
        x: 200,
        y: 100,
        textAlign: 'center'
      })

      const cleanup = mount(mountable, ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(ctx.textAlign).toBe('center')
    })

    it('应该支持垂直对齐', async () => {
      const mountable = text({
        text: 'Middle',
        x: 200,
        y: 100,
        textBaseline: 'middle'
      })

      const cleanup = mount(mountable, ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(ctx.textBaseline).toBe('middle')
    })
  })

  describe('默认值', () => {
    it('填充颜色默认应该为黑色', async () => {
      const mountable = text({
        text: 'Default',
        x: 0,
        y: 0
      })

      const cleanup = mount(mountable, ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(ctx.fillStyle).toBe('#000000')
    })

    it('字体默认应该为 16px sans-serif', async () => {
      const mountable = text({
        text: 'Default Font',
        x: 0,
        y: 0
      })

      const cleanup = mount(mountable, ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(ctx.font).toBe('16px sans-serif')
    })

    it('水平对齐默认应该为 start', async () => {
      const mountable = text({
        text: 'Default Align',
        x: 0,
        y: 0
      })

      const cleanup = mount(mountable, ctx)
      cleanupFns.push(cleanup)

      await waitForAsync()

      expect(ctx.textAlign).toBe('start')
    })
  })

  // TODO: 高级文本功能测试 (待实现)
  describe('高级文本功能', () => {
    it.skip('应该支持文本换行', () => {
      // 参考 Konva.js: text({ wrap: 'word', width: 200 })
      // 需要更复杂的文本布局逻辑
    })

    it.skip('应该支持省略号', () => {
      // 参考 Konva.js: text({ width: 100, ellipsis: true })
      // 需要文本测量和裁剪逻辑
    })

    it('应该支持下划线', async () => {
      const mountable = text({
        text: 'Underlined Text',
        x: 10,
        y: 10,
        textDecoration: 'underline'
      })
      cleanupFns.push(mount(mountable, ctx))
      await waitForAsync()

      expect(ctx.fillText).toHaveBeenCalledWith('Underlined Text', 10, 10)
      // 下划线使用 stroke 绘制
      expect(ctx.stroke).toHaveBeenCalled()
      expect(ctx.moveTo).toHaveBeenCalled()
      expect(ctx.lineTo).toHaveBeenCalled()
    })

    it('应该支持字间距', async () => {
      const mountable = text({
        text: 'Test',
        x: 10,
        y: 10,
        letterSpacing: 5
      })
      cleanupFns.push(mount(mountable, ctx))
      await waitForAsync()

      // 有字间距时,文本会被拆分为单个字符绘制
      const fillTextCalls = (ctx.fillText as ReturnType<typeof vi.fn>).mock
        .calls
      // 应该有4次fillText调用（每个字符一次）
      expect(fillTextCalls.length).toBe(4)
      // 验证绘制了单个字符
      expect(fillTextCalls.some((call) => call[0] === 'T')).toBe(true)
      expect(fillTextCalls.some((call) => call[0] === 'e')).toBe(true)
      expect(fillTextCalls.some((call) => call[0] === 's')).toBe(true)
      expect(fillTextCalls.some((call) => call[0] === 't')).toBe(true)
    })
  })
})
