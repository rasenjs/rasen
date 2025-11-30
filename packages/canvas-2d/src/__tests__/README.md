# 集成测试 (Integration Tests)

此目录包含 Canvas 2D 的集成测试，用于测试整个系统的协同工作。

## 📁 目录结构

```
__tests__/
├── animation/           # 动画和脏区域检测测试
│   ├── animation.test.ts
│   └── *.png           # 调试用截图
└── visual/             # 视觉回归测试
    ├── visual.test.ts
    ├── scenes/         # 测试场景定义
    │   ├── basic.scene.ts
    │   └── advanced.scene.ts
    └── __snapshots__/  # 视觉快照
```

## 🎯 测试类型对比

### 1. 组件单元测试 (`components/*.test.ts`)

- **位置**: 与组件文件同目录
- **目的**: 测试单个组件的功能
- **工具**: Mock Canvas 上下文
- **示例**: `rect.test.ts`, `circle.test.ts`

### 2. 动画集成测试 (`__tests__/animation/`)

- **位置**: `__tests__/animation/`
- **目的**: 测试整个渲染系统的动画和脏区域检测
- **工具**: 真实的响应式运行时 (Vue)
- **测试内容**:
  - 矩形移动时的脏区域清除
  - 阴影区域的边界计算
  - 旋转和缩放动画
  - 重叠对象的局部更新

### 3. 视觉回归测试 (`__tests__/visual/`)

- **位置**: `__tests__/visual/`
- **目的**: 确保渲染结果的视觉一致性
- **工具**: pixelmatch 像素比较
- **测试内容**:
  - 基础图形渲染
  - 样式和变换效果
  - 与原生 Canvas API 的一致性

## 🚀 运行测试

### 运行所有测试

```bash
yarn vitest run packages/canvas-2d/
```

### 运行动画测试

```bash
yarn vitest run packages/canvas-2d/src/__tests__/animation/
```

### 运行视觉测试

```bash
yarn vitest run packages/canvas-2d/src/__tests__/visual/
```

### 更新视觉快照

```bash
UPDATE_SNAPSHOTS=true yarn vitest run packages/canvas-2d/src/__tests__/visual/
```

## 📝 编写新的集成测试

### 动画测试

在 `animation.test.ts` 中添加新的测试场景：

```typescript
it('新的动画场景', async () => {
  const x = ref(50)

  rect({ x, y: 50, width: 50, height: 50, fill: '#ff0000' })(ctx)
  await waitForUpdate(renderContext)

  // 验证初始位置
  expect(hasContent(ctx, 50, 50, 50, 50)).toBe(true)

  // 更新位置
  x.value = 150
  await waitForUpdate(renderContext)

  // 验证旧位置已清除
  expect(isRegionEmpty(ctx, 50, 50, 50, 50)).toBe(true)
  // 验证新位置有内容
  expect(hasContent(ctx, 150, 50, 50, 50)).toBe(true)
})
```

### 视觉测试

在 `scenes/` 目录下创建新场景：

```typescript
// scenes/my-feature.scene.ts
import type { VisualTestScene } from '../../../test-utils'
import { rect } from '../../../components'

export const myFeatureScenes: VisualTestScene[] = [
  {
    name: 'my-feature',
    width: 200,
    height: 150,
    baseline: (ctx: CanvasRenderingContext2D) => {
      // 使用原生 Canvas API 绘制预期结果
      ctx.fillStyle = '#ff0000'
      ctx.fillRect(50, 50, 100, 50)
    },
    render: (ctx: CanvasRenderingContext2D) => {
      // 使用 Rasen 组件绘制
      rect({ x: 50, y: 50, width: 100, height: 50, fill: '#ff0000' })(ctx)
    }
  }
]
```

然后在 `visual.test.ts` 中导入并运行。

## 🔧 测试工具

所有测试工具都位于 `src/test-utils/`：

- `mock.ts` - Mock 对象和响应式运行时
- `visual.ts` - 视觉测试相关工具
- `animation.ts` - 动画测试相关工具

查看 `src/test-utils/README.md` 了解详细用法。

## ⚠️ 注意事项

1. **动画测试**需要真实的响应式运行时（目前使用 Vue）
2. **视觉测试**依赖 `@napi-rs/canvas` 和 `pixelmatch`
3. **快照文件**应该提交到版本控制
4. **调试图片**（`*.png`）不应提交到版本控制

## 📊 测试覆盖范围

- ✅ 基础图形渲染 (rect, circle, line, text)
- ✅ 样式属性 (fill, stroke, shadow)
- ✅ 变换 (rotation, scale, translate)
- ✅ 动画和响应式更新
- ✅ 脏区域检测和局部刷新
- ⏭️ 渐变和图案 (待实现)
- ⏭️ 复杂路径和贝塞尔曲线 (待实现)
