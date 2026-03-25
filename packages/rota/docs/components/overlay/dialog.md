# Dialog 对话框组件

## 组件概述

Dialog 是一个模态对话框，覆盖在主窗口或其他对话框之上，使底层内容变为不可交互。常用于确认操作、表单填写、信息展示等场景。

## Reka UI API

### 组件结构

```vue
<Dialog.Root>
  <Dialog.Trigger />
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <Dialog.Title />
      <Dialog.Description />
      <Dialog.Close />
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

### Root Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| defaultOpen | boolean | false | 默认是否打开 |
| open | boolean | - | 受控的打开状态 |
| onOpenChange | (open: boolean) => void | - | 状态变化回调 |

### Trigger Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素作为触发器 |

### Portal Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| forceMount | boolean | false | 强制挂载 |
| container | HTMLElement | document.body | 挂载容器 |

### Overlay Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| forceMount | boolean | false | 强制挂载 |

### Content Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| forceMount | boolean | false | 强制挂载 |
| onOpenAutoFocus | (event: Event) => void | - | 打开时自动聚焦回调 |
| onCloseAutoFocus | (event: Event) => void | - | 关闭时自动聚焦回调 |
| onEscapeKeyDown | (event: KeyboardEvent) => void | - | ESC键按下回调 |
| onPointerDownOutside | (event: PointerDownOutsideEvent) => void | - | 外部点击回调 |
| onInteractOutside | (event: InteractOutsideEvent) => void | - | 外部交互回调 |

### Title Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### Description Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### Close Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### Data Attributes

**Trigger**
- `data-state`: 'open' | 'closed'

**Content**
- `data-state': 'open' | 'closed'

## Radix UI API

与 Reka UI 完全一致。

## 使用示例对比

### Reka UI 示例

```vue
<script setup>
import { Dialog } from 'reka-ui'
import { ref } from 'vue'

const open = ref(false)
</script>

<template>
  <Dialog.Root v-model:open="open">
    <Dialog.Trigger as-child>
      <button>编辑资料</button>
    </Dialog.Trigger>
    
    <Dialog.Portal>
      <Dialog.Overlay class="DialogOverlay" />
      <Dialog.Content class="DialogContent">
        <Dialog.Title>编辑资料</Dialog.Title>
        <Dialog.Description>
          在这里修改你的资料，完成后点击保存。
        </Dialog.Description>
        
        <fieldset>
          <label for="name">姓名</label>
          <input id="name" defaultValue="张三" />
        </fieldset>
        
        <div style="display: flex; gap: 25px; justify-content: flex-end;">
          <Dialog.Close as-child>
            <button>取消</button>
          </Dialog.Close>
          <Dialog.Close as-child>
            <button>保存</button>
          </Dialog.Close>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
</template>
```

### Radix UI 示例

```jsx
import * as React from 'react'
import { Dialog } from 'radix-ui'

export default () => {
  const [open, setOpen] = React.useState(false)
  
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button>编辑资料</button>
      </Dialog.Trigger>
      
      <Dialog.Portal>
        <Dialog.Overlay className="DialogOverlay" />
        <Dialog.Content className="DialogContent">
          <Dialog.Title>编辑资料</Dialog.Title>
          <Dialog.Description>
            在这里修改你的资料，完成后点击保存。
          </Dialog.Description>
          
          <fieldset>
            <label htmlFor="name">姓名</label>
            <input id="name" defaultValue="张三" />
          </fieldset>
          
          <div style={{ display: 'flex', gap: 25, justifyContent: 'flex-end' }}>
            <Dialog.Close asChild>
              <button>取消</button>
            </Dialog.Close>
            <Dialog.Close asChild>
              <button>保存</button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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

- Root: 无特殊角色
- Trigger: 无特殊角色
- Overlay: 无特殊角色
- Content: `role="dialog"` + `aria-modal="true"` + `aria-labelledby` + `aria-describedby`
- Title: 无特殊角色，通过 aria-labelledby 关联
- Description: 无特殊角色，通过 aria-describedby 关联

### 键盘交互

| 按键 | 行为 |
|------|------|
| Tab | 在对话框内移动焦点 |
| Shift + Tab | 反向移动焦点 |
| Escape | 关闭对话框 |

## Rota 实现建议

### 1. 基于 Rasen 的实现

```typescript
import { reactive, provide, inject } from '@rasen/core'

export const Dialog = {
  Root: defineComponent({
    props: {
      defaultOpen: { type: Boolean, default: false },
      open: Boolean
    },
    emits: ['update:open'],
    setup(props, { emit, slots }) {
      const state = reactive({
        open: props.open ?? props.defaultOpen
      })
      
      const open = computed(() => props.open ?? state.open)
      
      const setOpen = (value: boolean) => {
        state.open = value
        emit('update:open', value)
      }
      
      provide('dialog', { open, setOpen })
      
      return () => slots.default?.()
    }
  }),
  
  Content: defineComponent({
    setup(props, { slots }) {
      const { open } = inject('dialog')
      
      return () => {
        if (!open.value && !props.forceMount) return null
        
        return (
          <div
            role="dialog"
            aria-modal="true"
            data-state={open.value ? 'open' : 'closed'}
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

1. **Portal**: 使用 Rasen 的 Portal 功能渲染到 body
2. **焦点管理**: 打开时聚焦，关闭时恢复焦点
3. **键盘交互**: ESC 关闭，Tab 循环
4. **滚动锁定**: 打开时禁止背景滚动
5. **无障碍**: 完整的 ARIA 支持

### 3. 实现优先级

- [x] 基础结构
- [ ] Portal 渲染
- [ ] 焦点管理
- [ ] 键盘交互
- [ ] 滚动锁定
- [ ] 动画支持
