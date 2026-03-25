# Separator 分隔符组件

## 组件概述

Separator 是一个视觉或语义上的分隔符，用于分隔内容区域。常用于菜单项分组、内容区域分隔、表单字段分组等场景。

## Reka UI API

### 组件结构

```vue
<Separator.Root />
```

### Root Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| orientation | 'horizontal' \| 'vertical' | 'horizontal' | 方向 |
| decorative | boolean | false | 是否为装饰性（无语义） |

### Data Attributes

**Root**
- `data-orientation': 'horizontal' | 'vertical'

## Radix UI API

与 Reka UI 完全一致。

## 使用示例对比

### Reka UI 示例

```vue
<script setup>
import { Separator } from 'reka-ui'
</script>

<template>
  <div style="width: 100%; max-width: 300px; margin: 0 15px;">
    <div class="Text" style="font-weight: 500;">
      Radix Primitives
    </div>
    <div class="Text">
      一个开源的 UI 组件库。
    </div>
    <Separator.Root class="SeparatorRoot" style="margin: 15px 0;" />
    <div style="display: flex; height: 20px; align-items: center;">
      <div class="Text">博客</div>
      <Separator.Root 
        class="SeparatorRoot" 
        decorative
        orientation="vertical"
        style="margin: 0 15px;"
      />
      <div class="Text">文档</div>
      <Separator.Root 
        class="SeparatorRoot" 
        decorative
        orientation="vertical"
        style="margin: 0 15px;"
      />
      <div class="Text">源码</div>
    </div>
  </div>
</template>
```

### Radix UI 示例

```jsx
import * as React from 'react'
import { Separator } from 'radix-ui'

export default () => {
  return (
    <div style={{ width: '100%', maxWidth: 300, margin: '0 15px' }}>
      <div className="Text" style={{ fontWeight: 500 }}>
        Radix Primitives
      </div>
      <div className="Text">
        一个开源的 UI 组件库。
      </div>
      <Separator.Root className="SeparatorRoot" style={{ margin: '15px 0' }} />
      <div style={{ display: 'flex', height: 20, alignItems: 'center' }}>
        <div className="Text">博客</div>
        <Separator.Root 
          className="SeparatorRoot" 
          decorative
          orientation="vertical"
          style={{ margin: '0 15px' }}
        />
        <div className="Text">文档</div>
        <Separator.Root 
          className="SeparatorRoot" 
          decorative
          orientation="vertical"
          style={{ margin: '0 15px' }}
        />
        <div className="Text">源码</div>
      </div>
    </div>
  )
}
```

## 差异分析

### 装饰性 vs 语义性

| 属性 | 说明 |
|------|------|
| decorative = true | 纯装饰，无语义，屏幕阅读器忽略 |
| decorative = false | 语义分隔，屏幕阅读器朗读 "separator" |

### API 差异

| 特性 | Reka UI | Radix UI | 说明 |
|------|---------|----------|------|
| 组件结构 | 完全一致 | 完全一致 | 无差异 |
| Props | 完全一致 | 完全一致 | 无差异 |

## 可访问性

### WAI-ARIA 角色

- decorative = false: `role="separator"` + `aria-orientation`
- decorative = true: 无角色

### 屏幕阅读器

- 装饰性分隔符：屏幕阅读器忽略
- 语义分隔符：朗读 "separator"

## Rota 实现建议

### 1. 基于 Rasen 的实现

```typescript
export const Separator = {
  Root: defineComponent({
    props: {
      orientation: { 
        type: String, 
        default: 'horizontal' 
      },
      decorative: { 
        type: Boolean, 
        default: false 
      }
    },
    setup(props, { slots }) {
      return () => (
        <div
          role={props.decorative ? undefined : 'separator'}
          aria-orientation={props.decorative ? undefined : props.orientation}
          data-orientation={props.orientation}
          style={{
            [props.orientation === 'vertical' ? 'width' : 'height']: '1px',
            [props.orientation === 'vertical' ? 'height' : 'width']: 'auto'
          }}
        >
          {slots.default?.()}
        </div>
      )
    }
  })
}
```

### 2. 关键特性

1. **双向支持**: 水平和垂直
2. **装饰性**: 可配置是否为装饰性
3. **无障碍**: 根据配置提供语义支持
4. **简单**: 实现简单，使用广泛

### 3. 实现优先级

- [x] 基础结构
- [ ] 方向支持
- [ ] 装饰性支持
- [ ] 无障碍支持
