# Perry AOT Integration — Research & Spike Results

> Date: 2026-09-09 · Status: spike verified on macOS (Perry 0.5.1220, arm64)
> Scope: Perry as a **TS→LLVM AOT compiler pipeline only** (no `perry/ui` widgets).
> Rendering backend is self-owned (WebGPU-native as the cut line). React Native
> (JSI/Hermes, non-LLVM) is explicitly out of scope.

---

## TL;DR

| Question | Answer |
|---|---|
| Can Rasen core + math compile under Perry AOT? | **Yes — verified.** Full `core/src` + `math/src` compile, link, and run (8.2 MB binary, all assertions pass). |
| Can Rasen be *fully* AOT? | **Yes**, via single-entry + relative-path **source** imports. Not via npm package-name imports (architecturally unsupported). |
| What syntax breaks? | Exactly one pattern found: **generic arrow functions in call-argument position** (`com(<T, N>(cfg) => …)`). Fixed in core (`c0e32e4`). |
| Do we need a Rust wrapper crate for GPU? | **No.** Official [`@perryts/webgpu`](https://github.com/PerryTS/webgpu) (wgpu-backed, spec-faithful, 60 FFI symbols) covers it; macOS + Windows verified upstream. |
| Can `canvas-2d` map onto `perry/ui` Canvas? | **No.** Toy-grade subset (no transform stack, no state machine; native `arc`/`fillText` are stubs). |

---

## 1. What Perry is

Perry compiles TypeScript to native machine code (SWC → HIR → LLVM, no JS
runtime). Key surfaces relevant to Rasen:

- `perry run <file.ts>` — one-step compile + execute (native binary).
- `perry check [file]` — static compatibility gate (fast; CI-usable).
- `perry.nativeLibrary` manifest — declare extern "C" symbols resolved against
  statically linked libraries at link time (this is how Bloom Engine and
  `@perryts/webgpu` integrate).
- `bun:ffi` / `node:ffi` compatibility modules — runtime `dlopen` of arbitrary
  C libraries (unix x86_64/aarch64 only; hand-written SysV/AAPCS64 trampolines,
  no libffi). Good for prototyping/measurement, not the final architecture.
- Built-in shader packaging: manifest `backends.{metal,vulkan,d3d12}` compiles
  and bundles `.metallib` / `.spv` / `.dxil` at build time.

## 2. The linking model (why "runtime-only link" fails on package imports)

`perry run`/`perry compile` link the entry's object file against prebuilt
`libperry_runtime.a` + `libperry_stdlib.a` only. When code does
`import { ref } from '@rasenjs/core'` (npm package name), Perry's codegen does
**not** bundle that package's source — it emits a dynamic lookup through
`js_call_v8_export` (a V8-bridge helper that only exists in the JS output
mode). The native linker then fails with undefined symbols.

**This is by design** ("compile TS once, ship native binary" leaves no room
for dynamic module resolution). The working alternatives:

| Import strategy | Result |
|---|---|
| `from '@rasenjs/core'` (package name, dist) | ✗ `js_call_v8_export` → link failure |
| package name + `perry.compilePackages` + `perry.allow.compilePackages` | ✗ same (compiler acknowledges, linker still runtime-only) |
| relative path → `dist/index.js` (tsup output) | ⚠ links, but class-expression + cross-module `instanceof` throws TypeError at runtime |
| **relative path → `src/*.ts` (source)** | ✅ **compiles, links, runs correctly** |

**Consequence:** the Rasen-on-Perry build must feed **source files** through a
single entry (a barrel file with relative imports, or a build step that
resolves workspace packages to source paths). `perry check` (default mode)
remains usable as a static CI gate regardless.

## 3. The one unsupported syntax (fixed in `c0e32e4`)

Perry's SWC parser rejects **generic arrow functions in call-argument
position**:

```ts
// ✗ parse error: Expected(">", ",")
export const when = com(
  <N = unknown>(config: WhenConfig<N>): Mountable<N> => { … }
)

// ✓ function declaration — unambiguous in every parser mode
function whenComponent<N = unknown>(config: WhenConfig<N>): Mountable<N> { … }
export const when = com(whenComponent)
```

Everything else we exercised parses and runs natively: rest destructuring,
computed/Symbol keys, `typeof undeclaredGlobal`, Map/Set, optional chaining,
class expressions + `instanceof`, static class members, typed arrays, getters
via `Object.defineProperty`, closures, `Object.is` dedup.

Fixes applied (zero regressions: tsup build ✓, 189 core unit tests ✓):

- `each.ts` — dropped inner generic params that shadowed `each<T, N>`
- `match.ts` — extracted `matchComponent()`, `export const match = com(matchComponent)`
- `when.ts` — extracted `whenComponent()`, same shape

## 4. Runtime notes

- `core`'s `ref()` is **self-contained** (closure + `track`/`trigger` over a
  module-level `depMap`); it does **not** call `ReactiveRuntime.ref()`.
  `runtime.subscribe(getter, cb)` takes a **getter function**, not a ref object.
