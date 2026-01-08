# Getting Started

This guide will help you set up your first Rasen project.

::: warning Work In Progress
Rasen has **NOT been published to npm** yet. The installation commands below are for future reference.
:::

## Installation

### For DOM Rendering

::: code-group

```bash [npm]
npm install @rasenjs/core @rasenjs/dom @rasenjs/reactive-vue vue
```

```bash [yarn]
yarn add @rasenjs/core @rasenjs/dom @rasenjs/reactive-vue vue
```

```bash [pnpm]
pnpm add @rasenjs/core @rasenjs/dom @rasenjs/reactive-vue vue
```

:::

### With TC39 Signals

::: code-group

```bash [npm]
npm install @rasenjs/core @rasenjs/dom @rasenjs/reactive-signals signal-polyfill
```

```bash [yarn]
yarn add @rasenjs/core @rasenjs/dom @rasenjs/reactive-signals signal-polyfill
```

```bash [pnpm]
pnpm add @rasenjs/core @rasenjs/dom @rasenjs/reactive-signals signal-polyfill
```

:::

### Optional: JSX Support

```bash
npm install @rasenjs/jsx-runtime
```

## Basic Example

### 1. Set Up the Reactive Runtime

First, you need to configure the reactive runtime. This only needs to be done once at app initialization:

```typescript
import { useReactiveRuntime } from '@rasenjs/reactive-vue'

// Initialize with Vue's reactivity
useReactiveRuntime()
```

### 2. Create Reactive State

Use the reactive library directly:

```typescript
import { ref, computed } from '@vue/reactivity'

const count = ref(0)
const doubled = computed(() => count.value * 2)
```

### 3. Build Components

Components are functions that return mount functions. Use `com` to wrap components with reactive effects:

```typescript
import { com, getReactiveRuntime } from '@rasenjs/core'
import { div, button, span } from '@rasenjs/dom'

const Counter = com(() => {
  const runtime = getReactiveRuntime()
  const count = runtime.ref(0)
  
  return div(
    { style: { padding: '20px' } },
    span({ textContent: () => `Count: ${count.value}` }),
    button({
      textContent: '+',
      style: { marginLeft: '10px' },
      on: { click: () => count.value++ }
    })
  )
})
```

### 4. Mount to DOM

```typescript
import { mount } from '@rasenjs/dom'

mount(Counter(), document.getElementById('app'))
```

## Complete Example

```typescript
import { com, setReactiveRuntime, getReactiveRuntime } from '@rasenjs/core'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { div, button, span, mount } from '@rasenjs/dom'

// 1. Setup reactive runtime
useReactiveRuntime()

// 2. Define component with com
const Counter = com(() => {
  const runtime = getReactiveRuntime()
  const count = runtime.ref(0)
  const doubled = runtime.computed(() => count.value * 2)
  
  return () => div(
    { style: { padding: '20px', textAlign: 'center' } },
    div(
      { style: { fontSize: '24px', marginBottom: '10px' } },
      'Count: ',
      span({ textContent: () => count.value.toString() })
    ),
    div(
      { style: { fontSize: '18px', color: '#666', marginBottom: '20px' } },
      'Doubled: ',
      span({ textContent: () => doubled.value.toString() })
    ),
    div(
      button({
        textContent: '-',
        style: { padding: '10px 20px', marginRight: '10px' },
        on: { click: () => count.value-- }
      }),
      button({
        textContent: '+',
        style: { padding: '10px 20px' },
        on: { click: () => count.value++ }
      })
    )
  )
})

// 3. Mount to DOM
mount(Counter(), document.getElementById('app'))
```

## Using JSX

If you prefer JSX syntax, configure your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@rasenjs/dom"
  }
}
```

Then you can write components using JSX:

```tsx
import { com, getReactiveRuntime } from '@rasenjs/core'
import { ref } from '@vue/reactivity'

const Counter = com(() => {
  const runtime = getReactiveRuntime()
  const count = runtime.ref(0)
  
  return (
    <div style={{ padding: '20px' }}>
      <p>Count: {count}</p>
      <button onClick={() => count.value++}>+</button>
    </div>
  )
})
```

## Next Steps

- [Three-Phase Functions](/guide/three-phase-functions) — Understand the component lifecycle
- [Reactive Runtime](/guide/reactive-runtime) — Learn about reactive adapters
- [Render Targets](/guide/render-targets) — Explore different render targets
