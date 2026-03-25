# Accordion 手风琴组件

## 组件概述

Accordion 是一个垂直堆叠的交互式标题集合，每个标题都可以展开或折叠关联的内容区域。常用于 FAQ、设置面板、导航菜单等场景。

## Reka UI API

### 组件结构

```vue
<Accordion.Root>
  <Accordion.Item>
    <Accordion.Header>
      <Accordion.Trigger />
    </Accordion.Header>
    <Accordion.Content />
  </Accordion.Item>
</Accordion.Root>
```

### Root Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| type | 'single' \| 'multiple' | - | 单选或多选模式 |
| value | string \| string[] | - | 受控值 |
| defaultValue | string \| string[] | - | 默认展开项 |
| onValueChange | (value: string \| string[]) => void | - | 值变化回调 |
| collapsible | boolean | false | 是否允许全部折叠（single模式） |
| disabled | boolean | false | 是否禁用 |
| dir | 'ltr' \| 'rtl' | 'ltr' | 文本方向 |
| orientation | 'horizontal' \| 'vertical' | 'vertical' | 方向 |

### Item Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| value | string | - | 唯一标识（必需） |
| disabled | boolean | false | 是否禁用 |

### Header Props

无特殊属性，作为 Trigger 的容器。

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
- `data-orientation`: 'horizontal' | 'vertical'

**Content**
- `data-state`: 'open' | 'closed'
- `data-disabled`: 存在时表示禁用
- `data-orientation`: 'horizontal' | 'vertical'

## Radix UI API

### 组件结构

```jsx
<Accordion.Root>
  <Accordion.Item>
    <Accordion.Header>
      <Accordion.Trigger />
    </Accordion.Header>
    <Accordion.Content />
  </Accordion.Item>
</Accordion.Root>
```

### Root Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| type | 'single' \| 'multiple' | - | 单选或多选模式 |
| value | string \| string[] | - | 受控值 |
| defaultValue | string \| string[] | - | 默认展开项 |
| onValueChange | (value: string \| string[]) => void | - | 值变化回调 |
| collapsible | boolean | false | 是否允许全部折叠（single模式） |
| disabled | boolean | false | 是否禁用 |
| dir | 'ltr' \| 'rtl' | 'ltr' | 文本方向 |
| orientation | 'horizontal' \| 'vertical' | 'vertical' | 方向 |

### Item Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| value | string | - | 唯一标识（必需） |
| disabled | boolean | false | 是否禁用 |

### Header Props

无特殊属性。

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
- `data-orientation`: 'horizontal' | 'vertical'

**Content**
- `data-state`: 'open' | 'closed'
- `data-disabled`: 存在时表示禁用
- `data-orientation`: 'horizontal' | 'vertical'

## 使用示例对比

### Reka UI 示例

```vue
<script setup>
import { Accordion } from 'reka-ui'
import { ref } from 'vue'

const value = ref(['item-1'])
</script>

<template>
  <Accordion.Root v-model="value" type="multiple">
    <Accordion.Item value="item-1">
      <Accordion.Header>
        <Accordion.Trigger>第一个问题</Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content>
        这是第一个问题的答案。
      </Accordion.Content>
    </Accordion.Item>
    
    <Accordion.Item value="item-2">
      <Accordion.Header>
        <Accordion.Trigger>第二个问题</Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content>
        这是第二个问题的答案。
      </Accordion.Content>
    </Accordion.Item>
  </Accordion.Root>
</template>
```

### Radix UI 示例

```jsx
import * as React from 'react'
import { Accordion } from 'radix-ui'

export default () => {
  const [value, setValue] = React.useState(['item-1'])
  
  return (
    <Accordion.Root 
      value={value} 
      onValueChange={setValue}
      type="multiple"
    >
      <Accordion.Item value="item-1">
        <Accordion.Header>
          <Accordion.Trigger>第一个问题</Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content>
          这是第一个问题的答案。
        </Accordion.Content>
      </Accordion.Item>
      
      <Accordion.Item value="item-2">
        <Accordion.Header>
          <Accordion.Trigger>第二个问题</Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content>
          这是第二个问题的答案。
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  )
}
```

## 差异分析

### API 差异

| 特性 | Reka UI | Radix UI | 说明 |
|------|---------|----------|------|
| 双向绑定 | v-model | value + onValueChange | Vue vs React 的差异 |
| 组件结构 | 完全一致 | 完全一致 | 无差异 |
| Props | 完全一致 | 完全一致 | 无差异 |
| Data Attributes | 完全一致 | 完全一致 | 无差异 |

### 实现差异

1. **响应式系统**
   - Reka UI: 使用 Vue 的响应式系统（ref, reactive）
   - Radix UI: 使用 React 的 useState, useEffect

2. **事件处理**
   - Reka UI: 使用 Vue 的事件系统
   - Radix UI: 使用 React 的事件系统

3. **插槽 vs Children**
   - Reka UI: 使用 Vue 的插槽机制
   - Radix UI: 使用 React 的 children prop

## 可访问性

### WAI-ARIA 角色

- Root: `role="region"` + `aria-label`
- Item: 无特殊角色
- Header: `role="heading"` + `aria-level="3"`
- Trigger: `role="button"` + `aria-expanded` + `aria-controls`
- Content: `role="region"` + `aria-labelledby`

### 键盘交互

| 按键 | 行为 |
|------|------|
| Space / Enter | 切换折叠状态 |
| Tab | 移动焦点到下一个可聚焦元素 |
| Shift + Tab | 移动焦点到上一个可聚焦元素 |
| ArrowDown | 移动焦点到下一个触发器（垂直方向） |
| ArrowUp | 移动焦点到上一个触发器（垂直方向） |
| ArrowRight | 移动焦点到下一个触发器（水平方向） |
| ArrowLeft | 移动焦点到上一个触发器（水平方向） |
| Home | 移动焦点到第一个触发器 |
| End | 移动焦点到最后一个触发器 |

## Rota 实现建议

### 1. 基于 Rasen 的实现

```typescript
// 使用 Rasen 的响应式系统
import { reactive, computed } from '@rasen/core'

// 组件定义
export const Accordion = {
  Root: defineComponent({
    props: {
      type: { type: String as PropType<'single' | 'multiple'>, default: 'single' },
      value: [String, Array],
      defaultValue: [String, Array],
      collapsible: Boolean,
      disabled: Boolean,
      dir: { type: String, default: 'ltr' },
      orientation: { type: String, default: 'vertical' }
    },
    setup(props, { emit }) {
      const state = reactive({
        value: props.value ?? props.defaultValue ?? (props.type === 'multiple' ? [] : '')
      })
      
      // 提供上下文
      provide('accordion', {
        state,
        props,
        toggleItem: (itemValue: string) => {
          // 切换逻辑
        }
      })
      
      return () => (
        <div 
          role="region"
          data-orientation={props.orientation}
        >
          {slots.default?.()}
        </div>
      )
    }
  }),
  Item: /* ... */,
  Header: /* ... */,
  Trigger: /* ... */,
  Content: /* ... */
}
```

### 2. 关键特性

1. **状态管理**: 使用 Rasen 的响应式系统
2. **组合式 API**: 支持类似 Vue 3 的组合式 API
3. **TypeScript**: 完整的类型支持
4. **无样式**: 保持 Headless 特性
5. **可访问性**: 完整的 ARIA 支持

### 3. 实现优先级

- [x] 基础结构
- [ ] 单选模式
- [ ] 多选模式
- [ ] 键盘导航
- [ ] 动画支持
- [ ] 水平方向
- [ ] RTL 支持
