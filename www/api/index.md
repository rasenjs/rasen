# API Reference

The stable public surface, package by package. Deep dives live in the
[guide](/guide/introduction); this page is the index you keep open while coding.

## `@rasenjs/core`

### Paradigm

```typescript
type Mountable<Node = unknown> = (
  node: Node,
  hooks: HostHooks<Node> | undefined
) => (() => void) | undefined

type SyncComponent<Host, Props> = (props: Props) => Mountable<Host>
type AsyncComponent<Host, Props> = (props: Props) => Promise<Mountable<Host>>
type Component<Host, Props> = SyncComponent<Host, Props> | AsyncComponent<Host, Props>

type PropValue<T> = T | Ref<T> | ReadonlyRef<T>
type Ref<T> = unknown            // opaque: only the active runtime may read it
```

### Functions

| Export | Description |
| ------ | ----------- |
| `com(component)` | wraps a component so each instance gets an effect scope; subscriptions made during setup and mount stop together |
| `mount(mountable, node, hooks?)` | renderer-agnostic mount of a mountable |
| `setReactiveRuntime(runtime)` / `getReactiveRuntime()` | install / read the active adapter; `getReactiveRuntime()` lazily creates the built-in runtime when none is installed |
| `ref(value)` | built-in callable ref: `count()` reads, `count(v)` writes |
| `computed(getter)` | built-in derived ref |
| `unref(ref)` / `setValue(ref, v)` / `toValue(prop)` | unwrap a ref; write a ref; resolve `PropValue` (value / ref / getter) |
| `toValue(prop)` | resolve a `PropValue` — value, ref or getter — to a value (used when you write a host) |

### Reactive runtime interface

```typescript
interface ReactiveRuntime {
  subscribe<T>(getter: () => T, callback: (value: T, oldValue: T) => void): () => void
  effectScope(): { run<T>(fn: () => T): T | undefined; stop(): void }
  ref<T>(value: T): Ref<T>
  unref<T>(value: T | Ref<T>): T
  setValue<T>(ref: Ref<T>, value: T): void
  isRef(value: unknown): boolean
}
```

[Reactive Runtime →](/guide/reactive-runtime)

### Structural components

| Export | Props |
| ------ | ----- |
| `each` | `{ of: T[] \| Ref<T[]> \| (() => T[]), children: (item, index) => Mountable }` |
| `repeat` | `(count, render: (index) => Mountable)` |
| `when` | `{ condition: PropValue<boolean>, then: () => Mountable, else?: () => Mountable }` |
| `match` / `switchCase` | `{ value, cases: Record<K, (k) => Mountable> \| [condition, branch][], default? }` |
| `fragment` / `f` | `{ children, hooks? }` — siblings without a wrapper |
| `lazy` | `{ loader: () => Promise<Mountable>, loading?: () => Mountable }` |

### JSX runtime

```typescript
import { Fragment, registerTag, configureTags } from '@rasenjs/core'
```

`registerTag(name, component)` / `configureTags({ prefix: tags })` teach the
runtime what a lowercase tag means (PascalCase tags need no registration). Host
packages register their own tags in their `jsx-runtime` entry.
[JSX & the Compiler →](/guide/advanced/jsx)

## `@rasenjs/dom`

| Export | Description |
| ------ | ----------- |
| `mount(mountable, container)` | mount into an element |
| `hydrate(component, container)` | claim server-rendered DOM |
| `tag(name)`, `element({ tag, … })`, `h` | element factory (`el()`, `el(child)`, `el(props)`, `el(props, …children)`) |
| every HTML tag | `div`, `span`, `button`, `input`, `label`, `details`, … |
| `text({ content })`, `html({ content })` | reactive text node; raw HTML node |
| `canvas({ width, height, contextType?, children, … })` | canvas bridged to canvas-2d (`'2d'`) or gfx (`'webgl'`, `'webgl2'`, `'webgpu'`) |
| `each`, `repeat`, `when`, `match`, `show`, `transition`, `transitionGroup`, `lazy`, `fragment` | structural + animation components |
| `bindLookControls(canvas, { yaw, pitch, locked })` | pointer-lock look controls (yaw/pitch refs, clamped pitch) |
| `setupKeyboard(map)` | keyboard shortcuts bound to handlers |
| `mod`, `prevent`, `stop`, `once`, `self`, `key`, `enter`, `esc`, `tab`, `space` | event-handler modifiers (`onClick={mod(prevent(fn))}`) |

