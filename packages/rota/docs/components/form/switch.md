# Switch 开关组件

## 组件概述

Switch 是一个双态按钮，可以在"开"和"关"状态之间切换。常用于设置选项、开关功能等场景。

## Reka UI API

### 组件结构

```vue
<Switch.Root>
  <Switch.Thumb />
</Switch.Root>
```

### Root Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| defaultChecked | boolean | false | 默认选中状态 |
| checked | boolean | - | 受控的选中状态 |
| onCheckedChange | (checked: boolean) => void | - | 状态变化回调 |
| disabled | boolean | false | 是否禁用 |
| required | boolean | false | 是否必填 |
| name | string | - | 表单名称 |
| value | string | 'on' | 表单值 |

### Thumb Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### Data Attributes

**Root**
- `data-state`: 'checked' | 'unchecked'
- `data-disabled`: 存在时表示禁用

## Radix UI API

与 Reka UI 完全一致。

## 使用示例对比

### Reka UI 示例

```vue
<script setup>
import { Switch } from 'reka-ui'
import { ref } from 'vue'

const checked = ref(false)
</script>

<template>
  <form>
    <div style="display: flex; align-items: center;">
      <label class="Label" for="airplane-mode" style="padding-right: 15px;">
        飞行模式
      </label>
      <Switch.Root 
        class="SwitchRoot" 
        v-model:checked="checked"
        id="airplane-mode"
      >
        <Switch.Thumb class="SwitchThumb" />
      </Switch.Root>
    </div>
  </form>
</template>
```

### Radix UI 示例

```jsx
import * as React from 'react'
import { Switch } from 'radix-ui'

export default () => {
  const [checked, setChecked] = React.useState(false)
  
  return (
    <form>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <label className="Label" htmlFor="airplane-mode" style={{ paddingRight: 15 }}>
          飞行模式
        </label>
        <Switch.Root 
          className="SwitchRoot" 
          checked={checked}
          onCheckedChange={setChecked}
          id="airplane-mode"
        >
          <Switch.Thumb className="SwitchThumb" />
        </Switch.Root>
      </div>
    </form>
  )
}
```

## 差异分析

### 与 Checkbox 的区别

| 特性 | Switch | Checkbox |
|------|--------|----------|
| 状态数 | 2 | 3 (indeterminate) |
| 视觉 | 滑动开关 | 方框勾选 |
| 用途 | 开关设置 | 多选项 |

### API 差异

| 特性 | Reka UI | Radix UI | 说明 |
|------|---------|----------|------|
| 双向绑定 | v-model:checked | checked + onCheckedChange | Vue vs React |
| 组件结构 | 完全一致 | 完全一致 | 无差异 |
| Props | 完全一致 | 完全一致 | 无差异 |

## 可访问性

### WAI-ARIA 角色

- Root: `role="switch"` + `aria-checked` + `aria-required` + `aria-disabled`

### 键盘交互

| 按键 | 行为 |
|------|------|
| Space | 切换状态 |
| Enter | 切换状态 |

## Rota 实现建议

### 1. 基于 Rasen 的实现

```typescript
export const Switch = {
  Root: defineComponent({
    props: {
      defaultChecked: { type: Boolean, default: false },
      checked: Boolean,
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
        
        const newValue = !state.checked
        state.checked = newValue
        emit('update:checked', newValue)
      }
      
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          toggle()
        }
      }
      
      provide('switch', { isChecked, disabled: props.disabled })
      
      return () => (
        <button
          type="button"
          role="switch"
          aria-checked={isChecked.value}
          aria-disabled={props.disabled}
          aria-required={props.required}
          data-state={isChecked.value ? 'checked' : 'unchecked'}
          data-disabled={props.disabled ? '' : undefined}
          onClick={toggle}
          onKeydown={handleKeyDown}
        >
          {slots.default?.()}
        </button>
      )
    }
  }),
  
  Thumb: defineComponent({
    setup(props, { slots }) {
      const { isChecked } = inject('switch')
      
      return () => (
        <span
          data-state={isChecked.value ? 'checked' : 'unchecked'}
        >
          {slots.default?.()}
        </span>
      )
    }
  })
}
```

### 2. 关键特性

1. **双态切换**: 开/关状态
2. **表单集成**: 支持 name 和 value 属性
3. **键盘交互**: Space 和 Enter 切换状态
4. **动画**: 支持滑动手势动画
5. **无障碍**: 完整的 ARIA 支持

### 3. 实现优先级

- [x] 基础结构
- [ ] 状态切换
- [ ] 表单集成
- [ ] 键盘交互
- [ ] 动画支持
