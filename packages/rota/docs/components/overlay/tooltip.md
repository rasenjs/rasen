# Tooltip 工具提示组件

## 组件概述

Tooltip 是一个简短的文本提示，当用户将鼠标悬停或聚焦在元素上时显示。常用于解释按钮功能、显示快捷键、提供额外信息等场景。

## Reka UI API

### 组件结构

```vue
<Tooltip.Provider>
  <Tooltip.Root>
    <Tooltip.Trigger />
    <Tooltip.Portal>
      <Tooltip.Content>
        <Tooltip.Arrow />
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
</Tooltip.Provider>
```

### Provider Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| delayDuration | number | 700 | 延迟显示时间（毫秒） |
| skipDelayDuration | number | 300 | 跳过延迟时间 |
| disableHoverableContent | boolean | false | 禁用可悬停内容 |

### Root Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| defaultOpen | boolean | false | 默认是否打开 |
| open | boolean | - | 受控的打开状态 |
| onOpenChange | (open: boolean) => void | - | 状态变化回调 |
| delayDuration | number | - | 延迟显示时间（覆盖 Provider） |
| disableHoverableContent | boolean | - | 禁用可悬停内容（覆盖 Provider） |

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
| side | 'top' \| 'right' \| 'bottom' \| 'left' | 'top' | 显示位置 |
| sideOffset | number | 0 | 位置偏移 |
| align | 'start' \| 'center' \| 'end' | 'center' | 对齐方式 |
| alignOffset | number | 0 | 对齐偏移 |
| avoidCollisions | boolean | true | 避免碰撞 |
| collisionBoundary | Boundary \| Boundary[] | [] | 碰撞边界 |
| collisionPadding | number \| Padding | 0 | 碰撞内边距 |
| arrowPadding | number | 0 | 箭头内边距 |
| sticky | 'partial' \| 'always' | 'partial' | 粘性定位 |
| hideWhenDetached | boolean | false | 分离时隐藏 |

### Arrow Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| width | number | 10 | 箭头宽度 |
| height | number | 5 | 箭头高度 |

### Data Attributes

**Trigger**
- `data-state`: 'delayed-open' | 'instant-open' | 'closed'

**Content**
- `data-state': 'delayed-open' | 'instant-open' | 'closed'
- `data-side`: 'top' | 'right' | 'bottom' | 'left'
- `data-align': 'start' | 'center' | 'end'

### CSS Variables

- `--radix-tooltip-content-transform-origin`: 内容变换原点
- `--radix-tooltip-content-available-width`: 可用宽度
- `--radix-tooltip-content-available-height`: 可用高度
- `--radix-tooltip-trigger-width`: 触发器宽度
- `--radix-tooltip-trigger-height`: 触发器高度

## Radix UI API

与 Reka UI 完全一致。

## 使用示例对比

### Reka UI 示例

```vue
<script setup>
import { Tooltip } from 'reka-ui'
</script>

<template>
  <Tooltip.Provider>
    <Tooltip.Root>
      <Tooltip.Trigger as-child>
        <button class="IconButton">
          <PlusIcon />
        </button>
      </Tooltip.Trigger>
      
      <Tooltip.Portal>
        <Tooltip.Content 
          class="TooltipContent" 
          :side-offset="5"
        >
          添加到库
          <Tooltip.Arrow class="TooltipArrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  </Tooltip.Provider>
</template>
```

### Radix UI 示例

```jsx
import * as React from 'react'
import { Tooltip } from 'radix-ui'
import { PlusIcon } from '@radix-ui/react-icons'

export default () => {
  return (
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button className="IconButton">
            <PlusIcon />
          </button>
        </Tooltip.Trigger>
        
        <Tooltip.Portal>
          <Tooltip.Content 
            className="TooltipContent" 
            sideOffset={5}
          >
            添加到库
            <Tooltip.Arrow className="TooltipArrow" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
```

## 差异分析

### API 差异

