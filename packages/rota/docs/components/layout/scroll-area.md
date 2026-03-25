# ScrollArea 滚动区域组件

## 组件概述

ScrollArea 是一个增强的滚动容器，支持自定义滚动条样式，提供跨浏览器一致的滚动体验。常用于内容列表、聊天记录、代码展示等场景。

## Reka UI API

### 组件结构

```vue
<ScrollArea.Root>
  <ScrollArea.Viewport>
    <!-- 内容 -->
  </ScrollArea.Viewport>
  <ScrollArea.Scrollbar orientation="vertical">
    <ScrollArea.Thumb />
  </ScrollArea.Scrollbar>
  <ScrollArea.Scrollbar orientation="horizontal">
    <ScrollArea.Thumb />
  </ScrollArea.Scrollbar>
  <ScrollArea.Corner />
</ScrollArea.Root>
```

### Root Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| type | 'auto' \| 'always' \| 'scroll' \| 'hover' | 'hover' | 滚动条显示类型 |
| scrollHideDelay | number | 600 | 隐藏延迟（毫秒） |
| dir | 'ltr' \| 'rtl' | 'ltr' | 文本方向 |

### Viewport Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### Scrollbar Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| forceMount | boolean | false | 强制挂载 |
| orientation | 'vertical' \| 'horizontal' | 'vertical' | 方向 |

### Thumb Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### Corner Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### Data Attributes

**Root**
- `data-orientation': 'vertical' | 'horizontal'

**Scrollbar**
- `data-state': 'visible' | 'hidden'
- `data-orientation': 'vertical' | 'horizontal'

**Thumb**
- `data-state': 'visible' | 'hidden'

## Radix UI API

与 Reka UI 完全一致。

## 使用示例对比

### Reka UI 示例

```vue
<script setup>
import { ScrollArea } from 'reka-ui'

const TAGS = Array.from({ length: 50 }).map(
  (_, i, a) => `v1.2.0-beta.${a.length - i}`
)
</script>

<template>
  <ScrollArea.Root class="ScrollAreaRoot">
    <ScrollArea.Viewport class="ScrollAreaViewport">
      <div style="padding: 15px 20px;">
        <div class="Text">标签</div>
        <div 
          v-for="tag in TAGS" 
          :key="tag" 
          class="Tag"
        >
          {{ tag }}
        </div>
      </div>
    </ScrollArea.Viewport>
    
    <ScrollArea.Scrollbar 
      class="ScrollAreaScrollbar" 
      orientation="vertical"
    >
      <ScrollArea.Thumb class="ScrollAreaThumb" />
    </ScrollArea.Scrollbar>
    
    <ScrollArea.Scrollbar 
      class="ScrollAreaScrollbar" 
      orientation="horizontal"
    >
      <ScrollArea.Thumb class="ScrollAreaThumb" />
    </ScrollArea.Scrollbar>
    
    <ScrollArea.Corner class="ScrollAreaCorner" />
  </ScrollArea.Root>
</template>
```

### Radix UI 示例

```jsx
import * as React from 'react'
import { ScrollArea } from 'radix-ui'

const TAGS = Array.from({ length: 50 }).map(
  (_, i, a) => `v1.2.0-beta.${a.length - i}`
)

export default () => {
  return (
    <ScrollArea.Root className="ScrollAreaRoot">
      <ScrollArea.Viewport className="ScrollAreaViewport">
        <div style={{ padding: '15px 20px' }}>
          <div className="Text">标签</div>
          {TAGS.map((tag) => (
            <div key={tag} className="Tag">
              {tag}
            </div>
          ))}
        </div>
      </ScrollArea.Viewport>
      
      <ScrollArea.Scrollbar 
        className="ScrollAreaScrollbar" 
        orientation="vertical"
      >
        <ScrollArea.Thumb className="ScrollAreaThumb" />
      </ScrollArea.Scrollbar>
      
      <ScrollArea.Scrollbar 
        className="ScrollAreaScrollbar" 
        orientation="horizontal"
      >
        <ScrollArea.Thumb className="ScrollAreaThumb" />
      </ScrollArea.Scrollbar>
      
      <ScrollArea.Corner className="ScrollAreaCorner" />
    </ScrollArea.Root>
  )
}
```

