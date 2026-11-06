# Changelog

All notable changes to the Rasen project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Everything below landed after `0.1.4-alpha` and is what the next release
(0.1.9 / 0.1.0 for the new packages) ships.

### Fixed

- **`@rasenjs/html`: every tag in `HTML_TAGS` is a real export now.** The list
  an app's auto-import spreads had 76 names while the package exported 51
  element factories: `b`/`i`/`u`, `dl`/`dt`/`dd`, `picture`/`track`,
  `optgroup`/`fieldset`/`legend`/`datalist`/`output`,
  `caption`/`colgroup`/`col`,
  `details`/`summary`/`dialog`/`figure`/`figcaption`/`address`/`time` were
  listed but missing, so any SSR app writing one of those tags failed to
  build (`import { dl } from '@rasenjs/html'` → no such export). All 23 are
  implemented and exported; a test now compares the list against the package's
  own exports so the two cannot drift again.
- **`@rasenjs/react-native`: Metro compiles JSX again.** The `react-native`
  Babel plugin now runs JSX elimination on `Program.enter` (the same pass the
  bundler plugin runs), so an RN module contains no JSX and emits no
  `react/jsx-runtime` import. Before this the plugin only did HMR injection,
  and Metro's redirect pointed at a `jsx-runtime.js` that no longer existed —
  imports of it failed to resolve.
- **Host `jsx-runtime` subpaths resolve at runtime again.** `types` alone left
  the export condition with no runtime target, so anything that resolved the
  subpath outside `tsc` failed with a bare
  `ERR_PACKAGE_PATH_NOT_EXPORTED`. Each host now ships a runtime stub beside
  the hand-written `.d.ts`: importing is harmless, calling throws a message
  naming the fix (`rasenCompile()` + `unplugin-auto-import`).
- **`@rasenjs/html` no longer depends on `@rasenjs/dom` to typecheck.** Its
  `jsx-runtime.d.ts` typed `IntrinsicElements` from the DOM renderer's
  `ElementProps`/`HTMLTagName`, which lived in `devDependencies` — a published
  `@rasenjs/html` had an unresolvable type. The tag types now come from the
  package's own `BaseProps` plus core's canonical name list.
- **`@rasenjs/html`: `<>…</>` renders text children again.** The JSX `Fragment`
  bound through `HTML_TAGS` was core's mountable-only fallback, which dropped
  text with a warning — `<>{'a'}</>` produced `""` on the server. It now wraps
  core's structural fragment with the host's hydration-markered hooks (the
  shape `htmlHostHooks` already uses), sharing one implementation with the
  object form of `fragment`. The uppercase `Fragment` is a plain
  alias of `fragment`'s children form now — children normalization lives in
  core.
- **`@rasenjs/html`: the object form of `fragment` no longer throws under
  ESM.** It called `require('@rasenjs/core')` in a `"type": "module"` package;
  the delegation is a plain import now.
- **Unused canvas stacks no longer reach the bundle.** `@rasenjs/canvas-2d`,
  `@rasenjs/gfx` and `@rasenjs/assets` declare `"sideEffects": false`
  (audited: their module tops are pure — component `com()` wrappers create
  their scopes lazily, and nothing registers at load), so an app that never
  renders `<canvas>` bundles none of them: the ahp-mobile-agent client and the
  repo's ssr example dropped ~50 KB of Spine runtime that previously leaked
  through dom's canvas bridge.
- **HMR wrapping no longer breaks dev transforms.** The `enterHmrModule`
  prelude is inserted after the last import *statement* (a multi-line
  `import {` … `} from '…'` used to be split in half, 500-ing the module),
  `com()` detection ignores comments and strings (a doc comment mentioning
  `com()` used to qualify), and `@rasenjs/core`'s own sources are excluded —
  wrapping core with an import of core deadlocked `hmrState` in its TDZ.

### Breaking

- **JSX compiles away entirely.** `@rasenjs/compiler` now eliminates every
  JSX node hoisting cannot bake into a bare factory call, so a build pairs
  `rasenCompile.vite()` with `unplugin-auto-import` to bind those names: each
  host ships its own names as data (`DOM_TAGS` from `@rasenjs/dom`,
  `HTML_TAGS` from `@rasenjs/html`), listed in auto-import's `imports` map
  together with the app's own components (recipe: `www/guide/advanced/jsx`).
  The compiler itself emits imports only for its hoisting helpers.
- **The tag registry is gone.** `registerTag` / `configureTags` / `findTag`
  (and the `TagConfig` / `TagComponent` types) were removed from
  `@rasenjs/core`; host `jsx-runtime` entries are now **types-only `.d.ts`
  files** — they carry the `JSX` namespace for `jsxImportSource` type
  checking and expose no runtime at all (core no longer exports `jsx` /
  `jsxs` / `jsxDEV` either; `Fragment` at core's root is the structural
  `fragment()`).
- **Compiler options narrowed.** `componentTags` and `tagManifest` are removed
  (lowercase tags are plain auto-imported bindings now), and the
  `@rasenjs/dom/tags` subpath (`TAG_MANIFEST`) is gone. `intrinsicTags` still
  decides what hoists into `template()` HTML.
- **Conflicts are build errors.** A local binding shadowing a tag at its call
  site, or a tag that cannot be an identifier (`<my-widget>`, a keyword like
  `<var>`), fails the build with the fix named — previously a silently wrong
  runtime lookup.
- **The image adapter registers with `<canvas>`, not at dom's root.**
  `@rasenjs/dom` no longer side-effect-imports `image-adapter` from its entry,
  which bundled `@rasenjs/assets` + `@rasenjs/math` into every DOM app; the
  `<canvas>` component registers `domImageAdapter` when it ships, and the root
  no longer re-exports it. Apps on other hosts keep calling `setImageAdapter`
  themselves.
- **The image adapter slot lives in `@rasenjs/core`.** `setImageAdapter` /
  `getImageAdapter` / `ImageAdapter` / `ImageLike` moved out of
  `@rasenjs/assets` into core (same family as `setReactiveRuntime`): hosts
  register through a dependency they already have, and assets becomes a pure
  consumer of the slot. assets re-exports the two types but no longer
  `setImageAdapter`, and `@rasenjs/dom` no longer depends on `@rasenjs/assets`
  at all.

### Added

#### Framework
- **One children rule in core** — `normalizeChildren` (coerce, flatten, drop
  nullish/boolean): the single source shared by core's `fragment()` (`Fragment`
  is its root alias), and the DOM/HTML fragments; the compiler mirrors the
  rule inline at emission (`flat(Infinity).filter(…)`), so compiled children
  arrive pre-normalized without a binding.
- **`@rasenjs/compiler`** — bundler-agnostic JSX compiler: attribute-getter
  transform, static hoisting into `template()` clones, dev-only HMR remount
  boundaries, and the opt-in structural pass that rewrites `.map()` to `each`
  and `cond && <El/>` / `cond ? <A/> : <B/>` to `when`. Vite/webpack/Rspack/esbuild
  through unplugin, Metro/Babel through `@rasenjs/compiler/babel`.
- **`eliminateJsxFromFile`** — the JSX elimination pass as an AST-level API,
  so a Babel pipeline reuses it on the file it is already transforming instead
  of re-parsing the source. `@rasenjs/react-native/babel` uses it to compile
  JSX away for Metro (which has no `unplugin-auto-import` phase), removing the
  `react/jsx-runtime` hop entirely.
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
