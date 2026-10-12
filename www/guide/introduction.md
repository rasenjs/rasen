# What is Rasen?

**Rasen** (らせん, Japanese for "Spiral") is a reactive rendering framework that is agnostic to both reactive systems and rendering targets.

> Inspired by the anime *Tengen Toppa Gurren Lagann*, where spiral energy represents the power to break through all limits.

## The Problem

Modern frontend frameworks are mature, but we've observed several fundamental issues:

### 1. Reinventing the Reactive Wheel

Vue, Solid, Signals... Reactive systems have been nearly perfected. As framework developers, we should let users choose "the best" rather than forcing them to accept yet another homegrown reactive solution.

### 2. The Overhead of Virtual DOM

VDOM adds unnecessary complexity in many scenarios. Direct manipulation is often simpler and more efficient.

### 3. The Cross-Platform Struggle

When you need to switch from HTML to Canvas to WebGL within the same context, existing frameworks offer little help. Cross-platform rendering shouldn't be this hard.

### 4. Frameworks Are Too Narrow

Why is React limited to DOM and React Native? Why is Vue confined to DOM? The realm of graphical rendering extends far beyond these boundaries.

## The Solution

Rasen provides **dual decoupling**:

1. **Reactive System Decoupling** — Use Vue, Signals, or any reactive library
2. **Render Target Decoupling** — Render to DOM, Canvas, React Native, HTML, WebGL, or any host

```
┌─────────────────────────────────────────────────────────┐
│                      User Code                          │
├─────────────────────────────────────────────────────────┤
│                  Rasen Core (Paradigm)                  │
├──────────────────────┬──────────────────────────────────┤
│  Reactive Runtime    │       Render Target              │
│     Adapters         │         Adapters                 │
│  ┌────────────────┐  │  ┌─────────────────────────────┐ │
│  │ Vue Reactivity │  │  │ DOM / Canvas / React Native │ │
│  │ TC39 Signals   │  │  │ HTML(SSR) / WebGL / ...     │ │
│  │ Any reactive   │  │  │ Any mountable target...     │ │
│  └────────────────┘  │  └─────────────────────────────┘ │
└──────────────────────┴──────────────────────────────────┘
```

## Packages

Rasen is a monorepo. The packages below are the ones you are most likely to
install; the full list lives in [Packages](/packages/).

| Package | Description | Status |
| ------- | ----------- | ------ |
| [`@rasenjs/core`](/packages/core) | Paradigm, types and the component primitives | ✅ Alpha |
| [`@rasenjs/compiler`](/packages/compiler) | JSX transform, static hoisting, HMR (Vite/webpack/Rspack/esbuild/Babel) | ✅ Alpha |
| [`@rasenjs/dom`](/packages/dom) | DOM renderer | ✅ Alpha |
| [`@rasenjs/html`](/packages/html) | HTML string renderer for SSR/SSG | ✅ Alpha |
| [`@rasenjs/web`](/packages/web) | Isomorphic bundle — DOM in the browser, HTML on the server | ✅ Alpha |
| [`@rasenjs/router`](/packages/router) | Headless router, plus DOM and SSR bindings | ✅ Alpha |
| [`@rasenjs/reactive-vue`](/packages/reactive-vue) | Vue 3 reactivity adapter (`@vue/reactivity`) | ✅ Alpha |
| [`@rasenjs/reactive-signals`](/packages/reactive-signals) | TC39 Signals adapter (`signal-polyfill`) | ✅ Alpha |
| [`@rasenjs/reactive-nanostores`](/packages/reactive-nanostores) | Nanostores adapter | ✅ Alpha |
| [`@rasenjs/canvas-2d`](/packages/canvas-2d) | Canvas 2D renderer | ✅ Alpha |
| [`@rasenjs/rn-dom`](/packages/rn-dom) | DOM-like document abstraction over React Native Fabric | ✅ Alpha |
| [`@rasenjs/tw`](/packages/tw) | Tailwind-style class interpreter | 🚧 In repo |
| [`@rasenjs/rota`](/packages/rota) | Headless UI component library | 🚧 In repo |
| `@rasenjs/gfx`, `@rasenjs/gpui`, `@rasenjs/lvgl`, `@rasenjs/lynx`, `@rasenjs/react-native` | WebGL, native desktop, embedded and RN targets | 🏗️ In progress |

"Alpha" means the package is published and usable, but the API may still change
before 1.0.

## Status

::: warning Work In Progress
The framework is in **alpha** and is closing in on its first public release.
Most rendering and routing packages are published on npm; the compiler and
several targets are still repo-only. Expect breaking changes between alpha
releases.
:::

## Next Steps

- [Design Philosophy](/guide/design-philosophy) — understand the core ideas
- [Getting Started](/guide/getting-started) — set up your first project
- [Three-Phase Functions](/guide/three-phase-functions) — learn the component model
