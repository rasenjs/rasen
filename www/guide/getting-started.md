# Getting Started

This guide sets up a Rasen project and walks through the two ways to write UI:
**JSX** (recommended — it goes through the compiler) and the **function
factories** (`div({ … })`) that JSX compiles down to.

## Requirements

- **Node.js 18+**
- A package manager (`npm`, `yarn` or `pnpm`)
- A bundler for JSX projects — the compiler ships a [Vite](https://vitejs.dev)
  plugin and a Babel plugin for Metro / React Native

## Option A — Start from the template

The `rasen-ts` template is an SSR + hydration app with isomorphic routing,
signals and the compiler already wired up:

```bash
npx degit rasenjs/rasen/templates/rasen-ts my-rasen-app
cd my-rasen-app
npm install
npm run dev          # http://localhost:3000
```

It is an ordinary Vite project, so `npm run build` produces the client and
server bundles.

## Option B — Add Rasen to an existing Vite project

```bash
# Runtime
npm install @rasenjs/web @rasenjs/router @rasenjs/reactive-signals signal-polyfill

# Compiler (dev dependency)
npm install -D @rasenjs/compiler
```

`@rasenjs/web` is the isomorphic entry: it resolves to the DOM renderer in the
browser and to the HTML/SSR renderer on the server, so one import works on both
sides. Individual packages are documented under [Packages](/packages/).

::: tip Release status
`@rasenjs/core`, `@rasenjs/dom`, `@rasenjs/html`, `@rasenjs/web`,
`@rasenjs/router*`, `@rasenjs/canvas-2d`, `@rasenjs/animation`, `@rasenjs/rn-dom`,
`@rasenjs/reactive-vue`, `@rasenjs/reactive-signals` and
`@rasenjs/reactive-nanostores` are published on npm. `@rasenjs/compiler`,
`@rasenjs/tw`, `@rasenjs/rota`, `@rasenjs/math`, `@rasenjs/assets` and the
experimental targets (`gfx`, `gpui`, `lvgl`, `lynx`, `react-native`) are still
in-repo only — install them from the
[repository](https://github.com/rasenjs/rasen) until the next release.
:::

### 1. Pick a reactive runtime

Rasen is reactive-system agnostic. Install one adapter and activate it **once**
at startup. With signals:

```typescript
// entry-client.ts
import { useReactiveRuntime } from '@rasenjs/reactive-signals'
import { createBrowserHistory } from '@rasenjs/router'
import { hydrate } from '@rasenjs/web'

useReactiveRuntime()

const root = document.getElementById('app')
if (root) hydrate(App(createBrowserHistory()), root)
```

With Vue's reactivity:

```typescript
import { useReactiveRuntime } from '@rasenjs/reactive-vue' // uses @vue/reactivity
import { ref, computed } from '@vue/reactivity'

useReactiveRuntime()

const count = ref(0)
const doubled = computed(() => count.value * 2)
```

See [Reactive Runtime](/guide/reactive-runtime) for every adapter, including the
built-in callable-ref runtime if you want zero extra dependencies.

### 2. Configure the compiler

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { rasenCompile } from '@rasenjs/compiler'

export default defineConfig({
  plugins: [rasenCompile.vite()]
})
```

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@rasenjs/web" // "@rasenjs/dom" for browser-only apps
  }
}
```

The plugin runs four passes:

| Pass | What it does | Default |
| ---- | ------------ | ------- |
| JSX attribute transform | wraps non-trivial attribute expressions in getters so bindings stay lazy | on |
| Static hoisting | turns a fully static subtree into one `template()` clone instead of a `createElement` chain | on |
| HMR | wraps `com()` components so edits remount cleanly in dev | on (dev only) |
| Structural rewrite | `.map()` → `each`, `cond && <El/>` / `cond ? <A/> : <B/>` → `when` | **off** — opt in with `structural: true` |

The structural pass is opt-in because it emits `each` / `when` calls from
`@rasenjs/core`, which only exist in a Rasen host. See
[JSX & the Compiler](/guide/advanced/jsx).

### 3. Write a component

```tsx
import { Signal } from 'signal-polyfill'
import { com } from '@rasenjs/core'

export const Counter = com(() => {
  const count = new Signal.State(0)

  return (
    <div class="counter">
      {/* a bare ref interpolates directly — the compiler emits a renderText()
          binding that unwraps it through the active runtime */}
      <p>Count: {count}</p>
      <button onClick={() => count.set(count.get() + 1)}>+</button>
    </div>
  )
})
```

`com()` gives every instance its own effect scope: subscriptions created during
setup and mount are collected and stopped on unmount.

### 4. Mount it

Client only:

```tsx
import { mount } from '@rasenjs/dom'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'

useReactiveRuntime()
mount(<Counter />, document.getElementById('app')!)
```

Server rendering plus hydration:

```tsx
// server
import { renderToString } from '@rasenjs/html'
const html = renderToString(<Counter />)

// client
import { hydrate } from '@rasenjs/web'
hydrate(<Counter />, document.getElementById('app')!)
```

A JSX element is itself a mountable, so `mount()` / `hydrate()` take it directly.

## Without JSX

Every host ships function factories with the same call shape, so the example
above can be written without a compiler step:

```typescript
import { com, ref } from '@rasenjs/core'
import { div, p, button, mount } from '@rasenjs/dom'

// The built-in runtime is the default, so no adapter is required for the
// zero-dependency path. Its refs are callable: `count()` reads, `count(v)` writes.
const Counter = com(() => {
  const count = ref(0)

  return div(
    { class: 'counter' },
    // a ref in a child position becomes a reactive text node
    p({}, 'Count: ', count),
    button({ onClick: () => count(count() + 1) }, '+')
  )
})

mount(Counter(), document.getElementById('app')!)
```

::: warning `textContent` is not a prop
The DOM renderer classifies each prop as either a DOM property (per tag) or an
attribute; `textContent` is neither, so `div({ textContent: 'hi' })` writes a
`text-content` attribute. Pass text as a child (`div({}, 'hi')`), use the
[`text` component](/guide/targets/dom#text), or write JSX.
:::

## Next Steps

- [Three-Phase Functions](/guide/three-phase-functions) — the component model
- [Reactive Runtime](/guide/reactive-runtime) — pick or write an adapter
- [Components](/guide/components) — `each`, `when`, `match`, transitions
- [Render Targets](/guide/render-targets) — DOM, Canvas 2D, RN, SSR
