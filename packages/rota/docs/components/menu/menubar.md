# Menubar 菜单栏组件

## 组件概述

Menubar 是一个视觉上持久化的菜单，常见于桌面应用程序，提供对一组一致命令的快速访问。常用于应用程序的顶部菜单栏。

## Reka UI API

### 组件结构

```vue
<Menubar.Root>
  <Menubar.Menu>
    <Menubar.Trigger />
    <Menubar.Portal>
      <Menubar.Content>
        <Menubar.Item />
        <Menubar.Separator />
        <Menubar.Group>
          <Menubar.Item />
        </Menubar.Group>
        <Menubar.CheckboxItem>
          <Menubar.ItemIndicator />
        </Menubar.CheckboxItem>
        <Menubar.RadioGroup>
          <Menubar.RadioItem>
            <Menubar.ItemIndicator />
          </Menubar.RadioItem>
        </Menubar.RadioGroup>
        <Menubar.Sub>
          <Menubar.SubTrigger />
          <Menubar.Portal>
            <Menubar.SubContent />
          </Menubar.Portal>
        </Menubar.Sub>
      </Menubar.Content>
    </Menubar.Portal>
  </Menubar.Menu>
</Menubar.Root>
```

### Root Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| value | string | - | 当前激活菜单 |
| defaultValue | string | - | 默认激活菜单 |
| onValueChange | (value: string) => void | - | 值变化回调 |
| dir | 'ltr' \| 'rtl' | 'ltr' | 文本方向 |
| loop | boolean | true | 键盘循环导航 |

### Menu Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| value | string | - | 菜单唯一标识 |

### Trigger Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| disabled | boolean | false | 是否禁用 |

### Portal Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| forceMount | boolean | false | 强制挂载 |
| container | HTMLElement | document.body | 挂载容器 |

### Content Props

与 DropdownMenu.Content 相同。

### Item Props

与 DropdownMenu.Item 相同。

### 其他组件

Separator, Group, CheckboxItem, RadioGroup, RadioItem, ItemIndicator, Sub, SubTrigger, SubContent 的 API 与 DropdownMenu 对应组件完全一致。

### Data Attributes

**Trigger**
- `data-state': 'open' | 'closed'
- `data-disabled': 存在时表示禁用

**Content**
- `data-state': 'open' | 'closed'

其他组件的 Data Attributes 与 DropdownMenu 一致。

## Radix UI API

与 Reka UI 完全一致。

## 使用示例对比

### Reka UI 示例

```vue
<script setup>
import { Menubar } from 'reka-ui'
import { ref } from 'vue'

const checked = ref(true)
const person = ref('pedro')
</script>

<template>
  <Menubar.Root class="MenubarRoot">
    <Menubar.Menu>
      <Menubar.Trigger class="MenubarTrigger">
        文件
      </Menubar.Trigger>
      <Menubar.Portal>
        <Menubar.Content class="MenubarContent" :side-offset="5">
          <Menubar.Item class="MenubarItem">
            新标签页 <div class="RightSlot">⌘+T</div>
          </Menubar.Item>
          <Menubar.Item class="MenubarItem">
            新窗口 <div class="RightSlot">⌘+N</div>
          </Menubar.Item>
          <Menubar.Separator class="MenubarSeparator" />
          <Menubar.Item class="MenubarItem">
            关闭窗口 <div class="RightSlot">⌘+W</div>
          </Menubar.Item>
        </Menubar.Content>
      </Menubar.Portal>
    </Menubar.Menu>
    
    <Menubar.Menu>
      <Menubar.Trigger class="MenubarTrigger">
        编辑
      </Menubar.Trigger>
      <Menubar.Portal>
        <Menubar.Content class="MenubarContent" :side-offset="5">
          <Menubar.Item class="MenubarItem">
            撤销 <div class="RightSlot">⌘+Z</div>
          </Menubar.Item>
          <Menubar.Item class="MenubarItem">
            重做 <div class="RightSlot">⇧+⌘+Z</div>
          </Menubar.Item>
          <Menubar.Separator class="MenubarSeparator" />
          <Menubar.Item class="MenubarItem">
            剪切 <div class="RightSlot">⌘+X</div>
          </Menubar.Item>
          <Menubar.Item class="MenubarItem">
            复制 <div class="RightSlot">⌘+C</div>
          </Menubar.Item>
          <Menubar.Item class="MenubarItem">
            粘贴 <div class="RightSlot">⌘+V</div>
          </Menubar.Item>
        </Menubar.Content>
      </Menubar.Portal>
    </Menubar.Menu>
    
    <Menubar.Menu>
      <Menubar.Trigger class="MenubarTrigger">
        视图
      </Menubar.Trigger>
      <Menubar.Portal>
        <Menubar.Content class="MenubarContent" :side-offset="5">
          <Menubar.CheckboxItem 
            class="MenubarCheckboxItem"
            v-model:checked="checked"
          >
            <Menubar.ItemIndicator class="MenubarItemIndicator">
              <CheckIcon />
            </Menubar.ItemIndicator>
            显示状态栏
          </Menubar.CheckboxItem>
        </Menubar.Content>
      </Menubar.Portal>
    </Menubar.Menu>
  </Menubar.Root>
