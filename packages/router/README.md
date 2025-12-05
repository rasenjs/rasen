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
import { template as tpl, createRouter, createBrowserHistory } from '@rasenjs/router'

// Create router with declarative routes configuration
const router = createRouter({
  // String paths (simplest form)
  home: '/',
  about: '/about',
  
  // Empty object (uses key as path)
  contact: {},
  
  // Template literals with parameters
  user: tpl`/users/${{ id: z.string() }}`,
  post: tpl`/posts/${{ id: z.coerce.number() }}`,
  
  // Nested routes
  settings: {
    profile: {},
    account: tpl`${{ section: z.string() }}`,
  }
}, {
  history: createBrowserHistory(),
})

// Extract routes object for type-safe access
const { routes } = router

// Navigate by Route object (fully type-safe!)
router.push(routes.user, { params: { id: 'alice' } })
// → navigates to '/users/alice'

router.href(routes.post, { params: { id: 42 } })
// → '/posts/42'

// Or navigate by route key string (also type-safe!)
router.push('user', { params: { id: 'bob' } })
// → navigates to '/users/bob'

router.href('post', { params: { id: 123 } })
// → '/posts/123'

// Match URL paths
router.match('/users/alice')
// → { route: routes.user, params: { id: 'alice' }, path: '/users/alice' }

router.subscribe((match) => {
  console.log('Route changed:', match?.route, match?.params)
})
```

## API Reference

### Route Configuration Formats

Routes can be defined in multiple ways:

```typescript
import { z } from 'zod'
import { template as tpl, createRouter } from '@rasenjs/router'

const router = createRouter({
  // String paths (simplest, no parameters)
  home: '/',
  about: '/about',
  docs: '/documentation',
  
  // Empty object (uses key as path segment)
  contact: {},  // → /contact
  
  // Template literals with parameters
  user: tpl`/users/${{ id: z.string() }}`,
  post: tpl`/posts/${{ id: z.coerce.number() }}`,
  
  // Multiple parameters
  userPost: tpl`/users/${{ userId: z.string() }}/posts/${{ postId: z.coerce.number() }}`,
  
  // Route configuration object (for advanced options)
  search: {
    path: tpl`/search`,
    query: { q: z.string(), page: z.coerce.number().optional() },
    meta: { title: 'Search Results' }
  },
  
  // Nested routes (auto-creates path hierarchy)
  admin: {
    dashboard: {},        // → /admin/dashboard
    users: {},           // → /admin/users
    settings: tpl`${{ section: z.string() }}`,  // → /admin/settings/:section
  }
})
```


### \`createRouter(config, options)\`

Creates a router instance with a declarative routes configuration.

#### Configuration Format

Routes are defined declaratively using simple values:

```typescript
const router = createRouter({
  // String path (no parameters)
  home: '/',
  
  // Empty object (uses key as path)
  about: {},
  
  // Template literal with parameters
  user: tpl`/users/${{ id: z.string() }}`,
  
  // Configuration object (for advanced options)
  search: {
    path: tpl`/search`,
    query: { q: z.string() },
    meta: { title: 'Search' }
  },
  
  // Nested routes
  settings: {
    profile: {},
    account: tpl`${{ type: z.string() }}`,
  }
}, {
  history: createBrowserHistory(),
})
```

#### Router Instance

```typescript
interface Router<TRoutes> {
  // Routes config with preserved structure
  readonly routes: TRoutes
  
  // Current matched route (reactive)
  readonly current: RouteMatch | null
  
  // Match a path
  match(path: string): RouteMatch | null
  
  // Generate href - supports both Route objects and string keys
  // For routes without params, options is optional
  href<P>(route: Route<P>, options?: { params?: P, query?: Q }): string
  href(key: 'user' | 'settings.profile' | ..., options?: any): string
  
  // Navigate - supports both Route objects and string keys
  // For routes without params, options is optional
  push<P>(route: Route<P>, options?: { params?: P, query?: Q }): Promise<void>
  push(key: 'user' | 'settings.profile' | ..., options?: any): Promise<void>
  
  // Replace - same as push
  replace<P>(route: Route<P>, options?: { params?: P, query?: Q }): Promise<void>
  replace(key: 'user' | 'settings.profile' | ..., options?: any): Promise<void>
  
  // Subscribe to route changes
  beforeEach(listener: (to: RouteMatch, from: RouteMatch | null) => boolean | void): () => void
  beforeLeave(listener: (to: RouteMatch, from: RouteMatch | null) => boolean | void): () => void
  afterEach(listener: (to: RouteMatch, from: RouteMatch | null) => void): () => void
  onError(listener: (error: Error, to: RouteMatch | null, from: RouteMatch | null) => void): () => void
  
  // Navigation state
  readonly isNavigating: boolean
  
  // Cleanup
  destroy(): void
}
```

#### Navigation

Both Route objects and string keys are fully type-safe:

```typescript
const router = createRouter({
  user: tpl`/users/${{ id: z.string() }}`,
  settings: {
    profile: {},
  }
})

