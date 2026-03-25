# HoverCard 悬停卡片组件

## 组件概述

HoverCard 是一个类似 Tooltip 的弹出组件，但可以包含更丰富的内容和交互。当用户将鼠标悬停在触发元素上时显示，常用于用户资料卡片、链接预览等场景。

## Reka UI API

### 组件结构

```vue
<HoverCard.Root>
  <HoverCard.Trigger />
  <HoverCard.Portal>
    <HoverCard.Content>
      <HoverCard.Arrow />
    </HoverCard.Content>
  </HoverCard.Portal>
</HoverCard.Root>
```

### Root Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| defaultOpen | boolean | false | 默认是否打开 |
| open | boolean | - | 受控的打开状态 |
| onOpenChange | (open: boolean) => void | - | 状态变化回调 |
| openDelay | number | 700 | 打开延迟（毫秒） |
| closeDelay | number | 300 | 关闭延迟（毫秒） |

### Trigger Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素作为触发器 |

### Portal Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| forceMount | boolean | false | 强制挂载 |
| container | HTMLElement | document.body | 挂载容器 |

### Content Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| forceMount | boolean | false | 强制挂载 |
| side | 'top' \| 'right' \| 'bottom' \| 'left' | 'bottom' | 显示位置 |
| sideOffset | number | 0 | 位置偏移 |
| align | 'start' \| 'center' \| 'end' | 'center' | 对齐方式 |
| alignOffset | number | 0 | 对齐偏移 |
| avoidCollisions | boolean | true | 避免碰撞 |
| collisionBoundary | Boundary \| Boundary[] | [] | 碰撞边界 |
| collisionPadding | number \| Padding | 0 | 碰撞内边距 |
| arrowPadding | number | 0 | 箭头内边距 |

### Arrow Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| width | number | 10 | 箭头宽度 |
| height | number | 5 | 箭头高度 |

### Data Attributes

**Trigger**
- `data-state`: 'open' | 'closed'

**Content**
- `data-state': 'open' | 'closed'
- `data-side`: 'top' | 'right' | 'bottom' | 'left'
- `data-align': 'start' | 'center' | 'end'

### CSS Variables

- `--radix-hover-card-content-transform-origin`: 内容变换原点
- `--radix-hover-card-content-available-width`: 可用宽度
- `--radix-hover-card-content-available-height`: 可用高度

## Radix UI API

与 Reka UI 完全一致。

## 使用示例对比

### Reka UI 示例

```vue
<script setup>
import { HoverCard } from 'reka-ui'
</script>

<template>
  <HoverCard.Root>
    <HoverCard.Trigger as-child>
      <a 
        href="https://twitter.com/radix_ui"
        target="_blank"
        rel="noreferrer noopener"
      >
        <img 
          src="https://pbs.twimg.com/profile_images/1337055608613253126/r_eiMp2H_400x400.png" 
          alt="Radix UI"
        />
      </a>
    </HoverCard.Trigger>
    
    <HoverCard.Portal>
      <HoverCard.Content class="HoverCardContent" :side-offset="5">
        <div style="display: flex; flex-direction: column; gap: 7px;">
          <img 
            class="Image large" 
            src="https://pbs.twimg.com/profile_images/1337055608613253126/r_eiMp2H_400x400.png" 
            alt="Radix UI"
          />
          <div>
            <div class="Text bold">Radix</div>
            <div class="Text faded">@radix_ui</div>
          </div>
          <div class="Text">
            组件、图标、颜色和模板，用于构建高质量、可访问的 UI。免费且开源。
          </div>
          <div style="display: flex; gap: 15px;">
            <div>
              <span class="Text bold">0</span> 
              <span class="Text faded">关注中</span>
            </div>
            <div>
              <span class="Text bold">2,900</span> 
              <span class="Text faded">关注者</span>
            </div>
          </div>
        </div>
        <HoverCard.Arrow class="HoverCardArrow" />
      </HoverCard.Content>
    </HoverCard.Portal>
  </HoverCard.Root>
</template>
```

### Radix UI 示例

