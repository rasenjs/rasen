# Select 选择器组件

## 组件概述

Select 是一个下拉选择器，用户可以从列表中选择一个值。常用于表单选择、筛选条件、设置选项等场景。

## Reka UI API

### 组件结构

```vue
<Select.Root>
  <Select.Trigger>
    <Select.Value />
    <Select.Icon />
  </Select.Trigger>
  <Select.Portal>
    <Select.Content>
      <Select.ScrollUpButton />
      <Select.Viewport>
        <Select.Item>
          <Select.ItemText />
          <Select.ItemIndicator />
        </Select.Item>
        <Select.Group>
          <Select.Label />
          <Select.Item />
        </Select.Group>
        <Select.Separator />
      </Select.Viewport>
      <Select.ScrollDownButton />
    </Select.Content>
  </Select.Portal>
</Select.Root>
```

### Root Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| defaultValue | string | - | 默认值 |
| value | string | - | 受控值 |
| onValueChange | (value: string) => void | - | 值变化回调 |
| defaultOpen | boolean | false | 默认是否打开 |
| open | boolean | - | 受控的打开状态 |
| onOpenChange | (open: boolean) => void | - | 打开状态变化回调 |
| dir | 'ltr' \| 'rtl' | 'ltr' | 文本方向 |
| name | string | - | 表单名称 |
| disabled | boolean | false | 是否禁用 |
| required | boolean | false | 是否必填 |

### Trigger Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### Value Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| placeholder | string | - | 占位符 |

### Icon Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

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
| position | 'item-aligned' \| 'popper' | 'item-aligned' | 定位模式 |
| side | 'top' \| 'right' \| 'bottom' \| 'left' | 'bottom' | 显示位置（popper模式） |
| sideOffset | number | 0 | 位置偏移 |
| align | 'start' \| 'center' \| 'end' | 'start' | 对齐方式 |
| alignOffset | number | 0 | 对齐偏移 |
| avoidCollisions | boolean | true | 避免碰撞 |
| collisionBoundary | Boundary \| Boundary[] | [] | 碰撞边界 |
| collisionPadding | number \| Padding | 10 | 碰撞内边距 |
| onCloseAutoFocus | (event: Event) => void | - | 关闭时自动聚焦回调 |
| onEscapeKeyDown | (event: KeyboardEvent) => void | - | ESC键按下回调 |
| onPointerDownOutside | (event: PointerDownOutsideEvent) => void | - | 外部点击回调 |

### Viewport Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### Item Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| value | string | - | 值（必需） |
| disabled | boolean | false | 是否禁用 |
| textValue | string | - | 文本值（用于搜索） |

### ItemText Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### ItemIndicator Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| forceMount | boolean | false | 强制挂载 |

### Group Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### Label Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### Separator Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### ScrollUpButton Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### ScrollDownButton Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### Data Attributes

**Trigger**
- `data-state`: 'open' | 'closed'
- `data-disabled`: 存在时表示禁用
- `data-placeholder`: 存在时表示有占位符

**Value**
- `data-placeholder`: 存在时表示有占位符

**Item**
- `data-state`: 'checked' | 'unchecked'
- `data-highlighted`: 存在时表示高亮
- `data-disabled`: 存在时表示禁用

### CSS Variables

- `--radix-select-content-transform-origin`: 内容变换原点
- `--radix-select-content-available-width`: 可用宽度
- `--radix-select-content-available-height`: 可用高度
- `--radix-select-trigger-width`: 触发器宽度
- `--radix-select-trigger-height`: 触发器高度

## Radix UI API

与 Reka UI 完全一致。

## 使用示例对比

### Reka UI 示例

