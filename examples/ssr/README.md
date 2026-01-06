# Rasen SSR Example

This example demonstrates **isomorphic routing** with Rasen - the same code runs on both server and client.

## Architecture

### Key Concept: Build-time Web Implementation Selection

Instead of runtime detection, we use build-time aliases to swap implementations:

```typescript
// vite.config.ts
resolve: {
  alias: {
    '@rasenjs/web': isSSR 
      ? '@rasenjs/html'
      : '@rasenjs/dom'
  }
}
```

### File Structure

```
src/
├── App.ts          # Isomorphic app component
├── routes.ts       # Shared route definitions
├── server.ts       # SSR entry (uses @rasenjs/router-html)
├── client.ts       # Client entry (uses @rasenjs/router-dom)
└── views/
    ├── Home.ts     # Isomorphic view components
    ├── About.ts
    └── User.ts
```

## Usage

```bash
# Install dependencies
yarn install

# Start dev server with SSR
yarn dev

# Build for production
yarn build

# Visit http://localhost:3000
```

## How It Works

### 1. Same Route Definitions

```typescript
// routes.ts - shared between SSR and client
export const routes = {
  home: route('/'),
  about: route('/about'),
  user: route('/user/:id')
}
```

### 2. Isomorphic App Component

```typescript
// App.ts - imports are aliased at build time
import { createRouterView, createRouterLink } from '@rasenjs/web'
import { div, nav } from '@rasenjs/web'

export function createApp(history: HistoryAdapter) {
  const router = createRouter({ history, routes })
  const RouterView = createRouterView(router, views)
  const Link = createRouterLink(router)
  
  return () => div({ class: 'app' },
    nav(
      Link({ to: routes.home }, 'Home'),
      Link({ to: routes.about }, 'About')
    ),
    RouterView()
  )
}
```

### 3. Different Entries

```typescript
// server.ts - SSR entry
import { createMemoryHistory } from '@rasenjs/router'
import { renderToString } from '@rasenjs/html'
import { createApp } from './App'

export function render(url: string) {
  const history = createMemoryHistory(url)
  const App = createApp(history)
  return renderToString(App())
}

// client.ts - Client entry
import { createBrowserHistory } from '@rasenjs/router'
import { hydrate } from '@rasenjs/dom'
import { createApp } from './App'

const history = createBrowserHistory()
const App = createApp(history)
hydrate(App(), document.getElementById('app')!)
```

## Key Differences

| Aspect | SSR (@rasenjs/router-html) | Client (@rasenjs/router-dom) |
|--------|---------------------------|------------------------------|
| History | `createMemoryHistory` | `createBrowserHistory` |
| RouterView | Static render | Reactive with `watch` |
| Link | Static `<a>` with href | Event-driven navigation |
| Hydration | N/A | `hydrate()` |

## Benefits

✅ **DRY**: Write router logic once  
✅ **Type-safe**: Full TypeScript support  
✅ **Zero runtime cost**: Build-time resolution  
✅ **Optimal bundles**: Tree-shaking works perfectly  
✅ **Mental model**: Same API, different implementations

## Notes

- Router guards work in both environments
- `data-active` attribute is rendered in SSR, reactive in client
- Reactive state (`ref`, `computed`) only activates on client
