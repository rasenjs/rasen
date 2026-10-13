# JSX & the Compiler

JSX is the recommended authoring syntax in Rasen, and the
[`@rasenjs/compiler`](/packages/compiler) is what makes it cheap: it turns a
static subtree into one `template()` clone and each dynamic slot into a single
fine-grained binding. There is no virtual DOM in the output — you can read the
generated code and see the DOM calls.

## Setup

```bash
npm install -D @rasenjs/compiler
```

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { rasenCompile } from '@rasenjs/compiler'

export default defineConfig({ plugins: [rasenCompile.vite()] })
```

```jsonc
// tsconfig.json — pick the host whose JSX runtime you want
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@rasenjs/web" // "@rasenjs/dom", "@rasenjs/html", "@rasenjs/react-native", …
  }
}
```

Each host package exposes `jsx-runtime` / `jsx-dev-runtime` entries, so JSX
works even without the compiler — the compiler only decides how much of it
becomes a template.

## Usage

```tsx
import { Signal } from 'signal-polyfill'
import { useReactiveRuntime } from '@rasenjs/reactive-signals'
import { mount } from '@rasenjs/dom'

useReactiveRuntime()

const App = () => {
  const count = new Signal.State(0)

  return (
    <div class="app">
      <h1>Hello Rasen</h1>
      {/* a bare ref interpolates directly — bound through renderText() */}
      <p>Count: {count}</p>
      <button onClick={() => count.set(count.get() + 1)}>+</button>
    </div>
  )
}

mount(<App />, document.getElementById('app')!)
```

## What the compiler does with each shape

| You write | The compiler emits |
| --------- | ------------------ |
| `<div class="box"><span>hi</span></div>` | one clone of a template, instead of a `createElement` chain |
| `{refOrGetter}` as a child | one text binding, re-evaluated when its dependencies change |
| `class={expr}`, `class={cond ? 'a' : ''}` | one class binding (a condition collapses to a `classList.toggle`) |
| `style={expr}`, `value={expr}`, `disabled={expr}` | one property or attribute binding |
| `onClick={fn}` | one delegated listener |
| `ref={r}` | the element is written into the ref |
| `<Component …/>`, `<>…</>`, spread props | left as JSX — the runtime factory path |

Attributes are classified at compile time: an `a={expr}` attribute is wrapped in
a getter so it stays lazy, while literals, identifiers and object/array literals
are passed through untouched.

## Reactivity in JSX

```tsx
// a ref, unwrapped by the runtime
<p>{count}</p>

// an explicitly read expression (also fine)
<p>{double.get()}</p>

// a derived value, recomputed by the binding
<span class={isActive ? 'on' : 'off'}>{isActive ? 'Active' : 'Idle'}</span>
```

## Events

`onX` in camelCase, with the DOM event name lowercased:

```tsx
<button onClick={() => save()}>Save</button>
<input onInput={(e) => (text.value = (e.target as HTMLInputElement).value)} />
```

## Conditionals and lists

These need the structural pass (`structural: true`); without it they are plain
JS expressions that evaluate once per mount:

```tsx
{showHeader && <Header />}                  {/* → when({ condition, then }) */}
{isLoading.get() ? <Spinner /> : <Content />} {/* → when({ condition, then, else }) */}
{items.get().map((item) => <li>{item.name}</li>)} {/* → each({ of, children }) */}
```

```typescript
// vite.config.ts
rasenCompile.vite({ structural: true })
```

`each` matches items by object identity, so it moves existing nodes on reorder
instead of rebuilding the list. The rewrite only happens in a **child**
position — `items={items.map(…)}` (an attribute) is left alone, because there it
is a value, not a mountable.

## Fragments

```tsx
<>
  <Header />
  <Content />
</>
```

`<>…</>` compiles to the host's `Fragment`, which mounts its children without a
wrapper element and (in the DOM host) renders text children directly.

## Custom tags

Lowercase tags are looked up in the host's tag registry; register your own for
custom elements or a third-party component library:

```typescript
import { registerTag, configureTags } from '@rasenjs/core'

registerTag('custom-button', CustomButton)

// or in bulk, with a namespace prefix
configureTags({ '': { div, span }, X: { Chart, Legend } }) // <XChart />, <XLegend />
```

`@rasenjs/dom/jsx-runtime` registers every DOM tag at import time, so
`registerTag` is for custom elements and third-party tag sets (canvas-2d and the
GL target register their own). PascalCase tags never need registration — they are
called directly.

## Debugging the output

```bash
# per-module compiled / fallback counts (Babel adapter)
RASEN_COMPILER_DEBUG=1 yarn build
```

## Next Steps

- [@rasenjs/compiler](/packages/compiler) — full pass and option reference
- [Components](/guide/components) — the component model in JSX
- [DOM rendering](/guide/targets/dom) — what the emitted bindings do
