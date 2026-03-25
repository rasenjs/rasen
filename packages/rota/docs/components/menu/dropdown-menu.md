# DropdownMenu 下拉菜单组件

## 组件概述

DropdownMenu 是一个由按钮触发的菜单，显示一组操作或功能选项。常用于操作菜单、设置选项、导航链接等场景。

## Reka UI API

### 组件结构

```vue
<DropdownMenu.Root>
  <DropdownMenu.Trigger />
  <DropdownMenu.Portal>
    <DropdownMenu.Content>
      <DropdownMenu.Label />
      <DropdownMenu.Item />
      <DropdownMenu.Group>
        <DropdownMenu.Item />
      </DropdownMenu.Group>
      <DropdownMenu.CheckboxItem>
        <DropdownMenu.ItemIndicator />
      </DropdownMenu.CheckboxItem>
      <DropdownMenu.RadioGroup>
        <DropdownMenu.RadioItem>
          <DropdownMenu.ItemIndicator />
        </DropdownMenu.RadioItem>
      </DropdownMenu.RadioGroup>
      <DropdownMenu.Sub>
        <DropdownMenu.SubTrigger />
        <DropdownMenu.Portal>
          <DropdownMenu.SubContent />
        </DropdownMenu.Portal>
      </DropdownMenu.Sub>
      <DropdownMenu.Separator />
      <DropdownMenu.Arrow />
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
```

### Root Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| defaultOpen | boolean | false | 默认是否打开 |
| open | boolean | - | 受控的打开状态 |
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
| side | 'top' \| 'right' \| 'bottom' \| 'left' | 'bottom' | 显示位置 |
| sideOffset | number | 0 | 位置偏移 |
| align | 'start' \| 'center' \| 'end' | 'start' | 对齐方式 |
| alignOffset | number | 0 | 对齐偏移 |
| avoidCollisions | boolean | true | 避免碰撞 |
| collisionBoundary | Boundary \| Boundary[] | [] | 碰撞边界 |
| collisionPadding | number \| Padding | 0 | 碰撞内边距 |
| arrowPadding | number | 0 | 箭头内边距 |
| onCloseAutoFocus | (event: Event) => void | - | 关闭时自动聚焦回调 |
| onEscapeKeyDown | (event: KeyboardEvent) => void | - | ESC键按下回调 |
| onPointerDownOutside | (event: PointerDownOutsideEvent) => void | - | 外部点击回调 |
| onFocusOutside | (event: FocusOutsideEvent) => void | - | 外部聚焦回调 |
| onInteractOutside | (event: InteractOutsideEvent) => void | - | 外部交互回调 |

### Item Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| disabled | boolean | false | 是否禁用 |
| onSelect | (event: Event) => void | - | 选择回调 |
| textValue | string | - | 文本值（用于搜索） |

### Label Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### Separator Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### Group Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### CheckboxItem Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| checked | boolean \| 'indeterminate' | - | 选中状态 |
| defaultChecked | boolean | false | 默认选中 |
| onCheckedChange | (checked: boolean) => void | - | 选中变化回调 |
| disabled | boolean | false | 是否禁用 |
| onSelect | (event: Event) => void | - | 选择回调 |

### RadioGroup Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| value | string | - | 当前值 |
| defaultValue | string | - | 默认值 |
| onValueChange | (value: string) => void | - | 值变化回调 |

### RadioItem Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| value | string | - | 值（必需） |
| disabled | boolean | false | 是否禁用 |
| onSelect | (event: Event) => void | - | 选择回调 |

### ItemIndicator Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| forceMount | boolean | false | 强制挂载 |

### Sub Props

无特殊属性。

### SubTrigger Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| disabled | boolean | false | 是否禁用 |

### SubContent Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| forceMount | boolean | false | 强制挂载 |
| sideOffset | number | 0 | 位置偏移 |
| alignOffset | number | 0 | 对齐偏移 |

