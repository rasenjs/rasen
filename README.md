# Rasen

<p align="center">
  <strong>らせん (Spiral)</strong><br>
  A reactive rendering framework that is agnostic to both reactive systems and rendering targets
</p>

## Features

- **Reactive System Agnostic**: Works with any reactive library (Vue, Solid, Preact Signals, etc.)
- **Rendering Target Agnostic**: Supports Canvas 2D, WebGL, SVG, DOM, and more
- **Pure Function Components**: No virtual DOM, no component instances
- **Self-Controlled Rendering**: Components control their own rendering logic through watchers
- **Monorepo Architecture**: Modular packages for different use cases

## Packages

- **[@rasenjs/core](./packages/core)** - Core framework and reactive runtime adapters
- **[@rasenjs/dom](./packages/dom)** - DOM rendering components
- **[@rasenjs/canvas-2d](./packages/canvas-2d)** - Canvas 2D rendering components
- **[@rasenjs/jsx-runtime](./packages/jsx-runtime)** - JSX runtime for using TSX/JSX syntax
- **[@rasenjs/reactive-vue](./packages/reactive-vue)** - Vue 3 reactive system adapter
- **[@rasenjs/reactive-signals](./packages/reactive-signals)** - Signals-based reactive system adapter

## Installation

```bash
# Core package
npm install @rasenjs/core

# DOM rendering
npm install @rasenjs/dom

# Canvas 2D rendering
npm install @rasenjs/canvas-2d

# JSX support
npm install @rasenjs/jsx-runtime

# Reactive adapters (choose one)
npm install @rasenjs/reactive-vue vue
npm install @rasenjs/reactive-signals signal-polyfill
```

## Quick Start

### 1. Setup Reactive Runtime

Rasen doesn't depend on any specific reactive library. You need to set up a reactive runtime first:

```typescript
import { setReactiveRuntime } from '@rasenjs/core'
import { createVueRuntime } from '@rasenjs/reactive-vue'
import { ref, computed } from 'vue'

// Using Vue 3 Composition API
setReactiveRuntime(createVueRuntime())
```

Or with TC39 Signals:

```typescript
import { setReactiveRuntime } from '@rasenjs/core'
import { createSignalsRuntime } from '@rasenjs/reactive-signals'
import { Signal } from 'signal-polyfill'

setReactiveRuntime(createSignalsRuntime())
```

### 2. Create Components

```typescript
import { ref, computed } from 'vue'
import { div, h2, p, button } from '@rasenjs/dom'

const count = ref(0)

const Counter = () => {
  return div({
    children: [
      h2({ textContent: 'Counter Example' }),
      p({
        textContent: computed(() => `Count: ${count.value}`),
        style: { fontSize: '24px' }
      }),
      button({
        textContent: 'Increment',
        on: { click: () => count.value++ }
      })
    ]
  })
}

// Mount to DOM
const container = document.getElementById('app')
const unmount = Counter()(container)
```

### 3. Canvas 2D Example

```typescript
import { ref, computed } from 'vue'
import { canvas } from '@rasenjs/dom'
import { context as canvas2DContext, rect, circle } from '@rasenjs/canvas-2d'

const x = ref(50)

const CanvasDemo = () => {
  return canvas({
    width: 400,
    height: 300,
    children: [
      canvas2DContext({
        children: [
          rect({
            x: computed(() => x.value),
            y: 100,
            width: 100,
            height: 50,
            fill: '#4CAF50'
          }),
          circle({
            x: 200,
            y: 200,
            radius: 30,
            fill: '#2196F3'
          })
        ]
      })
    ]
  })
}
```

### 4. Using JSX/TSX

Rasen supports JSX syntax for a more familiar developer experience. First, configure TypeScript:

```json
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@rasenjs/jsx-runtime"
  }
}
```

Then write components using JSX:

```tsx
import { setReactiveRuntime } from '@rasenjs/core'
import { createSignalsRuntime, ref, computed } from '@rasenjs/reactive-signals'
import { mount } from '@rasenjs/dom'

setReactiveRuntime(createSignalsRuntime())

const Counter = () => {
  const count = ref(0)
  const double = computed(() => count.value * 2)

  return (
    <div style={{ padding: '20px' }}>
      <h2>JSX Counter</h2>
      <p>Count: {count}</p>
      <p>Double: {double}</p>
      <button onClick={() => count.value++}>Increment</button>
      <button onClick={() => count.value--}>Decrement</button>
    </div>
  )
}

mount(Counter(), document.getElementById('app'))
```

You can also configure custom tags for different rendering targets:

```tsx
import { configureTags } from '@rasenjs/jsx-runtime'
import * as dom from '@rasenjs/dom'
import * as canvas2d from '@rasenjs/canvas-2d'

configureTags({
  '': dom,                 // DOM tags without prefix: <div>, <button>
  'canvas-2d-': canvas2d   // Canvas tags with prefix: <canvas-2d-rect>
})
```

## Development

This is a monorepo managed with Yarn workspaces.

```bash
# Install dependencies
yarn install

# Build all packages
yarn build

# Run tests
yarn test

# Run linter
yarn lint

# Type check
yarn typecheck

# Run examples
yarn examples:dev
```

## Examples

Check out the [examples/](./examples) directory for more examples:

- **counter.html** - DOM rendering with reactive state
- **counter-jsx.html** - JSX/TSX syntax example
- **canvas.html** - Canvas 2D animations
- **todo.html** - Todo list application

Run examples locally:

```bash
yarn examples:dev
```

## Project Structure

```
rasen/
├── packages/
│   ├── core/              # Core framework
│   ├── dom/               # DOM rendering
│   ├── canvas-2d/         # Canvas 2D rendering
│   ├── jsx-runtime/       # JSX runtime
│   ├── reactive-vue/      # Vue adapter
│   └── reactive-signals/  # Signals adapter
├── examples/
│   └── web/               # Web examples
└── ...
```

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT © Rasen Contributors
