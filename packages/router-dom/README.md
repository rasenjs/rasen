# @rasenjs/router-dom

DOM bindings for [`@rasenjs/router`](https://github.com/rasenjs/rasen/tree/main/packages/router): a `Link` component built on
`<a>` and a `RouterView` built on the DOM `switchCase`, plus scroll restoration
and layout helpers.

## Installation

```bash
npm install @rasenjs/router-dom @rasenjs/router @rasenjs/dom
```

## Usage

```tsx
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { createRouter, createBrowserHistory, route } from '@rasenjs/router'
import { createRouterView, createRouterLink } from '@rasenjs/router-dom'
import { mount } from '@rasenjs/dom'

useReactiveRuntime()

const router = createRouter(
  { home: route('/'), about: route('/about') },
  { history: createBrowserHistory() }
)

const RouterView = createRouterView(router, {
  home: () => <HomeView />,
  about: () => <AboutView />
})
const Link = createRouterLink(router)

const { home, about } = router.routes

mount(
  <div>
    <Link to={home}>Home</Link>
    <Link to={about}>About</Link>
    <RouterView />
  </div>,
  document.getElementById('app')!
)
```

| Export | Description |
| ------ | ----------- |
| `createRouterView(router, views, fallback?)` | renders the view matching the current route; `fallback` handles unmatched paths |
| `createRouterLink(router)` (alias `createLink`) | `<a>` wrapper that intercepts clicks and calls `router.push`; forwards `class`, `style` and any other attribute |
| `layout(config)` | composes a persistent shell (header/footer) around the routed view |
| `useScrollRestoration(router)` | restores scroll position on back/forward navigation |
| `createLeaveGuard(router)` | blocks navigation away from the current route |

Every export of `@rasenjs/router` is re-exported here, so an app can import its
whole routing surface from one package. For SSR use
[`@rasenjs/router-html`](https://github.com/rasenjs/rasen/tree/main/packages/router-html) instead — or `@rasenjs/web`, which
picks the right one per environment.

## License

MIT