```jsx
import * as React from 'react'
import { HoverCard } from 'radix-ui'

export default () => {
  return (
    <HoverCard.Root>
      <HoverCard.Trigger asChild>
        <a 
          href="https://twitter.com/radix_ui"
          target="_blank"
          rel="noreferrer noopener"
        >
          <img 
            src="https://pbs.twimg.com/profile_images/1337055608613253126/r_eiMp2H_400x400.png" 
            alt="Radix UI"
          />
        </a>
      </HoverCard.Trigger>
      
      <HoverCard.Portal>
        <HoverCard.Content className="HoverCardContent" sideOffset={5}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <img 
              className="Image large" 
              src="https://pbs.twimg.com/profile_images/1337055608613253126/r_eiMp2H_400x400.png" 
              alt="Radix UI"
            />
            <div>
              <div className="Text bold">Radix</div>
              <div className="Text faded">@radix_ui</div>
            </div>
            <div className="Text">
              组件、图标、颜色和模板，用于构建高质量、可访问的 UI。免费且开源。
            </div>
            <div style={{ display: 'flex', gap: 15 }}>
              <div>
                <span className="Text bold">0</span> 
                <span className="Text faded">关注中</span>
              </div>
              <div>
                <span className="Text bold">2,900</span> 
                <span className="Text faded">关注者</span>
              </div>
            </div>
          </div>
          <HoverCard.Arrow className="HoverCardArrow" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  )
}
```

## 差异分析

### 与 Tooltip 的区别

| 特性 | HoverCard | Tooltip |
|------|-----------|---------|
| 内容复杂度 | 富文本、交互元素 | 简短文本 |
| 可聚焦 | 可以聚焦内容 | 不可以 |
| 可交互 | 支持内部交互 | 仅显示信息 |
| 延迟 | 可配置 | 固定延迟 |
| 键盘支持 | 有限 | 完整支持 |

### 与 Popover 的区别

| 特性 | HoverCard | Popover |
|------|-----------|---------|
| 触发方式 | 鼠标悬停 | 点击 |
| 模态 | 非模态 | 可选模态 |
| 键盘交互 | 有限 | 完整支持 |
| 用途 | 信息预览 | 表单、设置等 |

## 可访问性

### WAI-ARIA 角色

HoverCard 没有特定的 ARIA 角色，但应该确保：
- 触发器有适当的描述性标签
- 内容对屏幕阅读器可访问
- 支持键盘导航（如果内容可交互）

### 交互模式

1. **鼠标悬停**: 延迟显示（默认 700ms）
2. **鼠标移出**: 延迟关闭（默认 300ms）
3. **移动到内容**: 保持打开状态
4. **触摸设备**: 长按显示

## Rota 实现建议

### 1. 基于 Rasen 的实现

```typescript
import { reactive, computed } from '@rasen/core'

export const HoverCard = {
  Root: defineComponent({
    props: {
      defaultOpen: { type: Boolean, default: false },
      open: Boolean,
      openDelay: { type: Number, default: 700 },
      closeDelay: { type: Number, default: 300 }
    },
    emits: ['update:open'],
    setup(props, { emit, slots }) {
      const state = reactive({
        open: props.open ?? props.defaultOpen,
        openTimeout: null,
        closeTimeout: null
      })
      
      const isOpen = computed(() => props.open ?? state.open)
      
      const setOpen = (value: boolean) => {
        state.open = value
        emit('update:open', value)
      }
      
      const handleOpen = () => {
        clearTimeout(state.closeTimeout)
        state.openTimeout = setTimeout(() => {
          setOpen(true)
        }, props.openDelay)
      }
      
      const handleClose = () => {
        clearTimeout(state.openTimeout)
        state.closeTimeout = setTimeout(() => {
          setOpen(false)
        }, props.closeDelay)
      }
      
      provide('hover-card', { isOpen, handleOpen, handleClose })
      
      return () => slots.default?.()
    }
  }),
  
  Trigger: defineComponent({
    setup(props, { slots }) {
      const { handleOpen, handleClose } = inject('hover-card')
      
      return () => (
        <div
          onMouseEnter={handleOpen}
          onMouseLeave={handleClose}
        >
          {slots.default?.()}
        </div>
      )
    }
  }),
  
  Content: defineComponent({
    setup(props, { slots }) {
      const { isOpen, handleOpen, handleClose } = inject('hover-card')
      
      return () => {
        if (!isOpen.value && !props.forceMount) return null
        
        return (
          <div
            onMouseEnter={handleOpen}
            onMouseLeave={handleClose}
          >
            {slots.default?.()}
          </div>
        )
      }
    }
  })
}
```

### 2. 关键特性

1. **延迟管理**: 智能的打开/关闭延迟
2. **悬停保持**: 鼠标移到内容时保持打开
3. **定位**: 使用 Floating UI
4. **箭头**: 可选的指向箭头
5. **Portal**: 渲染到 body

### 3. 实现优先级

- [x] 基础结构
- [ ] 延迟逻辑
- [ ] 悬停保持
- [ ] Floating UI 集成
- [ ] 动画支持