```vue
<script setup>
import { Select } from 'reka-ui'
import { ref } from 'vue'

const value = ref('apple')
</script>

<template>
  <Select.Root v-model="value">
    <Select.Trigger class="SelectTrigger" aria-label="水果">
      <Select.Value placeholder="选择一个水果..." />
      <Select.Icon class="SelectIcon">
        <ChevronDownIcon />
      </Select.Icon>
    </Select.Trigger>
    
    <Select.Portal>
      <Select.Content class="SelectContent">
        <Select.ScrollUpButton class="SelectScrollButton">
          <ChevronUpIcon />
        </Select.ScrollUpButton>
        
        <Select.Viewport class="SelectViewport">
          <Select.Group>
            <Select.Label class="SelectLabel">水果</Select.Label>
            <SelectItem value="apple">苹果</SelectItem>
            <SelectItem value="banana">香蕉</SelectItem>
            <SelectItem value="blueberry">蓝莓</SelectItem>
          </Select.Group>
          
          <Select.Separator class="SelectSeparator" />
          
          <Select.Group>
            <Select.Label class="SelectLabel">蔬菜</Select.Label>
            <SelectItem value="aubergine">茄子</SelectItem>
            <SelectItem value="broccoli">西兰花</SelectItem>
            <SelectItem value="carrot" disabled>胡萝卜</SelectItem>
          </Select.Group>
        </Select.Viewport>
        
        <Select.ScrollDownButton class="SelectScrollButton">
          <ChevronDownIcon />
        </Select.ScrollDownButton>
      </Select.Content>
    </Select.Portal>
  </Select.Root>
</template>

<script setup>
const SelectItem = defineComponent({
  props: {
    value: String,
    disabled: Boolean
  },
  setup(props, { slots }) {
    return () => (
      <Select.Item 
        class="SelectItem" 
        :value="props.value"
        :disabled="props.disabled"
      >
        <Select.ItemText>{slots.default?.()}</Select.ItemText>
        <Select.ItemIndicator class="SelectItemIndicator">
          <CheckIcon />
        </Select.ItemIndicator>
      </Select.Item>
    )
  }
})
</script>
```

### Radix UI 示例

```jsx
import * as React from 'react'
import { Select } from 'radix-ui'

export default () => {
  const [value, setValue] = React.useState('apple')
  
  return (
    <Select.Root value={value} onValueChange={setValue}>
      <Select.Trigger className="SelectTrigger" aria-label="水果">
        <Select.Value placeholder="选择一个水果..." />
        <Select.Icon className="SelectIcon">
          <ChevronDownIcon />
        </Select.Icon>
      </Select.Trigger>
      
      <Select.Portal>
        <Select.Content className="SelectContent">
          <Select.ScrollUpButton className="SelectScrollButton">
            <ChevronUpIcon />
          </Select.ScrollUpButton>
          
          <Select.Viewport className="SelectViewport">
            <Select.Group>
              <Select.Label className="SelectLabel">水果</Select.Label>
              <SelectItem value="apple">苹果</SelectItem>
              <SelectItem value="banana">香蕉</SelectItem>
              <SelectItem value="blueberry">蓝莓</SelectItem>
            </Select.Group>
            
            <Select.Separator className="SelectSeparator" />
            
            <Select.Group>
              <Select.Label className="SelectLabel">蔬菜</Select.Label>
              <SelectItem value="aubergine">茄子</SelectItem>
              <SelectItem value="broccoli">西兰花</SelectItem>
              <SelectItem value="carrot" disabled>胡萝卜</SelectItem>
            </Select.Group>
          </Select.Viewport>
          
          <Select.ScrollDownButton className="SelectScrollButton">
            <ChevronDownIcon />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}

const SelectItem = React.forwardRef(({ children, ...props }, forwardedRef) => {
  return (
    <Select.Item className="SelectItem" {...props} ref={forwardedRef}>
      <Select.ItemText>{children}</Select.ItemText>
      <Select.ItemIndicator className="SelectItemIndicator">
        <CheckIcon />
      </Select.ItemIndicator>
    </Select.Item>
  )
})
```

## 差异分析

### 定位模式

| 模式 | 说明 | 特点 |
|------|------|------|
| item-aligned | 默认模式 | 类似原生 select，对齐选中项 |
| popper | 弹出层模式 | 类似 popover，支持更多定位选项 |

### API 差异

