# Progress 进度条组件

## 组件概述

Progress 是一个显示任务完成进度的指示器，通常以进度条的形式呈现。常用于文件上传、下载进度、表单填写进度等场景。

## Reka UI API

### 组件结构

```vue
<Progress.Root>
  <Progress.Indicator />
</Progress.Root>
```

### Root Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| value | number \| null | - | 进度值（0-100），null 表示不确定状态 |
| max | number | 100 | 最大值 |
| getValueLabel | (value: number, max: number) => string | - | 自定义标签函数 |

### Indicator Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### Data Attributes

**Root**
- `data-state`: 'indeterminate' | 'loading' | 'complete'
- `data-value`: 当前进度值
- `data-max`: 最大值

**Indicator**
- `data-state`: 'indeterminate' | 'loading' | 'complete'
- `data-value`: 当前进度值
- `data-max`: 最大值

## Radix UI API

与 Reka UI 完全一致。

## 使用示例对比

### Reka UI 示例

```vue
<script setup>
import { Progress } from 'reka-ui'
import { ref, onMounted } from 'vue'

const progress = ref(13)

onMounted(() => {
  const timer = setTimeout(() => progress.value = 66, 500)
  onUnmounted(() => clearTimeout(timer))
})
</script>

<template>
  <Progress.Root class="ProgressRoot" v-model="progress">
    <Progress.Indicator 
      class="ProgressIndicator"
      :style="{ transform: `translateX(-${100 - progress}%)` }"
    />
  </Progress.Root>
</template>
```

### Radix UI 示例

```jsx
import * as React from 'react'
import { Progress } from 'radix-ui'

export default () => {
  const [progress, setProgress] = React.useState(13)
  
  React.useEffect(() => {
    const timer = setTimeout(() => setProgress(66), 500)
    return () => clearTimeout(timer)
  }, [])
  
  return (
    <Progress.Root className="ProgressRoot" value={progress}>
      <Progress.Indicator 
        className="ProgressIndicator"
        style={{ transform: `translateX(-${100 - progress}%)` }}
      />
    </Progress.Root>
  )
}
```

## 差异分析

### 状态说明

| 状态 | 说明 |
|------|------|
| indeterminate | 不确定状态（value 为 null） |
| loading | 加载中（0 < value < max） |
| complete | 完成（value === max） |

### API 差异

| 特性 | Reka UI | Radix UI | 说明 |
|------|---------|----------|------|
| 双向绑定 | v-model | value | Vue vs React |
| 组件结构 | 完全一致 | 完全一致 | 无差异 |
| Props | 完全一致 | 完全一致 | 无差异 |

## 可访问性

### WAI-ARIA 角色

- Root: `role="progressbar"` + `aria-valuemin` + `aria-valuemax` + `aria-valuenow` + `aria-valuetext`

### 屏幕阅读器

- 自动朗读进度百分比
- 可通过 getValueLabel 自定义朗读文本

## Rota 实现建议

### 1. 基于 Rasen 的实现

```typescript
import { computed } from '@rasen/core'

export const Progress = {
  Root: defineComponent({
    props: {
      value: { type: Number, default: null },
      max: { type: Number, default: 100 },
      getValueLabel: Function
    },
    setup(props, { slots }) {
      const percentage = computed(() => {
        if (props.value === null) return null
        return Math.min(Math.max((props.value / props.max) * 100, 0), 100)
      })
      
      const state = computed(() => {
        if (props.value === null) return 'indeterminate'
        if (props.value >= props.max) return 'complete'
        return 'loading'
      })
      
      const valueLabel = computed(() => {
        if (props.getValueLabel) {
          return props.getValueLabel(props.value ?? 0, props.max)
        }
        return props.value === null ? '加载中...' : `${Math.round(percentage.value ?? 0)}%`
      })
      
      provide('progress', { 
        percentage, 
        state,
        value: computed(() => props.value),
        max: computed(() => props.max)
      })
      
      return () => (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={props.max}
          aria-valuenow={props.value ?? undefined}
          aria-valuetext={valueLabel.value}
          data-state={state.value}
          data-value={props.value ?? undefined}
          data-max={props.max}
        >
          {slots.default?.()}
        </div>
      )
    }
  }),
  
  Indicator: defineComponent({
    setup(props, { slots }) {
      const { percentage, state, value, max } = inject('progress')
      
      return () => (
        <div
          data-state={state.value}
          data-value={value.value ?? undefined}
          data-max={max.value}
          style={{
            transform: percentage.value !== null 
              ? `translateX(-${100 - percentage.value}%)` 
              : undefined
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

1. **不确定状态**: 支持 null 值表示加载中
2. **百分比计算**: 自动计算百分比
3. **无障碍**: 完整的 ARIA 支持
4. **自定义标签**: 可自定义屏幕阅读器文本
5. **动画**: 支持进度动画

### 3. 实现优先级

- [x] 基础结构
- [ ] 确定状态
- [ ] 不确定状态
- [ ] 无障碍支持
- [ ] 动画支持
