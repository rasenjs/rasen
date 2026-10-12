# Changelog

All notable changes to the Rasen project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Everything below landed after `0.1.4-alpha` and is what the next release
(0.1.9 / 0.1.0 for the new packages) ships.

### Added

#### Framework
- **`@rasenjs/compiler`** — bundler-agnostic JSX compiler: attribute-getter
  transform, static hoisting into `template()` clones, dev-only HMR remount
  boundaries, and the opt-in structural pass that rewrites `.map()` to `each`
  and `cond && <El/>` / `cond ? <A/> : <B/>` to `when`. Vite/webpack/Rspack/esbuild
  through unplugin, Metro/Babel through `@rasenjs/compiler/babel`
  (`@rasen-compile` directive per file).
- **`@rasenjs/web`** — isomorphic bundle: the DOM renderer in the browser, the
  HTML renderer on the server, one import. `@rasenjs/web/elements` is the
  routing-free subset for component libraries.
- **Core**: built-in zero-dependency reactive runtime (callable refs), host hook
  inheritance in `com()`, `renderText()` unwrapping refs through the runtime,
  shared HTML string utilities, and `when`/`each` fixes for dependency tracking.

#### Routing
- Router guards (`beforeEach` / `afterEach` / `onError`), leave guards,
  scroll restoration and a `layout` helper.
- `@rasenjs/router-html` so the same route table renders on both targets.

#### Reactivity
- Adapters for **alien-signals** and **nanostores** join Vue and TC39 Signals.

#### Rendering targets
- **`@rasenjs/canvas-2d`** — shape set (rect, circle, ellipse, arc, ring, star,
  wedge, polygon, arrow, line, path, point, text, image, sprite, group, spine),
  delegated pointer events, injected frame scheduling, and reactive props.
- **`@rasenjs/gfx`** — WebGL/WebGPU renderer sharing canvas-2d's shape API:
  batching, cameras (2D/3D/orthographic), compressed-texture seams, spine.
- **`@rasenjs/rn-dom` 0.2** — DOM-like document over React Native's Fabric
  pipeline: element/tag registry, event system aligned with RN, style sheets,
  `classList`, focus/blur, Fabric node helpers, iOS/Android specifics.
- **`@rasenjs/react-native`** — RN components, Metro/Babel plugins, devtools.
- **`@rasenjs/rn-html`**, **`@rasenjs/lynx`**, **`@rasenjs/gpui`**,
  **`@rasenjs/lvgl`**, **`@rasenjs/winui3`** (research) — additional hosts.

#### Utilities
- **`@rasenjs/rota`** — headless UI components (dialog, alert dialog, popover,
  tooltip, accordion, tabs, menu, switch, checkbox, slider, toggle group, radio
  group, progress, pin input, tags input, …) with an isomorphic test suite.
- **`@rasenjs/animation`** — tween, spring and frame animations as refs, driven
  by an injected frame source.
- **`@rasenjs/math`** — `Vec2f`/`Vec3f`/`Vec4f`, `Mat3x3f`/`Mat4x4f`, `Quatf`.
- **`@rasenjs/assets`** — Spine and glTF/GLB parsing, host-injected image loading.
- **`@rasenjs/tw`** — Tailwind-style class interpreter (runtime `tw()` plus an
  AOT-generated table and a `tw-generate` CLI).

#### Tooling and docs
- `templates/rasen-ts` ported onto the current packages: SSR + hydration,
  isomorphic routing, signals, compiler.
- New game/viewer examples: racing, FPS, Mario, craft, NIKKE viewer (browser and
  Perry native), plus GPU benches.

### Changed

- **Naming**: `MountFunction` → `Mountable`; `useReactiveRuntime()` replaces
  manual `setReactiveRuntime(createReactiveRuntime())` in user code.
- **`@rasenjs/core` → `0.1.8`, `@rasenjs/dom` → `0.1.8`**: one definition of the
  attribute rules shared by both renderers; element/tag factories classify props
  per tag (`value`/`checked`/… as properties, the rest as attributes).
- **Events**: `onX` props (`onClick`, `onInput`) replace the old `on: { click }`
  object, which no longer exists.
- **`@rasenjs/jsx` retired**: JSX support moved into the compiler plus each
  host's `jsx-runtime` / `jsx-dev-runtime` entry; tag registration lives in core
  (`registerTag`, `configureTags`).