### Arrow Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| width | number | 10 | 箭头宽度 |
| height | number | 5 | 箭头高度 |

### Data Attributes

**Trigger**
- `data-state`: 'open' | 'closed'
- `data-disabled`: 存在时表示禁用

**Item**
- `data-disabled`: 存在时表示禁用
- `data-highlighted`: 存在时表示高亮

**CheckboxItem**
- `data-state`: 'checked' | 'unchecked' | 'indeterminate'
- `data-disabled`: 存在时表示禁用
- `data-highlighted`: 存在时表示高亮

**RadioItem**
- `data-state`: 'checked' | 'unchecked'
- `data-disabled`: 存在时表示禁用
- `data-highlighted`: 存在时表示高亮

**SubTrigger**
- `data-state`: 'open' | 'closed'
- `data-disabled`: 存在时表示禁用
- `data-highlighted`: 存在时表示高亮

## Radix UI API

与 Reka UI 完全一致。

## 使用示例对比

### Reka UI 示例

```vue
<script setup>
import { DropdownMenu } from 'reka-ui'
import { ref } from 'vue'

const bookmarksChecked = ref(true)
const urlsChecked = ref(false)
const person = ref('pedro')
</script>

<template>
  <DropdownMenu.Root>
    <DropdownMenu.Trigger as-child>
      <button class="IconButton">
        <HamburgerMenuIcon />
      </button>
    </DropdownMenu.Trigger>
    
    <DropdownMenu.Portal>
      <DropdownMenu.Content class="DropdownMenuContent" :side-offset="5">
        <DropdownMenu.Item class="DropdownMenuItem">
          新标签页 <div class="RightSlot">⌘+T</div>
        </DropdownMenu.Item>
        <DropdownMenu.Item class="DropdownMenuItem">
          新窗口 <div class="RightSlot">⌘+N</div>
        </DropdownMenu.Item>
        
        <DropdownMenu.Separator class="DropdownMenuSeparator" />
        
        <DropdownMenu.CheckboxItem 
          class="DropdownMenuCheckboxItem"
          v-model:checked="bookmarksChecked"
        >
          <DropdownMenu.ItemIndicator class="DropdownMenuItemIndicator">
            <CheckIcon />
          </DropdownMenu.ItemIndicator>
          显示书签 <div class="RightSlot">⌘+B</div>
        </DropdownMenu.CheckboxItem>
        
        <DropdownMenu.Separator class="DropdownMenuSeparator" />
        
        <DropdownMenu.Label class="DropdownMenuLabel">
          人员
        </DropdownMenu.Label>
        <DropdownMenu.RadioGroup v-model="person">
          <DropdownMenu.RadioItem class="DropdownMenuRadioItem" value="pedro">
            <DropdownMenu.ItemIndicator class="DropdownMenuItemIndicator">
              <DotFilledIcon />
            </DropdownMenu.ItemIndicator>
            Pedro Duarte
          </DropdownMenu.RadioItem>
          <DropdownMenu.RadioItem class="DropdownMenuRadioItem" value="colm">
            <DropdownMenu.ItemIndicator class="DropdownMenuItemIndicator">
              <DotFilledIcon />
            </DropdownMenu.ItemIndicator>
            Colm Tuite
          </DropdownMenu.RadioItem>
        </DropdownMenu.RadioGroup>
        
        <DropdownMenu.Arrow class="DropdownMenuArrow" />
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
</template>
```

### Radix UI 示例

