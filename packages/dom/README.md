# @rasenjs/dom

The DOM renderer for [Rasen](https://github.com/rasenjs/rasen): typed element
factories, fine-grained bindings, structural components, SSR-aware template
cloning and hydration.

## Installation

```bash
npm install @rasenjs/dom @rasenjs/core
# pick one reactivity adapter
npm install @rasenjs/reactive-vue @vue/reactivity
```

## Quick start

```tsx
import { Signal } from 'signal-polyfill'
import { useReactiveRuntime } from '@rasenjs/reactive-signals'
import { mount } from '@rasenjs/dom'

useReactiveRuntime()

const name = new Signal.State('World')

mount(
  <div class="app">
    <input
      value={name}
      onInput={(e) => name.set((e.target as HTMLInputElement).value)}
    />
    <p>Hello, {name}!</p>
  </div>,
  document.getElementById('app')!
)
```

The JSX runtime lives at `@rasenjs/dom/jsx-runtime`; point
`compilerOptions.jsxImportSource` at `@rasenjs/dom` and the
[compiler](https://github.com/rasenjs/rasen/tree/main/packages/compiler) hoists the static parts into a single `template()`
clone.

## Without JSX

Every tag is also a function with four call forms:

```typescript
import { div, p, input, button, mount } from '@rasenjs/dom'
import { ref } from '@rasenjs/core'

const name = ref('World')

const App = () =>
  div(
    { class: 'app' },
    input({ value: name, onInput: (e) => name(e.target.value) }),
    // a ref in a child position becomes a reactive text node
    p({}, 'Hello, ', name, '!')
  )

mount(App(), document.getElementById('app'))
```

```typescript
el()               // empty element
el(child)          // single child
el(props)          // props only
el(props, ...kids) // props + extra children
```

Use `tag('my-element')` (or `element({ tag: 'my-element' })`) for a tag that has
no named export.

### Props

| Kind | Examples | Behaviour |
| ---- | -------- | --------- |
| class | `class` | written through `bindClass`; a static string subscribes to nothing. In JSX, `className` is accepted too — the JSX runtime and the compiler normalize it to `class` |
| style | a record (`{ fontSize: 16 }`) or a string | object → per-declaration write, each declaration may itself be a `PropValue` |
| events | `onClick`, `onInput`, `onPointerDown`, … | `onX` in camelCase; the listener name is lowercased (`onClick` → `click`) |
| DOM properties | `value`, `checked`, `indeterminate` (input), `value` (textarea/select), `selected` (option), `selectedIndex`, plus the common `disabled`, `readOnly`, `multiple`, `hidden` | assigned on the element, not through `setAttribute` |
| everything else | `id`, `title`, `href`, `tabIndex`, … | attribute, written as given — attribute names are case-insensitive in HTML, so `tabIndex` and `tabindex` address the same attribute |
| `data-*` / `aria-*` | `dataState`, `ariaChecked` | kebab-cased to `data-state` / `aria-checked` |
| `ref` | `ref={myRef}` | receives the element on mount, `null` on unmount |

::: warning Not props
`textContent` and `innerHTML` are not special props — they would be written as
`text-content` / `inner-html` attributes. Use a child, the
[`text`](#text) component, or JSX. Event objects (`on: { click }`) are no longer
supported either; pass `onClick`.
:::

### Reactive values

Any prop value can be a `PropValue<T>` — a plain value, a ref, or a getter
function:

```typescript
div({
  class: () => (active() ? 'box box--active' : 'box'), // getter → subscribed
  style: { opacity: () => (visible() ? '1' : '0') },
  onClick: handleClick
})
```

Child positions are different: a **ref** child is reactive, a **mountable**
child is mounted, and a plain getter child is invoked once for its text (it is
not re-evaluated). Use `text()` when you want a getter-driven text node:

```typescript
import { text } from '@rasenjs/dom'

p({}, text({ content: () => `Count: ${count()}` }))
```

### Children

Accepted child kinds: `string`, `number`, a ref, a getter returning
`string | number`, and a `Mountable`. Pass a **flat** array — the factory does
not flatten nested arrays (the JSX runtime does).

## Components

| Export | Description |
| ------ | ----------- |
| `tag(name)` / `element({ tag, … })` / `h` | element factory |
| `text({ content })` | reactive text node |
| `html({ content })` | raw HTML node (escapes nothing) |
| `canvas({ width, height, contextType?, children })` | `<canvas>` bridged to a renderer — `'2d'` (default) reaches `@rasenjs/canvas-2d`, `'webgl'`/`'webgl2'`/`'webgpu'` reach `@rasenjs/gfx`; the bridge also re-exports that target's `createRoot` |
| `each`, `repeat`, `when`, `match`, `show`, `fragment`/`f`, `lazy` | re-exported from core |
| `transition({ when, children, name? })` (`fade`, `slide`, `scale`) | enter/leave CSS transitions |
| `transitionGroup` (`listFade`, `listSlide`) | transitions for list items |
| `mount(mountable, container)` | mount into an element |
| `hydrate(component, container)` | claim server-rendered DOM instead of creating it |
| `mountSlot` / `collectHtml` / `template` / `child` | primitives the compiler emits |

`show` keeps the element in the DOM and toggles `display`; `when` mounts and
unmounts. Use `show` for frequently toggled panels and `when` when the subtree
is expensive to keep alive.

## SSR and hydration

The same component tree renders on the server through
[`@rasenjs/html`](https://github.com/rasenjs/rasen/tree/main/packages/html); on the client `hydrate()` walks the existing DOM and
attaches bindings instead of recreating nodes:

```typescript
import { hydrate } from '@rasenjs/dom'

hydrate(App(), document.getElementById('app'))
```

Hydration state is a module-level singleton, so `hydrate()` cannot be nested —
mount each root from its own entry point. Compiled templates claim their
server-rendered counterpart through the same cursor, which is why text nodes and
slot anchors only need to line up between the two renderers, not be identical.

## Host hooks

`mount()` passes `hostHooks` to every mountable: marker creation, insertion,
detachment, batching and bounded hosts. Structural components
(`each` / `when` / `match`) degrade gracefully when a hook is missing — the
contract per hook is documented in `host-hooks.ts`.

## License

MIT