- Feed Perry **`src/`, not `dist/`**: tsup's class-expression lowering breaks
  `instanceof` across module boundaries under Perry's module system.
- `window`/DOM references (e.g. debug counters in `each.ts`) throw
  `ReferenceError` on native — guard or strip for native builds.
- HMR code (`enterHmrModule`/vite-plugin-rasen injection) must be excluded
  from the native entry tree.

## 5. GPU paths (for the native renderer)

| Path | Status | Role |
|---|---|---|
| [`@perryts/webgpu`](https://www.npmjs.com/package/@perryts/webgpu) | official, v0.3.0, MIT | **Primary.** wgpu-backed, spec-faithful (same WGSL/descriptors/constants; flat `deviceCreateBuffer(device, desc)` shape + explicit `devicePoll`). Render-pass method tower complete. macOS verified end-to-end (`examples/triangle-macos`), Windows d3d12 verified (swapchain reparent fix), iOS/Android compile-ready, Linux pending. |
| `perry.nativeLibrary` manifest | stable | Static-link any C-ABI library; symbols lower to direct LLVM calls. |
| `bun:ffi` dlopen | unix-only | Prototype/FFI-overhead measurement only. |
| `BloomView` + `surfaceFromNativeView` | official | On-screen surface: perry/ui reserves a GPU-capable native view; the binding wraps it into a swapchain. |
| Custom Rust crate | fallback | Only if the wgpu-native glue proves insufficient. |

Two integration options for Rasen's renderer:

1. **GL glue layer** — a TS `GLNativeContext` implementing the ~35 WebGL
   entry points `RenderContext` actually uses, backed by `@perryts/webgpu`.
   Zero changes to existing components (spine, gfx).
2. **WebGPU RenderContext backend** — thinner long-term (spec-faithful API on
   both web and native), but GLSL shaders must be translated to WGSL.

## 6. macOS windowing (host shell)

`App()` from `perry/ui` already provides the full shell: NSWindow +
NSApplication, an ~8 ms NSTimer pump driving timers/`onFrame`, and a single
NSEvent local monitor for pointer down/up/move (hit-tested, coordinates
remapped to web convention). A game-loop feature flag exists for
background-thread user code with UIKit/AppKit owning the main thread. For a
Rasen native shell: reuse `App()` + `BloomView`, wire `schedule` → `onFrame`,
`dispatchPointer` → pointer callbacks, `setImageAdapter` → native decode.

## 7. Constraints — what cannot convert as-is

- npm package-name imports (must become relative source imports / single entry)
- tsup `dist` artifacts (use `src/`)
- HMR machinery (web-only; exclude from native entry)
- `window`/`document` touches (guard for native)
- `perry/ui` Canvas as a canvas-2d backend (toy-grade; do not build on it)

## 8. Verified results

| Test | Result |
|---|---|
| Pure-TS Signal (sub/dedup/unsub/effect) + Float32Array math, `perry run` | PASS (7.6 MB) |
| `perry check` on real `@rasenjs/core` + `@rasenjs/math` imports | PASS |
| Full `core/src/index.ts` + `math/src` via relative imports, `perry run` | **PASS** (8.2 MB; ref/computed/vec3/all component factories) |
| tsup build + 189 core unit tests after syntax fixes | PASS |

Spike scripts live in `/tmp/perry-reactivity-test` (ephemeral) and an
untracked `examples/perry-reactive-test/` scratch dir.

## 9. Next steps

1. Native host context: window + frame pump + `dispatchPointer`/`schedule`/
   `setImageAdapter` wiring (reuse `perry/ui` `App()` + `BloomView`).
2. Mount a real component (rect → spine) under Perry; pixel-compare vs browser.
3. Scan `dom`/`gfx` packages for the generic-arrow pattern (mechanical fix).
4. Measure FFI overhead (bun:ffi micro-bench) to finalize the command-buffer
   design (one fat submit per frame).
5. Decide GL-glue vs WebGPU RenderContext backend (§5).
