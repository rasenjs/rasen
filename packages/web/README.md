# @rasenjs/web

Isomorphic web components with routing that automatically switch between DOM and HTML rendering based on the execution environment.

## Installation

```bash
npm install @rasenjs/web @rasenjs/router @rasenjs/core zod
```

## Overview

`@rasenjs/web` is a unified facade package that provides both basic elements and routing components for web rendering. It automatically exports the appropriate renderer based on the environment:

- **Server-side (SSR)**: Uses `@rasenjs/html` + `@rasenjs/router-html` to render HTML strings
- **Client-side (Browser)**: Uses `@rasenjs/dom` + `@rasenjs/router-dom` for reactive DOM manipulation

This allows you to write **isomorphic components with routing** that work seamlessly in both environments without code changes.

## How It Works

The package uses [conditional exports](https://nodejs.org/api/packages.html#conditional-exports) in `package.json`:

```json
{
  "exports": {
    ".": {
      "ssr": "./dist/html.js",      // Server-side rendering
      "browser": "./dist/dom.js",   // Client-side rendering
      "default": "./dist/dom.js"    // Default to browser
    }
  }
}
```

Build tools like Vite automatically select the correct export condition based on the environment.

## Quick Start

### Isomorphic Component

Write your component once, and it works in both SSR and client environments:

```typescript
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { div, p, button } from '@rasenjs/web'
import { ref } from '@vue/reactivity'

// Setup reactive runtime
useReactiveRuntime()

// Isomorphic component - works in both SSR and browser
export const Counter = () => {
  const count = ref(0)
  const increment = () => count.value++

  return div(
    {},
    // a ref in a child position becomes a reactive text node on both targets
    p({}, 'Count: ', count),
    button({ onClick: increment }, 'Increment')
  )
}
```

### Server-Side Rendering (SSR)

On the server, `@rasenjs/web` renders to HTML strings:

```typescript
import { renderToString } from '@rasenjs/web'
import { Counter } from './Counter'

// Renders to HTML string
const html = renderToString(Counter())
// Result: '<div><p>Count: 0</p><button>Increment</button></div>'
```

### Client-Side Hydration

On the client, `@rasenjs/web` creates interactive DOM elements:

```typescript
import { mount } from '@rasenjs/web'
import { Counter } from './Counter'

// Mounts and hydrates the component
mount(Counter(), document.getElementById('app'))
// Now the button is interactive and updates the counter
```

## API

`@rasenjs/web` re-exports all APIs from the appropriate renderer and router:

### SSR Mode (Server)

Exports everything from `@rasenjs/html` + `@rasenjs/router-html`:

- `renderToString()` - Render component to HTML string
- `div()`, `p()`, `button()`, etc. - HTML element creators
- `RouterView()` - Render matched route to HTML
- `RouterLink()` - Create `<a>` tag with href
- All standard HTML elements

### Browser Mode (Client)

Exports everything from `@rasenjs/dom` + `@rasenjs/router-dom`:

- `mount()` - Mount component to DOM
- `div()`, `p()`, `button()`, etc. - DOM element creators
- `RouterView()` - Render matched route to DOM
- `RouterLink()` - Create interactive `<a>` with click handling
- All standard HTML elements with event handling

## Important Considerations

### 1. Event Handlers

Event handlers only work in the browser. On the server, they are ignored:

```typescript
// ✅ Safe - works in browser, ignored in SSR
button({ onClick: handler }, 'Click me')

// ❌ Avoid - 'on' object would render as HTML attribute in SSR
button({ on: { click: handler } }, 'Click me')
```

**Best Practice**: Use `onClick`, `onInput`, etc. (not `on: { click }` object).

### 2. Reactive Text

Pass a **ref** to a child position and both renderers keep it updated:

```typescript
// ✅ Works in both SSR and browser — one text node, updated through the runtime
p({}, count)
p({}, 'Count: ', count)
```

- **SSR**: the current value is written into the markup
- **Browser**: the same ref drives a subscription, so later writes update the node

A plain getter child — `p(() => \`Count: ${count.value}\`)` — does **not**
subscribe in the DOM renderer, it is invoked once. Use a ref,
`text({ content: () => … })`, or JSX (`<p>Count: {count}</p>`, which the compiler
binds for you).

### 3. Import Path

Always import from `@rasenjs/web`, not from `@rasenjs/dom` or `@rasenjs/html` directly:

```typescript
// ✅ Correct - automatic environment detection
import { div, mount } from '@rasenjs/web'

// Routing

### Define Routes

```typescript
import { createRouter, createMemoryHistory, template as tpl } from '@rasenjs/router'
import { z } from 'zod'

export const router = createRouter({
  home: '/',
  about: '/about',
  user: tpl`/user/${{ id: z.string() }}`,
}, {
  history: createMemoryHistory(),
})

export const { routes } = router
```

### Use Router Components

```typescript
import { createRouterView, createRouterLink, div, nav } from '@rasenjs/web'
import { router, routes } from './router'

// One view table + one link factory; both resolve to the DOM or the HTML
// implementation depending on the environment.
const RouterView = createRouterView(
  router,
  {
    home: () => Home(),
    about: () => About(),
    user: (params) => User(params)
  },
  { default: () => NotFound() }
)

const Link = createRouterLink(router)

export const App = () => div(
  {},
  nav({}, Link({ to: routes.home }, 'Home'), Link({ to: routes.about }, 'About')),
  RouterView()
)
```

In JSX the same components are written as `<RouterView />` and
`<Link to={routes.home}>Home</Link>`.

## Use Cases

### Universal Components with Routing

Build full-featured apps that work in any environment:

```typescriptRouterView` and `RouterLink`
- Dynamic route parameters
- Hot module replacement (HMR)

## Related Packages

- [`@rasenjs/router`](https://github.com/rasenjs/rasen/tree/main/packages/router) - Core headless router
- [`@rasenjs/dom`](https://github.com/rasenjs/rasen/tree/main/packages/dom) - DOM renderer (browser)
- [`@rasenjs/html`](https://github.com/rasenjs/rasen/tree/main/packages/html) - HTML renderer (SSR)
- [`@rasenjs/router-dom`](https://github.com/rasenjs/rasen/tree/main/packages/router-dom) - DOM router components (internal)
- [`@rasenjs/router-html`](https://github.com/rasenjs/rasen/tree/main/packages/router-html) - HTML router components (internal)

### SSR with Client Hydration and Routing

Perfect for server-rendered apps with client interactivity and navigation:

```typescript
// server.ts
import { renderToString } from '@rasenjs/web'
import { router } from './router'

const html = (url: string) => {
  router.push(url) // Set route from request URL
  return `<!DOCTYPE html>
<html>
  <body>
    <div id="app">${renderToString(App())}</div>
    <script type="module" src="/client.js"></script>
  </body>
</html>`
}

// client.ts
import { mount } from '@rasenjs/web'
import { createBrowserHistory } from '@rasenjs/router'
import { router } from './router'

router.history = createBrowserHistory()
</html>`

// client.ts
import { mount } from '@rasenjs/web'
mount(App(), document.getElementById('app'))
```

## Complete Example

See the [SSR example](https://github.com/rasenjs/rasen/tree/main/examples/ssr) for a full implementation with:

- Server-side rendering
- Client-side hydration
- Routing with `RouterView` and `RouterLink`
- Dynamic route parameters
- Hot module replacement (HMR)

## Related Packages

- [`@rasenjs/router`](https://github.com/rasenjs/rasen/tree/main/packages/router) - Core headless router
- [`@rasenjs/dom`](https://github.com/rasenjs/rasen/tree/main/packages/dom) - DOM renderer (browser)
- [`@rasenjs/html`](https://github.com/rasenjs/rasen/tree/main/packages/html) - HTML renderer (SSR)
- [`@rasenjs/router-dom`](https://github.com/rasenjs/rasen/tree/main/packages/router-dom) - DOM router components (internal)
- [`@rasenjs/router-html`](https://github.com/rasenjs/rasen/tree/main/packages/router-html) - HTML router components (internal)

## License

MIT
