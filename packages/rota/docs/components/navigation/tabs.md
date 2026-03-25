# Tabs 标签页组件

## 组件概述

Tabs 是一组分层的内容区域，称为标签面板，一次只显示一个。常用于设置页面、内容分类、步骤导航等场景。

## Reka UI API

### 组件结构

```vue
<Tabs.Root>
  <Tabs.List>
    <Tabs.Trigger />
  </Tabs.List>
  <Tabs.Content />
</Tabs.Root>
```

### Root Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| defaultValue | string | - | 默认激活标签 |
| value | string | - | 受控值 |
| onValueChange | (value: string) => void | - | 值变化回调 |
| orientation | 'horizontal' \| 'vertical' | 'horizontal' | 方向 |
| dir | 'ltr' \| 'rtl' | 'ltr' | 文本方向 |
| activationMode | 'automatic' \| 'manual' | 'automatic' | 激活模式 |

### List Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### Trigger Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| value | string | - | 标签唯一标识（必需） |
| disabled | boolean | false | 是否禁用 |

### Content Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| value | string | - | 面板唯一标识（必需） |
| forceMount | boolean | false | 强制挂载 |

### Data Attributes

**Trigger**
- `data-state`: 'active' | 'inactive'
- `data-disabled`: 存在时表示禁用
- `data-orientation`: 'horizontal' | 'vertical'

**Content**
- `data-state`: 'active' | 'hidden'

## Radix UI API

与 Reka UI 完全一致。

## 使用示例对比

### Reka UI 示例

```vue
<script setup>
import { Tabs } from 'reka-ui'
import { ref } from 'vue'

const value = ref('tab1')
</script>

<template>
  <Tabs.Root class="TabsRoot" v-model="value">
    <Tabs.List class="TabsList" aria-label="管理账户">
      <Tabs.Trigger class="TabsTrigger" value="tab1">
        账户
      </Tabs.Trigger>
      <Tabs.Trigger class="TabsTrigger" value="tab2">
        密码
      </Tabs.Trigger>
    </Tabs.List>
    
    <Tabs.Content class="TabsContent" value="tab1">
      <p class="Text">
        在这里修改您的账户信息。完成后点击保存。
      </p>
      <fieldset>
        <label class="Label" for="name">姓名</label>
        <input class="Input" id="name" defaultValue="张三" />
      </fieldset>
      <fieldset>
        <label class="Label" for="username">用户名</label>
        <input class="Input" id="username" defaultValue="@zhangsan" />
      </fieldset>
    </Tabs.Content>
    
    <Tabs.Content class="TabsContent" value="tab2">
      <p class="Text">
        在这里修改您的密码。保存后您将需要重新登录。
      </p>
      <fieldset>
        <label class="Label" for="currentPassword">当前密码</label>
        <input class="Input" id="currentPassword" type="password" />
      </fieldset>
      <fieldset>
        <label class="Label" for="newPassword">新密码</label>
        <input class="Input" id="newPassword" type="password" />
      </fieldset>
      <fieldset>
        <label class="Label" for="confirmPassword">确认密码</label>
        <input class="Input" id="confirmPassword" type="password" />
      </fieldset>
    </Tabs.Content>
  </Tabs.Root>
</template>
```

### Radix UI 示例

```jsx
import * as React from 'react'
import { Tabs } from 'radix-ui'

export default () => {
  const [value, setValue] = React.useState('tab1')
  
  return (
    <Tabs.Root className="TabsRoot" value={value} onValueChange={setValue}>
      <Tabs.List className="TabsList" aria-label="管理账户">
        <Tabs.Trigger className="TabsTrigger" value="tab1">
          账户
        </Tabs.Trigger>
        <Tabs.Trigger className="TabsTrigger" value="tab2">
          密码
        </Tabs.Trigger>
      </Tabs.List>
      
      <Tabs.Content className="TabsContent" value="tab1">
        <p className="Text">
          在这里修改您的账户信息。完成后点击保存。
        </p>
        <fieldset>
          <label className="Label" htmlFor="name">姓名</label>
          <input className="Input" id="name" defaultValue="张三" />
        </fieldset>
        <fieldset>
          <label className="Label" htmlFor="username">用户名</label>
          <input className="Input" id="username" defaultValue="@zhangsan" />
        </fieldset>
      </Tabs.Content>
      
      <Tabs.Content className="TabsContent" value="tab2">
        <p className="Text">
          在这里修改您的密码。保存后您将需要重新登录。
        </p>
        <fieldset>
          <label className="Label" htmlFor="currentPassword">当前密码</label>
          <input className="Input" id="currentPassword" type="password" />
        </fieldset>
        <fieldset>
          <label className="Label" htmlFor="newPassword">新密码</label>
          <input className="Input" id="newPassword" type="password" />
        </fieldset>
        <fieldset>
          <label className="Label" htmlFor="confirmPassword">确认密码</label>
          <input className="Input" id="confirmPassword" type="password" />
        </fieldset>
      </Tabs.Content>
    </Tabs.Root>
  )
}
```

