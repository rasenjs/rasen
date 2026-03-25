# Checkbox 复选框组件

## 组件概述

Checkbox 是一个允许用户在选中和未选中状态之间切换的控件。支持三种状态：选中、未选中和不确定状态。常用于表单、设置选项等场景。

## Reka UI API

### 组件结构

```vue
<Checkbox.Root>
  <Checkbox.Indicator />
</Checkbox.Root>
```

### Root Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| defaultChecked | boolean \| 'indeterminate' | false | 默认选中状态 |
| checked | boolean \| 'indeterminate' | - | 受控的选中状态 |
| onCheckedChange | (checked: boolean \| 'indeterminate') => void | - | 状态变化回调 |
| disabled | boolean | false | 是否禁用 |
| required | boolean | false | 是否必填 |
| name | string | - | 表单名称 |
| value | string | 'on' | 表单值 |

### Indicator Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| forceMount | boolean | false | 强制挂载 |

### Data Attributes

**Root**
- `data-state`: 'checked' | 'unchecked' | 'indeterminate'
- `data-disabled`: 存在时表示禁用

## Radix UI API

与 Reka UI 完全一致。

## 使用示例对比

### Reka UI 示例

```vue
<script setup>
import { Checkbox } from 'reka-ui'
import { ref } from 'vue'

const checked = ref(false)
</script>

<template>
  <form>
    <div style="display: flex; align-items: center;">
      <Checkbox.Root 
        class="CheckboxRoot" 
        v-model:checked="checked"
        id="c1"
      >
        <Checkbox.Indicator class="CheckboxIndicator">
          <CheckIcon />
        </Checkbox.Indicator>
      </Checkbox.Root>
      <label class="Label" for="c1">
        接受条款和条件。
      </label>
    </div>
  </form>
</template>
```

### Radix UI 示例

```jsx
import * as React from 'react'
import { Checkbox } from 'radix-ui'
import { CheckIcon } from '@radix-ui/react-icons'

export default () => {
  const [checked, setChecked] = React.useState(false)
  
  return (
    <form>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <Checkbox.Root 
          className="CheckboxRoot" 
          checked={checked}
          onCheckedChange={setChecked}
          id="c1"
        >
          <Checkbox.Indicator className="CheckboxIndicator">
            <CheckIcon />
          </Checkbox.Indicator>
        </Checkbox.Root>
        <label className="Label" htmlFor="c1">
          接受条款和条件。
        </label>
      </div>
    </form>
  )
}
```

## 差异分析

### API 差异

| 特性 | Reka UI | Radix UI | 说明 |
|------|---------|----------|------|
| 双向绑定 | v-model:checked | checked + onCheckedChange | Vue vs React |
| 组件结构 | 完全一致 | 完全一致 | 无差异 |
| Props | 完全一致 | 完全一致 | 无差异 |

## 可访问性

### WAI-ARIA 角色

- Root: `role="checkbox"` + `aria-checked` + `aria-required` + `aria-disabled`

### 键盘交互

| 按键 | 行为 |
|------|------|
| Space | 切换选中状态 |
| Enter | 切换选中状态 |

## Rota 实现建议

### 1. 基于 Rasen 的实现

```typescript
import { reactive, computed } from '@rasen/core'

export const Checkbox = {
  Root: defineComponent({
    props: {
      defaultChecked: { type: [Boolean, String], default: false },
      checked: [Boolean, String],
      disabled: { type: Boolean, default: false },
      required: { type: Boolean, default: false },
      name: String,
      value: { type: String, default: 'on' }
    },
    emits: ['update:checked'],
    setup(props, { emit, slots }) {
      const state = reactive({
        checked: props.checked ?? props.defaultChecked
      })
      
      const isChecked = computed(() => props.checked ?? state.checked)
      
      const toggle = () => {
        if (props.disabled) return
        
        let newValue: boolean | 'indeterminate'
        if (state.checked === false) {
          newValue = true
        } else if (state.checked === true) {
          newValue = 'indeterminate'
        } else {
          newValue = false
        }
        
        state.checked = newValue
        emit('update:checked', newValue)
      }
      
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          toggle()
        }
      }
      
      provide('checkbox', { 
        isChecked, 
        disabled: props.disabled 
      })
      
      return () => (
        <button
          type="button"
          role="checkbox"
          aria-checked={isChecked.value}
          aria-disabled={props.disabled}
          aria-required={props.required}
          data-state={isChecked.value === true ? 'checked' : isChecked.value === 'indeterminate' ? 'indeterminate' : 'unchecked'}
          data-disabled={props.disabled ? '' : undefined}
          onClick={toggle}
          onKeydown={handleKeyDown}
        >
          {slots.default?.()}
        </button>
      )
    }
  }),
  
  Indicator: defineComponent({
    props: {
      forceMount: { type: Boolean, default: false }
    },
    setup(props, { slots }) {
      const { isChecked } = inject('checkbox')
      
      return () => {
        if (!isChecked.value && !props.forceMount) return null
        
        return slots.default?.()
      }
    }
  })
}
```

### 2. 关键特性

1. **三态支持**: checked, unchecked, indeterminate
2. **表单集成**: 支持 name 和 value 属性
3. **键盘交互**: Space 和 Enter 切换状态
4. **无障碍**: 完整的 ARIA 支持
5. **受控/非受控**: 支持两种模式

### 3. 实现优先级

- [x] 基础结构
- [ ] 三态支持
- [ ] 表单集成
- [ ] 键盘交互
- [ ] 焦点管理
