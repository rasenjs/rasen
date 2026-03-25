# NavigationMenu 导航菜单组件

## 组件概述

NavigationMenu 是一个用于网站导航的菜单组件，支持水平或垂直布局，可以包含链接、下拉菜单等。常用于网站顶部导航、侧边栏导航等场景。

## Reka UI API

### 组件结构

```vue
<NavigationMenu.Root>
  <NavigationMenu.List>
    <NavigationMenu.Item>
      <NavigationMenu.Trigger />
      <NavigationMenu.Content>
        <NavigationMenu.Link />
      </NavigationMenu.Content>
    </NavigationMenu.Item>
    <NavigationMenu.Item>
      <NavigationMenu.Link />
    </NavigationMenu.Item>
    <NavigationMenu.Indicator />
  </NavigationMenu.List>
  <NavigationMenu.Viewport />
</NavigationMenu.Root>
```

### Root Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| value | string | - | 当前激活项 |
| defaultValue | string | - | 默认激活项 |
| onValueChange | (value: string) => void | - | 值变化回调 |
| dir | 'ltr' \| 'rtl' | 'ltr' | 文本方向 |
| orientation | 'horizontal' \| 'vertical' | 'horizontal' | 方向 |

### List Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### Item Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| value | string | - | 唯一标识 |

### Trigger Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素作为触发器 |
| disabled | boolean | false | 是否禁用 |

### Content Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| forceMount | boolean | false | 强制挂载 |

### Link Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| active | boolean | false | 是否激活 |
| onSelect | (event: Event) => void | - | 选择回调 |

### Indicator Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| forceMount | boolean | false | 强制挂载 |

### Viewport Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| forceMount | boolean | false | 强制挂载 |

### Data Attributes

**Trigger**
- `data-state': 'open' | 'closed'
- `data-disabled': 存在时表示禁用

**Content**
- `data-state': 'open' | 'closed'
- `data-motion': 'to-start' | 'to-end' | 'from-start' | 'from-end'

**Indicator**
- `data-state': 'visible' | 'hidden'
- `data-orientation': 'horizontal' | 'vertical'

**Link**
- `data-active': 存在时表示激活

## Radix UI API

与 Reka UI 完全一致。

## 使用示例对比

### Reka UI 示例

```vue
<script setup>
import { NavigationMenu } from 'reka-ui'
</script>

<template>
  <NavigationMenu.Root class="NavigationMenuRoot">
    <NavigationMenu.List class="NavigationMenuList">
      <NavigationMenu.Item>
        <NavigationMenu.Trigger class="NavigationMenuTrigger">
          学习 <CaretDownIcon class="CaretDown" aria-hidden />
        </NavigationMenu.Trigger>
        <NavigationMenu.Content class="NavigationMenuContent">
          <ul class="List">
            <li>
              <NavigationMenu.Link as-child>
                <a class="Callout" href="/">
                  <div class="CalloutHeading">Radix Primitives</div>
                  <p class="CalloutText">
                    React 的无样式、可访问组件。
                  </p>
                </a>
              </NavigationMenu.Link>
            </li>
            <ListItem href="/docs" title="Stitches">
              CSS-in-JS，开发者体验一流。
            </ListItem>
          </ul>
        </NavigationMenu.Content>
      </NavigationMenu.Item>
      
      <NavigationMenu.Item>
        <NavigationMenu.Link class="NavigationMenuLink" href="https://github.com">
          Github
        </NavigationMenu.Link>
      </NavigationMenu.Item>
      
      <NavigationMenu.Indicator class="NavigationMenuIndicator">
        <div class="Arrow" />
      </NavigationMenu.Indicator>
    </NavigationMenu.List>
    
    <div class="ViewportPosition">
      <NavigationMenu.Viewport class="NavigationMenuViewport" />
    </div>
  </NavigationMenu.Root>
</template>
```

### Radix UI 示例

```jsx
import * as React from 'react'
import { NavigationMenu } from 'radix-ui'

