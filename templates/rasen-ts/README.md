# Rasen + TypeScript + Vite

This template provides a minimal setup to get started with Rasen in Vite with TypeScript and JSX support.

## What's Included

- ⚡ [Vite](https://vitejs.dev/) - Next Generation Frontend Tooling
- 🌀 [Rasen](https://github.com/rasenjs/rasen) - Reactive Rendering Framework
- 📝 TypeScript with strict mode
- ✨ JSX/TSX support via `@rasenjs/jsx-runtime`

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
├── public/
│   └── rasen.svg          # App icon
├── src/
│   ├── components/
│   │   └── Counter.tsx    # Example counter component
│   ├── App.tsx            # Root component
│   ├── main.tsx           # Entry point
│   ├── style.css          # Global styles
│   └── vite-env.d.ts      # Vite type definitions
├── index.html             # HTML entry
├── package.json
├── tsconfig.json          # TypeScript config with JSX
└── vite.config.ts         # Vite config
```

## Key Concepts

### Reactive Runtime

Rasen requires a reactive runtime to be initialized before rendering. This template uses `@rasenjs/reactive-signals`:

```tsx
import { setReactiveRuntime } from '@rasenjs/core'
import { createSignalsRuntime } from '@rasenjs/reactive-signals'

setReactiveRuntime(createSignalsRuntime())
```

### Reactive State

Create reactive state using signals:

```tsx
import { ref, computed } from '@rasenjs/reactive-signals'

const count = ref(0)
const double = computed(() => count.value * 2)

// Update state
count.value++
```

### JSX Components

Write components using JSX syntax:

```tsx
/// <reference types="@rasenjs/jsx-runtime/jsx" />

export const MyComponent = () => {
  const message = ref('Hello')

  return (
    <div>
      <h1>{message}</h1>
      <button onClick={() => message.value = 'Updated!'}>
        Click me
      </button>
    </div>
  )
}
```

### Mounting

Mount your app to the DOM:

```tsx
import { mount } from '@rasenjs/dom'

mount(<App />, document.getElementById('app')!)
```

## Learn More

- [Rasen Documentation](https://github.com/rasenjs/rasen#readme)
- [Vite Documentation](https://vitejs.dev/)
- [TypeScript Documentation](https://www.typescriptlang.org/)
