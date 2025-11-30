/**
 * Canvas 2D 视觉测试
 *
 * 使用 pixelmatch 进行像素级比较，验证渲染结果的正确性
 *
 * 运行方式:
 * - 正常测试: yarn vitest run visual.test.ts
 * - 更新快照: UPDATE_SNAPSHOTS=true yarn vitest run visual.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createCanvas } from '@napi-rs/canvas'
import { setReactiveRuntime } from '@rasenjs/core'
import { dirname, resolve } from 'path'
import {
  runVisualTest,
  createMockReactiveRuntime,
  UPDATE_SNAPSHOTS,
  type VisualTestScene
} from '../../test-utils'
import { basicScenes } from './scenes/basic.scene.js'
import { advancedScenes } from './scenes/advanced.scene.js'

// 快照目录：相对于当前测试文件的 __snapshots__ 目录
// 使用 import.meta.dirname (Node.js 20.11+) 或回退方案
const currentDir =
  typeof import.meta.dirname === 'string'
    ? import.meta.dirname
    : dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'))
const SNAPSHOTS_DIR = resolve(currentDir, '__snapshots__')

beforeAll(() => {
  // 初始化 mock reactive runtime
  setReactiveRuntime(createMockReactiveRuntime())
})

/**
 * 运行单个场景测试
 */
async function testScene(scene: VisualTestScene) {
  // 使用 node-canvas 创建新画布
  const testCanvas = createCanvas(scene.width, scene.height)

  const result = await runVisualTest(
    scene,
    testCanvas as unknown as HTMLCanvasElement,
    SNAPSHOTS_DIR
  )

  if (result.isNewSnapshot) {
    console.log(`📸 新快照已创建: ${scene.name}`)
  }

  if (!result.pass) {
    console.log(
      `❌ 视觉测试失败: ${scene.name}\n` +
        `   差异像素: ${result.diffPixels} / ${result.totalPixels} (${result.diffPercent.toFixed(2)}%)\n` +
        `   查看 .actual.png 和 .diff.png 文件进行调试`
    )
  }

  expect(
    result.pass,
    `视觉测试失败: ${scene.name}, 差异像素: ${result.diffPixels} (${result.diffPercent.toFixed(2)}%)`
  ).toBe(true)
}

describe('Canvas 2D 视觉测试', () => {
  if (UPDATE_SNAPSHOTS) {
    console.log('🔄 更新快照模式')
  }

  describe('基础图形', () => {
    for (const scene of basicScenes) {
      const testFn = scene.skip ? it.skip : scene.only ? it.only : it

      testFn(`${scene.name}`, async () => {
        await testScene(scene)
      })
    }
  })

  describe('高级功能', () => {
    for (const scene of advancedScenes) {
      const testFn = scene.skip ? it.skip : scene.only ? it.only : it

      testFn(`${scene.name}`, async () => {
        await testScene(scene)
      })
    }
  })
})
