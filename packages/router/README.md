# @rasenjs/router

A headless, type-safe router for JavaScript applications. Framework-agnostic core with platform-agnostic components.

## Features

- 🎯 **Type-safe** - Full TypeScript support with inferred route parameters
- 🔌 **Headless** - Core routing logic separated from view layer
- ✅ **Zod Integration** - Parameter validation and type coercion via template literals
- 🌲 **Nested Routes** - Support for absolute and relative path conventions
- 🪶 **Lightweight** - Zero dependencies (Zod is a peer dependency)
- 🎨 **Platform-agnostic** - Works with DOM, React Native, Canvas, or any rendering target

## Installation

```bash
npm install @rasenjs/router zod
# or
yarn add @rasenjs/router zod
# or
pnpm add @rasenjs/router zod
```

## Quick Start

```typescript
import { z } from 'zod'
import { route, tpl, createRoutes, createRouter, createBrowserHistory } from '@rasenjs/router'

// 1. Define routes using template literals
const routes = createRoutes({
  home: route('/'),
  about: route('/about'),
  user: route(tpl`/users/${{ id: z.string() }}`),
  post: route(tpl`/posts/${{ id: z.coerce.number() }}`),
})

// 2. Create router
const router = createRouter(routes, {
  history: createBrowserHistory(),
})

// 3. Use the router with Route objects (type-safe!)
router.match('/users/alice')
// → { route: routes.user, params: { id: 'alice' }, path: '/users/alice' }

router.href(routes.user, { id: 'bob' })
// → '/users/bob'

router.push(routes.post, { id: 42 })
// → navigates to '/posts/42'

router.subscribe((match) => {
  console.log('Route changed:', match?.route, match?.params)
})
```

## API Reference

### \`route(template?, options?)\`

Creates a route definition using template literals.

```typescript
import { z } from 'zod'
import { route, tpl } from '@rasenjs/router'

// Empty route (uses key as path segment)
route()

// Simple route (string path)
route('/')
route('/about')

// Route with string parameter
route(tpl`/users/${{ id: z.string() }}`)

// Route with number parameter (auto-coerced)
route(tpl`/posts/${{ id: z.coerce.number() }}`)

// Route with multiple parameters
route(tpl`/users/${{ userId: z.string() }}/posts/${{ postId: z.coerce.number() }}`)

// Route with query and meta
route(tpl`/search`, {
  query: { q: z.string(), page: z.coerce.number().optional() },
  meta: { title: 'Search' }
})
```

### \`createRoutes(config)\`

Creates a nested route structure from configuration. Returns Route objects that can be used directly with router methods.

#### Path Convention

