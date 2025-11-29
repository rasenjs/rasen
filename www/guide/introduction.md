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

| Package | Description |
|---------|-------------|
| [@rasenjs/core](/packages/core) | Core runtime and type definitions |
| [@rasenjs/dom](/packages/dom) | DOM rendering components |
| [@rasenjs/canvas-2d](/packages/canvas-2d) | Canvas 2D rendering components |
| [@rasenjs/react-native](/packages/react-native) | React Native Fabric renderer |
| [@rasenjs/html](/packages/html) | HTML renderer for SSR/SSG |
| [@rasenjs/jsx-runtime](/packages/jsx-runtime) | JSX/TSX runtime support |
| [@rasenjs/reactive-vue](/packages/reactive-vue) | Vue 3 reactivity adapter |
| [@rasenjs/reactive-signals](/packages/reactive-signals) | TC39 Signals adapter |

## Status

::: warning Work In Progress
This framework is still under active development and has **NOT been published to npm**.

**Please do not use this in production.** APIs are unstable and may change at any time.

If you're interested in this project, feel free to ⭐ star and watch for updates!
:::

## Next Steps

- [Design Philosophy](/guide/design-philosophy) — Understand the core ideas
- [Getting Started](/guide/getting-started) — Set up your first project
- [Three-Phase Functions](/guide/three-phase-functions) — Learn the component model