[@rasenjs/dom →](/packages/dom)

## `@rasenjs/compiler`

```typescript
import { rasenCompile } from '@rasenjs/compiler'
```

```typescript
rasenCompile.vite(options?)      // also: .webpack() .rspack() .esbuild()

interface RasenCompilerPluginOptions {
  templateSource?: string        // default '@rasenjs/dom/template'
  intrinsicTags?: Set<string>    // host tags safe to hoist
  enabled?: boolean
  compile?: boolean              // static hoisting (default true)
  jsxTransform?: boolean         // attribute getters (default true)
  hmr?: boolean                  // dev-only remount boundaries (default true)
  structural?: boolean           // .map()/&&/?: rewrites (default FALSE)
  exclude?: string[]
}
```

Metro / React Native and other Babel pipelines use
`@rasenjs/compiler/babel` instead, and that adapter compiles only modules that
carry the `@rasen-compile` directive.

[@rasenjs/compiler →](/packages/compiler)

## `@rasenjs/html`

| Export | Description |
| ------ | ----------- |
| `renderToString(mountable)` | render to an HTML string |
| `renderToStringMultiple(mountables)` | render several roots, concatenated |
| HTML tags | `div`, `span`, `p`, `ul`, `li`, `form`, `table`, … (`el(props, …children)`; `attrs` is accepted here) |
| `element({ tag, … })` | any tag name, including a document-shell tag (`title`, `meta`, …) |
| `text`, `html`, `fragment`, `when`, `each`, `match`, `transition` | the same component set as DOM |

[@rasenjs/html →](/packages/html)

## `@rasenjs/web`

Re-exports the DOM half (plus `@rasenjs/router-dom`) in the browser and the HTML
half (plus `@rasenjs/router-html`) on the server, chosen by the
`browser` / `ssr` / `node` export conditions. `@rasenjs/web/elements` is the
routing-free subset for component libraries.

## `@rasenjs/router`

```typescript
const router = createRouter(routes, { history })

router.current        // current RouteMatch
router.push(route, { params })
router.replace(route, { params })
router.href(route, { params })
router.beforeEach(cb) / afterEach(cb) / onError(cb)
```

| Export | Description |
| ------ | ----------- |
| `route(path, options?)` | declare a route |
| `template` / `tpl` | path template with typed params (zod peer dependency) |
| `createRouter(routes, { history })` | create the router; `routes` may nest |
| `createBrowserHistory()` / `createHashHistory()` / `createMemoryHistory()` | history adapters; memory history is what SSR uses |
| `createRouterView(router, views, fallback?)` | route → component table (from `router-dom` / `router-html`) |
| `createRouterLink(router)` (`createLink`) | link component |
| `layout(config)` / `useScrollRestoration(router)` / `createLeaveGuard(router)` | shell layout, scroll restoration, leave guard |

[@rasenjs/router →](/packages/router)

## Reactivity adapters

```typescript
import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime, useReactiveRuntime } from '@rasenjs/reactive-vue'

useReactiveRuntime()                            // the usual entry point
setReactiveRuntime(createReactiveRuntime())     // or wire the adapter up yourself
```

`reactive-vue` also exports `ref`, `unref`, `setValue`; `reactive-signals` and
`reactive-alien-signals` export `ref`, `computed`, `unref`, `isRef`.
[Reactive Runtime →](/guide/reactive-runtime)

## Animation, styling, UI

| Package | Entry points |
| ------- | ------------ |
| `@rasenjs/animation` | `tween`, `spring`, `frame`, `all`, `getEasing`, easing functions |
| `@rasenjs/tw` | `tw(...)`: Tailwind-style class string → style record (`@rasenjs/tw/perry` for the AOT path) |
| `@rasenjs/rota` | headless UI components (`primitive`, dialog, popover, menu, …) |

## Targets

| Package | Entry points |
| ------- | ------------ |
| `@rasenjs/canvas-2d` | shape components: `rect`, `text`, `circle`, `path`, `group`, `sprite`, `spine`, … |
| `@rasenjs/react-native` | RN components (`View`, `Text`, `Pressable`, `FlatList`, …) and `registerApp(appName, App)` to mount |
| `@rasenjs/rn-dom` | the DOM-like document/reactor layer under `@rasenjs/react-native` — see its [package page](/packages/rn-dom) |
