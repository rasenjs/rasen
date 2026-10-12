# Components

A Rasen component is a plain function: it takes props and returns a mountable.
There is no component class, no instance object and no virtual DOM — state lives
in closures.

## Basic structure

```tsx
import { com } from '@rasenjs/core'

export const Greeting = com((props: { name: string }) => (
  <p>Hello, {props.name}!</p>
))
```

`com()` is optional but recommended: it gives every instance its own effect
scope, so subscriptions created during setup and mount are stopped together on
unmount, and it is what the compiler's dev-only HMR pass wraps.

The returned value can be:

- a JSX element (or a plain mountable)
- a function that receives the host, for hand-written DOM work
- a `Promise` of the above (`AsyncComponent`) — great for `lazy()`

```tsx
// A component without com(): still valid, you own the cleanup
const Clock = () => (host: HTMLElement) => {
  const tick = setInterval(() => (host.textContent = new Date().toLocaleTimeString()), 1000)
  return () => clearInterval(tick)
}
```

## Reactive state

State comes from the reactivity library you chose, created inside the component
so each instance gets its own copy:

```tsx
import { Signal } from 'signal-polyfill'
import { com } from '@rasenjs/core'

export const Counter = com(() => {
  const count = new Signal.State(0)
  const double = new Signal.Computed(() => count.get() * 2)

  return (
    <div class="counter">
      <span>{count}</span>
      <span>{double} when doubled</span>
      <button onClick={() => count.set(count.get() + 1)}>+</button>
    </div>
  )
})
```

A **bare ref interpolates directly**: the compiler emits a `renderText()`
binding that unwraps it through the active runtime. Expressions derived from a
ref read explicitly (`isEven.get() ? 'Even' : 'Odd'`).

Without the compiler, use the same value in a child position (`<span>{count}</span>`
becomes `span({}, count)`) or `text({ content })`.

## Props and reactive props

Props are ordinary arguments — type them with an interface:

```tsx
interface UserProps {
  name: string
  avatar: string
  status?: () => string        // a PropValue: getter, ref or plain value
}

export const UserCard = com((props: UserProps) => (
  <div class="user-card">
    <img src={props.avatar} alt={props.name} />
    <span>{props.name}</span>
    <span class={props.status ? () => `status-${props.status!()}` : 'status-offline'} />
  </div>
))

// Any prop value can also be a ref or a static value: PropValue<T> = T | Ref<T> | ReadonlyRef<T>
```

Attributes accept a getter, a ref or a value; the binding layer decides at
runtime whether to subscribe, so passing a static string costs one write and no
watcher.

## Composition

Components compose by calling each other, and children are just props:

```tsx
export const Layout = com((props: {
  header?: Mountable<HTMLElement>
  sidebar?: Mountable<HTMLElement>
  content: Mountable<HTMLElement>
  footer?: Mountable<HTMLElement>
}) => (
  <div class="layout">
    {props.header && <div class="header">{props.header}</div>}
    <div class="main">
      {props.sidebar && <aside class="sidebar">{props.sidebar}</aside>}
      <main class="content">{props.content}</main>
    </div>
    {props.footer && <div class="footer">{props.footer}</div>}
  </div>
))
```

::: tip `&&` and `.map()` need the structural pass
`{props.header && <div …/>}` and `{rows.map(…)}` compile to `when()` / `each()`
only when the compiler's **structural** pass is enabled (`structural: true`).
Without it they stay ordinary JSX expressions — still correct, just without
reconciliation.
:::

## Slots

There is no slot syntax: pass mountables. Named slots are props, dynamic
content is `children`:

```tsx
export const Card = com((props: { title: string; children?: Mountable<HTMLElement> }) => (
  <div class="card">
    <div class="card-title">{props.title}</div>
    <div class="card-body">{props.children}</div>
  </div>
))
```

## Instance state vs shared state

State created inside a component belongs to that instance:

```tsx
<div>
  <Counter />
  <Counter />  {/* independent state */}
</div>
```

State created at module scope is shared by every instance:

```tsx
const globalCount = new Signal.State(0)

export const CounterA = () => <span>{globalCount}</span>
export const CounterB = () => <span>{globalCount}</span>
```

## Composable functions

Anything reusable can be a plain function that returns state — the Rasen
equivalent of a composable:

```tsx
const useToggle = (initial = false) => {
  const open = new Signal.State(initial)
  return {
    open,
    toggle: () => open.set(!open.get()),
    setTrue: () => open.set(true),
    setFalse: () => open.set(false)
  }
}

export const Dropdown = com((props: { label: string; children?: Mountable<HTMLElement> }) => {
  const { open, toggle } = useToggle()

  return (
    <div class="dropdown">
      <button onClick={toggle}>{props.label}</button>
      <div class="dropdown-menu" style={{ display: open.get() ? 'block' : 'none' }}>
        {props.children}
      </div>
    </div>
  )
})
```

## Lists

With the structural pass, `.map()` in a child position becomes `each()` — keyed
by object identity, so reordering and removal move nodes instead of rebuilding
them:

```tsx
const TodoList = com((props: { todos: Signal.State<Todo[]> }) => (
  <ul>
    {props.todos.get().map((todo) => (
      <li class={todo.done ? 'done' : ''} onClick={() => todo.done = true}>
        {todo.text}
      </li>
    ))}
  </ul>
))
```

Explicitly, `each` takes `of` (array, ref or getter) and a render callback:

```typescript
import { each } from '@rasenjs/core'

each({
  of: () => todos.get(),          // getter → reads the dependency
  children: (todo, index) => TodoRow(todo, index)
})
```

Use `repeat(count, render)` when you need N identical rows rather than a list.

## Conditionals

`when` swaps a branch (mount/unmount); `show` toggles `display` and keeps the
subtree alive:

```typescript
import { when, match, show } from '@rasenjs/core'

when({ condition: () => isLoggedIn(), then: () => UserPanel(), else: () => LoginForm() })

show({ when: isVisible, children: HeavyPanel() })   // stays mounted, hidden via CSS

match({
  value: () => currentTab(),
  cases: { home: () => HomePage(), user: (key) => UserPage({ key }) },
  default: () => NotFound()
})
```

In JSX these are the `cond && <El/>` and `cond ? <A/> : <B/>` forms once the
structural pass is on.

## Async components

`lazy()` mounts a placeholder while a component loads:

```typescript
import { lazy } from '@rasenjs/core'

const HeavyChart = lazy({
  loader: () => import('./HeavyChart').then((m) => m.HeavyChart()),
  loading: () => spinner()
})
```

## Best practices

1. **Keep components focused** — one component, one responsibility; extract
   reusable logic into composable functions.
2. **Create state where it belongs** — inside `com()` for instance state, at
   module scope for shared state. A ref created inside a component body
   (outside the returned factory) is re-created on every call.
3. **Type your props** — components are plain functions, so `interface` +
   parameter types give full inference; there is no generic component type to
   fight with.
4. **Let props be getters when they are cheap** — `PropValue` covers value /
   ref / getter, so the binding layer can stay lazy without the caller deciding.
5. **Prefer `show` for cheap, frequently toggled subtrees** and `when` when the
   subtree is expensive to keep alive.

## Next Steps

- [Three-Phase Functions](/guide/three-phase-functions) — the lifecycle behind `com()`
- [Reactive Runtime](/guide/reactive-runtime) — where state comes from
- [JSX & the Compiler](/guide/advanced/jsx) — what the compiler does to this code
