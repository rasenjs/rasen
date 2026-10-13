# @rasenjs/compiler

JSX compiler for [Rasen](https://github.com/rasenjs/rasen): attribute
classification, static hoisting, structural rewrites and dev HMR.

Bundler-agnostic — one plugin factory covers **Vite, webpack, Rspack and
esbuild** through [unplugin]; a separate Babel plugin covers **Metro / React
Native** and any other Babel pipeline.

## Installation

```bash
npm install -D @rasenjs/compiler
```

## Usage

### Vite

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { rasenCompile } from '@rasenjs/compiler'

export default defineConfig({
  plugins: [rasenCompile.vite()]
})
```

`rasenCompile.webpack()`, `rasenCompile.rspack()` and `rasenCompile.esbuild()`
return the same pipeline for the other bundlers.

### Babel (Metro / React Native)

```javascript
// babel.config.js
module.exports = {
  plugins: [require('@rasenjs/compiler/babel').default]
}
```

The Babel adapter is **opt-in per file**: it only compiles modules containing
the `@rasen-compile` directive. The bundler plugin has no such requirement —
its passes are on by default.

### Set the JSX runtime

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@rasenjs/dom" // or "@rasenjs/web", "@rasenjs/html", …
  }
}
```

## What the compiler does

The passes run in a fixed order — static hoisting must see the author's raw
expressions, so it goes before the attribute transform:

| # | Pass | Default | Description |
| - | ---- | ------- | ----------- |
| 0 | Structural rewrite | `structural: false` | `.map(cb)` → `each({ of, children })`, `cond && <El/>` and `cond ? <A/> : <B/>` → `when({…})` |
| 1 | Static hoisting | `compile: true` | a fully static subtree is cloned from one template instead of built with `createElement`; each dynamic slot becomes a single binding |
| 2 | JSX attribute transform | `jsxTransform: true` | non-trivial attribute expressions are wrapped in `() => expr` so bindings stay lazy |
| 3 | HMR | `hmr: true` | injects `com()` remount boundaries into dev builds |

Pass 0 is opt-in because it emits calls to `each` / `when` from
`@rasenjs/core`, which only exist in a Rasen host — a React or Vue project
compiling through this plugin would get code that cannot render.

### Static hoisting rules

A subtree is hoisted when every part of it is statically known:

- **hoisted**: host elements (`div`, `span`, …) from the host's intrinsic tag
  list, nested arbitrarily deep, static attributes and text
- **bound**: `{expr}` text children, `class` / `style` / property / attribute
  expressions, `onClick`-style handlers, `ref`
- **falls back to the JSX runtime**: components (PascalCase tags), fragments,
  spread attributes, element-producing children (`.map()`, `cond && <El/>`),
  mountable-function children, `innerHTML` / `textContent` props, and child
  expressions that can be arrays of mountables

Falling back is always safe — the subtree simply stays a normal `jsx()` call.

## Options

```typescript
interface RasenCompilerPluginOptions {
  /** Import path for runtime primitives (default '@rasenjs/dom/template') */
  templateSource?: string
  /** Host's intrinsic (statically hoistable) tag list */
  intrinsicTags?: Set<string>
  /** Disable the whole plugin */
  enabled?: boolean
  /** Static hoisting */
  compile?: boolean
  /** JSX attribute-expression transform */
  jsxTransform?: boolean
  /** HMR wrapping (dev only) */
  hmr?: boolean
  /** Structural rewrite — opt-in, see above */
  structural?: boolean
  /** Module id substrings to skip */
  exclude?: string[]
}
```

## License

MIT

[unplugin]: https://unplugin.unjs.io