```jsx
import * as React from 'react'
import { DropdownMenu } from 'radix-ui'

export default () => {
  const [bookmarksChecked, setBookmarksChecked] = React.useState(true)
  const [urlsChecked, setUrlsChecked] = React.useState(false)
  const [person, setPerson] = React.useState('pedro')
  
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="IconButton">
          <HamburgerMenuIcon />
        </button>
      </DropdownMenu.Trigger>
      
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="DropdownMenuContent" sideOffset={5}>
          <DropdownMenu.Item className="DropdownMenuItem">
            新标签页 <div className="RightSlot">⌘+T</div>
          </DropdownMenu.Item>
          <DropdownMenu.Item className="DropdownMenuItem">
            新窗口 <div className="RightSlot">⌘+N</div>
          </DropdownMenu.Item>
          
          <DropdownMenu.Separator className="DropdownMenuSeparator" />
          
          <DropdownMenu.CheckboxItem 
            className="DropdownMenuCheckboxItem"
            checked={bookmarksChecked}
            onCheckedChange={setBookmarksChecked}
          >
            <DropdownMenu.ItemIndicator className="DropdownMenuItemIndicator">
              <CheckIcon />
            </DropdownMenu.ItemIndicator>
            显示书签 <div className="RightSlot">⌘+B</div>
          </DropdownMenu.CheckboxItem>
          
          <DropdownMenu.Separator className="DropdownMenuSeparator" />
          
          <DropdownMenu.Label className="DropdownMenuLabel">
            人员
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={person} onValueChange={setPerson}>
            <DropdownMenu.RadioItem className="DropdownMenuRadioItem" value="pedro">
              <DropdownMenu.ItemIndicator className="DropdownMenuItemIndicator">
                <DotFilledIcon />
              </DropdownMenu.ItemIndicator>
              Pedro Duarte
            </DropdownMenu.RadioItem>
            <DropdownMenu.RadioItem className="DropdownMenuRadioItem" value="colm">
              <DropdownMenu.ItemIndicator className="DropdownMenuItemIndicator">
                <DotFilledIcon />
              </DropdownMenu.ItemIndicator>
              Colm Tuite
            </DropdownMenu.RadioItem>
          </DropdownMenu.RadioGroup>
          
          <DropdownMenu.Arrow className="DropdownMenuArrow" />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
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

- Content: `role="menu"`
- Item: `role="menuitem"`
- CheckboxItem: `role="menuitemcheckbox"`
- RadioItem: `role="menuitemradio"`
- Label: 无特殊角色
- Separator: `role="separator"`

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

## Rota 实现建议

### 1. 基于 Rasen 的实现

```typescript
import { reactive, provide, inject } from '@rasen/core'

export const DropdownMenu = {
  Root: defineComponent({
    props: {
      defaultOpen: { type: Boolean, default: false },
      open: Boolean,
      modal: { type: Boolean, default: true }
    },
    emits: ['update:open'],
    setup(props, { emit, slots }) {
      const state = reactive({
        open: props.open ?? props.defaultOpen
      })
      
      const isOpen = computed(() => props.open ?? state.open)
      
      const setOpen = (value: boolean) => {
        state.open = value
        emit('update:open', value)
      }
      
      provide('dropdown-menu', { isOpen, setOpen, modal: props.modal })
      
      return () => slots.default?.()
    }
  }),
  
  Item: defineComponent({
    props: {
      disabled: { type: Boolean, default: false }
    },
    setup(props, { slots }) {
      const { setOpen } = inject('dropdown-menu')
      const highlighted = ref(false)
      
      const handleSelect = () => {
        if (props.disabled) return
        setOpen(false)
      }
      
      return () => (
        <div
          role="menuitem"
          data-disabled={props.disabled ? '' : undefined}
          data-highlighted={highlighted.value ? '' : undefined}
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

1. **复合组件**: Item, CheckboxItem, RadioItem, Sub
2. **键盘导航**: 完整的键盘支持
3. **焦点管理**: 自动聚焦和高亮
4. **子菜单**: 支持嵌套菜单
5. **类型搜索**: 支持输入搜索

### 3. 实现优先级

- [x] 基础结构
- [ ] 键盘导航
- [ ] 焦点管理
- [ ] 子菜单
- [ ] CheckboxItem
- [ ] RadioItem
- [ ] 类型搜索
