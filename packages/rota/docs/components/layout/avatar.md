# Avatar 头像组件

## 组件概述

Avatar 是一个显示用户头像的组件，支持图片加载失败时显示备用内容。常用于用户资料、评论列表、团队成员展示等场景。

## Reka UI API

### 组件结构

```vue
<Avatar.Root>
  <Avatar.Image />
  <Avatar.Fallback />
</Avatar.Root>
```

### Root Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |

### Image Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| src | string | - | 图片地址 |
| srcSet | string | - | 图片源集 |
| sizes | string | - | 图片尺寸 |
| alt | string | - | 替代文本 |
| loading | 'eager' \| 'lazy' | 'eager' | 加载方式 |
| onLoadingStatusChange | (status: 'loading' \| 'loaded' \| 'error') => void | - | 加载状态回调 |

### Fallback Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| asChild | boolean | false | 使用子元素 |
| delayMs | number | 0 | 延迟显示（毫秒） |

### Data Attributes

**Image**
- `data-state': 'loading' | 'loaded' | 'error'

**Fallback**
- `data-state': 'visible' | 'hidden'

## Radix UI API

与 Reka UI 完全一致。

## 使用示例对比

### Reka UI 示例

```vue
<script setup>
import { Avatar } from 'reka-ui'
</script>

<template>
  <div style="display: flex; gap: 20px;">
    <Avatar.Root class="AvatarRoot">
      <Avatar.Image 
        class="AvatarImage"
        src="https://images.unsplash.com/photo-1492633423870-43d1cd2775eb?&w=128&h=128&dpr=2&q=80"
        alt="用户头像"
      />
      <Avatar.Fallback class="AvatarFallback" :delay-ms="600">
        JD
      </Avatar.Fallback>
    </Avatar.Root>
    
    <Avatar.Root class="AvatarRoot">
      <Avatar.Image 
        class="AvatarImage"
        src="broken-image.jpg"
        alt="用户头像"
      />
      <Avatar.Fallback class="AvatarFallback">
        JD
      </Avatar.Fallback>
    </Avatar.Root>
  </div>
</template>
```

### Radix UI 示例

```jsx
import * as React from 'react'
import { Avatar } from 'radix-ui'

export default () => {
  return (
    <div style={{ display: 'flex', gap: 20 }}>
      <Avatar.Root className="AvatarRoot">
        <Avatar.Image 
          className="AvatarImage"
          src="https://images.unsplash.com/photo-1492633423870-43d1cd2775eb?&w=128&h=128&dpr=2&q=80"
          alt="用户头像"
        />
        <Avatar.Fallback className="AvatarFallback" delayMs={600}>
          JD
        </Avatar.Fallback>
      </Avatar.Root>
      
      <Avatar.Root className="AvatarRoot">
        <Avatar.Image 
          className="AvatarImage"
          src="broken-image.jpg"
          alt="用户头像"
        />
        <Avatar.Fallback className="AvatarFallback">
          JD
        </Avatar.Fallback>
      </Avatar.Root>
    </div>
  )
}
```

## 差异分析

### 加载状态

| 状态 | 说明 |
|------|------|
| loading | 图片加载中 |
| loaded | 图片加载成功 |
| error | 图片加载失败 |

### Fallback 延迟

- `delayMs = 0`: 立即显示 Fallback
- `delayMs > 0`: 延迟显示，避免图片快速加载时的闪烁

### API 差异

| 特性 | Reka UI | Radix UI | 说明 |
|------|---------|----------|------|
| 组件结构 | 完全一致 | 完全一致 | 无差异 |
| Props | 完全一致 | 完全一致 | 无差异 |

## 可访问性

### WAI-ARIA 角色

- Root: 无特殊角色
- Image: `role="img"` + `aria-label`（通过 alt 属性）
- Fallback: 无特殊角色

### 屏幕阅读器

- 图片加载成功：朗读 alt 文本
- 图片加载失败：朗读 Fallback 内容

## Rota 实现建议

### 1. 基于 Rasen 的实现

```typescript
import { reactive, provide, inject } from '@rasen/core'

export const Avatar = {
  Root: defineComponent({
    setup(props, { slots }) {
      const state = reactive({
        status: 'loading' as 'loading' | 'loaded' | 'error'
      })
      
      provide('avatar', { 
        status: computed(() => state.status),
        setStatus: (status: 'loading' | 'loaded' | 'error') => {
          state.status = status
        }
      })
      
      return () => (
        <span style={{ display: 'inline-block', position: 'relative' }}>
          {slots.default?.()}
        </span>
      )
    }
  }),
  
  Image: defineComponent({
    props: {
      src: String,
      srcSet: String,
      sizes: String,
      alt: String,
      loading: { type: String, default: 'eager' }
    },
    emits: ['loadingStatusChange'],
    setup(props, { emit, slots }) {
      const { setStatus } = inject('avatar')
      
      const handleLoad = () => {
        setStatus('loaded')
        emit('loadingStatusChange', 'loaded')
      }
      
      const handleError = () => {
        setStatus('error')
        emit('loadingStatusChange', 'error')
      }
      
      return () => (
        <img
          src={props.src}
          srcset={props.srcSet}
          sizes={props.sizes}
          alt={props.alt}
          loading={props.loading}
          onLoad={handleLoad}
          onError={handleError}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )
    }
  }),
  
  Fallback: defineComponent({
    props: {
      delayMs: { type: Number, default: 0 }
    },
    setup(props, { slots }) {
      const { status } = inject('avatar')
      
      const visible = ref(false)
      let timer: number | null = null
      
      watchEffect(() => {
        if (status.value === 'error' || status.value === 'loading') {
          if (props.delayMs > 0) {
            timer = window.setTimeout(() => {
              visible.value = true
            }, props.delayMs)
          } else {
            visible.value = true
          }
        } else {
          visible.value = false
          if (timer) clearTimeout(timer)
        }
      })
      
      return () => {
        if (!visible.value) return null
        
        return (
          <span
            data-state={visible.value ? 'visible' : 'hidden'}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {slots.default?.()}
          </span>
        )
      }
    }
  })
}
```

### 2. 关键特性

1. **加载状态管理**: 自动管理图片加载状态
2. **Fallback 延迟**: 避免快速加载时的闪烁
3. **响应式**: 支持响应式图片（srcSet, sizes）
4. **无障碍**: 完整的 ARIA 支持

### 3. 实现优先级

- [x] 基础结构
- [ ] 加载状态管理
- [ ] Fallback 延迟
- [ ] 响应式图片
