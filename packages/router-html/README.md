# @rasenjs/router-html

HTML/SSR-specific router components for Rasen framework.

## Features

- 🎯 **API compatible with @rasenjs/router-dom** - Write once, run everywhere
- 🚀 **Static rendering** - No reactivity overhead in SSR
- 🔄 **Isomorphic code** - Same component code for SSR and client
- 📦 **Tree-shakeable** - Build-time separation for optimal bundle size

## Installation

```bash
npm install @rasenjs/router-html
# or
yarn add @rasenjs/router-html
```

## Usage

### Isomorphic Application Structure

```typescript
// routes.ts - Shared route definitions
import { route } from '@rasenjs/router'

export const routes = {
  home: route('/'),
  about: route('/about'),
  user: route('/user/:id')
}

export const views = {
  home: () => HomeView(),
  about: () => AboutView(),
  user: () => UserView()
}

// App.ts - Isomorphic component
import { createRouter } from '@rasenjs/router'
import { createRouterView, createRouterLink } from '@rasenjs/router-html' // or '@rasenjs/router-dom'
import { div, nav } from '@rasenjs/html' // or '@rasenjs/dom'
import { routes, views } from './routes'

export function createApp(history) {
  const router = createRouter({ history, routes })
  const RouterView = createRouterView(router, views)
  const Link = createRouterLink(router)
  
  return () => div({ class: 'app' },
    nav({},
      Link({ to: routes.home }, 'Home'),
      Link({ to: routes.about }, 'About')
    ),
    RouterView()
  )
}

// server.ts - SSR entry
import { createMemoryHistory } from '@rasenjs/router'
import { renderToString } from '@rasenjs/html'
import { createApp } from './App'

export function renderPage(url: string) {
  const history = createMemoryHistory(url)
  const App = createApp(history)
  const html = renderToString(App())
  
  return `
<!DOCTYPE html>
<html>
  <head>
    <title>My App</title>
    <script type="module" src="/client.js"></script>
  </head>
  <body>
    <div id="app">${html}</div>
  </body>
</html>`
}

// client.ts - Client entry
import { createBrowserHistory } from '@rasenjs/router'
import { hydrate } from '@rasenjs/dom'
import { createApp } from './App'

const history = createBrowserHistory()
const App = createApp(history)
hydrate(App(), document.getElementById('app')!)
```

### Build Configuration

Use build tool aliases to switch between SSR and client:

```typescript
// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      // SSR build
      '@rasenjs/web': '@rasenjs/router-html',
      '@rasenjs/web': '@rasenjs/html',
      
      // Client build (override in separate config)
      // '@rasenjs/web': '@rasenjs/router-dom',
      // '@rasenjs/web': '@rasenjs/dom',
    }
  }
})
```

Then in your code:

```typescript
import { createRouterView, createRouterLink } from '@rasenjs/web'
import { div, nav } from '@rasenjs/web'
```

## API

### createRouterView

Creates a static RouterView component that renders the matched route once.

```typescript
function createRouterView<TRoutes>(
  router: Router<TRoutes>,
  views: ViewsConfig<TRoutes, StringHost>,
  options?: {
    default?: () => Mountable<StringHost>
  }
): () => Mountable<StringHost>
```

### createRouterLink

Creates static Link components with href attributes, no event handling.

```typescript
function createRouterLink<TRoutes>(
  router: Router<TRoutes>
): LinkComponent<TRoutes, StringHost>
```

### createLeaveGuard

Creates a LeaveGuard component (no-op in SSR, for API compatibility).

```typescript
function createLeaveGuard<TRoutes>(
  router: Router<TRoutes>
): LeaveGuardComponent<TRoutes, StringHost>
```

## Differences from @rasenjs/router-dom

| Feature | @rasenjs/router-dom | @rasenjs/router-html |
|---------|---------------------|----------------------|
| Reactivity | ✅ Watches route changes | ❌ Static render |
| Event handlers | ✅ Click navigation | ❌ Static href only |
| LeaveGuard | ✅ Prevents navigation | ❌ No-op (renders children) |
| Host type | `HTMLElement` | `StringHost` |

## License

MIT
