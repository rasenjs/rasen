# Packages

Rasen is a monorepo: the paradigm lives in `@rasenjs/core`, and everything else
is a reactive-runtime adapter or a render target.

## Framework

| Package | Version | What it is |
| ------- | ------- | ---------- |
| [@rasenjs/core](/packages/core) | ![npm](https://img.shields.io/npm/v/@rasenjs/core.svg) | The `Mountable` contract, structural components (`each`, `when`, `match`, `show`, `lazy`, `fragment`), the reactive-runtime boundary and the host-agnostic JSX runtime |
| [@rasenjs/compiler](/packages/compiler) | in repo | JSX transform, static hoisting, structural rewrites and HMR — one plugin for Vite/webpack/Rspack/esbuild plus a Babel adapter for Metro |
| [@rasenjs/dom](/packages/dom) | ![npm](https://img.shields.io/npm/v/@rasenjs/dom.svg) | DOM renderer: element factories, bindings, hydration, compiled templates |
| [@rasenjs/html](/packages/html) | ![npm](https://img.shields.io/npm/v/@rasenjs/html.svg) | HTML string renderer for SSR/SSG |
| [@rasenjs/web](/packages/web) | ![npm](https://img.shields.io/npm/v/@rasenjs/web.svg) | Isomorphic bundle: DOM in the browser, HTML on the server — same imports |

## Routing

| Package | Version | What it is |
| ------- | ------- | ---------- |
| [@rasenjs/router](/packages/router) | ![npm](https://img.shields.io/npm/v/@rasenjs/router.svg) | Headless router: typed route trees, params, guards, history adapters |
| [@rasenjs/router-dom](/packages/router-dom) | ![npm](https://img.shields.io/npm/v/@rasenjs/router-dom.svg) | `<a>`-based link, DOM `RouterView`, scroll restoration, layout |
| [@rasenjs/router-html](/packages/router-html) | ![npm](https://img.shields.io/npm/v/@rasenjs/router-html.svg) | The same components for the SSR string host |

## Reactivity adapters

| Package | Version | Reactivity system |
| ------- | ------- | ----------------- |
| [@rasenjs/reactive-vue](/packages/reactive-vue) | ![npm](https://img.shields.io/npm/v/@rasenjs/reactive-vue.svg) | `@vue/reactivity` |
| [@rasenjs/reactive-signals](/packages/reactive-signals) | ![npm](https://img.shields.io/npm/v/@rasenjs/reactive-signals.svg) | TC39 Signals (`signal-polyfill`) |
| [@rasenjs/reactive-nanostores](/packages/reactive-nanostores) | ![npm](https://img.shields.io/npm/v/@rasenjs/reactive-nanostores.svg) | nanostores |
| `@rasenjs/reactive-alien-signals` | in repo | alien-signals (the signal core Vue Language Tools uses) |

`@rasenjs/core` also ships a zero-dependency built-in runtime, so no adapter is
required to get started.

## Render targets

| Package | Version | Target |
| ------- | ------- | ------ |
| [@rasenjs/canvas-2d](/packages/canvas-2d) | ![npm](https://img.shields.io/npm/v/@rasenjs/canvas-2d.svg) | Canvas 2D shapes, text, paths, sprites, groups |
| [@rasenjs/rn-dom](/packages/rn-dom) | ![npm](https://img.shields.io/npm/v/@rasenjs/rn-dom.svg) | DOM-like document abstraction over React Native's Fabric pipeline |
| [@rasenjs/react-native](/packages/react-native) | in repo | React Native components on top of `rn-dom` (no React) |
| `@rasenjs/gfx` | in repo | WebGL/WebGPU renderer sharing canvas-2d's shape API |
| `@rasenjs/gpui` | in repo | Native desktop through Zed's GPUI |
| `@rasenjs/lvgl` | in repo | Embedded displays (LVGL + QuickJS) |
| `@rasenjs/lynx` | in repo | Lynx main-thread rendering |

## Utilities

| Package | Version | What it is |
| ------- | ------- | ---------- |
| [@rasenjs/tw](/packages/tw) | in repo | Tailwind-style class strings → style records |
| [@rasenjs/rota](/packages/rota) | in repo | Headless UI component library (dialogs, popovers, menus, …) |
| [@rasenjs/animation](/packages/animation) | ![npm](https://img.shields.io/npm/v/@rasenjs/animation.svg) | Tween, spring and frame animations as refs |
| [@rasenjs/math](/packages/math) | in repo | `Vec2/3/4f`, `Mat3x3f`, `Mat4x4f`, `Quatf` |
| [@rasenjs/assets](/packages/assets) | in repo | Spine and glTF/GLB parsing, image loading via a host adapter |
| `@rasenjs/compiler/babel` | in repo | Babel plugin for Metro / any Babel pipeline |

## Release status

Packages marked with an npm badge are published (all of them are alpha — APIs
can still change before 1.0). The rest live in the
[repository](https://github.com/rasenjs/rasen) until the next release; install
them with your package manager's workspace/link support or build them from
source.

The canonical example of everything working together is
[`templates/rasen-ts`](https://github.com/rasenjs/rasen/tree/main/templates/rasen-ts):
SSR + hydration, isomorphic routing, signals and the compiler.
