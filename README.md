# Rasen

<p align="center">
  <strong>らせん (Spiral)</strong><br>
  <em>One Reactive Core, Multiple Render Targets</em><br><br>
  A reactive rendering framework agnostic to both reactive systems and rendering targets.<br>
  Write once, render to <b>DOM</b>, <b>Canvas 2D</b>, <b>React Native</b>, and more.
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#packages">Packages</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#cross-platform-examples">Cross-Platform</a> •
  <a href="#documentation">Documentation</a>
</p>

## Features

- **Cross-Platform Rendering** - Same reactive logic, different render targets (DOM, Canvas, React Native)
- **Reactive System Agnostic** - Works with Vue, Signals, or any reactive library
- **Pure Function Components** - No virtual DOM, no component instances
- **Self-Controlled Rendering** - Components control their own rendering via watchers
- **JSX Support** - Optional JSX/TSX syntax with configurable tags
- **TypeScript First** - Full type safety and inference

## Packages

| Package | Description |
|---------|-------------|
| [@rasenjs/core](./packages/core) | Core runtime and type definitions |
| [@rasenjs/dom](./packages/dom) | DOM rendering components |
| [@rasenjs/canvas-2d](./packages/canvas-2d) | Canvas 2D rendering components |
| [@rasenjs/react-native](./packages/react-native) | React Native Fabric renderer |
| [@rasenjs/jsx-runtime](./packages/jsx-runtime) | JSX/TSX runtime support |
| [@rasenjs/reactive-vue](./packages/reactive-vue) | Vue 3 reactivity adapter |
| [@rasenjs/reactive-signals](./packages/reactive-signals) | TC39 Signals adapter |

## Quick Start

### Installation

```bash
# Core + DOM rendering + Vue reactivity
npm install @rasenjs/core @rasenjs/dom @rasenjs/reactive-vue vue

# Or with Signals
npm install @rasenjs/core @rasenjs/dom @rasenjs/reactive-signals signal-polyfill

# Optional: JSX support
npm install @rasenjs/jsx-runtime
```

### Basic Example

```typescript
import { setReactiveRuntime } from '@rasenjs/core'
import { createVueRuntime } from '@rasenjs/reactive-vue'
import { div, button, mount } from '@rasenjs/dom'
import { ref, computed } from 'vue'

// 1. Setup reactive runtime
setReactiveRuntime(createVueRuntime())

// 2. Create reactive state
const count = ref(0)

// 3. Define component
const Counter = () => div({
  children: [
    div({ textContent: computed(() => `Count: ${count.value}`) }),
    button({
      textContent: 'Increment',
      on: { click: () => count.value++ }
    })
  ]
})

// 4. Mount to DOM
mount(Counter(), document.getElementById('app'))
```

## Cross-Platform Examples

Rasen's power lies in its ability to render to **any host** with the same reactive model:

### 🖥️ DOM

```typescript
import { div, button, mount } from '@rasenjs/dom'

const count = ref(0)

mount(
  div({
    children: [
      div({ textContent: computed(() => `Count: ${count.value}`) }),
      button({ textContent: '+', on: { click: () => count.value++ } })
    ]
  }),
  document.getElementById('app')
)
```

### 🎨 Canvas 2D

```typescript
import { canvas } from '@rasenjs/dom'
import { context, rect, text } from '@rasenjs/canvas-2d'

const x = ref(50)

mount(
  canvas({
    width: 400, height: 200,
    children: context({
      children: [
        rect({ x: x, y: 50, width: 100, height: 80, fill: '#4CAF50' }),
        text({ text: computed(() => `X: ${x.value}`), x: 10, y: 20 })
      ]
    })
  }),
  document.getElementById('app')
)

// Animate
setInterval(() => x.value = 50 + Math.sin(Date.now() / 500) * 100, 16)
```

### 📱 React Native (No React!)

```typescript
import { view, text, touchableOpacity } from '@rasenjs/react-native'

const count = ref(0)

view({
  style: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  children: [
    text({ 
      style: { fontSize: 48 }, 
      children: computed(() => `${count.value}`) 
    }),
    touchableOpacity({
      onPress: () => count.value++,
      children: text({ children: '+' })
    })
  ]
})
```

### With JSX

```tsx
// tsconfig.json: { "jsx": "react-jsx", "jsxImportSource": "@rasenjs/jsx-runtime" }

const Counter = () => {
  const count = ref(0)
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => count.value++}>Increment</button>
    </div>
  )
}
```

## Examples

```bash
# Run web examples
yarn examples:dev
```

See [examples/](./examples) for complete demos:

- **Web** ([examples/web](./examples/web)) - DOM, Canvas 2D, JSX demos
- **React Native** ([examples/react-native](./examples/react-native)) - Mobile app without React

## Documentation

Each package has detailed documentation:

- **[Core Concepts](./packages/core/README.md)** - Component model, lifecycle, reactive runtime
- **[DOM Rendering](./packages/dom/README.md)** - DOM components and mounting
- **[Canvas 2D](./packages/canvas-2d/README.md)** - 2D graphics rendering
- **[React Native](./packages/react-native/README.md)** - Fabric architecture binding
- **[JSX Runtime](./packages/jsx-runtime/README.md)** - JSX configuration and usage
- **[Vue Adapter](./packages/reactive-vue/README.md)** - Vue 3 reactivity integration
- **[Signals Adapter](./packages/reactive-signals/README.md)** - TC39 Signals integration

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Your Application                        │
├─────────────────────────────────────────────────────────────┤
│              @rasenjs/jsx-runtime (optional)                 │
├──────────────────┬──────────────────┬───────────────────────┤
│   @rasenjs/dom   │ @rasenjs/canvas-2d│ @rasenjs/react-native │
│   (Renderers)    │                   │                       │
├──────────────────┴──────────────────┴───────────────────────┤
│                       @rasenjs/core                          │
├─────────────────────────────────────────────────────────────┤
│     @rasenjs/reactive-vue    |    @rasenjs/reactive-signals  │
│                    (Reactive Adapters)                       │
└─────────────────────────────────────────────────────────────┘
```

## Development

```bash
# Install dependencies
yarn install

# Build all packages
yarn build

# Run tests
yarn test

# Type check
yarn typecheck

# Lint
yarn lint
```

## Project Structure

```
rasen/
├── packages/
│   ├── core/              # Core runtime
│   ├── dom/               # DOM renderer
│   ├── canvas-2d/         # Canvas 2D renderer
│   ├── react-native/      # React Native renderer
│   ├── jsx-runtime/       # JSX support
│   ├── reactive-vue/      # Vue adapter
│   └── reactive-signals/  # Signals adapter
├── examples/
│   ├── web/               # Web examples
│   └── react-native/      # RN example app
└── ...
```

## License

MIT © Rasen Contributors