| 特性 | Reka UI | Radix UI | 说明 |
|------|---------|----------|------|
| 双向绑定 | v-model | value + onValueChange | Vue vs React |
| 组件结构 | 完全一致 | 完全一致 | 无差异 |
| Props | 完全一致 | 完全一致 | 无差异 |

## 可访问性

### WAI-ARIA 角色

- Trigger: `role="combobox"` + `aria-expanded` + `aria-required` + `aria-disabled`
- Content: `role="listbox"`
- Item: `role="option"` + `aria-selected` + `aria-disabled`
- Group: `role="group"`
- Label: 无特殊角色

### 键盘交互

| 按键 | 行为 |
|------|------|
| Space | 打开选择器 / 选择高亮项 |
| Enter | 打开选择器 / 选择高亮项 |
| ArrowDown | 移动焦点到下一项 |
| ArrowUp | 移动焦点到上一项 |
| Escape | 关闭选择器 |
| Home | 移动焦点到第一项 |
| End | 移动焦点到最后一项 |
| A-Z | 类型搜索，跳转到匹配项 |

## Rota 实现建议

### 1. 基于 Rasen 的实现

```typescript
import { reactive, provide, inject } from '@rasen/core'

export const Select = {
  Root: defineComponent({
    props: {
      defaultValue: String,
      value: String,
      defaultOpen: { type: Boolean, default: false },
      open: Boolean,
      disabled: { type: Boolean, default: false },
      required: { type: Boolean, default: false },
      name: String
    },
    emits: ['update:value', 'update:open'],
    setup(props, { emit, slots }) {
      const state = reactive({
        value: props.value ?? props.defaultValue ?? '',
        open: props.open ?? props.defaultOpen
      })
      
      const currentValue = computed(() => props.value ?? state.value)
      const isOpen = computed(() => props.open ?? state.open)
      
      const setValue = (value: string) => {
        state.value = value
        emit('update:value', value)
      }
      
      const setOpen = (open: boolean) => {
        state.open = open
        emit('update:open', open)
      }
      
      provide('select', { 
        value: currentValue, 
        setValue, 
        isOpen, 
        setOpen, 
        disabled: props.disabled,
        required: props.required,
        name: props.name
      })
      
      return () => slots.default?.()
    }
  }),
  
  Trigger: defineComponent({
    setup(props, { slots }) {
      const { isOpen, setOpen, disabled, required } = inject('select')
      
      return () => (
        <button
          type="button"
          role="combobox"
          aria-expanded={isOpen.value}
          aria-disabled={disabled}
          aria-required={required}
          data-state={isOpen.value ? 'open' : 'closed'}
          data-disabled={disabled ? '' : undefined}
          onClick={() => setOpen(!isOpen.value)}
        >
          {slots.default?.()}
        </button>
      )
    }
  }),
  
  Item: defineComponent({
    props: {
      value: { type: String, required: true },
      disabled: { type: Boolean, default: false },
      textValue: String
    },
    setup(props, { slots }) {
      const { value: currentValue, setValue, setOpen } = inject('select')
      
      const isSelected = computed(() => currentValue.value === props.value)
      
      const handleSelect = () => {
        if (props.disabled) return
        setValue(props.value)
        setOpen(false)
      }
      
      return () => (
        <div
          role="option"
          aria-selected={isSelected.value}
          aria-disabled={props.disabled}
          data-state={isSelected.value ? 'checked' : 'unchecked'}
          data-disabled={props.disabled ? '' : undefined}
          onClick={handleSelect}
        >
          {slots.default?.()}
        </div>
      )
    }
  })
}
```

### 2. 关键特性

1. **两种定位模式**: item-aligned 和 popper
2. **类型搜索**: 支持键盘输入搜索
3. **分组**: 支持选项分组
4. **滚动按钮**: 长列表支持滚动
5. **表单集成**: 支持 name 属性

### 3. 实现优先级

- [x] 基础结构
- [ ] 选择逻辑
- [ ] 键盘导航
- [ ] 类型搜索
- [ ] 定位模式
- [ ] 滚动按钮
- [ ] 表单集成