| 特性 | Reka UI | Radix UI | 说明 |
|------|---------|----------|------|
| 双向绑定 | v-model:open | open + onOpenChange | Vue vs React |
| 组件结构 | 完全一致 | 完全一致 | 无差异 |
| Props | 完全一致 | 完全一致 | 无差异 |

## 可访问性

### WAI-ARIA 角色

- Content: `role="tooltip"`

### 键盘交互

| 按键 | 行为 |
|------|------|
| Tab | 移动焦点，触发器获得焦点时显示 tooltip |
| Shift + Tab | 反向移动焦点 |
| Escape | 关闭 tooltip |

### 交互模式

1. **鼠标悬停**: 延迟显示（默认 700ms）
2. **键盘聚焦**: 立即显示
3. **触摸设备**: 长按显示

## Rota 实现建议

### 1. 基于 Rasen 的实现

```typescript
import { reactive, provide, inject } from '@rasen/core'

export const Tooltip = {
  Provider: defineComponent({
    props: {
      delayDuration: { type: Number, default: 700 },
      skipDelayDuration: { type: Number, default: 300 },
      disableHoverableContent: { type: Boolean, default: false }
    },
    setup(props, { slots }) {
      const context = reactive({
        delayDuration: props.delayDuration,
        skipDelayDuration: props.skipDelayDuration,
        disableHoverableContent: props.disableHoverableContent,
        lastOpenedTime: 0
      })
      
      provide('tooltip-provider', context)
      
      return () => slots.default?.()
    }
  }),
  
  Root: defineComponent({
    props: {
      defaultOpen: { type: Boolean, default: false },
      open: Boolean,
      delayDuration: Number,
      disableHoverableContent: Boolean
    },
    emits: ['update:open'],
    setup(props, { emit, slots }) {
      const provider = inject('tooltip-provider')
      const state = reactive({
        open: props.open ?? props.defaultOpen,
        timeoutId: null
      })
      
      const isOpen = computed(() => props.open ?? state.open)
      
      const setOpen = (value: boolean) => {
        state.open = value
        emit('update:open', value)
      }
      
      const showTooltip = () => {
        const delay = props.delayDuration ?? provider.delayDuration
        const skipDelay = Date.now() - provider.lastOpenedTime < provider.skipDelayDuration
        
        if (skipDelay) {
          setOpen(true)
        } else {
          state.timeoutId = setTimeout(() => {
            setOpen(true)
            provider.lastOpenedTime = Date.now()
          }, delay)
        }
      }
      
      const hideTooltip = () => {
        if (state.timeoutId) {
          clearTimeout(state.timeoutId)
        }
        setOpen(false)
      }
      
      provide('tooltip', { isOpen, showTooltip, hideTooltip })
      
      return () => slots.default?.()
    }
  }),
  
  Trigger: defineComponent({
    setup(props, { slots }) {
      const { showTooltip, hideTooltip } = inject('tooltip')
      
      return () => (
        <button
          onMouseEnter={showTooltip}
          onMouseLeave={hideTooltip}
          onFocus={showTooltip}
          onBlur={hideTooltip}
        >
          {slots.default?.()}
        </button>
      )
    }
  }),
  
  Content: defineComponent({
    setup(props, { slots }) {
      const { isOpen } = inject('tooltip')
      
      return () => {
        if (!isOpen.value && !props.forceMount) return null
        
        return (
          <div role="tooltip">
            {slots.default?.()}
          </div>
        )
      }
    }
  })
}
```

### 2. 关键特性

1. **延迟显示**: 可配置的延迟时间
2. **智能跳过**: 快速切换时跳过延迟
3. **键盘支持**: 焦点触发
4. **定位**: 使用 Floating UI
5. **Provider**: 全局配置

### 3. 实现优先级

- [x] 基础结构
- [ ] 延迟逻辑
- [ ] Provider 配置
- [ ] 键盘交互
- [ ] Floating UI 集成
- [ ] 动画支持
