# Rasen + TypeScript + SSR

This template provides a complete setup for building **Server-Side Rendered (SSR)** applications with Rasen, Vite, TypeScript, JSX, and Router support.

## What's Included

- ⚡ [Vite](https://vitejs.dev/) - Next Generation Frontend Tooling
- 🌀 [Rasen](https://github.com/rasenjs/rasen) - Reactive Rendering Framework
- 🔄 **Server-Side Rendering (SSR)** with hydration
- 🧭 Isomorphic routing with `@rasenjs/router` and `@rasenjs/web`
- 📝 TypeScript with strict mode
- ✨ JSX/TSX support via `@rasenjs/jsx-runtime`
- 🎨 Beautiful UI with dark/light theme

## Getting Started

```bash
# Install dependencies
npm install

# Start development server (SSR mode)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
├── public/
│   └── logo.svg              # App logo
├── src/
│   ├── components/           # Reusable components
│   │   ├── Counter.tsx
│   │   ├── TodoList.tsx
│   │   ├── Timer.tsx
│   │   ├── ThemeToggle.tsx
│   │   └── Tabs.tsx
│   ├── views/                # Route views
│   │   ├── HomeView.tsx
│   │   ├── CounterView.tsx
│   │   ├── TodoView.tsx
│   │   ├── TimerView.tsx
│   │   └── AboutView.tsx
│   ├── App.tsx               # Isomorphic root component
│   ├── entry-client.tsx      # Client entry (hydration)
│   ├── entry-server.tsx      # Server entry (SSR)
│   ├── style.css             # Global styles
│   └── vite-env.d.ts         # Vite type definitions
├── server.js                 # Express + Vite SSR server
├── package.json
├── tsconfig.json             # TypeScript config with JSX
└── vite.config.ts            # Vite config with SSR support
```

## SSR Architecture

### Isomorphic App Component

The `App.tsx` exports a `createApp` factory function that accepts a history adapter:

```tsx
import type { HistoryAdapter } from '@rasenjs/router'
import { createRouter } from '@rasenjs/router'

export function createApp(history: HistoryAdapter) {
  const router = createRouter(routesConfig, { history })
  // ... return component
}
```

### Server Entry (`entry-server.tsx`)

Renders the app to HTML string using `MemoryHistory`:

```tsx
import { createMemoryHistory } from '@rasenjs/router'
import { renderToString } from '@rasenjs/web'

export function render(url: string) {
  const history = createMemoryHistory(url)
  const App = createApp(history)
  return renderToString(App)
}
```

### Client Entry (`entry-client.tsx`)

Hydrates the server-rendered HTML using `BrowserHistory`:

```tsx
import { createBrowserHistory } from '@rasenjs/router'
import { hydrate } from '@rasenjs/web'

const history = createBrowserHistory()
const App = createApp(history)
hydrate(App, document.getElementById('app')!)
```

## Key Concepts

### Reactive Runtime

Rasen requires a reactive runtime to be initialized before rendering. This template uses `@rasenjs/reactive-signals`:

```tsx
import { useReactiveRuntime } from '@rasenjs/reactive-signals'

useReactiveRuntime()
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

### Router Setup

Define routes and create a router:

```tsx
import { createRouter, createBrowserHistory, route } from '@rasenjs/router'

// Define routes
export const routes = {
  home: route('/'),
  about: route('/about'),
  user: route('/user/:id'),
}

// Create router instance
export const router = createRouter(routes, {
  history: createBrowserHistory(),
})
```

### Router Components

Create router view and link components:

```tsx
import { createRouterView, createRouterLink } from '@rasenjs/web'

// Create router view
const RouterView = createRouterView(router, {
  home: () => HomeView(),
  about: () => AboutView(),
  user: () => UserView(),
})

// Create link component
const Link = createRouterLink(router)

// Use in your app
<Link to={routes.home}>Home</Link>
<Link to={routes.user} params={{ id: '123' }}>User 123</Link>
<RouterView />
```

### Mounting

Mount your app to the DOM:

```tsx
import { mount } from '@rasenjs/web'

mount(<App />, document.getElementById('app')!)
```

## Learn More

- [Rasen Documentation](https://github.com/rasenjs/rasen#readme)
- [Vite Documentation](https://vitejs.dev/)
- [TypeScript Documentation](https://www.typescriptlang.org/)