- **Absolute path** (starts with \`/\`): Ignores parent key hierarchy
- **Relative path** (no \`/\` prefix or empty): Parent keys become path segments

```typescript
const routes = createRoutes({
  // Absolute paths (string syntax for routes without params)
  home: route('/'),                             // → /
  about: route('/about'),                       // → /about
  
  // Empty route() uses key as path
  settings: {
    profile: route(),                           // → /settings/profile
    account: route(),                           // → /settings/account
    security: route('password'),                // → /settings/security/password
  },
  
  // Mixed: absolute path escapes hierarchy
  api: {
    health: route('/health'),                   // → /health (not /api/health)
    users: route(),                             // → /api/users
  },
})

// Access routes directly
routes.home           // Route object for /
routes.settings.profile  // Route object for /settings/profile
```

### \`createRouter(routes, options)\`

Creates a router instance.

```typescript
const router = createRouter(routes, {
  history: createBrowserHistory(), // or createHashHistory() or createMemoryHistory()
})
```

#### Router Instance

```typescript
interface Router {
  // Current matched route (reactive)
  readonly current: RouteMatch | null
  
  // Match a path
  match(path: string): RouteMatch | null
  
  // Generate href for a route (type-safe)
  href<P>(route: Route<P>, params: P): string
  
  // Navigate to a route (type-safe)
  push<P>(route: Route<P>, params: P): void
  
  // Replace current route (type-safe)
  replace<P>(route: Route<P>, params: P): void
  
  // Subscribe to route changes
  subscribe(listener: (match: RouteMatch | null) => void): () => void
}
```

### History Adapters

```typescript
import {
  createBrowserHistory,  // Uses browser's History API
  createHashHistory,     // Uses hash-based routing (#/path)
  createMemoryHistory,   // In-memory routing (for SSR/testing)
} from '@rasenjs/router'
```

## Platform-Agnostic Components

The \`/components\` subpath provides platform-agnostic router components that work with any rendering target.

```typescript
import { createRouterLink, createRouterView, type ViewsMap } from '@rasenjs/router/components'
```

### \`createRouterLink(router, Anchor)\`

Creates a Link component. You provide your platform's anchor component.

```typescript
import { a } from '@rasenjs/dom'

// Create Link with your platform's anchor component
const Link = createRouterLink(router, a)

// Usage - children as rest parameters
Link({ to: routes.home, params: {} }, 'Home')
Link({ to: routes.user, params: { id: 'alice' } }, 'Alice')

// Usage - children as prop
Link({ to: routes.home, params: {}, children: ['Home'] })
```

#### Link Props

| Prop | Type | Description |
|------|------|-------------|
| \`to\` | \`Route<P>\` | The Route object to navigate to |
| \`params\` | \`P\` | Parameters for the route (type-safe) |
| \`children\` | \`Child[]\` | Optional children (can also use rest params) |

#### Anchor Props (passed to your Anchor component)

| Prop | Type | Description |
|------|------|-------------|
| \`href\` | \`string\` | The URL for the link |
| \`dataActive\` | \`boolean \\| (() => boolean)\` | Reactive active state |
| \`onClick\` | \`(e) => void\` | Click handler with navigation |

### \`createRouterView(router, routes, views, options)\`

Creates a RouterView component that renders the matched view. Uses an object structure matching the routes config.

```typescript
import { div, h1 } from '@rasenjs/dom'
import { layout } from '@rasenjs/router/components'

const RouterView = createRouterView(router, routes, {
  home: () => div(h1('Home')),
  user: ({ id }) => div(h1(`User: ${id}`)),
  posts: {
    // Optional layout wrapper for nested routes
    [layout]: (children) => div(
      { class: 'posts-layout' },
      nav('Posts Nav'),
      children()
    ),
    list: () => div(h1('Posts List')),
    detail: ({ id }) => div(h1(`Post #${id}`)),
  },
}, {
  default: () => div(h1('404 Not Found')),
})

// Usage
div(
  RouterView()
)
```

#### Layout Support

Use the `layout` symbol to define wrapper components for nested route groups:

```typescript
import { layout } from '@rasenjs/router/components'

const views = {
  dashboard: {
    // Layout wraps all dashboard child routes
    [layout]: (children) => DashboardLayout({ children }),
    overview: () => OverviewView(),
    settings: () => SettingsView(),
  }
}
```

## Full Example

```typescript
import { z } from 'zod'
import { setReactiveRuntime, type Mountable } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-signals'
import { div, a, h1, nav, mount } from '@rasenjs/dom'
import { route, tpl, createRoutes, createRouter, createBrowserHistory } from '@rasenjs/router'
import { createRouterLink, createRouterView, layout } from '@rasenjs/router/components'

// Initialize reactive runtime
setReactiveRuntime(createReactiveRuntime())

// Define routes with template literals (use strings for routes without params)
const routes = createRoutes({
  home: route('/'),
  user: route(tpl`/users/${{ id: z.string() }}`),
  dashboard: {
    overview: route(),
    settings: route(),
  }
})

// Create router
const router = createRouter(routes, {
  history: createBrowserHistory(),
})

// Create Link component with @rasenjs/dom's anchor
const Link = createRouterLink(router, a)

// Dashboard layout
function DashboardLayout(children: () => Mountable<HTMLElement>) {
  return div(
    { class: 'dashboard' },
    nav(
      Link({ to: routes.dashboard.overview, params: {} }, 'Overview'),
      Link({ to: routes.dashboard.settings, params: {} }, 'Settings')
    ),
    div({ class: 'content' }, children())
  )
}

// Create RouterView with object structure
const RouterView = createRouterView(router, routes, {
  home: () => div('Welcome!'),
  user: ({ id }) => div(`User: ${id}`),
  dashboard: {
    [layout]: DashboardLayout,
    overview: () => div('Dashboard Overview'),
    settings: () => div('Dashboard Settings'),
  },
}, {
  default: () => div('404 Not Found'),
})

// App component
function App(): Mountable<HTMLElement> {
  return div(
    { class: 'app' },
    nav(
      { class: 'nav' },
      // children as rest parameters
      Link({ to: routes.home, params: {} }, 'Home'),
      Link({ to: routes.user, params: { id: 'alice' } }, 'Alice'),
      // children as prop
      Link({ to: routes.dashboard.overview, params: {}, children: ['Dashboard'] }),
    ),
    div(
      { class: 'main' },
      RouterView()
    )
  )
}

// Mount
mount(App(), document.getElementById('app')!)
```

### Styling Active Links

Use CSS to style links based on \`data-active\`:

```css
a[data-active="true"] {
  color: blue;
  font-weight: bold;
}
```

## Type Safety

The router provides full type inference for route parameters:

```typescript
const routes = createRoutes({
  user: route(tpl`/users/${{ id: z.string() }}`),
  post: route(tpl`/posts/${{ id: z.coerce.number() }}`),
})

const router = createRouter(routes, { history: createBrowserHistory() })

// ✅ Type-safe - params.id is string
router.push(routes.user, { id: 'alice' })

// ✅ Type-safe - params.id is number
router.push(routes.post, { id: 42 })

// ❌ Type error - missing 'id'
router.push(routes.user, {})

// ❌ Type error - wrong type
router.push(routes.post, { id: 'not-a-number' })
```

## Architecture

The router follows Rasen's **setup → mount → unmount** component lifecycle:

```typescript
// Setup phase: create the component
const Link = createRouterLink(router, Anchor)
const mountable = Link({ to: routes.home, params: {} }, 'Home')

// Mount phase: attach to host, returns unmount function
const unmount = mountable(container)

// Unmount phase: cleanup (remove nodes, unsubscribe listeners)
unmount()
```

This ensures proper cleanup of event listeners and router subscriptions.

## License

MIT
