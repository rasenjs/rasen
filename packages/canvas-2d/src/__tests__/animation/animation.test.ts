/**
 * 动画和脏区域检测测试
 *
 * 测试场景：
 * 1. 矩形位置变化 - 验证旧位置和新位置都被正确清除
 * 2. 带阴影的矩形移动 - 验证阴影区域也被计算在内
 * 3. 旋转动画 - 验证旋转后的边界框计算正确
 * 4. 缩放动画 - 验证缩放后的边界框计算正确
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createCanvas } from '@napi-rs/canvas'
import { ref } from 'vue'
import { setReactiveRuntime } from '@rasenjs/core'
import { createVueRuntime } from '@rasenjs/reactive-vue'
import { rect, RenderContext } from '../../index'
import {
  isRegionEmpty,
  hasContent,
  waitForUpdate,
  getPixelData
} from '../../test-utils'

// 设置响应式运行时
setReactiveRuntime(createVueRuntime())

describe('动画和脏区域检测', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let canvas: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ctx: any
  let renderContext: RenderContext

  beforeEach(() => {
    canvas = createCanvas(400, 300)
    ctx = canvas.getContext('2d')
    // 创建 RenderContext 并关联到 ctx
    renderContext = new RenderContext(ctx)
  })

  it('基础矩形移动 - 旧位置应被清除', async () => {
    const x = ref(50)
    const y = ref(50)

    // 绘制初始矩形
    rect({ x, y, width: 50, height: 50, fill: '#ff0000' })(ctx)
    await waitForUpdate(renderContext)

    // 验证初始位置有内容
    expect(hasContent(ctx, 50, 50, 50, 50)).toBe(true)
    expect(isRegionEmpty(ctx, 150, 50, 50, 50)).toBe(true)

    // 移动矩形
    x.value = 150
    await waitForUpdate(renderContext)

    // 验证旧位置已清除，新位置有内容
    expect(isRegionEmpty(ctx, 50, 50, 50, 50)).toBe(true)
    expect(hasContent(ctx, 150, 50, 50, 50)).toBe(true)
  })

  it('带阴影的矩形移动 - 阴影区域也应被清除', async () => {
    const x = ref(50)
    const y = ref(50)

    // 绘制带阴影的矩形
    rect({
      x,
      y,
      width: 50,
      height: 50,
      fill: '#ff0000',
      shadowColor: 'rgba(0, 0, 0, 0.5)',
      shadowBlur: 10,
      shadowOffsetX: 10,
      shadowOffsetY: 10
    })(ctx)
    await waitForUpdate(renderContext)

    // 验证初始位置和阴影区域都有内容
    expect(hasContent(ctx, 50, 50, 50, 50)).toBe(true) // 矩形本体
    expect(hasContent(ctx, 60, 60, 50, 50)).toBe(true) // 阴影区域

    // 移动矩形
    x.value = 200
    await waitForUpdate(renderContext)

    // 验证旧位置（包括阴影）已清除
    expect(isRegionEmpty(ctx, 50, 50, 50, 50)).toBe(true) // 旧矩形位置
    expect(isRegionEmpty(ctx, 60, 60, 50, 50)).toBe(true) // 旧阴影位置

    // 验证新位置有内容
    expect(hasContent(ctx, 200, 50, 50, 50)).toBe(true) // 新矩形位置
    expect(hasContent(ctx, 210, 60, 50, 50)).toBe(true) // 新阴影位置
  })

  it('旋转矩形移动 - 旋转后的边界应被清除', async () => {
    const x = ref(100)
    const y = ref(100)

    // 绘制旋转 45 度的矩形
    rect({
      x,
      y,
      width: 40,
      height: 40,
      fill: '#00ff00',
      rotation: (45 * Math.PI) / 180
    })(ctx)
    await waitForUpdate(renderContext)

    // 验证旋转后的区域有内容（45度旋转的正方形会占据更大的边界框）
    expect(hasContent(ctx, 100, 100, 40, 40)).toBe(true)

    // 移动矩形
    x.value = 250
    await waitForUpdate(renderContext)

    // 验证旧位置的所有区域都已清除（包括旋转后的边界框）
    // 旋转 45 度的正方形，边界框会扩大约 1.414 倍
    expect(isRegionEmpty(ctx, 92, 92, 56, 56)).toBe(true)

    // 验证新位置有内容
    expect(hasContent(ctx, 250, 100, 40, 40)).toBe(true)
  })

  it('缩放动画 - 缩放前后的边界都应被清除', async () => {
    const scaleX = ref(1)
    const scaleY = ref(1)

    // 绘制初始矩形
    rect({
      x: 100,
      y: 100,
      width: 50,
      height: 50,
      fill: '#0000ff',
      scaleX,
      scaleY
    })(ctx)
    await waitForUpdate(renderContext)

    // 验证初始大小有内容
    expect(hasContent(ctx, 100, 100, 50, 50)).toBe(true)

    // 放大矩形
    scaleX.value = 2
    scaleY.value = 2
    await waitForUpdate(renderContext)

    // 验证放大后的区域有内容
    // 缩放 2 倍，中心点在 (125, 125)，所以范围应该是 75-175
    expect(hasContent(ctx, 75, 75, 100, 100)).toBe(true)

    // 验证原始区域边缘外部的像素也被绘制了
    expect(hasContent(ctx, 75, 75, 20, 20)).toBe(true) // 左上角超出部分
  })

  it('连续快速移动 - 所有中间位置都应被清除', async () => {
    const x = ref(50)

    rect({ x, y: 50, width: 30, height: 30, fill: '#ff00ff' })(ctx)
    await waitForUpdate(renderContext)

    // 快速连续移动
    x.value = 100
    x.value = 150
    x.value = 200
    await waitForUpdate(renderContext)

    // 验证所有旧位置都已清除
    expect(isRegionEmpty(ctx, 50, 50, 30, 30)).toBe(true) // 初始位置
    expect(isRegionEmpty(ctx, 100, 50, 30, 30)).toBe(true) // 中间位置 1
    expect(isRegionEmpty(ctx, 150, 50, 30, 30)).toBe(true) // 中间位置 2

    // 只有最终位置有内容
    expect(hasContent(ctx, 200, 50, 30, 30)).toBe(true)
  })

  it('重叠矩形移动 - 不应影响静态矩形', async () => {
    const x = ref(50)

    // 静态矩形（蓝色）
    rect({ x: 150, y: 50, width: 50, height: 50, fill: '#0000ff' })(ctx)

    // 移动矩形（红色）
    rect({ x, y: 50, width: 50, height: 50, fill: '#ff0000' })(ctx)
    await waitForUpdate(renderContext)

    // 验证两个矩形都存在
    expect(hasContent(ctx, 50, 50, 50, 50)).toBe(true) // 红色矩形
    expect(hasContent(ctx, 150, 50, 50, 50)).toBe(true) // 蓝色矩形

    // 移动红色矩形到远离蓝色矩形的位置
    x.value = 250
    await waitForUpdate(renderContext)

    // 验证红色矩形旧位置已清除
    expect(isRegionEmpty(ctx, 50, 50, 50, 50)).toBe(true)

    // 验证蓝色矩形仍然存在（没有被错误清除）
    expect(hasContent(ctx, 150, 50, 50, 50)).toBe(true)

    // 验证红色矩形在新位置
    expect(hasContent(ctx, 250, 50, 50, 50)).toBe(true)
  })

  it('颜色变化 - 不应产生拖影', async () => {
    const fill = ref('#ff0000')

    rect({ x: 100, y: 100, width: 50, height: 50, fill })(ctx)
    await waitForUpdate(renderContext)

    // 获取初始颜色的像素数�?
    const initialData = getPixelData(ctx, 100, 100, 1, 1)
    expect(initialData[0]).toBe(255) // R
    expect(initialData[1]).toBe(0) // G
    expect(initialData[2]).toBe(0) // B

    // 改变颜色
    fill.value = '#00ff00'
    await waitForUpdate(renderContext)

    // 验证颜色已更新
    const newData = getPixelData(ctx, 100, 100, 1, 1)
    expect(newData[0]).toBe(0) // R
    expect(newData[1]).toBe(255) // G
    expect(newData[2]).toBe(0) // B
  })
})
