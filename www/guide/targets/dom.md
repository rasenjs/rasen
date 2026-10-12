# DOM Rendering

`@rasenjs/dom` renders the same components to real DOM nodes. Its full reference
lives in the [package page](/packages/dom); this guide focuses on how bindings
behave.

## Overview

```tsx
import { Signal } from 'signal-polyfill'
import { useReactiveRuntime } from '@rasenjs/reactive-signals'
import { mount } from '@rasenjs/dom'

useReactiveRuntime()

const count = new Signal.State(0)

mount(
  <div class="counter">
    <span>Count: {count}</span>
    <button onClick={() => count.set(count.get() + 1)}>+</button>
  </div>,
  document.getElementById('app')!
)
```

## Element components

All standard HTML tags have named exports, plus `tag(name)` / `element({ tag })`
for anything else:

```typescript
import {
  div, span, p, a, img, br, hr,
  h1, h2, h3, h4, h5, h6,
  button, input, textarea, select, option, label, form,
  ul, ol, li, dl, dt, dd,
  table, thead, tbody, tr, th, td,
  header, footer, main, nav, section, article, aside,
  details, summary, dialog, canvas
} from '@rasenjs/dom'
```

Each factory takes `el()`, `el(child)`, `el(props)` or `el(props, ...children)`.

## Props

### Attributes and properties

```typescript
div({ id: 'my-div', class: 'container', title: 'Hello' })
input({ type: 'checkbox', checked: isChecked, disabled: isDisabled })
```

Props are classified per tag: `value` / `checked` / `indeterminate` /
`selectedIndex` / `selected` and the common `disabled` / `readOnly` /
`multiple` / `hidden` are written as DOM **properties**; everything else goes
through `setAttribute`. `data*` and `aria*` keys are kebab-cased
(`ariaChecked` → `aria-checked`); other keys are written as-is, and HTML
attribute names are case-insensitive.

::: warning Two props that do not exist
- `textContent` / `innerHTML` — pass a child or use `text()` / `html()`.
- `attrs` (an object of attributes) — that form belongs to the HTML renderer;
  in the DOM renderer pass the attributes as top-level props.
:::

### Reactive values

Every prop accepts a `PropValue` — a plain value, a ref, or a getter:

```typescript
div({
  // getter: subscribed, re-evaluated only when a dependency changes
  class: () => (isActive() ? 'active' : 'inactive'),
  style: {
    backgroundColor: () => (isHovered() ? 'blue' : 'gray'),
    transform: () => `scale(${scale()})`
  },
  hidden: !open()
})
```

A binding whose source reads no reactive dependency installs no subscription at
all, and an equal value never re-triggers a write — so static props cost one
assignment.

### Text

```typescript
// a ref child → reactive text node
span({}, count)

// a getter-driven text node (imported from @rasenjs/dom, not @rasenjs/core)
text({ content: () => `Count: ${count()}` })

// JSX: a bare ref interpolates directly
// <span>Count: {count}</span>
```

A **plain getter child** (`div({}, () => 'text')`) is invoked once and is not
re-evaluated later — it is treated as a child factory, not a getter binding.

::: tip Readonly refs
`PropValue` accepts a value, a ref or a getter. A *readonly* ref (Vue's
`ComputedRef`, whose type has no setter) is assignable from an adapter that types
its refs as readable — with Vue, pass the writable ref in a child position, or
`text({ content: () => computed.value })`, which subscribes to the read.
:::

### Events

```typescript
button({
  onClick: (e) => console.log('clicked', e),
  onMouseEnter: () => (hovered = true),
  onMouseLeave: () => (hovered = false)
})
```

`onX` is camelCase; the listener is registered for the lowercased name
(`onClick` → `click`). Bubbling event types are delegated to a single document
listener — see `configureEventDelegation` if a host needs direct listeners.

### Children

```typescript
ul({}, li('One'), li('Two'), li('Three'))

// arrays are supported, but must be flat
div({ children: [span({}, 'a'), span({}, 'b')] })
```

Accepted children: `string`, `number`, a ref, a getter returning text, and a
mountable (a component, `when(...)`, `each(...)`, a JSX element, …).

## Hydration

```typescript
import { hydrate } from '@rasenjs/dom'

hydrate(App(), document.getElementById('app'))
```

`hydrate()` walks the server-rendered DOM and attaches bindings instead of
recreating nodes, then removes anything left unconsumed. It is a module-level
singleton cursor, so roots cannot be hydrated concurrently or nested — mount
each root from its own entry point.

## Compiled templates

When the [compiler](/packages/compiler) hoists a subtree it emits code against
`@rasenjs/dom/template`: `template(html)` clones a `<template>` once and caches
it, `child(parent, index)` walks to a slot, `mountSlot` / `collectHtml` bridge
component children, and the binding helpers (`bindText`, `bindClass`,
`bindProp`, `bindAttr`, `bindStyle`, `on`, `setValue`) are re-exported from the
same entry so compiled output has a single import source.

## Next Steps

- [@rasenjs/dom package reference](/packages/dom)
- [Canvas 2D](/guide/targets/canvas-2d) — the same reactive model on a canvas
- [HTML (SSR)](/guide/targets/html-ssr) — the string host, for hydration
