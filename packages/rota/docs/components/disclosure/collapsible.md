# Collapsible 可折叠组件

## 组件概述

Collapsible 是一个交互式组件，可以展开或折叠内容区域。与 Accordion 不同，Collapsible 是单个独立的面板，不涉及多个面板的协调。常用于显示/隐藏详细信息、展开更多内容等场景。

## Reka UI API

### 组件结构

```vue
<Collapsible.Root>
  <Collapsible.Trigger />
  <Collapsible.Content />
</Collapsible.Root>
```

### Root Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| defaultOpen | boolean | false | 默认是否展开 |
| open | boolean | - | 受控的展开状态 |
| onOpenChange | (open: boolean) => void | - | 状态变化回调 |
| disabled | boolean | false | 是否禁用 |

### Trigger Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素作为触发器 |

### Content Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素作为内容容器 |
| forceMount | boolean | false | 强制挂载 |

### Data Attributes

**Trigger**
- `data-state`: 'open' | 'closed'
- `data-disabled`: 存在时表示禁用

**Content**
- `data-state`: 'open' | 'closed'
- `data-disabled`: 存在时表示禁用

## Radix UI API

### 组件结构

```jsx
<Collapsible.Root>
  <Collapsible.Trigger />
  <Collapsible.Content />
</Collapsible.Root>
```

### Root Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| defaultOpen | boolean | false | 默认是否展开 |
| open | boolean | - | 受控的展开状态 |
| onOpenChange | (open: boolean) => void | - | 状态变化回调 |
| disabled | boolean | false | 是否禁用 |

### Trigger Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素作为触发器 |

### Content Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素作为内容容器 |
| forceMount | boolean | false | 强制挂载 |

### Data Attributes

**Trigger**
- `data-state`: 'open' | 'closed'
- `data-disabled`: 存在时表示禁用

**Content**
- `data-state`: 'open' | 'closed'
- `data-disabled`: 存在时表示禁用

## 使用示例对比

### Reka UI 示例

```vue
<script setup>
import { Collapsible } from 'reka-ui'
import { ref } from 'vue'

const open = ref(false)
</script>

<template>
  <Collapsible.Root v-model:open="open">
    <div style="display: flex; align-items: center; justify-content: space-between;">
      <span>@peduarte starred 3 repositories</span>
      <Collapsible.Trigger as-child>
        <button class="IconButton">
          {{ open ? '收起' : '展开' }}
        </button>
      </Collapsible.Trigger>
    </div>
    
    <div class="Repository">
      <span>@radix-ui/primitives</span>
    </div>
    
    <Collapsible.Content>
      <div class="Repository">
        <span>@radix-ui/colors</span>
      </div>
      <div class="Repository">
        <span>@radix-ui/themes</span>
      </div>
    </Collapsible.Content>
  </Collapsible.Root>
</template>
```

### Radix UI 示例

```jsx
import * as React from 'react'
import { Collapsible } from 'radix-ui'

export default () => {
  const [open, setOpen] = React.useState(false)
  
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>@peduarte starred 3 repositories</span>
        <Collapsible.Trigger asChild>
          <button className="IconButton">
            {open ? '收起' : '展开'}
          </button>
        </Collapsible.Trigger>
      </div>
      
      <div className="Repository">
        <span>@radix-ui/primitives</span>
      </div>
      
      <Collapsible.Content>
        <div className="Repository">
          <span>@radix-ui/colors</span>
        </div>
        <div className="Repository">
          <span>@radix-ui/themes</span>
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
```

## 差异分析

### API 差异

| 特性 | Reka UI | Radix UI | 说明 |
|------|---------|----------|------|
| 双向绑定 | v-model:open | open + onOpenChange | Vue vs React 的差异 |
| 组件结构 | 完全一致 | 完全一致 | 无差异 |
| Props | 完全一致 | 完全一致 | 无差异 |
| Data Attributes | 完全一致 | 完全一致 | 无差异 |

### 实现差异

1. **响应式系统**
   - Reka UI: 使用 Vue 的响应式系统（ref, reactive）
   - Radix UI: 使用 React 的 useState

2. **事件处理**
   - Reka UI: 使用 Vue 的事件系统
   - Radix UI: 使用 React 的事件系统