</template>
```

### Radix UI 示例

```jsx
import * as React from 'react'
import { Menubar } from 'radix-ui'

export default () => {
  const [checked, setChecked] = React.useState(true)
  const [person, setPerson] = React.useState('pedro')
  
  return (
    <Menubar.Root className="MenubarRoot">
      <Menubar.Menu>
        <Menubar.Trigger className="MenubarTrigger">
          文件
        </Menubar.Trigger>
        <Menubar.Portal>
          <Menubar.Content className="MenubarContent" sideOffset={5}>
            <Menubar.Item className="MenubarItem">
              新标签页 <div className="RightSlot">⌘+T</div>
            </Menubar.Item>
            <Menubar.Item className="MenubarItem">
              新窗口 <div className="RightSlot">⌘+N</div>
            </Menubar.Item>
            <Menubar.Separator className="MenubarSeparator" />
            <Menubar.Item className="MenubarItem">
              关闭窗口 <div className="RightSlot">⌘+W</div>
            </Menubar.Item>
          </Menubar.Content>
        </Menubar.Portal>
      </Menubar.Menu>
      
      <Menubar.Menu>
        <Menubar.Trigger className="MenubarTrigger">
          编辑
        </Menubar.Trigger>
        <Menubar.Portal>
          <Menubar.Content className="MenubarContent" sideOffset={5}>
            <Menubar.Item className="MenubarItem">
              撤销 <div className="RightSlot">⌘+Z</div>
            </Menubar.Item>
            <Menubar.Item className="MenubarItem">
              重做 <div className="RightSlot">⇧+⌘+Z</div>
            </Menubar.Item>
            <Menubar.Separator className="MenubarSeparator" />
            <Menubar.Item className="MenubarItem">
              剪切 <div className="RightSlot">⌘+X</div>
            </Menubar.Item>
            <Menubar.Item className="MenubarItem">
              复制 <div className="RightSlot">⌘+C</div>
            </Menubar.Item>
            <Menubar.Item className="MenubarItem">
              粘贴 <div className="RightSlot">⌘+V</div>
            </Menubar.Item>
          </Menubar.Content>
        </Menubar.Portal>
      </Menubar.Menu>
      
      <Menubar.Menu>
        <Menubar.Trigger className="MenubarTrigger">
          视图
        </Menubar.Trigger>
        <Menubar.Portal>
          <Menubar.Content className="MenubarContent" sideOffset={5}>
            <Menubar.CheckboxItem 
              className="MenubarCheckboxItem"
              checked={checked}
              onCheckedChange={setChecked}
            >
              <Menubar.ItemIndicator className="MenubarItemIndicator">
                <CheckIcon />
              </Menubar.ItemIndicator>
              显示状态栏
            </Menubar.CheckboxItem>
          </Menubar.Content>
        </Menubar.Portal>
      </Menubar.Menu>
    </Menubar.Root>
  )
}
```

## 差异分析

### 与 DropdownMenu 的区别

| 特性 | Menubar | DropdownMenu |
|------|---------|--------------|
| 结构 | 多个 Menu 组成 | 单个 Root |
| 持久性 | 始终可见 | 点击触发 |
| 激活方式 | 点击/Alt+F | 点击触发器 |
| 键盘导航 | 左右切换菜单 | 无 |

### API 差异

| 特性 | Reka UI | Radix UI | 说明 |
|------|---------|----------|------|
| 双向绑定 | v-model:checked | checked + onCheckedChange | Vue vs React |
| 组件结构 | 完全一致 | 完全一致 | 无差异 |
| Props | 完全一致 | 完全一致 | 无差异 |

## 可访问性

### WAI-ARIA 角色

- Root: `role="menubar"`
- Menu: 无特殊角色
- Trigger: 无特殊角色
- Content: `role="menu"`
- Item: `role="menuitem"`
- CheckboxItem: `role="menuitemcheckbox"`
- RadioItem: `role="menuitemradio"`

### 键盘交互

| 按键 | 行为 |
|------|------|
| Space / Enter | 打开菜单 / 选择项 |
| ArrowDown | 打开菜单 / 移动到下一项 |
| ArrowUp | 移动到上一项 |
| ArrowRight | 下一个菜单 / 打开子菜单 |
| ArrowLeft | 上一个菜单 / 关闭子菜单 |
| Escape | 关闭菜单 |
| Home | 移动到第一项 |
| End | 移动到最后一项 |
| Alt + F | 激活第一个菜单（可选） |

## Rota 实现建议

### 1. 基于 Rasen 的实现

Menubar 本质上是多个 Menu 的组合，可以复用 DropdownMenu 的内部实现：

```typescript
import { reactive, provide, inject } from '@rasen/core'

