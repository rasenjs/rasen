# Slider 滑块组件

## 组件概述

Slider 是一个允许用户从给定范围内选择数值的输入控件。支持单滑块和多滑块（范围选择）。常用于音量调节、价格范围选择、亮度调节等场景。

## Reka UI API

### 组件结构

```vue
<Slider.Root>
  <Slider.Track>
    <Slider.Range />
  </Slider.Track>
  <Slider.Thumb />
</Slider.Root>
```

### Root Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| defaultValue | number[] | - | 默认值 |
| value | number[] | - | 受控值 |
| onValueChange | (value: number[]) => void | - | 值变化回调 |
| onValueCommit | (value: number[]) => void | - | 值提交回调 |
| name | string | - | 表单名称 |
| disabled | boolean | false | 是否禁用 |
| orientation | 'horizontal' \| 'vertical' | 'horizontal' | 方向 |
| dir | 'ltr' \| 'rtl' | 'ltr' | 文本方向 |
| inverted | boolean | false | 是否反转 |
| min | number | 0 | 最小值 |
| max | number | 100 | 最大值 |
| step | number | 1 | 步长 |
| minStepsBetweenThumbs | number | 0 | 滑块间最小步数 |
| form | string | - | 表单 ID |

### Track Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### Range Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### Thumb Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### Data Attributes

**Root**
- `data-disabled`: 存在时表示禁用
- `data-orientation`: 'horizontal' | 'vertical'

**Track**
- `data-disabled`: 存在时表示禁用
- `data-orientation`: 'horizontal' | 'vertical'

**Range**
- `data-disabled`: 存在时表示禁用
- `data-orientation`: 'horizontal' | 'vertical'

**Thumb**
- `data-disabled`: 存在时表示禁用
- `data-orientation`: 'horizontal' | 'vertical'

## Radix UI API

与 Reka UI 完全一致。

## 使用示例对比

### Reka UI 示例

```vue
<script setup>
import { Slider } from 'reka-ui'
</script>

<template>
  <form>
    <Slider.Root 
      class="SliderRoot" 
      :default-value="[50]"
      :max="100"
      :step="1"
    >
      <Slider.Track class="SliderTrack">
        <Slider.Range class="SliderRange" />
      </Slider.Track>
      <Slider.Thumb class="SliderThumb" aria-label="音量" />
    </Slider.Root>
  </form>
</template>
```

### Radix UI 示例

```jsx
import * as React from 'react'
import { Slider } from 'radix-ui'

export default () => {
  return (
    <form>
      <Slider.Root 
        className="SliderRoot" 
        defaultValue={[50]}
        max={100}
        step={1}
      >
        <Slider.Track className="SliderTrack">
          <Slider.Range className="SliderRange" />
        </Slider.Track>
        <Slider.Thumb className="SliderThumb" aria-label="音量" />
      </Slider.Root>
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

- Root: `role="slider"` + `aria-valuemin` + `aria-valuemax` + `aria-valuenow` + `aria-disabled`

### 键盘交互

| 按键 | 行为 |
|------|------|
| ArrowRight | 增加值（水平方向） |
| ArrowLeft | 减少值（水平方向） |
| ArrowUp | 增加值 |
| ArrowDown | 减少值 |
| PageUp | 大幅增加值 |
| PageDown | 大幅减少值 |
| Home | 设置为最小值 |
| End | 设置为最大值 |

## Rota 实现建议

### 1. 基于 Rasen 的实现

```typescript
import { reactive, computed } from '@rasen/core'

