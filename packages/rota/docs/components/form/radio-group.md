# RadioGroup 单选按钮组组件

## 组件概述

RadioGroup 是一组单选按钮，用户只能选择其中一个选项。常用于性别选择、支付方式选择、配送方式选择等场景。

## Reka UI API

### 组件结构

```vue
<RadioGroup.Root>
  <RadioGroup.Item>
    <RadioGroup.Indicator />
  </RadioGroup.Item>
  <RadioGroup.Item>
    <RadioGroup.Indicator />
  </RadioGroup.Item>
</RadioGroup.Root>
```

### Root Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| defaultValue | string | - | 默认值 |
| value | string | - | 受控值 |
| onValueChange | (value: string) => void | - | 值变化回调 |
| disabled | boolean | false | 是否禁用 |
| required | boolean | false | 是否必填 |
| name | string | - | 表单名称 |
| dir | 'ltr' \| 'rtl' | 'ltr' | 文本方向 |
| loop | boolean | true | 键盘循环导航 |

### Item Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| value | string | - | 值（必需） |
| disabled | boolean | false | 是否禁用 |
| required | boolean | false | 是否必填 |

### Indicator Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| forceMount | boolean | false | 强制挂载 |

### Data Attributes

**Root**
- `data-disabled`: 存在时表示禁用

**Item**
- `data-state`: 'checked' | 'unchecked'
- `data-disabled`: 存在时表示禁用

**Indicator**
- `data-state`: 'checked' | 'unchecked'
- `data-disabled`: 存在时表示禁用

## Radix UI API

与 Reka UI 完全一致。

## 使用示例对比

### Reka UI 示例

```vue
<script setup>
import { RadioGroup } from 'reka-ui'
import { ref } from 'vue'

const value = ref('default')
</script>

<template>
  <form>
    <RadioGroup.Root 
      class="RadioGroupRoot" 
      v-model="value"
      aria-label="视图密度"
    >
      <div style="display: flex; align-items: center;">
        <RadioGroup.Item class="RadioGroupItem" value="default" id="r1">
          <RadioGroup.Indicator class="RadioGroupIndicator" />
        </RadioGroup.Item>
        <label class="Label" for="r1">
          默认
        </label>
      </div>
      
      <div style="display: flex; align-items: center;">
        <RadioGroup.Item class="RadioGroupItem" value="comfortable" id="r2">
          <RadioGroup.Indicator class="RadioGroupIndicator" />
        </RadioGroup.Item>
        <label class="Label" for="r2">
          舒适
        </label>
      </div>
      
      <div style="display: flex; align-items: center;">
        <RadioGroup.Item class="RadioGroupItem" value="compact" id="r3">
          <RadioGroup.Indicator class="RadioGroupIndicator" />
        </RadioGroup.Item>
        <label class="Label" for="r3">
          紧凑
        </label>
      </div>
    </RadioGroup.Root>
  </form>
</template>
```

### Radix UI 示例

```jsx
import * as React from 'react'
import { RadioGroup } from 'radix-ui'

export default () => {
  const [value, setValue] = React.useState('default')
  
  return (
    <form>
      <RadioGroup.Root 
        className="RadioGroupRoot" 
        value={value}
        onValueChange={setValue}
        aria-label="视图密度"
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <RadioGroup.Item className="RadioGroupItem" value="default" id="r1">
            <RadioGroup.Indicator className="RadioGroupIndicator" />
          </RadioGroup.Item>
          <label className="Label" htmlFor="r1">
            默认
          </label>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <RadioGroup.Item className="RadioGroupItem" value="comfortable" id="r2">
            <RadioGroup.Indicator className="RadioGroupIndicator" />
          </RadioGroup.Item>
          <label className="Label" htmlFor="r2">
            舒适
          </label>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <RadioGroup.Item className="RadioGroupItem" value="compact" id="r3">
            <RadioGroup.Indicator className="RadioGroupIndicator" />
          </RadioGroup.Item>
          <label className="Label" htmlFor="r3">
            紧凑
          </label>
        </div>
      </RadioGroup.Root>
    </form>
  )
}
```

## 差异分析

### API 差异

| 特性 | Reka UI | Radix UI | 说明 |
|------|---------|----------|------|
| 双向绑定 | v-model | value + onValueChange | Vue vs React |
| 组件结构 | 完全一致 | 完全一致 | 无差异 |
| Props | 完全一致 | 完全一致 | 无差异 |

## 可访问性

### WAI-ARIA 角色

- Root: `role="radiogroup"` + `aria-required` + `aria-disabled`
- Item: `role="radio"` + `aria-checked` + `aria-required` + `aria-disabled`

### 键盘交互

| 按键 | 行为 |
|------|------|
| Tab | 移动焦点到选中的项，如果没有选中则移动到第一项 |
| Space | 选中聚焦的项 |
| Enter | 选中聚焦的项 |
| ArrowDown | 移动焦点到下一项 |
| ArrowUp | 移动焦点到上一项 |
| ArrowRight | 移动焦点到下一项（LTR） |
| ArrowLeft | 移动焦点到上一项（LTR） |

## Rota 实现建议

### 1. 基于 Rasen 的实现

```typescript
import { reactive, provide, inject } from '@rasen/core'

export const RadioGroup = {
  Root: defineComponent({
    props: {
      defaultValue: String,
      value: String,
      disabled: { type: Boolean, default: false },
      required: { type: Boolean, default: false },
      name: String,
      loop: { type: Boolean, default: true }
    },
    emits: ['update:value'],
    setup(props, { emit, slots }) {
      const state = reactive({
        value: props.value ?? props.defaultValue ?? ''
      })
      
      const currentValue = computed(() => props.value ?? state.value)
      
      const setValue = (value: string) => {
        state.value = value
        emit('update:value', value)
      }
      
      provide('radio-group', { 
        value: currentValue, 
        setValue, 
        disabled: props.disabled,
        required: props.required,
        name: props.name
      })
      
      return () => (
        <div
          role="radiogroup"
          aria-required={props.required}
          aria-disabled={props.disabled}
          data-disabled={props.disabled ? '' : undefined}
        >
          {slots.default?.()}
        </div>
      )
    }
  }),
  
  Item: defineComponent({
    props: {
      value: { type: String, required: true },
      disabled: { type: Boolean, default: false }
    },
    setup(props, { slots }) {
      const { value: currentValue, setValue, disabled: groupDisabled, required, name } = inject('radio-group')
      
      const isChecked = computed(() => currentValue.value === props.value)
      const isDisabled = computed(() => disabled || groupDisabled)
      
      const handleSelect = () => {
        if (isDisabled.value) return
        setValue(props.value)
      }
      
      return () => (
        <button
          type="button"
          role="radio"
          aria-checked={isChecked.value}
          aria-disabled={isDisabled.value}
          aria-required={required}
          data-state={isChecked.value ? 'checked' : 'unchecked'}
          data-disabled={isDisabled.value ? '' : undefined}
          onClick={handleSelect}
        >
          {slots.default?.()}
        </button>
      )
    }
  })
}
```

### 2. 关键特性

1. **单选互斥**: 同一组内只能选择一个
2. **键盘导航**: 方向键移动焦点
3. **表单集成**: 支持 name 属性
4. **循环导航**: 可配置是否循环
5. **无障碍**: 完整的 ARIA 支持

### 3. 实现优先级

- [x] 基础结构
- [ ] 单选逻辑
- [ ] 键盘导航
- [ ] 表单集成
- [ ] 循环导航
