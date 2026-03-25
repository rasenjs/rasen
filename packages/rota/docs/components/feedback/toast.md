# Toast 消息提示组件

## 组件概述

Toast 是一个简短的消息提示，临时显示在屏幕上，自动消失。常用于操作反馈、系统通知、错误提示等场景。

## Reka UI API

### 组件结构

```vue
<Toast.Provider>
  <Toast.Root>
    <Toast.Title />
    <Toast.Description />
    <Toast.Action />
    <Toast.Close />
  </Toast.Root>
  <Toast.Viewport />
</Toast.Provider>
```

### Provider Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| swipeDirection | 'right' \| 'left' \| 'up' \| 'down' \| Array | 'right' | 滑动关闭方向 |
| duration | number | 5000 | 显示时长（毫秒） |
| label | string | 'Notification' | 屏幕阅读器标签 |

### Root Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| defaultOpen | boolean | true | 默认是否打开 |
| open | boolean | - | 受控的打开状态 |
| onOpenChange | (open: boolean) => void | - | 状态变化回调 |
| type | 'foreground' \| 'background' | 'foreground' | 类型 |
| duration | number | - | 显示时长（覆盖 Provider） |
| onEscapeKeyDown | (event: KeyboardEvent) => void | - | ESC键回调 |
| onPause | () => void | - | 暂停回调 |
| onResume | () => void | - | 恢复回调 |
| onSwipeStart | (event: SwipeEvent) => void | - | 滑动开始回调 |
| onSwipeMove | (event: SwipeEvent) => void | - | 滑动移动回调 |
| onSwipeEnd | (event: SwipeEvent) => void | - | 滑动结束回调 |
| forceMount | boolean | false | 强制挂载 |

### Title Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### Description Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### Action Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| altText | string | - | 替代文本（屏幕阅读器） |

### Close Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### Viewport Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| hotkey | string[] | ['F8'] | 热键 |
| label | string | 'Notifications ({hotkey})' | 标签 |

### Data Attributes

**Root**
- `data-state': 'open' | 'closed'
- `data-swipe-direction': 'up' | 'down' | 'left' | 'right'
- `data-swipe-state': 'start' | 'move' | 'cancel' | 'end'

## Radix UI API

与 Reka UI 完全一致。

## 使用示例对比

### Reka UI 示例

```vue
<script setup>
import { Toast } from 'reka-ui'
import { ref } from 'vue'

const open = ref(false)
const eventDate = ref(new Date())
const timerRef = ref(0)

function oneWeekAway() {
  const now = new Date()
  const inOneWeek = now.setDate(now.getDate() + 7)
  return new Date(inOneWeek)
}

function handleClick() {
  eventDate.value = oneWeekAway()
  open.value = false
  window.clearTimeout(timerRef.value)
  timerRef.value = window.setTimeout(() => {
    open.value = true
  }, 100)
}
</script>

<template>
  <Toast.Provider>
    <button 
      class="Button large violet"
      @click="handleClick"
    >
      添加到日历
    </button>
    
    <Toast.Root 
      class="ToastRoot" 
      v-model:open="open"
    >
      <Toast.Title class="ToastTitle">
        已安排：{{ eventDate.toLocaleDateString() }}
      </Toast.Title>
      <Toast.Description class="ToastDescription">
        <time :datetime="eventDate.toISOString()">
          {{ eventDate.toLocaleDateString() }}
        </time>
      </Toast.Description>
      <Toast.Action 
        class="ToastAction" 
        as-child
        alt-text="撤销"
      >
        <button class="Button small green">
          撤销
        </button>
      </Toast.Action>
    </Toast.Root>
    
    <Toast.Viewport class="ToastViewport" />
  </Toast.Provider>
</template>
```

### Radix UI 示例

```jsx
import * as React from 'react'
import { Toast } from 'radix-ui'