export const Menubar = {
  Root: defineComponent({
    props: {
      defaultValue: String,
      value: String,
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
      
      provide('menubar', { 
        value: currentValue, 
        setValue, 
        loop: props.loop 
      })
      
      return () => (
        <div role="menubar">
          {slots.default?.()}
        </div>
      )
    }
  }),
  
  Menu: defineComponent({
    props: {
      value: { type: String, required: true }
    },
    setup(props, { slots }) {
      const { value: currentValue, setValue } = inject('menubar')
      
      const isOpen = computed(() => currentValue.value === props.value)
      
      provide('menubar-menu', { 
        isOpen, 
        value: props.value,
        setOpen: (open: boolean) => setValue(open ? props.value : '')
      })
      
      return () => slots.default?.({ isOpen })
    }
  }),
  
  Trigger: defineComponent({
    setup(props, { slots }) {
      const { isOpen, setOpen } = inject('menubar-menu')
      const { value: currentValue, setValue, loop } = inject('menubar')
      
      const handleClick = () => {
        setOpen(!isOpen.value)
      }
      
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setOpen(true)
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          // 切换到相邻菜单
          // 实现菜单切换逻辑
        }
      }
      
      return () => (
        <button
          data-state={isOpen.value ? 'open' : 'closed'}
          onClick={handleClick}
          onKeydown={handleKeyDown}
        >
          {slots.default?.()}
        </button>
      )
    }
  })
}
```

### 2. 关键特性

1. **多菜单组合**: 多个 Menu 协同工作
2. **键盘导航**: 左右键切换菜单
3. **持久可见**: 始终显示在界面上
4. **复用 DropdownMenu**: 内部可复用 DropdownMenu 组件
5. **Alt 快捷键**: 支持 Alt+F 等快捷键

### 3. 实现优先级

- [x] 基础结构
- [ ] 多菜单协调
- [ ] 键盘导航（左右切换）
- [ ] 复用 DropdownMenu
- [ ] Alt 快捷键
