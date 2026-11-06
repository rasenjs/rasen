# JSX & the Compiler

JSX is the recommended authoring syntax in Rasen, and the
[`@rasenjs/compiler`](/packages/compiler) is what makes it cheap: it turns a
static subtree into one `template()` clone and each dynamic slot into a single
fine-grained binding. There is no virtual DOM in the output — you can read the
generated code and see the DOM calls.

## Setup

```bash
npm install -D @rasenjs/compiler unplugin-auto-import
```

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { rasenCompile } from '@rasenjs/compiler'
import { DOM_TAGS } from '@rasenjs/dom'
import AutoImport from 'unplugin-auto-import/vite'

export default defineConfig({
  plugins: [
    rasenCompile.vite(),
    AutoImport({
      // Tags only exist where JSX is: a plain .ts module that happens to use
      // `dt` as a parameter (an HTML tag name!) must never see a tag import.
      include: [/\.tsx$/],
      imports: [
        { '@rasenjs/dom': [...DOM_TAGS] }, // host names: elements + canvas + Fragment
        // this app's own lowercase tags, grouped by module:
        // { '@rasenjs/ui': ['widget'] },
      ],
    }),
  ],
})
```

`DOM_TAGS` is **the host shipping its own names as pure data** — every
element it renders, plus `canvas` and `Fragment` (`@rasenjs/html` ships its
own `HTML_TAGS`, where `canvas` is a plain element). The next `imports`
entries are *this app's* custom lowercase tags (`rect` from
`@rasenjs/canvas-2d`, a library's `<widget>`, …); PascalCase tags need
nothing — they are the author's own imports. It is `unplugin-auto-import`'s
own declarative `imports` map — no resolver, nothing to wire. An SSR/web app
lists `@rasenjs/web`'s names instead, so the string host's plain `<canvas>`
element is what gets called.

```jsonc
// tsconfig.json — pick the host whose JSX types you want
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@rasenjs/web" // "@rasenjs/dom", "@rasenjs/html", "@rasenjs/react-native", …
  }
}
```

The host's `jsx-runtime` entry is **types only** for a working build (a
hand-written `.d.ts`): Rasen compiles JSX away entirely, so the module exists
purely for `jsxImportSource` type checking (its `JSX` namespace carries the
host's tag set). Alongside it sits a runtime stub, because a bare
`tsc`/`swc`/`vitest` run still resolves the subpath — it imports harmlessly and
throws a message naming the fix if anything calls `jsx()`. So a build that
forgot `rasenCompile()` fails with an instruction instead of a bare
`ERR_PACKAGE_PATH_NOT_EXPORTED` or a lookup against a registry that no longer
exists.

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

The elimination pass turns **every** lowercase tag into a bare call —
`<rect/>` becomes `rect({ … })` — and emits no import for it: which module a
name comes from is binding configuration. Each host ships its tag names as
pure data (`DOM_TAGS` from `@rasenjs/dom`, `HTML_TAGS` from `@rasenjs/html`),
and the app lists them — plus its own components — in `unplugin-auto-import`'s
`imports` map (Setup above). The compiler owns only what it can see: turning
tag tokens into identifiers, and a tag nobody uses is never imported.

- **PascalCase** (`<Panel/>`) — the author's own binding; tsc enforces it and
  the compiler simply calls it.
- **Custom lowercase** — add it to an `imports` entry with its module, e.g.
  `{ '@rasenjs/ui': ['widget'] }`.
- **`<canvas>` and `<>…</>`** — owned by the host's tag list: bind from
  `@rasenjs/dom` (the GL bridge) or `@rasenjs/html` (a plain element) by
  listing *that* host's list.
- **Conflicts fail loudly at build time**: a local variable shadowing a tag at
  its call site (the error says which name to rename), or a tag that cannot be
  an identifier (`<my-widget>`, a keyword like `<var>` — wrap it in a
  PascalCase component). An explicit `import { canvas } from '@rasenjs/dom'`
  in the file is fine and wins: the auto-import skips names already imported.

Hoisting helpers (`template`, `renderText`, `bindClass`, …) are the compiler's
own imports from `templateSource` — never part of a tag list. If your file
already binds one of those names from another module (a route DSL's
`template`, say), the build error names the collision and which side to rename.

## Debugging the output

```bash
# per-module compiled / fallback counts (Babel adapter)
RASEN_COMPILER_DEBUG=1 yarn build
```

## Next Steps

- [@rasenjs/compiler](/packages/compiler) — full pass and option reference
- [Components](/guide/components) — the component model in JSX
- [DOM rendering](/guide/targets/dom) — what the emitted bindings do
