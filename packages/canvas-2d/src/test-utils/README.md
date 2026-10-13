# Test Utils

Canvas 2D 测试辅助工具集。

> **Internal.** 本目录不对外导出（`package.json` 的 `exports` 只有包根入口）；
> 这里的所有示例都按**包内相对路径**导入，供本仓库的测试与视觉快照使用。

## 📁 文件结构

```
test-utils/
├── index.ts          # 统一导出入口
├── mock.ts           # Mock 工具（Canvas 上下文、响应式运行时）
├── visual.ts         # 视觉测试工具（像素比较、快照管理）
└── animation.ts      # 动画测试工具（区域检测、像素验证）
```

注：视觉测试的快照存储在 `__tests__/visual/__snapshots__/`

## 🧪 Mock 工具 (mock.ts)

创建测试所需的模拟对象。

### createMockContext()

创建模拟的 `CanvasRenderingContext2D`，用于单元测试。

```typescript
import { createMockContext } from './test-utils'

const ctx = createMockContext()
```

### createMockReactiveRuntime()

创建简单的模拟响应式运行时。

```typescript
import { createMockReactiveRuntime } from './test-utils'

setReactiveRuntime(createMockReactiveRuntime())
```

### 其他工具函数

- `getCallArgs(fn, index)` - 获取 mock 函数的调用参数
- `wasCalled(fn)` - 检查 mock 函数是否被调用
- `callCount(fn)` - 获取调用次数
- `waitForAsync(ms)` - 等待异步操作

## 🎨 视觉测试工具 (visual.ts)

基于像素比较的视觉回归测试。

### VisualTestScene

定义测试场景，包含基准渲染和测试渲染。

```typescript
import type { VisualTestScene } from './test-utils'

const scene: VisualTestScene = {
  name: 'rect-fill',
  width: 200,
  height: 150,
  baseline: (ctx) => {
    // 原生 Canvas API 渲染
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(50, 50, 100, 50)
  },
  render: (ctx) => {
    // Rasen 组件渲染
    rect({ x: 50, y: 50, width: 100, height: 50, fill: '#ff0000' })(ctx)
  }
}
```

### compareWithSnapshot()

比较当前渲染结果与快照。

```typescript
const result = await compareWithSnapshot(canvas, snapshotPath, {
  threshold: 0.1,
  maxDiffPixels: 100
})
```

## 🎬 动画测试工具 (animation.ts)

用于测试动画、脏区域检测和像素级验证。

### getPixelData()

获取 canvas 上某个区域的像素数据。

```typescript
import { getPixelData } from './test-utils'

const pixels = getPixelData(ctx, x, y, width, height)
```

### isRegionEmpty()

检查某个区域是否为空（全部透明）。

```typescript
import { isRegionEmpty } from './test-utils'

const isEmpty = isRegionEmpty(ctx, 50, 50, 100, 100)
expect(isEmpty).toBe(true)
```

### hasContent()

检查某个区域是否有内容。

```typescript
import { hasContent } from './test-utils'

expect(hasContent(ctx, 50, 50, 100, 100)).toBe(true)
```

### waitForUpdate()

等待响应式更新并刷新渲染。

```typescript
import { waitForUpdate } from './test-utils'

const x = ref(50)
x.value = 100
await waitForUpdate(renderContext)
```

## 📦 使用方式

### 在组件测试中

```typescript
import {
  createMockContext,
  createMockReactiveRuntime,
  getCallArgs,
  wasCalled
} from '../test-utils'

const ctx = createMockContext()
setReactiveRuntime(createMockReactiveRuntime())

rect({ x: 10, y: 20, width: 100, height: 50, fill: '#ff0000' })(ctx)

expect(wasCalled(ctx.fillRect)).toBe(true)
expect(getCallArgs(ctx.fillRect)).toEqual([10, 20, 100, 50])
```

### 在动画测试中

```typescript
import { isRegionEmpty, hasContent, waitForUpdate } from '../../test-utils'

const x = ref(50)
rect({ x, y: 50, width: 50, height: 50, fill: '#ff0000' })(ctx)

await waitForUpdate(renderContext)
expect(hasContent(ctx, 50, 50, 50, 50)).toBe(true)

x.value = 150
await waitForUpdate(renderContext)
expect(isRegionEmpty(ctx, 50, 50, 50, 50)).toBe(true)
```

### 在视觉测试中

```typescript
import { createVisualTestRunner } from '../../test-utils'
import * as basicScenes from './scenes/basic.scene'

const runTest = createVisualTestRunner()

describe('视觉测试', () => {
  for (const scene of Object.values(basicScenes)) {
    runTest(scene)
  }
})
```

## 🎯 最佳实践

1. **组件单元测试** → 使用 `mock.ts` 的工具
2. **动画和交互测试** → 使用 `animation.ts` 的工具
3. **视觉回归测试** → 使用 `visual.ts` 的工具

所有工具都可以从 `test-utils` 统一导入：

```typescript
import {
  createMockContext,
  isRegionEmpty,
  compareWithSnapshot
} from './test-utils'
```