- Documentation rebuilt: the website (`www/`) now mirrors every package README,
  and the guide uses the current JSX + `onClick` + compiler API.

### Fixed

- DOM: insertion resolves against the anchor per the explicit `HostHooks`
  contract; scene subtrees get their own host hooks; hydration claim rules fixed.
- HTML: a single child is accepted again; `hr`/`br` keep their props; the string
  renderer no longer emits markup the DOM renderer would not produce.
- Core: fragment children are flattened and non-mountable children no longer
  crash a host; list clearing no longer leaks a marker on non-DOM hosts.
- Compiler: function children and array-valued children are not hoisted as text;
  `className` is emitted as `class`; `.map()` rewrites hand `each` a getter so
  the list stays subscribed; accumulator state is dropped on fallback.
- Canvas/gfx: 2D geometry vertex fixes, RGB color parsing, WebGPU context
  injection, depth-buffer clearing for `lookAt` cameras, overlay blit precision.
- rn-dom/React Native: Vue proxy `toStringTag`, ScrollView
  `nestedScrollEnabled`, iOS `RefreshControl`, Text `disabled` alignment.
- Rota: focus trapping and restore, element refs under the built-in runtime,
  keyboard contracts for slider/toggle-group, form participation for
  checkbox/switch, id collisions.

## [0.1.4-alpha] - 2026-01-05

### Fixed

#### Router
- **Critical**: Fixed Link component not passing through props like `class` and `style`
  - Link components were missing CSS classes causing styling issues
  - Now properly spreads all additional props to the underlying Anchor component

#### Template
- Restored original home page structure with hero section, code examples, and features grid
- Fixed layout structure to match original design

## [0.1.3-alpha] - 2026-01-05

### Added

#### Router Packages
- Enhanced routing capabilities with nested route processing and navigation guards
- Added leave guard functionality and navigation error handling
- Implemented core router functionality with components, history management, and route definitions
- Created `@rasenjs/router-dom` package with DOM-specific router components

#### Core & DOM
- Element now supports mixing arrays and strings as children
- Added more DOM tags (details, summary, dialog, etc.)
- Optimized DOM operations and signal processing to reduce unnecessary updates
- Enhanced component lifecycle management with effect scopes
- Updated component types to use Mountable for better consistency

#### Shared
- Added boundary utility functions and tests for geometric calculations

#### Template
- Updated `rasen-ts` template to version 0.1.3-alpha
- Added router integration with multiple views (Home, Counter, Todo, Timer, About)
- Implemented navigation with active link highlighting
- Created view-based architecture for better code organization
- Enhanced UI with navigation bar and improved layout
- Updated documentation with router examples and setup instructions

### Changed

- All core packages updated to 0.1.3-alpha
- `@rasenjs/core`: 0.1.2-alpha → 0.1.3-alpha
- `@rasenjs/dom`: 0.1.2-alpha → 0.1.3-alpha
- `@rasenjs/jsx-runtime`: 0.1.2-alpha → 0.1.3-alpha
- `@rasenjs/reactive-vue`: 0.1.2-alpha → 0.1.3-alpha
- `@rasenjs/reactive-signals`: 0.1.2-alpha → 0.1.3-alpha
- `@rasenjs/shared`: 0.1.0-alpha → 0.1.3-alpha
- `@rasenjs/router`: 0.1.0-alpha → 0.1.3-alpha
- `@rasenjs/router-dom`: 0.1.0 → 0.1.3-alpha
- Wrapped components with `com` helper function for better lifecycle management

### Fixed

- Reduced unnecessary DOM updates by optimizing signal processing
- Enhanced component lifecycle to prevent memory leaks

## [0.1.2-alpha] - 2025-12-05

### Added
- Component lifecycle management with effect scopes
- `com` wrapper for automatic effect scope management

### Changed
- Updated package versions to 0.1.2-alpha
- Added publish configuration

## [0.1.1-alpha] - 2025-12-XX

### Added
- Initial router implementation
- Basic DOM and Canvas renderers

## [0.1.0-alpha] - 2025-12-XX

### Added
- Initial release
- Core reactive framework
- DOM renderer
- Canvas 2D renderer
- Vue reactivity adapter
- Signals reactivity adapter
- JSX runtime
