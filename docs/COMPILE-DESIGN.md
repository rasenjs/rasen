# Compile-Mode Design (Static Hoisting via vite-plugin-rasen)

> Status: Design approved, P1 (runtime primitives) implemented.
> Related: `benchmark/` hoisting experiment measured geo 1.26× → 1.08×.

## 1. Overview

Rasen's element factories (`div({...})`) run a per-instance construction
chain: createElement, prop classification, watcher setup, child mounting.
Compiled no-vdom frameworks (Vue Vapor, Solid, Svelte 5) replace this with:

1. A module-level HTML template parsed **once**
2. Per-instance `cloneNode`
3. Navigation paths **baked into generated code** (`child`/`next`/`txt`)
4. Dynamic wiring applied only to exact nodes

An experiment hand-writing this shape in the js-framework-benchmark entry
(keeping reactive semantics identical: per-row class watcher, click handlers)
moved Rasen from 1.26× to 1.08× geometric mean vs native — matching Vue Vapor
and beating Solid/Svelte/Vue-SFC in the same table. This doc specifies the
design for delivering that automatically via `vite-plugin-rasen`.

## 2. Key insight: hydration and hoisting are one mechanism

Both flows share the same structure:

```
HTML string (single source of truth for structure)
  → browser parser creates real nodes
    → locate dynamic positions
      → wire behavior (events, reactive updates)
```

| | Hydration | Static hoisting |
|---|---|---|
| Node source | server-rendered document tree | `<template>` clone |
| Instances | 1 | N |
| Initial values | already correct (skip first write) | placeholders (must set) |

Consequence: **one compiler IR serves three outputs** — client template
calls, SSR HTML strings, and hydration wiring code. SSR/client alignment is
guaranteed by construction instead of by manual marker bookkeeping.

## 3. Codegen target

User code (unchanged):

```ts
function Row(item: RowData) {
  return tr({ class: () => selected.value === item.id ? 'danger' : '' },
    td({ class: 'col-md-1' }, String(item.id)),
    td({ class: 'col-md-4' },
      a({ class: 'lbl', onClick: () => select(item.id) }, item.label)),
    td({ class: 'col-md-6' }))
}
```

Compiler output:

```ts
import { template, child, next, txt, bindClass, bindText, on } from '@rasenjs/dom/template'

const t0 = template('<tr class=row><td class=col-md-1> </td><td class=col-md-4><a class=lbl> </a></td><td class=col-md-6></td></tr>')

function Row(item: RowData) {
  return (host: HTMLElement) => {
    // Root acquisition is the ONLY mode branch — inside t0(host):
    // hydrating → claim + tag-verify + adopt (no re-insert);
    // otherwise → clone + appendChild.
    const n = t0(host)

    const td0 = child(n, 0)
    const td1 = next(td0)
    const a1 = child(td1, 0)

    bindText(txt(td0), () => String(item.id))   // non-reactive expr: set once
    bindText(txt(a1), () => item.label)
    bindClass(n, () => selected.value === item.id ? 'danger' : '')
    on(a1, 'click', () => select(item.id))

    return () => { /* offs… */ }
  }
}
```

Generated components remain standard Mountables wrapped by `com()` —
effectScope cleanup, HMR remount, and HostContext inheritance are inherited
for free. Compilation replaces only element construction.

Hydration composition: a compiled component claims exactly its root from the
sequential walker; its interior is addressed purely by navigation paths with
zero context interaction. The walker therefore rests at `root.nextSibling`,
so factory siblings keep claiming seamlessly in mixed trees.

## 4. Runtime primitives (`@rasenjs/dom/template`)

Implemented in `packages/dom/src/template.ts`:

| Primitive | Role |
|---|---|
| `template(html)` | Parse once (lazy, SSR-safe init); `t0(host)` = full acquisition policy (claim+adopt while hydrating / clone+append in CSR), `t0()` = pure clone |
| `child(parent, i)` / `next(node, offset)` | Baked navigation over childNodes |
| `txt(el)` | Text placeholder handle |
| `adopt(el)` | Hydration root marker (identity; shares all downstream code) |
| `bindClass(el, g)` | Reactive className |
| `bindText(node, g)` | Reactive text content |
| `bindStyle(el, g)` | css string or camelCase object; object updates clear removed keys |
| `bindProp(el, key, g)` | DOM property (value/checked/…) — direct property write |
| `bindAttr(el, name, g)` | Attribute; false/null removes, true sets empty |
| `on(el, ev, h)` | addEventListener returning its off function |

