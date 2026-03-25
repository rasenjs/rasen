# AlertDialog 警告对话框组件

## 组件概述

AlertDialog 是一种特殊的模态对话框，用于中断用户操作并要求确认重要操作。常用于删除确认、不可逆操作警告等场景。

## Reka UI API

### 组件结构

```vue
<AlertDialog.Root>
  <AlertDialog.Trigger />
  <AlertDialog.Portal>
    <AlertDialog.Overlay />
    <AlertDialog.Content>
      <AlertDialog.Title />
      <AlertDialog.Description />
      <AlertDialog.Cancel />
      <AlertDialog.Action />
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog.Root>
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

### Cancel Props

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
import { AlertDialog } from 'reka-ui'
</script>

<template>
  <AlertDialog.Root>
    <AlertDialog.Trigger as-child>
      <button class="Button red">删除账户</button>
    </AlertDialog.Trigger>
    
    <AlertDialog.Portal>
      <AlertDialog.Overlay class="AlertDialogOverlay" />
      <AlertDialog.Content class="AlertDialogContent">
        <AlertDialog.Title class="AlertDialogTitle">
          确定要删除吗？
        </AlertDialog.Title>
        <AlertDialog.Description class="AlertDialogDescription">
          此操作无法撤销。这将永久删除您的账户并从我们的服务器中删除您的数据。
        </AlertDialog.Description>
        <div style="display: flex; gap: 25px; justify-content: flex-end;">
          <AlertDialog.Cancel as-child>
            <button class="Button mauve">取消</button>
          </AlertDialog.Cancel>
          <AlertDialog.Action as-child>
            <button class="Button red">是的，删除账户</button>
          </AlertDialog.Action>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>
</template>
```

### Radix UI 示例

```jsx
import * as React from 'react'
import { AlertDialog } from 'radix-ui'

export default () => {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <button className="Button red">删除账户</button>
      </AlertDialog.Trigger>
      
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="AlertDialogOverlay" />
        <AlertDialog.Content className="AlertDialogContent">
          <AlertDialog.Title className="AlertDialogTitle">
            确定要删除吗？
          </AlertDialog.Title>
          <AlertDialog.Description className="AlertDialogDescription">
            此操作无法撤销。这将永久删除您的账户并从我们的服务器中删除您的数据。
          </AlertDialog.Description>
          <div style={{ display: 'flex', gap: 25, justifyContent: 'flex-end' }}>
            <AlertDialog.Cancel asChild>
              <button className="Button mauve">取消</button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button className="Button red">是的，删除账户</button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
```

## 差异分析

### 与 Dialog 的区别

| 特性 | AlertDialog | Dialog |
|------|-------------|--------|
| 用途 | 警告、确认 | 通用对话框 |
| 焦点管理 | 聚焦到 Action 按钮 | 聚焦到第一个可聚焦元素 |
| 关闭方式 | 只能通过按钮关闭 | ESC、点击外部都可关闭 |
| 语义 | `role="alertdialog"` | `role="dialog"` |

## 可访问性

### WAI-ARIA 角色

- Content: `role="alertdialog"` + `aria-modal="true"` + `aria-labelledby` + `aria-describedby`

### 键盘交互

| 按键 | 行为 |
|------|------|
| Tab | 在对话框内移动焦点 |
| Shift + Tab | 反向移动焦点 |
| Escape | 无效（必须明确选择） |

## Rota 实现建议

### 1. 基于 Rasen 的实现

AlertDialog 与 Dialog 的实现基本相同，主要区别在于：
1. 使用 `role="alertdialog"` 而非 `role="dialog"`
2. 焦点默认聚焦到 Action 按钮
3. 禁止通过 ESC 或点击外部关闭

```typescript
export const AlertDialog = {
  Content: defineComponent({
    setup(props, { slots }) {
      const { open } = inject('alert-dialog')
      
      return () => {
        if (!open.value && !props.forceMount) return null
        
        return (
          <div
            role="alertdialog"
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

### 2. 实现优先级

- [x] 基础结构
- [ ] 焦点管理（聚焦到 Action）
- [ ] 禁止外部关闭
- [ ] 动画支持