3. **动画支持**
   - 两者都支持通过 CSS 或 JavaScript 实现动画
   - 都提供 data-state 属性用于样式控制

## 可访问性

### WAI-ARIA 角色

- Root: 无特殊角色
- Trigger: `role="button"` + `aria-expanded` + `aria-controls`
- Content: 无特殊角色，通过 aria-labelledby 关联

### 键盘交互

| 按键 | 行为 |
|------|------|
| Space / Enter | 切换折叠状态 |
| Tab | 移动焦点到下一个可聚焦元素 |
| Shift + Tab | 移动焦点到上一个可聚焦元素 |

## Rota 实现建议

### 1. 基于 Rasen 的实现

```typescript
import { reactive, computed } from '@rasen/core'

export const Collapsible = {
  Root: defineComponent({
    props: {
      defaultOpen: { type: Boolean, default: false },
      open: Boolean,
      disabled: { type: Boolean, default: false }
    },
    emits: ['update:open'],
    setup(props, { emit, slots }) {
      const state = reactive({
        open: props.open ?? props.defaultOpen
      })
      
      const isOpen = computed(() => props.open ?? state.open)
      
      const toggle = () => {
        if (props.disabled) return
        const newValue = !isOpen.value
        state.open = newValue
        emit('update:open', newValue)
      }
      
      provide('collapsible', {
        isOpen,
        disabled: props.disabled,
        toggle
      })
      
      return () => (
        <div>
          {slots.default?.()}
        </div>
      )
    }
  }),
  
  Trigger: defineComponent({
    setup(props, { slots }) {
      const { isOpen, disabled, toggle } = inject('collapsible')
      
      return () => (
        <button
          type="button"
          aria-expanded={isOpen.value}
          aria-disabled={disabled}
          data-state={isOpen.value ? 'open' : 'closed'}
          data-disabled={disabled ? '' : undefined}
          onClick={toggle}
        >
          {slots.default?.()}
        </button>
      )
    }
  }),
  
  Content: defineComponent({
    setup(props, { slots }) {
      const { isOpen } = inject('collapsible')
      
      return () => {
        if (!isOpen.value && !props.forceMount) return null
        
        return (
          <div
            data-state={isOpen.value ? 'open' : 'closed'}
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

1. **状态管理**: 使用 Rasen 的响应式系统
2. **受控/非受控**: 支持两种模式
3. **动画支持**: 通过 data-state 属性支持 CSS 动画
4. **无样式**: 保持 Headless 特性
5. **可访问性**: 完整的 ARIA 支持

### 3. 实现优先级

- [x] 基础结构
- [ ] 受控/非受控模式
- [ ] 禁用状态
- [ ] 动画支持
- [ ] asChild 支持

## 与 Accordion 的关系

Collapsible 是 Accordion 的基础构建块。Accordion.Item 内部使用了 Collapsible 的逻辑，但增加了多面板协调的功能。

### 主要区别

| 特性 | Collapsible | Accordion |
|------|-------------|-----------|
| 面板数量 | 单个 | 多个 |
| 状态管理 | 简单布尔值 | 复杂值管理（single/multiple） |
| 面板协调 | 无 | 有（single模式） |
| 使用场景 | 独立展开/折叠 | FAQ、设置面板等 |

### 组合使用

```vue
<!-- 使用 Collapsible 构建简单的展开面板 -->
<Collapsible.Root>
  <Collapsible.Trigger>展开详情</Collapsible.Trigger>
  <Collapsible.Content>
    详细内容...
  </Collapsible.Content>
</Collapsible.Root>

<!-- 使用 Accordion 构建多个协调的面板 -->
<Accordion.Root type="single">
  <Accordion.Item value="item-1">
    <Accordion.Header>
      <Accordion.Trigger>问题 1</Accordion.Trigger>
    </Accordion.Header>
    <Accordion.Content>答案 1</Accordion.Content>
  </Accordion.Item>
  <Accordion.Item value="item-2">
    <Accordion.Header>
      <Accordion.Trigger>问题 2</Accordion.Trigger>
    </Accordion.Header>
    <Accordion.Content>答案 2</Accordion.Content>
  </Accordion.Item>
</Accordion.Root>
```