Shared semantics of all `bind*`:

- Initial value applied synchronously **unless hydrating** (server already
  rendered it; skipping avoids clobbering and speeds hydration).
- Updates go through the active runtime's `watch`, registering into the
  enclosing `com()` effect scope — teardown is automatic.
- Each returns its stop function for standalone use.

Event note: the factory path uses direct `addEventListener` today
(`delegated()` is an opt-in modifier helper, not a global system). Compiled
output matches. A global delegation switch would be a separate runtime
feature benefiting both paths equally.

## 5. Binding classification

Five binding classes with distinct update mechanics:

| Class | Examples | Mechanism | Helper |
|---|---|---|---|
| class | `class={expr}` | `el.className = v` | `bindClass` |
| style | string or camelCase object | cssText / per-key assign + stale-key removal | `bindStyle` |
| DOM property | value, checked, selected | `el[key] = v` (property, not attribute) | `bindProp` |
| attribute | href, data-*, aria-* | setAttribute / removeAttribute | `bindAttr` |
| event | onClick… | addEventListener (+off) | `on` |

The key→mechanism truth table already exists in `element.ts`
(`isDOMProperty`, `getDOMAttrName`). The compiler emits specialized helpers
for hot keys (class/style/value/checked) to avoid runtime dispatch; cold keys
fall back to a generic `bind()`. Both paths must share the same
classification module long-term.

## 6. Compiler input: JSX-first

Static/dynamic judgment must be cheap and reliable:

- **JSX**: syntactic fact — no braces = static (bake into HTML), braces =
  dynamic (emit wiring op). Component children = mount points. This is why
  Solid/Svelte/Vapor all compile explicit syntax; none interpret arbitrary JS
  (React Compiler is the counter-example proving the cost).
- **Factory-call transformation**: possible best-effort later (Million.js
  style — direct named import + object literal props only), silently passing
  through anything unrecognized. Not the main route.

Decision: JSX is the primary compilation input (`packages/dom` already ships
a jsx-runtime). Factory-call transformation may follow as best-effort.

## 7. Mixed-mode fallback rules

| Pattern | Handling |
|---|---|
| Fully static subtree | baked into template HTML |
| Dynamic attr/text/event | placeholder + wiring op |
| Dynamic tag `<tag={x}>` | fall back to factory call |
| Component children `<Header/>` | empty shell in template; component mounts into it at runtime |
| Spread props `{...rest}` | whole element falls back to factory |

Rule: compile what can be proven, fall back otherwise. Mixed use within one
component is fine — both paths produce plain DOM nodes.

## 8. Phases

| Phase | Scope | Acceptance |
|---|---|---|
| P1 ✅ | Runtime primitives + tests (`template-bind.test.ts`) | done |
| P2 ✅ | Compiler MVP: JSX transform for pure-element components; directive opt-in (`/** @rasen-compile */`); everything else passes through | benchmark rasen entry compiled end-to-end (geo ≈1.2× vs native) |
| P3 ✅ | Hydration unification: `t0(host)` claim+adopt, path-addressed interior; IR emits SSR HTML from the same walk (`__RASEN_SSR__` define gates the branch per build target) | dom/compiler/html suites green; e2e node render verified |
| P4 ✅ | Component mount points (`<!--r-->` anchor + `mountSlot`/`ssrSlot`, host passed down); global event delegation opt-in with bubbling-type whitelist | suites green; delegation tests cover fallback for non-bubbling events |

Known limitations (deliberate):
- `{expr}` containing nested JSX or arrays falls back to the factory chain
  (element-producing expressions are not text).
- `innerHTML` / `dangerouslySetInnerHTML` / `textContent` props fall back.
- Components with spread props, children, or dynamic tags fall back.
- Structural components (`each`/`when`) inside compiled templates are not
  slot-compiled yet; they work via the factory path.
- `<pre>` whitespace is trimmed by JSX text handling (minified-template
  contract).

## 9. Open questions

1. AST tooling for the plugin (babel vs typescript vs oxc) — decide before P2.
2. Dev-mode compilation: recommended ON (single behavior), sourcemaps for DX.
3. Marker strategy for structural components under compiled hydration
   (current `'w'/'e'/'i'` markers remain; element-level claiming is replaced
   by path addressing).
