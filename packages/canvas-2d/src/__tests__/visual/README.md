# Canvas 2D 视觉测试

基于像素级比较的 Canvas 渲染视觉测试系统，参考了 Konva.js、Fabric.js 和 PixiJS 的测试实践。

## 技术栈

- **@napi-rs/canvas**: 跨平台的 Node.js Canvas 实现，无需原生编译依赖
- **pixelmatch**: 高性能像素级图像比较库
- **pngjs**: PNG 图像编解码
- **vitest**: 测试运行器

## 测试原理

每个测试场景包含两个渲染函数：

1. **baseline**: 使用**原生 Canvas API** 绘制，确保正确性，用于生成基准快照
2. **render**: 使用 **rasen 组件** 绘制，用于验证 rasen 实现是否正确

测试流程：

1. **生成基准快照**（使用 `USE_BASELINE=true`）：
   - 使用 `baseline` 函数渲染
   - 保存为 PNG 快照（可信的"正确答案"）
2. **运行测试**（正常模式）：
   - 使用 `render` 函数渲染（rasen 组件）
   - 与基准快照进行像素比较
   - 如果差异超过阈值，测试失败，保存 `.actual.png` 和 `.diff.png`

这样可以确保：**快照是正确的（原生 API 生成），而 rasen 的实现需要匹配快照**

## 目录结构

```
visual/
├── __snapshots__/          # 基准快照图像
│   ├── rect-fill.png
│   ├── circle-fill.png
│   └── ...
├── scenes/                 # 测试场景定义
│   ├── basic.scene.ts      # 基础图形场景
│   └── advanced.scene.ts   # 高级功能场景
├── visual-test-utils.ts    # 测试工具函数
├── visual.test.ts          # 测试运行器
└── README.md               # 本文档
```

## 运行测试

### 步骤 1: 生成基准快照（首次或添加新场景时）

使用原生 Canvas API 生成可信的基准快照：

```bash
# Windows PowerShell
$env:USE_BASELINE="true" ; yarn vitest run --dir packages/canvas-2d/src/__tests__/visual

# Linux/macOS
USE_BASELINE=true yarn vitest run --dir packages/canvas-2d/src/__tests__/visual
```

### 步骤 2: 运行测试（验证 rasen 实现）

使用 rasen 组件渲染，对比基准快照：

```bash
# 从项目根目录
yarn vitest run --dir packages/canvas-2d/src/__tests__/visual

# 或从 canvas-2d 包目录
cd packages/canvas-2d
yarn test:visual
```

### 重新生成快照（修改 baseline 时）

如果你修改了 `baseline` 函数或添加新场景，需要重新生成快照：

```bash
$env:USE_BASELINE="true" ; yarn vitest run --dir packages/canvas-2d/src/__tests__/visual
```

## 添加新测试

### 1. 定义测试场景

在 `scenes/` 目录下创建或编辑场景文件：

```typescript
import { VisualTestScene } from '../visual-test-utils'

export const myNewScene: VisualTestScene = {
  name: 'my-new-feature',
  width: 400,
  height: 300,
  render: (ctx) => {
    // 使用 Canvas API 绘制
    ctx.fillStyle = 'blue'
    ctx.fillRect(50, 50, 100, 100)
  },
  options: {
    maxDiffPixels: 10 // 允许最多 10 个像素差异
  }
}

// 导出场景数组
export const myScenes: VisualTestScene[] = [
  myNewScene
  // ... 更多场景
]
```

### 2. 在测试文件中引入

编辑 `visual.test.ts`：

```typescript
import { myScenes } from './scenes/my.scene'

// 在测试套件中添加
describe('我的新功能', () => {
  for (const scene of myScenes) {
    it(scene.name, async () => {
      await testScene(scene)
    })
  }
})
```

### 3. 生成基准快照

```bash
UPDATE_SNAPSHOTS=true yarn test:visual
```

## 测试配置选项

每个场景可以配置以下选项：

```typescript
interface VisualTestOptions {
  /** pixelmatch 阈值 (0-1), 值越小越严格，默认 0.1 */
  threshold?: number

  /** 允许的最大差异像素数，默认 0 */
  maxDiffPixels?: number

  /** 允许的最大差异百分比 (0-100) */
  maxDiffPercent?: number
}
```

### 选择合适的容差

- **精确匹配**: `maxDiffPixels: 0` - 适用于简单几何图形
- **抗锯齿容差**: `maxDiffPixels: 10-50` - 适用于包含文本、曲线的场景
- **百分比容差**: `maxDiffPercent: 0.1` - 允许 0.1% 的像素差异

## 调试失败的测试

当测试失败时，会在 `__snapshots__/` 目录生成调试文件：

- `<scene-name>.png` - 基准快照（预期结果）
- `<scene-name>.actual.png` - 当前渲染结果
- `<scene-name>.diff.png` - 差异高亮图（红色标记差异像素）

对比这些图像可以快速定位渲染问题。

## 最佳实践

### 1. 场景设计

- **原子性**: 每个场景只测试一个功能点
- **可重复**: 避免随机性（如随机颜色、位置）
- **有意义**: 测试实际使用场景，而非人为构造

### 2. 快照管理

- **版本控制**: 将 `__snapshots__/` 目录提交到 Git
- **定期审查**: 在更新快照前，仔细检查视觉变化是否符合预期
- **CI 集成**: 在持续集成中运行视觉测试

### 3. 性能优化

- **批量运行**: 一次运行所有场景，而非逐个运行
- **合理尺寸**: 使用适当的画布尺寸，避免过大导致测试缓慢
- **选择性测试**: 使用 `scene.skip` 或 `scene.only` 进行调试

## 示例场景

### 基础矩形

```typescript
{
  name: 'rect-fill',
  width: 200,
  height: 150,
  render: (ctx) => {
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(50, 50, 100, 50)
  },
  options: { maxDiffPixels: 0 }
}
```

### 渐变填充

```typescript
{
  name: 'gradient-linear',
  width: 300,
  height: 200,
  render: (ctx) => {
    const gradient = ctx.createLinearGradient(0, 0, 300, 0)
    gradient.addColorStop(0, 'red')
    gradient.addColorStop(1, 'blue')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 300, 200)
  },
  options: { maxDiffPixels: 50 }
}
```

### 文本渲染（需要抗锯齿容差）

```typescript
{
  name: 'text-basic',
  width: 300,
  height: 100,
  render: (ctx) => {
    ctx.font = '24px Arial'
    ctx.fillStyle = '#000000'
    ctx.fillText('Hello Canvas', 50, 50)
  },
  options: { maxDiffPixels: 100 }  // 文本抗锯齿需要更大容差
}
```

## 参考资源

- [Konva.js 视觉测试](https://github.com/konvajs/konva/tree/master/test/visual)
- [Fabric.js 视觉测试](https://github.com/fabricjs/fabric.js/tree/master/test/visual)
- [PixiJS 视觉测试](https://github.com/pixijs/pixijs/tree/dev/packages/visual-tests)
- [pixelmatch 文档](https://github.com/mapbox/pixelmatch)
