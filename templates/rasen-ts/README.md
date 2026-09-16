# Rasen + TypeScript + SSR

A complete Server-Side Rendering (SSR) setup for Rasen: the same component
code renders to HTML on the server and hydrates in the browser.

## What's Included

- ⚡ [Vite](https://vitejs.dev/) — dev server and production build
- 🌀 [Rasen](https://github.com/rasenjs/rasen) — reactive rendering framework
- 🔄 **SSR + hydration** — server-rendered HTML, client-side takeover
- 🧭 **Isomorphic routing** — `@rasenjs/router` with memory/browser history
- ⚛️ **TC39 Signals** — `@rasenjs/reactive-signals` + `signal-polyfill`
- 🛠 **`@rasenjs/compiler`** — JSX transform, static hoisting, HMR
- 📝 TypeScript with strict mode

## Getting Started

The template is standalone — copy it out of the repo and install normally:

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # client + server bundles
```

### Developing against this repo's packages

To run the template against the local `packages/*` instead of the published
ones, no manifest change is needed: the template resolves `@rasenjs/*` upward
from the repository root, where the yarn workspaces are linked.

```bash
# From the repository root
yarn install
yarn build              # build the packages the template imports

cd templates/rasen-ts
rm -rf node_modules     # drop any npm-installed copies so resolution walks up
node server.js          # http://localhost:3000
```

Two things to watch for while doing this:

- `@rasenjs/*` must resolve to `packages/*` — if a `node_modules/@rasenjs`
  appears inside the template it shadows the local packages.
- `signal-polyfill` must be a **single copy**. The active runtime recognizes
  signals with `Signal.isState`, which returns `false` for instances from a
  duplicate copy — the signal is then treated as a plain object.

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
│   ├── theme.ts              # Module-level theme state
│   ├── style.css             # Global styles
│   └── vite-env.d.ts         # Vite type definitions
├── server.js                 # Express + Vite middleware dev server
├── package.json
├── tsconfig.json             # TypeScript config with JSX
└── vite.config.ts            # Vite config with SSR support
```

## The Compiler Plugin

One plugin covers the whole Rasen pipeline:

```ts
import { rasenCompile } from '@rasenjs/compiler'

export default defineConfig({
  plugins: [rasenCompile.vite()]
})
```

It runs, in order:

1. **JSX attribute transform** — `attr={complexExpr}` becomes `attr={() => complexExpr}`,
   so props are reactive without writing getters by hand. Literals, identifiers,
   object literals and functions are left alone.
2. **Static hoisting** — fully static intrinsic subtrees are compiled into
   `template()` clones with baked navigation paths instead of the element
   factory chain.
3. **HMR** — dev-only `enterHmrModule` / `exitHmrModule` wrapping for modules
   that use `com()`.

**Children are compiled, not transformed into accessors.** A `{expr}` text child
becomes a reactive text binding (`bindText(x, () => renderText(expr))`) and the
matching server-side emission, so interpolating the accessor call is all that is
needed:

```tsx
<span class="count-number">{count.get()}</span>
<p>{isEven.get() ? 'Even' : 'Odd'}</p>
```

Two related gotchas:

- `{count}` — the signal *object* — is stringified by `renderText()` into
  `[object Object]`. Interpolate the read (`count.get()`), not the signal.
- `{text({ content: … })}` is **not** needed and is in fact miscompiled inside
  compiled JSX: the call is treated as a text expression, so the returned
  mountable gets stringified. Use plain interpolation instead.

## Reactive State

The runtime is installed once per entry point:

```ts
import { useReactiveRuntime } from '@rasenjs/reactive-signals'

useReactiveRuntime()
```

State is a TC39 signal — read with `get()`, write with `set()`:

```ts
import { Signal } from 'signal-polyfill'

const count = new Signal.State(0)
const double = new Signal.Computed(() => count.get() * 2)

count.set(count.get() + 1)
```

## SSR Architecture

### Isomorphic Root

`App.tsx` exports a `createApp` factory that accepts a history adapter:

```tsx
const App = com((history: HistoryAdapter) => {
  const router = createRouter(routesConfig, { history })
  // ... return the component tree
})

export function createApp(history: HistoryAdapter) {
  return App(history)
}
```

### Server Entry (`entry-server.tsx`)

```tsx
import { createMemoryHistory } from '@rasenjs/router'
import { renderToString } from '@rasenjs/html'

export function render(url: string) {
  const history = createMemoryHistory(url)
  return renderToString(createApp(history))
}
```

### Client Entry (`entry-client.tsx`)

```tsx
import { createBrowserHistory } from '@rasenjs/router'
import { hydrate } from '@rasenjs/web'

hydrate(createApp(createBrowserHistory()), document.getElementById('app')!)
```

`@rasenjs/web` is isomorphic: it resolves to `@rasenjs/html` under the `node`
condition (SSR) and to `@rasenjs/dom` in the browser, so component imports stay
identical in both entries.

### Navigation

`router.current` is a plain property, so navigation is mirrored into a signal
to drive class bindings:

```ts
const path = new Signal.State(router.current?.path ?? '/')
router.afterEach((to) => path.set(to.path))
```

```tsx
<Link to={router.routes.home} class={() => (path.get() === '/' ? 'nav-link active' : 'nav-link')}>
  Home
</Link>
```

`createRouterView` takes a default slot for unmatched URLs:

```tsx
const RouterView = createRouterView(router, views, {
  default: () => NotFound()
})
```

## Notes

- `signal-polyfill` must resolve to a **single copy**. The active runtime
  detects signals with `Signal.isState`, which returns `false` for instances
  created by a duplicate copy of the package — the signal would then be treated
  as a plain object. `vite.config.ts` pins it via `resolve.dedupe`.
- `src/theme.ts` holds module-level state, which under SSR is shared by every
  request in the process. A multi-user app should carry theme (and any other
  per-request state) in a request-scoped context instead.

## Learn More

- [Rasen Documentation](https://github.com/rasenjs/rasen#readme)
- [Vite Documentation](https://vitejs.dev/)
- [TC39 Signals proposal](https://github.com/tc39/proposal-signals)