## 差异分析

### 激活模式

| 模式 | 说明 |
|------|------|
| automatic | 获得焦点时自动激活 |
| manual | 需要按 Enter 或 Space 激活 |

### API 差异

| 特性 | Reka UI | Radix UI | 说明 |
|------|---------|----------|------|
| 双向绑定 | v-model | value + onValueChange | Vue vs React |
| 组件结构 | 完全一致 | 完全一致 | 无差异 |
| Props | 完全一致 | 完全一致 | 无差异 |

## 可访问性

### WAI-ARIA 角色

- Root: `role="tablist"`
- List: 无特殊角色
- Trigger: `role="tab"` + `aria-selected` + `aria-disabled`
- Content: `role="tabpanel"` + `aria-labelledby`

### 键盘交互

| 按键 | 行为 |
|------|------|
| ArrowRight | 移动到下一个标签（水平） |
| ArrowLeft | 移动到上一个标签（水平） |
| ArrowDown | 移动到下一个标签（垂直） |
| ArrowUp | 移动到上一个标签（垂直） |
| Home | 移动到第一个标签 |
| End | 移动到最后一个标签 |

## Rota 实现建议

### 1. 基于 Rasen 的实现

```typescript
import { reactive, computed } from '@rasen/core'

export const Tabs = {
  Root: defineComponent({
    props: {
      defaultValue: String,
      value: String,
      orientation: { type: String, default: 'horizontal' },
      activationMode: { type: String, default: 'automatic' }
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
      
      provide('tabs', { 
        value: currentValue, 
        setValue,
        orientation: props.orientation,
        activationMode: props.activationMode
      })
      
      return () => slots.default?.()
    }
  }),
  
  List: defineComponent({
    setup(props, { slots }) {
      const { orientation } = inject('tabs')
      
      return () => (
        <div
          role="tablist"
          aria-orientation={orientation}
        >
          {slots.default?.()}
        </div>
      )
    }
  }),
  
  Trigger: defineComponent({
    props: {
      value: { type: String, required: true },
      disabled: { type: Boolean, default: false }
    },
    setup(props, { slots }) {
      const { value: currentValue, setValue, orientation, activationMode } = inject('tabs')
      
      const isActive = computed(() => currentValue.value === props.value)
      
      const handleClick = () => {
        if (props.disabled) return
        setValue(props.value)
      }
      
      const handleKeyDown = (e: KeyboardEvent) => {
        if (activationMode === 'manual' && (e.key === ' ' || e.key === 'Enter')) {
          e.preventDefault()
          setValue(props.value)
        }
      }
      
      const handleFocus = () => {
        if (activationMode === 'automatic') {
          setValue(props.value)
        }
      }
      
      return () => (
        <button
          role="tab"
          aria-selected={isActive.value}
          aria-disabled={props.disabled}
          data-state={isActive.value ? 'active' : 'inactive'}
          data-disabled={props.disabled ? '' : undefined}
          data-orientation={orientation}
          onClick={handleClick}
          onKeydown={handleKeyDown}
          onFocus={handleFocus}
        >
          {slots.default?.()}
        </button>
      )
    }
  }),
  
  Content: defineComponent({
    props: {
      value: { type: String, required: true },
      forceMount: { type: Boolean, default: false }
    },
    setup(props, { slots }) {
      const { value: currentValue } = inject('tabs')
      
      const isActive = computed(() => currentValue.value === props.value)
      
      return () => {
        if (!isActive.value && !props.forceMount) return null
        
        return (
          <div
            role="tabpanel"
            data-state={isActive.value ? 'active' : 'hidden'}
            hidden={!isActive.value}
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

1. **两种激活模式**: automatic 和 manual
2. **方向支持**: 水平和垂直
3. **键盘导航**: 完整的键盘支持
4. **强制挂载**: 可选择强制挂载所有面板
5. **动画**: 支持面板切换动画

### 3. 实现优先级

- [x] 基础结构
- [ ] 激活模式
- [ ] 键盘导航
- [ ] 垂直方向
- [ ] 动画支持
