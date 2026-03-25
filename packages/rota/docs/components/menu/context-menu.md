# ContextMenu 右键菜单组件

## 组件概述

ContextMenu 是一个在用户右键点击或长按时显示的菜单。常用于提供上下文相关的操作选项，如复制、粘贴、删除等。

## Reka UI API

### 组件结构

```vue
<ContextMenu.Root>
  <ContextMenu.Trigger />
  <ContextMenu.Portal>
    <ContextMenu.Content>
      <ContextMenu.Label />
      <ContextMenu.Item />
      <ContextMenu.Group>
        <ContextMenu.Item />
      </ContextMenu.Group>
      <ContextMenu.CheckboxItem>
        <ContextMenu.ItemIndicator />
      </ContextMenu.CheckboxItem>
      <ContextMenu.RadioGroup>
        <ContextMenu.RadioItem>
          <ContextMenu.ItemIndicator />
        </ContextMenu.RadioItem>
      </ContextMenu.RadioGroup>
      <ContextMenu.Sub>
        <ContextMenu.SubTrigger />
        <ContextMenu.Portal>
          <ContextMenu.SubContent />
        </ContextMenu.Portal>
      </ContextMenu.Sub>
      <ContextMenu.Separator />
    </ContextMenu.Content>
  </ContextMenu.Portal>
</ContextMenu.Root>
```

### Root Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| onOpenChange | (open: boolean) => void | - | 状态变化回调 |
| dir | 'ltr' \| 'rtl' | 'ltr' | 文本方向 |
| modal | boolean | true | 是否为模态 |

### Trigger Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素作为触发器 |
| disabled | boolean | false | 是否禁用 |

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
| sideOffset | number | 0 | 位置偏移 |
| alignOffset | number | 0 | 对齐偏移 |
| avoidCollisions | boolean | true | 避免碰撞 |
| collisionBoundary | Boundary \| Boundary[] | [] | 碰撞边界 |
| collisionPadding | number \| Padding | 0 | 碰撞内边距 |
| onCloseAutoFocus | (event: Event) => void | - | 关闭时自动聚焦回调 |
| onEscapeKeyDown | (event: KeyboardEvent) => void | - | ESC键按下回调 |
| onPointerDownOutside | (event: PointerDownOutsideEvent) => void | - | 外部点击回调 |

### Item Props

与 DropdownMenu.Item 相同。

### 其他组件

Label, Separator, Group, CheckboxItem, RadioGroup, RadioItem, ItemIndicator, Sub, SubTrigger, SubContent 的 API 与 DropdownMenu 对应组件完全一致。

### Data Attributes

**Trigger**
- `data-state`: 'open' | 'closed'

**Content**
- `data-state': 'open' | 'closed'

其他组件的 Data Attributes 与 DropdownMenu 一致。

## Radix UI API

与 Reka UI 完全一致。

## 使用示例对比

### Reka UI 示例

```vue
<script setup>
import { ContextMenu } from 'reka-ui'
import { ref } from 'vue'

const bookmarksChecked = ref(true)
const urlsChecked = ref(false)
const person = ref('pedro')
</script>

<template>
  <ContextMenu.Root>
    <ContextMenu.Trigger class="ContextMenuTrigger">
      右键点击这里。
    </ContextMenu.Trigger>
    
    <ContextMenu.Portal>
      <ContextMenu.Content class="ContextMenuContent" :side-offset="5">
        <ContextMenu.Item class="ContextMenuItem">
          后退 <div class="RightSlot">⌘+[</div>
        </ContextMenu.Item>
        <ContextMenu.Item class="ContextMenuItem" disabled>
          前进 <div class="RightSlot">⌘+]</div>
        </ContextMenu.Item>
        <ContextMenu.Item class="ContextMenuItem">
          刷新 <div class="RightSlot">⌘+R</div>
        </ContextMenu.Item>
        
        <ContextMenu.Separator class="ContextMenuSeparator" />
        
        <ContextMenu.CheckboxItem 
          class="ContextMenuCheckboxItem"
          v-model:checked="bookmarksChecked"
        >
          <ContextMenu.ItemIndicator class="ContextMenuItemIndicator">
            <CheckIcon />
          </ContextMenu.ItemIndicator>
          显示书签 <div class="RightSlot">⌘+B</div>
        </ContextMenu.CheckboxItem>
        
        <ContextMenu.Separator class="ContextMenuSeparator" />
        
        <ContextMenu.Label class="ContextMenuLabel">
          人员
        </ContextMenu.Label>
        <ContextMenu.RadioGroup v-model="person">
          <ContextMenu.RadioItem class="ContextMenuRadioItem" value="pedro">
            <ContextMenu.ItemIndicator class="ContextMenuItemIndicator">
              <DotFilledIcon />
            </ContextMenu.ItemIndicator>
            Pedro Duarte
          </ContextMenu.RadioItem>
        </ContextMenu.RadioGroup>
      </ContextMenu.Content>
    </ContextMenu.Portal>
  </ContextMenu.Root>
</template>
```

### Radix UI 示例

```jsx
import * as React from 'react'
import { ContextMenu } from 'radix-ui'

