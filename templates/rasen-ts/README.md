# Rasen + TypeScript + Vite

This template provides a minimal setup to get started with Rasen in Vite with TypeScript, JSX, and Router support.

## What's Included

- ⚡ [Vite](https://vitejs.dev/) - Next Generation Frontend Tooling
- 🌀 [Rasen](https://github.com/rasenjs/rasen) - Reactive Rendering Framework
- 🧭 Router support with `@rasenjs/router` and `@rasenjs/router-dom`
- 📝 TypeScript with strict mode
- ✨ JSX/TSX support via `@rasenjs/jsx-runtime`
- 🎨 Beautiful UI with dark/light theme

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
│   └── logo.svg           # App logo
├── src/
│   ├── components/        # Reusable components
│   │   ├── Counter.tsx
│   │   ├── TodoList.tsx
│   │   ├── Timer.tsx
│   │   ├── ThemeToggle.tsx
│   │   └── Tabs.tsx
│   ├── views/             # Route views
│   │   ├── HomeView.tsx
│   │   ├── CounterView.tsx
│   │   ├── TodoView.tsx
│   │   ├── TimerView.tsx
│   │   └── AboutView.tsx
│   ├── App.tsx            # Root component with router
│   ├── router.ts          # Router configuration
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
import { createReactiveRuntime } from '@rasenjs/reactive-signals'

setReactiveRuntime(createReactiveRuntime())
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
import { createRouterView, createLink } from '@rasenjs/router-dom'

// Create router view
const RouterView = createRouterView(router, {
  home: () => HomeView(),
  about: () => AboutView(),
  user: () => UserView(),
})

// Create link component
const Link = createLink(router)

// Use in your app
<Link to={routes.home}>Home</Link>
<Link to={routes.user} params={{ id: '123' }}>User 123</Link>
<RouterView />
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
