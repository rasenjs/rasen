/**
 * Canvas 2D 测试辅助工具
 *
 * 创建模拟的 Canvas 上下文和响应式运行时用于测试
 */

import { vi } from 'vitest'
import type { ReactiveRuntime } from '@rasenjs/core'

/**
 * 创建模拟的 CanvasRenderingContext2D
 */
export function createMockContext(): CanvasRenderingContext2D {
  const canvas = {
    width: 800,
    height: 600,
    getContext: vi.fn()
  } as unknown as HTMLCanvasElement

  const ctx = {
    canvas,
    // 绘制状态
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt' as CanvasLineCap,
    lineJoin: 'miter' as CanvasLineJoin,
    miterLimit: 10,
    lineDashOffset: 0,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over' as GlobalCompositeOperation,

    // 阴影
    shadowBlur: 0,
    shadowColor: 'rgba(0, 0, 0, 0)',
    shadowOffsetX: 0,
    shadowOffsetY: 0,

    // 文本
    font: '10px sans-serif',
    textAlign: 'start' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    direction: 'ltr' as CanvasDirection,

    // 变换矩阵
    _transform: [1, 0, 0, 1, 0, 0] as number[],

    // 路径操作
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    ellipse: vi.fn(),
    rect: vi.fn(),

    // 绘制操作
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    drawImage: vi.fn(),

    // 文本测量
    measureText: vi.fn((text: string) => ({
      width: text.length * 10,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 2,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: text.length * 10,
      fontBoundingBoxAscent: 12,
      fontBoundingBoxDescent: 3,
      emHeightAscent: 10,
      emHeightDescent: 2,
      alphabeticBaseline: 0,
      hangingBaseline: 8,
      ideographicBaseline: -2
    })) as unknown as CanvasRenderingContext2D['measureText'],

    // 变换
    scale: vi.fn(),
    rotate: vi.fn(),
    translate: vi.fn(),
    transform: vi.fn(),
    setTransform: vi.fn(),
    getTransform: vi.fn(() => new DOMMatrix()),
    resetTransform: vi.fn(),

    // 状态
    save: vi.fn(),
    restore: vi.fn(),

    // 裁剪
    clip: vi.fn(),

    // 像素操作
    createImageData: vi.fn(),
    getImageData: vi.fn(),
    putImageData: vi.fn(),

    // 虚线
    setLineDash: vi.fn(),
    getLineDash: vi.fn(() => []),

    // 渐变和图案
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn()
    })),
    createRadialGradient: vi.fn(() => ({
      addColorStop: vi.fn()
    })),
    createPattern: vi.fn(() => ({})),
    createConicGradient: vi.fn(() => ({
      addColorStop: vi.fn()
    })),

    // 其他
    isPointInPath: vi.fn(() => false),
    isPointInStroke: vi.fn(() => false),
    getContextAttributes: vi.fn(() => ({})),
    drawFocusIfNeeded: vi.fn(),
    roundRect: vi.fn()
  } as unknown as CanvasRenderingContext2D

  return ctx
}

/**
 * 获取模拟函数的调用参数
 */
export function getCallArgs(
  fn: ReturnType<typeof vi.fn>,
  callIndex = 0
): unknown[] {
  return fn.mock.calls[callIndex] ?? []
}

/**
 * 获取模拟函数的最后一次调用参数
 */
export function getLastCallArgs(fn: ReturnType<typeof vi.fn>): unknown[] {
  const calls = fn.mock.calls
  return calls[calls.length - 1] ?? []
}

/**
 * 检查模拟函数是否被调用
 */
export function wasCalled(fn: ReturnType<typeof vi.fn>): boolean {
  return fn.mock.calls.length > 0
}

/**
 * 获取模拟函数的调用次数
 */
export function callCount(fn: ReturnType<typeof vi.fn>): number {
  return fn.mock.calls.length
}

/**
 * 清除所有模拟函数的调用记录
 */
export function clearMockCalls(ctx: CanvasRenderingContext2D): void {
  const mockFunctions = [
    'beginPath',
    'closePath',
    'moveTo',
    'lineTo',
    'bezierCurveTo',
    'quadraticCurveTo',
    'arc',
    'arcTo',
    'ellipse',
    'rect',
    'fill',
    'stroke',
    'fillRect',
    'strokeRect',
    'clearRect',
    'fillText',
    'strokeText',
    'drawImage',
    'measureText',
    'scale',
    'rotate',
    'translate',
    'transform',
    'setTransform',
    'getTransform',
    'resetTransform',
    'save',
    'restore',
    'clip',
    'setLineDash',
    'getLineDash',
    'createLinearGradient',
    'createRadialGradient',
    'createPattern'
  ] as const

  for (const fnName of mockFunctions) {
    const fn = ctx[fnName] as unknown as ReturnType<typeof vi.fn>
    if (fn && typeof fn.mockClear === 'function') {
      fn.mockClear()
    }
  }
}

/**
 * 创建一个简单的模拟响应式运行时用于测试
 */
export function createMockReactiveRuntime(): ReactiveRuntime {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    watch: (source: any, callback: any, options?: any) => {
      // 立即执行一次以建立依赖关系
      const value = source()
      if (options?.immediate) {
        callback(value, value)
      }
      // 返回停止函数
      return () => {}
    },
    effectScope: () => ({
      run: <T>(fn: () => T) => fn(),
      stop: () => {}
    }),
    ref: <T>(value: T) => ({ value }),
    computed: <T>(getter: () => T) => ({
      get value() {
        return getter()
      }
    }),
    unref: <T>(value: T) => {
      if (value && typeof value === 'object' && 'value' in value) {
        return (value as { value: T }).value
      }
      return value
    },
    isRef: (value: unknown) => {
      return value !== null && typeof value === 'object' && 'value' in value
    }
  }
}

/**
 * 等待异步操作完成
 */
export function waitForAsync(ms = 20): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