export const Slider = {
  Root: defineComponent({
    props: {
      defaultValue: { type: Array, default: () => [] },
      value: Array,
      min: { type: Number, default: 0 },
      max: { type: Number, default: 100 },
      step: { type: Number, default: 1 },
      disabled: { type: Boolean, default: false },
      orientation: { type: String, default: 'horizontal' },
      inverted: { type: Boolean, default: false }
    },
    emits: ['update:value', 'valueCommit'],
    setup(props, { emit, slots }) {
      const state = reactive({
        value: props.value ?? props.defaultValue ?? [props.min]
      })
      
      const currentValue = computed(() => props.value ?? state.value)
      
      const setValue = (value: number[]) => {
        state.value = value
        emit('update:value', value)
      }
      
      const handleKeyDown = (e: KeyboardEvent, index: number) => {
        const step = props.step
        const bigStep = (props.max - props.min) / 10
        let newValue = [...currentValue.value]
        
        switch (e.key) {
          case 'ArrowRight':
          case 'ArrowUp':
            newValue[index] = Math.min(newValue[index] + step, props.max)
            break
          case 'ArrowLeft':
          case 'ArrowDown':
            newValue[index] = Math.max(newValue[index] - step, props.min)
            break
          case 'PageUp':
            newValue[index] = Math.min(newValue[index] + bigStep, props.max)
            break
          case 'PageDown':
            newValue[index] = Math.max(newValue[index] - bigStep, props.min)
            break
          case 'Home':
            newValue[index] = props.min
            break
          case 'End':
            newValue[index] = props.max
            break
          default:
            return
        }
        
        e.preventDefault()
        setValue(newValue)
        emit('valueCommit', newValue)
      }
      
      provide('slider', { 
        value: currentValue, 
        setValue, 
        min: props.min,
        max: props.max,
        step: props.step,
        disabled: props.disabled,
        orientation: props.orientation,
        inverted: props.inverted,
        handleKeyDown
      })
      
      return () => (
        <div
          role="slider"
          aria-valuemin={props.min}
          aria-valuemax={props.max}
          aria-valuenow={currentValue.value[0]}
          aria-disabled={props.disabled}
          data-disabled={props.disabled ? '' : undefined}
          data-orientation={props.orientation}
        >
          {slots.default?.()}
        </div>
      )
    }
  }),
  
  Track: defineComponent({
    setup(props, { slots }) {
      const { orientation, disabled } = inject('slider')
      
      return () => (
        <div
          data-disabled={disabled ? '' : undefined}
          data-orientation={orientation}
        >
          {slots.default?.()}
        </div>
      )
    }
  }),
  
  Range: defineComponent({
    setup(props, { slots }) {
      const { value, min, max, orientation, disabled, inverted } = inject('slider')
      
      const percentage = computed(() => {
        const range = max - min
        const start = ((value.value[0] - min) / range) * 100
        const end = value.value.length > 1 
          ? ((value.value[1] - min) / range) * 100 
          : 100
        
        return { start, end }
      })
      
      return () => (
        <div
          data-disabled={disabled ? '' : undefined}
          data-orientation={orientation}
          style={{
            [orientation === 'horizontal' ? 'left' : 'bottom']: `${percentage.value.start}%`,
            [orientation === 'horizontal' ? 'right' : 'top']: `${100 - percentage.value.end}%`
          }}
        >
          {slots.default?.()}
        </div>
      )
    }
  }),
  
  Thumb: defineComponent({
    setup(props, { slots }) {
      const { value, min, max, orientation, disabled, handleKeyDown } = inject('slider')
      
      const percentage = computed(() => {
        return ((value.value[0] - min) / (max - min)) * 100
      })
      
      return () => (
        <div
          role="slider"
          tabindex={disabled ? -1 : 0}
          data-disabled={disabled ? '' : undefined}
          data-orientation={orientation}
          style={{
            [orientation === 'horizontal' ? 'left' : 'bottom']: `${percentage.value}%`
          }}
          onKeydown={(e) => handleKeyDown(e, 0)}
        >
          {slots.default?.()}
        </div>
      )
    }
  })
}
```

### 2. 关键特性

1. **范围选择**: 支持多滑块
2. **键盘交互**: 完整的键盘支持
3. **方向支持**: 水平和垂直
4. **反转模式**: 支持反向
5. **表单集成**: 支持 name 属性

### 3. 实现优先级

- [x] 基础结构
- [ ] 单滑块
- [ ] 多滑块（范围）
- [ ] 键盘交互
- [ ] 拖拽交互
- [ ] 垂直方向
