/**
 * Canvas 2D 视觉测试工具
 *
 * 基于 pixelmatch 的像素级比较方案
 * 参考 Konva.js, Fabric.js, PixiJS 的视觉测试实践
 */

// @ts-expect-error - pixelmatch doesn't have type definitions
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, resolve } from 'path'
import { setReactiveRuntime } from '@rasenjs/core'

/**
 * 初始化 mock 响应式运行时
 */
export function initMockReactiveRuntime(): void {
  setReactiveRuntime({
    effect: (fn: () => void) => {
      fn()
      return () => {}
    },
    computed: <T>(getter: () => T) => {
      return {
        get value() {
          return getter()
        }
      }
    },
    ref: <T>(value: T) => {
      let _value = value
      return {
        get value() {
          return _value
        },
        set value(v: T) {
          _value = v
        }
      }
    },
    unref: <T>(ref: T | { value: T }) => {
      if (ref && typeof ref === 'object' && 'value' in ref) {
        return ref.value
      }
      return ref as T
    },
    watch: (_source: () => unknown, callback: () => void) => {
      // 简单实现：立即执行一次 callback
      callback()
      return () => {}
    }
  })
}

/**
 * 视觉测试选项
 */
export interface VisualTestOptions {
  /** pixelmatch 阈值 (0-1), 值越小越严格 */
  threshold?: number
  /** 允许的最大差异像素数 */
  maxDiffPixels?: number
  /** 允许的最大差异百分比 (0-100) */
  maxDiffPercent?: number
}

/**
 * 视觉测试结果
 */
export interface VisualTestResult {
  /** 测试是否通过 */
  pass: boolean
  /** 差异像素数 */
  diffPixels: number
  /** 差异百分比 */
  diffPercent: number
  /** 总像素数 */
  totalPixels: number
  /** 差异图像 (仅失败时存在) */
  diffImage?: PNG
  /** 是否为首次运行 (生成基准图像) */
  isNewSnapshot?: boolean
}

/**
 * 测试场景定义
 */
export interface VisualTestScene {
  /** 场景唯一标识 */
  name: string
  /** 画布宽度 */
  width: number
  /** 画布高度 */
  height: number
  /** 基准渲染函数（使用原生 Canvas API，用于生成快照） */
  baseline: (ctx: CanvasRenderingContext2D) => void | Promise<void>
  /** 测试渲染函数（使用 rasen 组件，用于验证） */
  render: (ctx: CanvasRenderingContext2D) => void | Promise<void>
  /** 测试选项 */
  options?: VisualTestOptions
  /** 是否跳过 */
  skip?: boolean
  /** 是否只运行此测试 */
  only?: boolean
}

/**
 * 从 Canvas 获取像素数据
 */
export function getCanvasPixels(canvas: HTMLCanvasElement): {
  data: Uint8ClampedArray
  width: number
  height: number
} {
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return {
    data: imageData.data,
    width: canvas.width,
    height: canvas.height
  }
}

/**
 * 将像素数据保存为 PNG 文件
 */