const { routes } = router

// Route object - type-safe params
router.push(routes.user, { params: { id: 'alice' } })
router.push(routes.settings.profile)  // params optional (no params needed)

// String key - type-safe params
router.push('user', { params: { id: 'bob' } })
router.push('settings.profile')  // params optional
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

The `/components` subpath provides platform-agnostic router components that work with any rendering target.

```typescript
import { createRouterLink, createRouterView, type ViewsMap } from '@rasenjs/router/components'
```

### Building Route Views with `com`

For route views with reactive logic and side effects, wrap with `com`:

```typescript
import { com, getReactiveRuntime } from '@rasenjs/core'
import { div, h1, mount } from '@rasenjs/dom'

// Simple route view
const UserView = ({ id }) => div(
  h1(`User: ${id}`)
)

// Route view with reactive logic - use com
const PostDetailView = com(({ id }: { id: string }) => {
  const runtime = getReactiveRuntime()
  const post = runtime.ref<any>(null)
  const loading = runtime.ref(true)
  
  runtime.watch(
    () => id,
    async (newId) => {
      loading.value = true
      const data = await fetchPost(newId)
      post.value = data
      loading.value = false
    },
    { immediate: true }
  )
  
  return div(
    {
      children: [
        () => loading.value 
          ? p({ textContent: 'Loading...' })
          : post.value
            ? h1({ textContent: post.value.title })
            : p({ textContent: 'Not found' })
      ]
    }
  )
})
```

### `createRouterLink(router, Anchor)`

Creates a Link component. You provide your platform's anchor component.

```typescript
import { a } from '@rasenjs/dom'

// Create Link with your platform's anchor component
const Link = createRouterLink(router, a)

// Usage - children as rest parameters
Link({ to: routes.home }, 'Home')  // params optional for no-param routes
Link({ to: routes.user, params: { id: 'alice' } }, 'Alice')

// Usage - children as prop
Link({ to: routes.home, children: ['Home'] })
Link({ to: routes.user, params: { id: 'alice' }, children: ['Alice'] })

// Usage - string key navigation
Link({ to: 'home' }, 'Home')
Link({ to: 'user', params: { id: 'bob' } }, 'Bob')
```

#### Link Props

```typescript
interface LinkProps<P, Q> {
  // Target route - either Route object or string key
  to: Route<P, Q> | string
  
  // Parameters (optional if route has no params)
  params?: P
  
  // Query parameters (optional)
  query?: Partial<InferQueryParams<Q>>
  
  // Children elements
  children?: Array<Mountable<Host> | string>
}
```

#### Anchor Props (passed to your Anchor component)

```typescript
interface AnchorProps {
  href: string                        // The URL for the link
  dataActive?: boolean | (() => boolean)  // Reactive active state
  onClick: (e: ClickEvent) => void    // Click handler with navigation
}
```

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
import { template as tpl, createRouter, createBrowserHistory } from '@rasenjs/router'
import { createRouterLink, createRouterView, layout } from '@rasenjs/router/components'

// Initialize reactive runtime
setReactiveRuntime(createReactiveRuntime())

// Create router with declarative routes configuration
const router = createRouter({
  home: '/',
  user: tpl`/users/${{ id: z.string() }}`,
  dashboard: {
    overview: {},
    settings: {},
  }
}, {
  history: createBrowserHistory(),
})

// Extract routes for type-safe access
const { routes } = router

// Create Link component with @rasenjs/dom's anchor
const Link = createRouterLink(router, a)

// Dashboard layout
function DashboardLayout(children: () => Mountable<HTMLElement>) {
  return div(
    { class: 'dashboard' },
    nav(
      Link({ to: routes.dashboard.overview }, 'Overview'),
      Link({ to: routes.dashboard.settings }, 'Settings')
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
      // No-param routes don't need params
      Link({ to: routes.home }, 'Home'),
      // Routes with params require params
      Link({ to: routes.user, params: { id: 'alice' } }, 'Alice'),
      Link({ to: routes.dashboard.overview }, 'Dashboard'),
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
const router = createRouter({
  user: tpl`/users/${{ id: z.string() }}`,
  post: tpl`/posts/${{ id: z.coerce.number() }}`,
  home: '/',  // no parameters
}, { history: createBrowserHistory() })

const { routes } = router

// ✅ Type-safe - params.id is string
router.push(routes.user, { params: { id: 'alice' } })

// ✅ Type-safe - params.id is number
router.push(routes.post, { params: { id: 42 } })

// ✅ Type-safe - no params required for home
router.push(routes.home)

// ❌ Type error - missing 'id'
router.push(routes.user, { params: {} })

// ❌ Type error - wrong type
router.push(routes.post, { params: { id: 'not-a-number' } })

// ❌ Type error - params not allowed
router.push(routes.home, { params: { id: '123' } })
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
