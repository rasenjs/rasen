# Reactive Runtime

Rasen does not implement reactivity. It calls into whichever reactive system you
already use through a small interface, so the same components can be driven by
Vue refs, TC39 Signals, nanostores, or the zero-dependency runtime built into
`@rasenjs/core`.

## The interface

```typescript
interface ReactiveRuntime {
  /** The one binding primitive every renderer uses. */
  subscribe<T>(getter: () => T, callback: (value: T, oldValue: T) => void): () => void

  /** Component lifetime: com() collects subscriptions here and stops them. */
  effectScope(): { run<T>(fn: () => T): T | undefined; stop(): void }

  ref<T>(value: T): Ref<T>
  unref<T>(value: T | Ref<T>): T
  setValue<T>(ref: Ref<T>, value: T): void
  isRef(value: unknown): boolean
}
```

`subscribe` carries two guarantees the renderers rely on:

1. **Static sources install nothing.** If the first evaluation of `getter`
   collects no dependency, there is no subscription to maintain.
2. **Equal values are skipped.** A change that evaluates to an `Object.is`-equal
   result never calls back.

Together they let a binding treat static and dynamic input identically — a
static binding degrades to a single write instead of a watcher.

## Built-in runtime

`getReactiveRuntime()` never throws. With no adapter installed it lazily creates
a **zero-dependency runtime** whose refs are callable:

```typescript
import { ref, unref, computed } from '@rasenjs/core'

const count = ref(0)
count()            // read → 0
count(5)           // write → 5
const double = computed(() => count() * 2)
```

This is enough to use Rasen with no reactive library at all, and it is what the
element factories fall back to in tests and SSR.

## Adapters

Install one adapter and activate it **once** before mounting:

::: code-group

```typescript [Vue]
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { ref, computed, reactive } from '@vue/reactivity'

useReactiveRuntime()

const count = ref(0)
const doubled = computed(() => count.value * 2)
```

```typescript [Signals]
import { useReactiveRuntime, ref, computed } from '@rasenjs/reactive-signals'
import { Signal } from 'signal-polyfill'

useReactiveRuntime()

// either the adapter's helpers…
const count = ref(0)

// …or signal-polyfill directly: Signal.State / Signal.Computed are recognized
// as refs by the runtime
const total = new Signal.State(0)
const doubled = computed(() => count.value * 2)
```

```typescript [Nanostores]
import { useReactiveRuntime } from '@rasenjs/reactive-nanostores'
import { atom, computed } from 'nanostores'

useReactiveRuntime()

const count = atom(0)
const doubled = computed(count, (n) => n * 2)
```

```typescript [Alien Signals]
import { useReactiveRuntime, ref } from '@rasenjs/reactive-alien-signals'

useReactiveRuntime()

const count = ref(0)   // alien-signals signal, callable: count() / count(5)
```

:::

`useReactiveRuntime()` is a thin wrapper over `createReactiveRuntime()` +
`setReactiveRuntime()`; use the `create*` form when you want to build a runtime
yourself (for testing, or to pick options).

::: tip One adapter per page
The adapter is global, and it also decides what counts as a ref
(`runtime.isRef`). Two adapters at once means two incompatible ref flavors, so
installing a second one replaces the first.
:::

## PropValue: value, ref or getter

Host props accept `PropValue<T>` — a plain value, a ref, or a getter function:

```typescript
import type { PropValue } from '@rasenjs/core'

interface Props {
  class: PropValue<string>
  hidden: PropValue<boolean>
}
```

```typescript
div({
  class: 'card',                        // static: one write, no subscription
  hidden: isHidden,                     // ref: subscribed
  title: () => `Count: ${count()}`,     // getter: subscribed
  style: { opacity: () => (open() ? '1' : '0') }
})
```

A getter re-evaluates whenever anything it read changes, so it is the most
direct way to express a derived value without creating a computed.

### Children are different

A child position resolves **values, refs and mountables**, not getters:

| Child | Result |
| ----- | ------ |
| `'text'` / `42` | static text node |
| a ref | reactive text node, updated through the runtime |
| a mountable (`when(…)`, a component, a JSX element) | mounted |
| a plain getter | called once for its text — use `text({ content })` for a reactive text node |

In JSX, `{count}` on a ref compiles to that reactive text binding for you.

## Custom runtime

An adapter is ~60 lines: implement the six members and call
`setReactiveRuntime()`. See
[Custom Reactive Runtime](/guide/advanced/custom-reactive) for a walkthrough.

## Next Steps

- [Three-Phase Functions](/guide/three-phase-functions) — where state lives
- [Render Targets](/guide/render-targets) — who consumes the bindings
- [@rasenjs/core reference](/packages/core) — the exports in one place
