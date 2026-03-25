# Popover 弹出框组件

## 组件概述

Popover 是一个浮动的容器，由按钮触发，用于显示富文本内容。与 Tooltip 不同，Popover 支持更复杂的内容和交互。常用于设置面板、信息卡片、表单等场景。

## Reka UI API

### 组件结构

```vue
<Popover.Root>
  <Popover.Trigger />
  <Popover.Anchor />
  <Popover.Portal>
    <Popover.Content>
      <Popover.Arrow />
      <Popover.Close />
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
```

### Root Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| defaultOpen | boolean | false | 默认是否打开 |
| open | boolean | - | 受控的打开状态 |
| onOpenChange | (open: boolean) => void | - | 状态变化回调 |
| modal | boolean | false | 是否为模态 |

### Trigger Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素作为触发器 |

### Anchor Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素作为锚点 |

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
| align | 'start' \| 'center' \| 'end' | 'center' | 对齐方式 |
| alignOffset | number | 0 | 对齐偏移 |
| avoidCollisions | boolean | true | 避免碰撞 |
| collisionBoundary | Boundary \| Boundary[] | [] | 碰撞边界 |
| collisionPadding | number \| Padding | 0 | 碰撞内边距 |
| arrowPadding | number | 0 | 箭头内边距 |
| sticky | 'partial' \| 'always' | 'partial' | 粘性定位 |
| hideWhenDetached | boolean | false | 分离时隐藏 |
| onOpenAutoFocus | (event: Event) => void | - | 打开时自动聚焦回调 |
| onCloseAutoFocus | (event: Event) => void | - | 关闭时自动聚焦回调 |
| onEscapeKeyDown | (event: KeyboardEvent) => void | - | ESC键按下回调 |
| onPointerDownOutside | (event: PointerDownOutsideEvent) => void | - | 外部点击回调 |
| onFocusOutside | (event: FocusOutsideEvent) => void | - | 外部聚焦回调 |
| onInteractOutside | (event: InteractOutsideEvent) => void | - | 外部交互回调 |

### Arrow Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| width | number | 10 | 箭头宽度 |
| height | number | 5 | 箭头高度 |

### Close Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### Data Attributes

**Trigger**
- `data-state`: 'open' | 'closed'

**Content**
- `data-state': 'open' | 'closed'
- `data-side`: 'top' | 'right' | 'bottom' | 'left'
- `data-align': 'start' | 'center' | 'end'

### CSS Variables

- `--radix-popover-content-transform-origin`: 内容变换原点
- `--radix-popover-content-available-width`: 可用宽度
- `--radix-popover-content-available-height`: 可用高度
- `--radix-popover-trigger-width`: 触发器宽度
- `--radix-popover-trigger-height`: 触发器高度

## Radix UI API

与 Reka UI 完全一致。

## 使用示例对比

### Reka UI 示例

```vue
<script setup>
import { Popover } from 'reka-ui'
import { ref } from 'vue'

const open = ref(false)
</script>

<template>
  <Popover.Root v-model:open="open">
    <Popover.Trigger as-child>
      <button>设置尺寸</button>
    </Popover.Trigger>
    
    <Popover.Portal>
      <Popover.Content 
        class="PopoverContent" 
        :side-offset="5"
      >
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <p style="margin-bottom: 10px;">尺寸设置</p>
          
          <fieldset>
            <label for="width">宽度</label>
            <input id="width" defaultValue="100%" />
          </fieldset>
          
          <fieldset>
            <label for="height">高度</label>
            <input id="height" defaultValue="25px" />
          </fieldset>
        </div>
        
        <Popover.Close class="PopoverClose">
          关闭
        </Popover.Close>
        
        <Popover.Arrow class="PopoverArrow" />
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
</template>
```

### Radix UI 示例

```jsx
import * as React from 'react'
import { Popover } from 'radix-ui'

export default () => {
  const [open, setOpen] = React.useState(false)
  
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button>设置尺寸</button>
      </Popover.Trigger>
      
      <Popover.Portal>
        <Popover.Content 
          className="PopoverContent" 
          sideOffset={5}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ marginBottom: 10 }}>尺寸设置</p>
            
            <fieldset>
              <label htmlFor="width">宽度</label>
              <input id="width" defaultValue="100%" />
            </fieldset>
            
            <fieldset>
              <label htmlFor="height">高度</label>
              <input id="height" defaultValue="25px" />
            </fieldset>
          </div>
          
          <Popover.Close className="PopoverClose">
            关闭
          </Popover.Close>
          
          <Popover.Arrow className="PopoverArrow" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
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

- Content: `role="dialog"` + `aria-modal="true"`（modal模式）

### 键盘交互

| 按键 | 行为 |
|------|------|
| Space / Enter | 打开/关闭弹出框 |
| Tab | 在弹出框内移动焦点 |
| Shift + Tab | 反向移动焦点 |
| Escape | 关闭弹出框 |

## Rota 实现建议

### 1. 基于 Rasen 的实现

```typescript
import { reactive, computed } from '@rasen/core'
import { useFloating, offset, flip, shift, arrow } from '@floating-ui/dom'

export const Popover = {
  Root: defineComponent({
    props: {
      defaultOpen: { type: Boolean, default: false },
      open: Boolean,
      modal: { type: Boolean, default: false }
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
      
      provide('popover', { isOpen, setOpen, modal: props.modal })
      
      return () => slots.default?.()
    }
  }),
  
  Content: defineComponent({
    props: {
      side: { type: String, default: 'bottom' },
      sideOffset: { type: Number, default: 0 },
      align: { type: String, default: 'center' },
      alignOffset: { type: Number, default: 0 },
      avoidCollisions: { type: Boolean, default: true }
    },
    setup(props, { slots }) {
      const { isOpen } = inject('popover')
      const triggerRef = ref<HTMLElement>()
      const contentRef = ref<HTMLElement>()
      
      const { floatingStyles, middlewareData } = useFloating(
        triggerRef,
        contentRef,
        {
          placement: props.side,
          middleware: [
            offset(props.sideOffset),
            flip({ enabled: props.avoidCollisions }),
            shift({ padding: props.collisionPadding })
          ]
        }
      )
      
      return () => {
        if (!isOpen.value && !props.forceMount) return null
        
        return (
          <div
            ref={contentRef}
            style={floatingStyles.value}
            data-side={middlewareData.value.placement}
            data-align={props.align}
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

1. **定位**: 使用 Floating UI 进行智能定位
2. **碰撞检测**: 自动避免超出视口
3. **箭头**: 支持指向触发器的箭头
4. **Portal**: 渲染到 body 避免层叠问题
5. **焦点管理**: 可选的模态模式

### 3. 实现优先级

- [x] 基础结构
- [ ] Floating UI 集成
- [ ] 碰撞检测
- [ ] 箭头定位
- [ ] Portal 渲染
- [ ] 焦点管理