export default () => {
  const [open, setOpen] = React.useState(false)
  const [eventDate, setEventDate] = React.useState(new Date())
  const timerRef = React.useRef(0)
  
  function oneWeekAway() {
    const now = new Date()
    const inOneWeek = now.setDate(now.getDate() + 7)
    return new Date(inOneWeek)
  }
  
  function handleClick() {
    setEventDate(oneWeekAway())
    setOpen(false)
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      setOpen(true)
    }, 100)
  }
  
  return (
    <Toast.Provider>
      <button 
        className="Button large violet"
        onClick={handleClick}
      >
        添加到日历
      </button>
      
      <Toast.Root 
        className="ToastRoot" 
        open={open}
        onOpenChange={setOpen}
      >
        <Toast.Title className="ToastTitle">
          已安排：{eventDate.toLocaleDateString()}
        </Toast.Title>
        <Toast.Description className="ToastDescription">
          <time dateTime={eventDate.toISOString()}>
            {eventDate.toLocaleDateString()}
          </time>
        </Toast.Description>
        <Toast.Action 
          className="ToastAction" 
          asChild
          altText="撤销"
        >
          <button className="Button small green">
            撤销
          </button>
        </Toast.Action>
      </Toast.Root>
      
      <Toast.Viewport className="ToastViewport" />
    </Toast.Provider>
  )
}
```

## 差异分析

### Toast 类型

| 类型 | 说明 |
|------|------|
| foreground | 前景 Toast，获得焦点 |
| background | 后景 Toast，不获得焦点 |

### API 差异

| 特性 | Reka UI | Radix UI | 说明 |
|------|---------|----------|------|
| 双向绑定 | v-model:open | open + onOpenChange | Vue vs React |
| 组件结构 | 完全一致 | 完全一致 | 无差异 |
| Props | 完全一致 | 完全一致 | 无差异 |

## 可访问性

### WAI-ARIA 角色

- Root: `role="status"` + `aria-live` + `aria-atomic`
- Title: 无特殊角色
- Description: 无特殊角色
- Action: 无特殊角色

### 键盘交互

| 按键 | 行为 |
|------|------|
| Tab | 在 Toast 内移动焦点 |
| Shift + Tab | 反向移动焦点 |
| Escape | 关闭 Toast |
| F8 | 聚焦到 Viewport |

## Rota 实现建议

### 1. 基于 Rasen 的实现

```typescript
import { reactive, provide, inject } from '@rasen/core'

export const Toast = {
  Provider: defineComponent({
    props: {
      swipeDirection: { type: [String, Array], default: 'right' },
      duration: { type: Number, default: 5000 },
      label: { type: String, default: 'Notification' }
    },
    setup(props, { slots }) {
      const toasts = reactive([])
      
      const addToast = (toast: any) => {
        toasts.push(toast)
      }
      
      const removeToast = (id: string) => {
        const index = toasts.findIndex(t => t.id === id)
        if (index > -1) {
          toasts.splice(index, 1)
        }
      }
      
      provide('toast-provider', { 
        toasts, 
        addToast, 
        removeToast,
        swipeDirection: props.swipeDirection,
        duration: props.duration,
        label: props.label
      })
      
      return () => slots.default?.()
    }
  }),
  
  Root: defineComponent({
    props: {
      defaultOpen: { type: Boolean, default: true },
      open: Boolean,
      type: { type: String, default: 'foreground' },
      duration: Number
    },
    emits: ['update:open'],
    setup(props, { emit, slots }) {
      const { duration: providerDuration } = inject('toast-provider')
      const state = reactive({
        open: props.open ?? props.defaultOpen
      })
      
      const isOpen = computed(() => props.open ?? state.open)
      const duration = computed(() => props.duration ?? providerDuration)
      
      let timer: number | null = null
      
      const setOpen = (value: boolean) => {
        state.open = value
        emit('update:open', value)
        
        if (value && duration.value > 0) {
          timer = window.setTimeout(() => {
            setOpen(false)
          }, duration.value)
        } else if (timer) {
          clearTimeout(timer)
        }
      }
      
      provide('toast', { isOpen, setOpen })
      
      return () => (
        <div
          role="status"
          aria-live={props.type === 'foreground' ? 'assertive' : 'polite'}
          aria-atomic="true"
          data-state={isOpen.value ? 'open' : 'closed'}
        >
          {isOpen.value && slots.default?.()}
        </div>
      )
    }
  }),
  
  Viewport: defineComponent({
    setup(props, { slots }) {
      const { label } = inject('toast-provider')
      
      return () => (
        <div
          role="region"
          aria-label={label}
          tabIndex={-1}
        >
          {slots.default?.()}
        </div>
      )
    }
  })
}
```

### 2. 关键特性

1. **自动消失**: 可配置显示时长
2. **滑动关闭**: 支持滑动关闭
3. **暂停/恢复**: 焦点时暂停计时
4. **多 Toast**: 支持同时显示多个
5. **热键**: F8 聚焦到 Viewport
6. **Action**: 支持操作按钮

### 3. 实现优先级

- [x] 基础结构
- [ ] 自动消失
- [ ] 滑动关闭
- [ ] 暂停/恢复
- [ ] 多 Toast 管理
- [ ] 动画支持