## 差异分析

### 滚动条显示类型

| 类型 | 说明 |
|------|------|
| auto | 自动显示/隐藏 |
| always | 始终显示 |
| scroll | 滚动时显示 |
| hover | 悬停时显示 |

### API 差异

| 特性 | Reka UI | Radix UI | 说明 |
|------|---------|----------|------|
| 组件结构 | 完全一致 | 完全一致 | 无差异 |
| Props | 完全一致 | 完全一致 | 无差异 |

## 可访问性

### WAI-ARIA 角色

- Root: 无特殊角色
- Viewport: 无特殊角色
- Scrollbar: `role="scrollbar"` + `aria-controls` + `aria-orientation` + `aria-valuenow` + `aria-valuemin` + `aria-valuemax`
- Thumb: 无特殊角色

### 键盘交互

| 按键 | 行为 |
|------|------|
| ArrowDown | 向下滚动 |
| ArrowUp | 向上滚动 |
| ArrowRight | 向右滚动 |
| ArrowLeft | 向左滚动 |
| PageDown | 向下滚动一页 |
| PageUp | 向上滚动一页 |
| Home | 滚动到顶部 |
| End | 滚动到底部 |

## Rota 实现建议

### 1. 基于 Rasen 的实现

```typescript
import { reactive, provide, inject } from '@rasen/core'

export const ScrollArea = {
  Root: defineComponent({
    props: {
      type: { 
        type: String, 
        default: 'hover' 
      },
      scrollHideDelay: { 
        type: Number, 
        default: 600 
      }
    },
    setup(props, { slots }) {
      const state = reactive({
        visible: false
      })
      
      let timer: number | null = null
      
      const showScrollbar = () => {
        state.visible = true
        if (timer) clearTimeout(timer)
        
        if (props.type === 'scroll' || props.type === 'hover') {
          timer = window.setTimeout(() => {
            state.visible = false
          }, props.scrollHideDelay)
        }
      }
      
      provide('scroll-area', { 
        visible: computed(() => state.visible),
        showScrollbar,
        type: props.type
      })
      
      return () => (
        <div style={{ position: 'relative' }}>
          {slots.default?.()}
        </div>
      )
    }
  }),
  
  Viewport: defineComponent({
    setup(props, { slots }) {
      const { showScrollbar } = inject('scroll-area')
      
      return () => (
        <div
          style={{
            overflow: 'scroll',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          }}
          onScroll={showScrollbar}
        >
          {slots.default?.()}
          <style>
            {`::-webkit-scrollbar { display: none; }`}
          </style>
        </div>
      )
    }
  }),
  
  Scrollbar: defineComponent({
    props: {
      orientation: { 
        type: String, 
        default: 'vertical' 
      }
    },
    setup(props, { slots }) {
      const { visible, type } = inject('scroll-area')
      
      const isVisible = computed(() => {
        if (type === 'always') return true
        return visible.value
      })
      
      return () => (
        <div
          role="scrollbar"
          aria-orientation={props.orientation}
          data-state={isVisible.value ? 'visible' : 'hidden'}
          data-orientation={props.orientation}
          style={{
            display: isVisible.value ? 'block' : 'none',
            position: 'absolute',
            [props.orientation === 'vertical' ? 'right' : 'bottom']: 0,
            [props.orientation === 'vertical' ? 'width' : 'height']: '10px'
          }}
        >
          {slots.default?.()}
        </div>
      )
    }
  }),
  
  Thumb: defineComponent({
    setup(props, { slots }) {
      const { visible } = inject('scroll-area')
      
      return () => (
        <div
          data-state={visible.value ? 'visible' : 'hidden'}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '5px',
            backgroundColor: 'rgba(0, 0, 0, 0.5)'
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

1. **自定义滚动条**: 完全自定义滚动条样式
2. **多种显示模式**: auto, always, scroll, hover
3. **双向滚动**: 支持水平和垂直
4. **跨浏览器一致**: 统一的滚动体验
5. **键盘支持**: 完整的键盘导航

### 3. 实现优先级

- [x] 基础结构
- [ ] 滚动条显示/隐藏
- [ ] 拖拽滚动
- [ ] 键盘导航
- [ ] RTL 支持