export function savePixelsToPng(
  data: Uint8ClampedArray | Buffer,
  width: number,
  height: number,
  filePath: string
): void {
  const dir = dirname(filePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const png = new PNG({ width, height })
  png.data = Buffer.from(data)
  writeFileSync(filePath, PNG.sync.write(png))
}

/**
 * 从 PNG 文件加载像素数据
 */
export function loadPixelsFromPng(filePath: string): {
  data: Buffer
  width: number
  height: number
} {
  const buffer = readFileSync(filePath)
  const png = PNG.sync.read(buffer)
  return {
    data: png.data,
    width: png.width,
    height: png.height
  }
}

/**
 * 比较当前渲染结果与快照
 */
export async function compareWithSnapshot(
  canvas: HTMLCanvasElement,
  snapshotPath: string,
  options: VisualTestOptions = {}
): Promise<VisualTestResult> {
  const { threshold = 0.1, maxDiffPixels = 0, maxDiffPercent } = options
  const { data: currentData, width, height } = getCanvasPixels(canvas)
  const totalPixels = width * height

  // 确保快照目录存在
  const dir = dirname(snapshotPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  // 首次运行，保存快照
  if (!existsSync(snapshotPath)) {
    savePixelsToPng(currentData, width, height, snapshotPath)
    return {
      pass: true,
      diffPixels: 0,
      diffPercent: 0,
      totalPixels,
      isNewSnapshot: true
    }
  }

  // 加载已有快照
  const snapshot = loadPixelsFromPng(snapshotPath)

  // 尺寸不匹配
  if (snapshot.width !== width || snapshot.height !== height) {
    return {
      pass: false,
      diffPixels: totalPixels,
      diffPercent: 100,
      totalPixels,
      isNewSnapshot: false
    }
  }

  // 创建 diff 图像
  const diffPng = new PNG({ width, height })

  // 使用 pixelmatch 比较
  const diffPixels = pixelmatch(
    snapshot.data,
    Buffer.from(currentData),
    diffPng.data,
    width,
    height,
    { threshold }
  )

  const diffPercent = (diffPixels / totalPixels) * 100

  // 判断是否通过
  let pass = false
  if (maxDiffPercent !== undefined) {
    pass = diffPercent <= maxDiffPercent
  } else {
    pass = diffPixels <= maxDiffPixels
  }

  return {
    pass,
    diffPixels,
    diffPercent,
    totalPixels,
    diffImage: pass ? undefined : diffPng,
    isNewSnapshot: false
  }
}

/**
 * 保存失败时的调试图像
 */
export function saveDebugImages(
  canvas: HTMLCanvasElement,
  result: VisualTestResult,
  basePath: string
): void {
  const { data, width, height } = getCanvasPixels(canvas)

  // 保存实际渲染结果
  const actualPath = basePath.replace('.png', '.actual.png')
  savePixelsToPng(data, width, height, actualPath)

  // 保存差异图像
  if (result.diffImage) {
    const diffPath = basePath.replace('.png', '.diff.png')
    writeFileSync(diffPath, PNG.sync.write(result.diffImage))
  }
}

/**
 * 是否更新快照模式
 */
export const UPDATE_SNAPSHOTS = process.env.UPDATE_SNAPSHOTS === 'true'

/**
 * 是否使用基准渲染模式（用于生成初始快照）
 */
export const USE_BASELINE = process.env.USE_BASELINE === 'true'

/**
 * 视觉测试运行器配置
 */
export interface VisualTestRunnerConfig {
  /** 快照目录的绝对路径 */
  snapshotsDir: string
}

/**
 * 运行视觉测试
 * @param scene 测试场景
 * @param canvas 画布元素
 * @param snapshotsDir 快照目录路径
 */
export async function runVisualTest(
  scene: VisualTestScene,
  canvas: HTMLCanvasElement,
  snapshotsDir: string
): Promise<VisualTestResult> {
  const ctx = canvas.getContext('2d')!

  // 清空画布
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // 选择渲染函数：基准模式用 baseline，测试模式用 render
  const renderFn = USE_BASELINE ? scene.baseline : scene.render
  await renderFn(ctx)

  const snapshotPath = resolve(snapshotsDir, `${scene.name}.png`)

  // 更新模式或基准模式：直接保存快照
  if (UPDATE_SNAPSHOTS || USE_BASELINE) {
    const { data, width, height } = getCanvasPixels(canvas)
    savePixelsToPng(data, width, height, snapshotPath)
    return {
      pass: true,
      diffPixels: 0,
      diffPercent: 0,
      totalPixels: width * height,
      isNewSnapshot: true
    }
  }

  // 比较模式
  const result = await compareWithSnapshot(
    canvas,
    snapshotPath,
    scene.options || { maxDiffPixels: 10 }
  )

  // 失败时保存调试图像
  if (!result.pass) {
    saveDebugImages(canvas, result, snapshotPath)
  }

  return result
}

/**
 * 创建可复用的视觉测试运行器
 * @param config 配置项，包含快照目录路径
 * @param getCanvas 获取画布的函数
 */
export function createVisualTestRunner(
  config: VisualTestRunnerConfig,
  getCanvas: () => HTMLCanvasElement | Promise<HTMLCanvasElement>
) {
  return async function testScene(scene: VisualTestScene) {
    const canvas = await getCanvas()
    // 调整画布尺寸
    canvas.width = scene.width
    canvas.height = scene.height

    const result = await runVisualTest(scene, canvas, config.snapshotsDir)

    if (result.isNewSnapshot) {
      console.log(`📸 新快照已创建: ${scene.name}`)
    }

    return result
  }
}
