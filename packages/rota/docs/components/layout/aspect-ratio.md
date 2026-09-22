# AspectRatio 宽高比组件

## 组件概述

AspectRatio 是一个容器组件，用于保持子元素的固定宽高比。常用于响应式图片、视频播放器、地图等需要保持特定比例的场景。

## Reka UI API

### 组件结构

```vue
<AspectRatio.Root>
  <!-- 内容 -->
</AspectRatio.Root>
```

### Root Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| ratio | number | 1 | 宽高比（宽/高） |

### Data Attributes

无特殊 data 属性。

## Radix UI API

与 Reka UI 完全一致。

## 使用示例对比

### Reka UI 示例

```vue
<script setup>
import { AspectRatio } from 'reka-ui'
</script>

<template>
  <div style="width: 300px;">
    <AspectRatio.Root :ratio="16 / 9">
      <img 
        src="https://images.unsplash.com/photo-1605092676920-8ac5ae40de7e?w=600"
        alt="风景"
        style="object-fit: cover; width: 100%; height: 100%;"
      />
    </AspectRatio.Root>
  </div>
</template>
```

### Radix UI 示例

```jsx
import * as React from 'react'
import { AspectRatio } from 'radix-ui'

export default () => {
  return (
    <div style={{ width: 300 }}>
      <AspectRatio.Root ratio={16 / 9}>
        <img 
          src="https://images.unsplash.com/photo-1605092676920-8ac5ae40de7e?w=600"
          alt="风景"
          style={{ objectFit: 'cover', width: '100%', height: '100%' }}
        />
      </AspectRatio.Root>
    </div>
  )
}
```

## 差异分析

### 常用宽高比

| 宽高比 | ratio 值 | 用途 |
|--------|----------|------|
| 1:1 | 1 | 正方形头像、图标 |
| 4:3 | 4/3 | 传统电视 |
| 16:9 | 16/9 | 宽屏视频 |
| 21:9 | 21/9 | 超宽屏视频 |
| 3:2 | 3/2 | 摄影 |

### API 差异

| 特性 | Reka UI | Radix UI | 说明 |
|------|---------|----------|------|
| 组件结构 | 完全一致 | 完全一致 | 无差异 |
| Props | 完全一致 | 完全一致 | 无差异 |

## 可访问性

AspectRatio 是一个纯布局组件，不涉及可访问性。

## Rota 实现建议

### 1. 基于 Rasen 的实现

```typescript
export const AspectRatio = {
  Root: defineComponent({
    props: {
      ratio: { 
        type: Number, 
        default: 1 
      }
    },
    setup(props, { slots }) {
      return () => (
        <div
          style={{
            position: 'relative',
            width: '100%',
            paddingBottom: `${100 / props.ratio}%`
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0
            }}
          >
            {slots.default?.()}
          </div>
        </div>
      )
    }
  })
}
```

### 2. 关键特性

1. **固定比例**: 保持子元素的宽高比
2. **响应式**: 根据容器宽度自动调整高度
3. **简单**: 实现简单，使用广泛

### 3. 实现优先级

Rota 已实现本组件（单元测试 + 浏览器 e2e 覆盖）。以下是遗留项、有意不做的项，以及需要澄清的实现决定；跨组件的通用事项（动画政策、RTL）见 README 的「实现状态」。
- 内容居中：已完成（内容容器是 flex 居中容器；`data-aspect-ratio-content` 可覆盖该策略）。注意其代价：flex 子项不再自动撑满宽度，需要撑满的子元素应自行绝对定位或显式设尺寸。
- 响应式：由 `padding-bottom` 按自身宽度计算，天然响应式

