# @rasenjs/jsx-runtime

JSX/TSX runtime for the Rasen reactive rendering framework.

## Installation

```bash
npm install @rasenjs/jsx-runtime @rasenjs/core @rasenjs/dom
# or @rasenjs/html for SSR, or @rasenjs/web for isomorphic
```

## Overview

`@rasenjs/jsx-runtime` provides the core JSX transformation logic for Rasen. It uses an **injection pattern** - you should import JSX runtime from your rendering package (`@rasenjs/dom`, `@rasenjs/html`, or `@rasenjs/web`), not directly from this package.

## Quick Start

### 1. Configure TypeScript

Choose the appropriate `jsxImportSource` based on your rendering target:

```json
// For SPA (DOM only)
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@rasenjs/dom"
  }
}

// For SSR/SSG (HTML only)
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@rasenjs/html"
  }
}

// For Isomorphic (automatic browser/node selection)
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@rasenjs/web"
  }
}
```

### 2. Write JSX Components

```tsx
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { mount } from '@rasenjs/dom'
import { ref } from '@vue/reactivity'

useReactiveRuntime()

const count = ref(0)

const Counter = () => (
  <div>
    <h1>Counter: {count}</h1>
    <button onClick={() => count.value++}>Increment</button>
  </div>
)

mount(Counter(), document.getElementById('app'))
```

## Tag Configuration

### Default Tags

All DOM tags are available by default:

```tsx
<div>
  <h1>Title</h1>
  <p>Paragraph</p>
  <button>Click me</button>
</div>
```

### `configureTags(config)`

Configure custom tags with namespaces:

```tsx
import { configureTags } from '@rasenjs/jsx-runtime'
import * as dom from '@rasenjs/dom'
import * as canvas2d from '@rasenjs/canvas-2d'

configureTags({
  '': dom,                  // No prefix: <div>, <button>
  'canvas-2d-': canvas2d    // Prefixed: <canvas-2d-rect>, <canvas-2d-circle>
})
```

**Prefix Rules:**

| Prefix | Config | Usage |
|--------|--------|-------|
| `''` (empty) | `{ '': { div } }` | `<div>` |
| `'c-'` | `{ 'c-': { rect } }` | `<c-rect>` |

### `registerTag(name, component)`

Register or override a single tag:

```tsx
import { registerTag } from '@rasenjs/jsx-runtime'
import { div } from '@rasenjs/dom'

// Register custom tag
registerTag('my-container', div)

// Usage
<my-container>Content</my-container>
```

### `getTag(name)`

Get a registered tag component:

```tsx
import { getTag } from '@rasenjs/jsx-runtime'

const DivComponent = getTag('div')
```

## Reactive Props

JSX props support reactive values. Both `class` and `className` are supported (they are equivalent):

```tsx
const isActive = ref(false)
const count = ref(0)

<div
  id="static-value"
  class={computed(() => isActive.value ? 'active' : '')}
  style={{ color: isActive.value ? 'red' : 'blue' }}
>
  Count: {count}
</div>
```

## Event Handlers

Use standard React-like event handlers:

```tsx
<button
  onClick={() => console.log('clicked')}
  onMouseEnter={() => console.log('hover')}
>
  Click me
</button>
```

## Children

### Static Children

```tsx
<div>
  <span>Child 1</span>
  <span>Child 2</span>
</div>
```

### Reactive Children

```tsx
const items = ref(['A', 'B', 'C'])

<ul>
  {computed(() => items.value.map(item => <li>{item}</li>))}
</ul>
```

### Mixed Content

```tsx
<div>
  Static text
  {count}
  <span>Nested element</span>
</div>
```

## Custom Renderers

Configure for different rendering targets:

```tsx
import { configureTags } from '@rasenjs/jsx-runtime'
import * as rnComponents from '@rasenjs/react-native'

// React Native tags
configureTags({
  'rn-': rnComponents
})

// Usage
<rn-view>
  <rn-text>Hello React Native!</rn-text>
</rn-view>
```

## TypeScript Support

JSX types are automatically inferred. For custom tags, extend the JSX namespace:

```tsx
// jsx.d.ts
declare namespace JSX {
  interface IntrinsicElements {
    'my-custom-tag': {
      value?: string
      children?: any
    }
  }
}
```

## Multiple Render Targets

Use different prefixes for different renderers:

```tsx
import { configureTags } from '@rasenjs/jsx-runtime'
import * as dom from '@rasenjs/dom'
import * as canvas2d from '@rasenjs/canvas-2d'

configureTags({
  '': dom,
  'c2d-': canvas2d
})

const App = () => (
  <div>
    <h1>Canvas Demo</h1>
    <canvas width={400} height={300}>
      <c2d-context>
        <c2d-rect x={10} y={10} width={100} height={50} fill="blue" />
        <c2d-circle x={200} y={150} radius={40} fill="red" />
      </c2d-context>
    </canvas>
  </div>
)
```

## API Reference

| Function | Description |
|----------|-------------|
| `configureTags(config)` | Configure tag mappings with prefixes |
| `registerTag(name, component)` | Register a single tag |
| `getTag(name)` | Get a registered tag component |

## License

MIT