export default () => {
  const [bookmarksChecked, setBookmarksChecked] = React.useState(true)
  const [urlsChecked, setUrlsChecked] = React.useState(false)
  const [person, setPerson] = React.useState('pedro')
  
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger className="ContextMenuTrigger">
        右键点击这里。
      </ContextMenu.Trigger>
      
      <ContextMenu.Portal>
        <ContextMenu.Content className="ContextMenuContent" sideOffset={5}>
          <ContextMenu.Item className="ContextMenuItem">
            后退 <div className="RightSlot">⌘+[</div>
          </ContextMenu.Item>
          <ContextMenu.Item className="ContextMenuItem" disabled>
            前进 <div className="RightSlot">⌘+]</div>
          </ContextMenu.Item>
          <ContextMenu.Item className="ContextMenuItem">
            刷新 <div className="RightSlot">⌘+R</div>
          </ContextMenu.Item>
          
          <ContextMenu.Separator className="ContextMenuSeparator" />
          
          <ContextMenu.CheckboxItem 
            className="ContextMenuCheckboxItem"
            checked={bookmarksChecked}
            onCheckedChange={setBookmarksChecked}
          >
            <ContextMenu.ItemIndicator className="ContextMenuItemIndicator">
              <CheckIcon />
            </ContextMenu.ItemIndicator>
            显示书签 <div className="RightSlot">⌘+B</div>
          </ContextMenu.CheckboxItem>
          
          <ContextMenu.Separator className="ContextMenuSeparator" />
          
          <ContextMenu.Label className="ContextMenuLabel">
            人员
          </ContextMenu.Label>
          <ContextMenu.RadioGroup value={person} onValueChange={setPerson}>
            <ContextMenu.RadioItem className="ContextMenuRadioItem" value="pedro">
              <ContextMenu.ItemIndicator className="ContextMenuItemIndicator">
                <DotFilledIcon />
              </ContextMenu.ItemIndicator>
              Pedro Duarte
            </ContextMenu.RadioItem>
          </ContextMenu.RadioGroup>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
```

## 差异分析

### 与 DropdownMenu 的区别

| 特性 | ContextMenu | DropdownMenu |
|------|-------------|--------------|
| 触发方式 | 右键/长按 | 点击 |
| 位置 | 鼠标位置 | 触发器位置 |
| 默认 modal | true | true |
| 受控打开 | 不支持 | 支持 |

### API 差异

| 特性 | Reka UI | Radix UI | 说明 |
|------|---------|----------|------|
| 双向绑定 | v-model:checked | checked + onCheckedChange | Vue vs React |
| 组件结构 | 完全一致 | 完全一致 | 无差异 |
| Props | 完全一致 | 完全一致 | 无差异 |

## 可访问性

### WAI-ARIA 角色

与 DropdownMenu 相同。

### 键盘交互

| 按键 | 行为 |
|------|------|
| Space / Enter | 选择高亮项 |
| ArrowDown | 移动焦点到下一项 |
| ArrowUp | 移动焦点到上一项 |
| ArrowRight | 打开子菜单 |
| ArrowLeft | 关闭子菜单 |
| Escape | 关闭菜单 |
| Home | 移动焦点到第一项 |
| End | 移动焦点到最后一项 |

### 触摸设备

- 长按触发菜单
- 点击外部关闭菜单

## Rota 实现建议

### 1. 基于 Rasen 的实现

ContextMenu 与 DropdownMenu 的主要区别在于触发方式和定位：

```typescript
import { reactive, provide, inject } from '@rasen/core'

export const ContextMenu = {
  Root: defineComponent({
    props: {
      modal: { type: Boolean, default: true }
    },
    setup(props, { slots }) {
      const state = reactive({
        open: false,
        position: { x: 0, y: 0 }
      })
      
      const setOpen = (value: boolean, position?: { x: number; y: number }) => {
        state.open = value
        if (position) {
          state.position = position
        }
      }
      
      provide('context-menu', { 
        isOpen: computed(() => state.open), 
        setOpen, 
        position: computed(() => state.position),
        modal: props.modal 
      })
      
      return () => slots.default?.()
    }
  }),
  
  Trigger: defineComponent({
    setup(props, { slots }) {
      const { setOpen } = inject('context-menu')
      
      const handleContextMenu = (e: MouseEvent) => {
        e.preventDefault()
        setOpen(true, { x: e.clientX, y: e.clientY })
      }
      
      return () => (
        <div onContextMenu={handleContextMenu}>
          {slots.default?.()}
        </div>
      )
    }
  }),
  
  Content: defineComponent({
    setup(props, { slots }) {
      const { isOpen, position } = inject('context-menu')
      
      return () => {
        if (!isOpen.value && !props.forceMount) return null
        
        return (
          <div
            role="menu"
            style={{
              position: 'fixed',
              left: `${position.value.x}px`,
              top: `${position.value.y}px`
            }}
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

1. **右键触发**: 监听 contextmenu 事件
2. **鼠标位置定位**: 在鼠标点击位置显示
3. **长按支持**: 触摸设备支持
4. **键盘导航**: 完整的键盘支持
5. **子菜单**: 支持嵌套菜单

### 3. 实现优先级

- [x] 基础结构
- [ ] 右键触发
- [ ] 鼠标位置定位
- [ ] 键盘导航
- [ ] 长按支持
- [ ] 子菜单
