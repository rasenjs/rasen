# @rasenjs/core

The paradigm and the primitives of [Rasen](https://github.com/rasenjs/rasen):
one `Mountable` contract, host-agnostic structural components, and the reactive
runtime boundary. It has **no dependencies** and does no rendering of its own.

## Installation

```bash
npm install @rasenjs/core
```

## The contract

```typescript
type Mountable<Node = unknown> = (
  node: Node,
  hooks: HostHooks<Node> | undefined
) => (() => void) | undefined

type SyncComponent<Host, Props> = (props: Props) => Mountable<Host>
type AsyncComponent<Host, Props> = (props: Props) => Promise<Mountable<Host>>
type Component<Host, Props> = SyncComponent<Host, Props> | AsyncComponent<Host, Props>
```

A component takes props and returns a `Mountable`. Mounting receives the host
plus the host's capability set (`HostHooks`) and returns a cleanup function.
Closures hold the state — there is no component instance, no virtual DOM and no
re-render pass.

## `com` — effect-scoped components

`com()` gives each instance its own effect scope: subscriptions created during
setup **and** during mount are collected and stopped together on unmount.

```typescript
import { com, getReactiveRuntime, ref } from '@rasenjs/core'

const Counter = com((initial: number) => {
  // The built-in runtime's refs are callable: count() reads, count(v) writes.
  const count = ref(initial)
  const increment = () => count(count() + 1)

  return (host: HTMLElement) => {
    const el = document.createElement('button')
    el.textContent = `Count: ${count()}`
    host.appendChild(el)

    const stop = getReactiveRuntime().subscribe(count, (v) => {
      el.textContent = `Count: ${v}`
    })

    return () => {
      stop()
      el.remove()
    }
  }
})
```

`com` is what the compiler's dev-only HMR pass wraps, so a component declared
with it remounts cleanly when its module is edited.

## Reactive runtime

Rasen never implements reactivity itself — it calls into the active adapter
through this interface:

```typescript
interface ReactiveRuntime {
  /** Unified binding primitive. A source that reads no dependency installs no
   *  subscription; equal values skip the callback. */
  subscribe<T>(getter: () => T, callback: (value: T, oldValue: T) => void): () => void
  /** Component lifetime: com() collects subscriptions here and stops them. */
  effectScope(): { run<T>(fn: () => T): T | undefined; stop(): void }
  ref<T>(value: T): Ref<T>
  unref<T>(value: T | Ref<T>): T
  setValue<T>(ref: Ref<T>, value: T): void
  isRef(value: unknown): boolean
}
```

```typescript
import { setReactiveRuntime, getReactiveRuntime, toValue } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'

setReactiveRuntime(createReactiveRuntime())  // usually via useReactiveRuntime()
const runtime = getReactiveRuntime()
```

`getReactiveRuntime()` never throws: with no adapter installed it lazily creates
a **built-in zero-dependency runtime** whose refs are callable
(`count()` / `count(v)`), so a project can start with no reactivity library at
all. Install an adapter when you want your own reactive primitives to drive the
UI — see [Available adapters](#available-adapters).

`PropValue<T> = T | Ref<T> | ReadonlyRef<T>` is the type every host prop accepts:
a plain value, a ref, or a getter function. `toValue()` resolves any of the three.

## Structural components

Host-agnostic components that any target can mount — they only need
`HostHooks`:

| Component | Purpose |
| --------- | ------- |
| `each({ of, children })` | keyed list reconciliation by object identity (`of` may be an array, a ref, or a getter — a getter is what keeps it subscribed) |
| `repeat(count, render)` | index-based repetition |
| `when({ condition, then, else? })` | conditional subtree; both branches are getters |
| `match({ value, cases, default? })` (alias `switchCase`) | multi-way branch; `cases` maps keys to branches, or is a list of `[condition, branch]` pairs |
| `fragment({ children, hooks? })` | siblings with no wrapper; needs `createText` hooks for text children |
| `lazy({ loader, loading? })` | async component boundary with a loading placeholder while the promise resolves |

```typescript
import { each, when, ref } from '@rasenjs/core'

each({
  of: () => rows(),                     // getter → reads the dependency
  children: (row) => Row(row)
})

when({
  condition: () => visible(),
  then: () => Panel(),
  else: () => null
})
```

The compiler can emit these for you: `.map()` → `each`, `cond && <El/>` and
`cond ? <A/> : <B/>` → `when` (see
[`@rasenjs/compiler`](https://github.com/rasenjs/rasen/tree/main/packages/compiler), `structural: true`).

## JSX runtime

`@rasenjs/core` provides the host-agnostic JSX runtime that host packages
re-export and extend with their own tag table:

```typescript
import { jsx, jsxs, Fragment, registerTag, configureTags } from '@rasenjs/core'

configureTags({ '': { div: myDivComponent, span: mySpanComponent } })
```

Lowercase tags are looked up in the registry (`configureTags` / `registerTag`),
PascalCase tags are called directly as components, and `Fragment` is `<>…</>`.

## SSR emission

`collectHtml()` mounts a component against a string host and returns the markup
— it is what a compiled component's SSR branch calls when a child is a
component rather than a template.

## Available adapters

| Adapter | Reactivity | Notes |
| ------- | ---------- | ----- |
| [`@rasenjs/reactive-vue`](https://github.com/rasenjs/rasen/tree/main/packages/reactive-vue) | `@vue/reactivity` | `useReactiveRuntime()`; refs are `.value` objects |
| [`@rasenjs/reactive-signals`](https://github.com/rasenjs/rasen/tree/main/packages/reactive-signals) | TC39 Signals (`signal-polyfill`) | `useReactiveRuntime()`; `Signal.State` / `Signal.Computed` act as refs |
| [`@rasenjs/reactive-nanostores`](https://github.com/rasenjs/rasen/tree/main/packages/reactive-nanostores) | [nanostores](https://github.com/nanostores/nanostores) | atoms + computed |
| [`@rasenjs/reactive-alien-signals`](https://github.com/rasenjs/rasen/tree/main/packages/reactive-alien-signals) | [alien-signals](https://github.com/stackblitz/alien-signals) | signal core used by Vue Language Tools |

The public helpers `ref`, `computed`, `unref`, `setValue`, `toValue`,
`watchObjectProps` and `rafSchedule` come from core itself so no adapter is
needed for basic use.

## License

MIT