export default () => {
  return (
    <NavigationMenu.Root className="NavigationMenuRoot">
      <NavigationMenu.List className="NavigationMenuList">
        <NavigationMenu.Item>
          <NavigationMenu.Trigger className="NavigationMenuTrigger">
            学习 <CaretDownIcon className="CaretDown" aria-hidden />
          </NavigationMenu.Trigger>
          <NavigationMenu.Content className="NavigationMenuContent">
            <ul className="List">
              <li>
                <NavigationMenu.Link asChild>
                  <a className="Callout" href="/">
                    <div className="CalloutHeading">Radix Primitives</div>
                    <p className="CalloutText">
                      React 的无样式、可访问组件。
                    </p>
                  </a>
                </NavigationMenu.Link>
              </li>
              <ListItem href="/docs" title="Stitches">
                CSS-in-JS，开发者体验一流。
              </ListItem>
            </ul>
          </NavigationMenu.Content>
        </NavigationMenu.Item>
        
        <NavigationMenu.Item>
          <NavigationMenu.Link className="NavigationMenuLink" href="https://github.com">
            Github
          </NavigationMenu.Link>
        </NavigationMenu.Item>
        
        <NavigationMenu.Indicator className="NavigationMenuIndicator">
          <div className="Arrow" />
        </NavigationMenu.Indicator>
      </NavigationMenu.List>
      
      <div className="ViewportPosition">
        <NavigationMenu.Viewport className="NavigationMenuViewport" />
      </div>
    </NavigationMenu.Root>
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

- Root: `role="navigation"` + `aria-label`
- List: 无特殊角色
- Item: 无特殊角色
- Trigger: 无特殊角色
- Content: 无特殊角色
- Link: 无特殊角色

### 键盘交互

| 按键 | 行为 |
|------|------|
| Tab | 移动焦点到下一个链接 |
| Shift + Tab | 移动焦点到上一个链接 |
| Enter / Space | 激活链接或打开菜单 |
| ArrowRight | 移动焦点到下一项（水平方向） |
| ArrowLeft | 移动焦点到上一项（水平方向） |
| ArrowDown | 移动焦点到下一项（垂直方向） |
| ArrowUp | 移动焦点到上一项（垂直方向） |
| Escape | 关闭菜单 |

## Rota 实现建议

### 1. 基于 Rasen 的实现

```typescript
import { reactive, provide, inject } from '@rasen/core'

export const NavigationMenu = {
  Root: defineComponent({
    props: {
      defaultValue: String,
      value: String,
      orientation: { type: String, default: 'horizontal' }
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
      
      provide('navigation-menu', { 
        value: currentValue, 
        setValue, 
        orientation: props.orientation 
      })
      
      return () => (
        <nav role="navigation">
          {slots.default?.()}
        </nav>
      )
    }
  }),
  
  Item: defineComponent({
    props: {
      value: String
    },
    setup(props, { slots }) {
      const { value: currentValue, setValue } = inject('navigation-menu')
      const isOpen = computed(() => currentValue.value === props.value)
      
      return () => slots.default?.({ isOpen })
    }
  }),
  
  Trigger: defineComponent({
    setup(props, { slots }) {
      const { value, setValue } = inject('navigation-menu')
      
      const handleClick = () => {
        setValue(value.value === props.value ? '' : props.value)
      }
      
      return () => (
        <button
          aria-expanded={isOpen.value}
          onClick={handleClick}
        >
          {slots.default?.()}
        </button>
      )
    }
  })
}
```

### 2. 关键特性

1. **响应式布局**: 支持水平和垂直方向
2. **指示器**: 显示当前激活项
3. **视口**: 统一的内容显示区域
4. **键盘导航**: 完整的键盘支持
5. **动画**: 平滑的过渡动画

### 3. 实现优先级

- [x] 基础结构
- [ ] 指示器
- [ ] 视口
- [ ] 键盘导航
- [ ] 动画支持
- [ ] 垂直布局
