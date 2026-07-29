# Rasen HMR Design

> Hot Module Replacement architecture for Rasen (らせん) — a reactive cross-platform rendering framework without virtual DOM.

**Status**: Draft  
**Last Updated**: 2026-07-27

---

## Table of Contents

1. [Problem Analysis](#1-problem-analysis)
2. [Design Goals](#2-design-goals)
3. [Core Challenge: No VDOM, Closure State](#3-core-challenge-no-vdom-closure-state)
4. [Architecture Overview](#4-architecture-overview)
5. [Package: `@rasenjs/core/hot` — HMR Runtime](#5-package-rasenjscorehot--hmr-runtime)
6. [Package: `@rasenjs/vite-plugin-rasen` — Vite Plugin](#6-package-rasenjsvite-plugin-rasen--vite-plugin)
7. [JSX Dev Runtime Enhancement](#7-jsx-dev-runtime-enhancement)
8. [Integration with Render Targets](#8-integration-with-render-targets)
9. [State Preservation Strategy](#9-state-preservation-strategy)
10. [Implementation Phases](#10-implementation-phases)
11. [Edge Cases & Risks](#11-edge-cases--risks)
12. [Appendix: Example Code](#12-appendix-example-code)

---

## 1. Problem Analysis

### Current State

| Aspect | Status | Detail |
|--------|--------|--------|
| Vite HMR (web examples) | ✅ Works out of box | Vite handles HMR at bundler level, no framework integration |
| Metro HMR (RN examples) | ✅ Works out of box | Metro handles HMR at bundler level |
| Vue RN transformer | ⚠️ Partial | Injects `__VUE_HMR_RUNTIME__` for `.vue` SFC components |
| `jsx-dev-runtime` | ❌ Placeholder | Currently just re-exports production runtime |
| Framework-level HMR | ❌ Missing | No component tracking, no hot boundary, no state preservation |
| DevTools | ❌ Missing | No component inspection, no HMR status panel |

### What HMR Needs to Do for Rasen

1. **Detect file change** via bundler (Vite/Metro)
2. **Identify affected modules** and their exported components
3. **Track mounted instances** of each component
4. **Unmount old instances** cleanly (call cleanup functions)
5. **Mount new instances** with updated component code
6. **Optionally preserve state** across the swap
7. **Handle CSS/Style updates** (already handled by bundlers)

---

## 2. Design Goals

### Must-Have (P0)

- [ ] **Component-level hot replacement**: Changed components are unmounted and remounted with new code
- [ ] **Clean lifecycle**: Old `unmount` called, new setup runs, new mount runs
- [ ] **Works with `com()` wrapper**: Compatible with effect scope lifecycle
- [ ] **Vite integration**: Works seamlessly with Vite dev server (DOM target)
- [ ] **Minimal API surface**: Users add minimal code (ideally just `hot()` wrapper)

### Should-Have (P1)

- [ ] **State preservation**: Opt-in mechanism to preserve `ref` values across HMR
- [ ] **Metro integration**: Works with React Native Metro bundler
- [ ] **Error recovery**: If new component throws, keep old one running
- [ ] **HMR status logging**: Console logging of hot update events

### Nice-to-Have (P2)

- [ ] **Canvas 2D / WebGL support**: HMR for non-DOM targets
- [ ] **DevTools overlay**: Visual HMR status indicator
- [ ] **Component tree inspection**: Show component hierarchy in dev mode
- [ ] **SSR HMR**: Hot reload for server-side rendering

---

## 3. Core Challenge: No VDOM, Closure State

### The Fundamental Problem

Rasen has **no virtual DOM**. Unlike React (VDOM diffing) or Vue (`render` function swapping), Rasen components are **three-phase closures**:

```typescript
const Counter = com((props) => {
  // Phase 1: Setup — creates refs, computed values
  const count = ref(0)
  const doubled = computed(() => count.value * 2)

  return (host) => {
    // Phase 2: Mount — creates DOM nodes, sets up watchers
    const el = document.createElement('div')
    el.textContent = String(count.value)
    host.appendChild(el)
    const stop = watch(count, (v) => el.textContent = String(v))

    // Phase 3: Unmount — cleanup
    return () => {
      stop()
      el.remove()
    }
  }
})
```

State lives **inside closures** — it is not externally accessible. There is no component instance object, no `this.state`, no fiber node.

### Why Existing HMR Approaches Don't Directly Apply

| Framework | HMR Mechanism | Why It Works |
|-----------|--------------|--------------|
| **React** | Fast Refresh: re-render function component, preserve state via fiber | React owns state management, can re-run component body |
| **Vue SFC** | Swap `render` function on component instance, trigger reactive re-render | Vue components have a mutable `render` option |
| **Svelte** | Re-run compiled setup, preserve DOM references | Compiler generates code with explicit setup/update separation |
| **Rasen** | ❌ State is in closure, no instance object, no intermediate representation | N/A |

### Solution Strategy: Hijacking `com()` at Runtime

Key insight: **`com()` is the single entry point for ALL Rasen components.** If we make `com()`'s implementation swappable at runtime, we can switch between production and development behavior transparently—no new API, no user-facing changes.

```
User code (unchanged):
  const Counter = com(() => { ... })
                   ^^^
                   Always the same import

Runtime (swappable):
  prodCom (production)   → create effectScope, mount, return unmount
  devCom (development)   ↑ same behavior + instance tracking + HMR swap

Implementation pointer:
  comImpl = __DEV__ ? devCom : prodCom   ← set at init
```

The parent component holds a **stable Mountable reference** (returned by `com()`). In development mode, `devCom` stores the component's instances in a registry keyed by module identity. When HMR fires:

1. The module re-executes, `com()` receives a new function
2. `devCom` recognizes this is an already-registered component (by module ID + call index)
3. It replaces the **implementation pointer** in the existing registry entry
4. It iterates all tracked instances: `unmount(old)` → `newSetup()` → `mount(host)`
5. It returns the same **stable wrapper** to the parent — no reference breakage

---

## 4. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Bundler Layer                            │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ Vite Dev Server  │  │ Metro Bundler    │  │ Others...     │  │
│  └────────┬─────────┘  └────────┬─────────┘  └───────┬───────┘  │
│           │ WebSocket           │ WebSocket          │           │
├───────────┼─────────────────────┼────────────────────┼───────────┤
│           ▼                     ▼                    ▼           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │          @rasenjs/vite-plugin-rasen (transform)         │    │
│  │  - Wrap module body in enterHmrModule/exitHmrModule     │    │
│  │  - Inject import.meta.hot.accept() at module end        │    │
│  │  - Zero AST analysis — just header/footer wrapper       │    │
│  │  - All injection is transparent to user                 │    │
│  └───────────────────────┬─────────────────────────────────┘    │
│                          │                                      │
├──────────────────────────┼──────────────────────────────────────┤
│                          ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │          @rasenjs/core/hot (Runtime)                     │    │
│  │                                                         │    │
│  │  __setComImpl()  ───  swaps com() impl at startup      │    │
│  │       │                                                  │    │
│  │  devCom()  ───  dev-mode com() with instance tracking   │    │
│  │       │      └──  HotComponentRegistry (per-module map) │    │
│  │       │      └──  enterHmrModule / exitHmrModule        │    │
│  │  hotRef()  ───  opt-in state preservation              │    │
│  │                                                         │    │
│  │  Architecture (minimal):                                │    │
│  │    prod:  com = prodCom  (original logic)               │    │
│  │    dev:   com = devCom   (wraps with instance tracking) │    │
│  └───────────────────────┬─────────────────────────────────┘    │
│                          │                                      │
├──────────────────────────┼──────────────────────────────────────┤
│                          ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │               jsx-dev-runtime (minimal)                   │    │
│  │  - Component identity tracking via com() (already done)   │    │
│  │  - Dev-mode validation warnings                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          │                                      │
│                          ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 Platform Integrations                    │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │    │
│  │  │ DOM HMR  │ │Canvas HMR│ │ RN HMR   │ │ SSR HMR  │   │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### HMR Flow (Detailed)

```
1. User edits src/Counter.tsx
2. Vite re-compiles and sends WebSocket update:
   { type: 'update', path: '/src/Counter.tsx' }
3. Browser's Vite HMR runtime calls import.meta.hot.accept() callback
   (injected by @rasenjs/vite-plugin-rasen during transformation)
4. Module re-executes:
   a. enterHmrModule('src/Counter.tsx') — sets global module context
   b. All imports re-execute (cached by Vite, other modules untouched)
   c. com(MyComponent) called:
      - devCom() reads current module ID, increments call index
      - Registry lookup: key = 'src/Counter.tsx#0'
      - EXISTS! This is an HMR update, not first mount
      - Replace impl pointer in registry entry
      - For each tracked instance: unmount old → new setup → mount to same host
      - Return same wrapper function (parent holds stable reference)
   d. exitHmrModule() — clears module context
5. Console: "[rasen/hot] ✨ Counter.tsx hot updated (2 instances)"
```

---

## 5. Package: `@rasenjs/core/hot` — HMR Runtime

This is the core HMR runtime. It lives in `@rasenjs/core` as a subpath export (`@rasenjs/core/hot`), gated behind `__DEV__` for tree-shaking.

### 5.1 `com()` Implementation Swap

The `com()` function in `@rasenjs/core` is backed by a mutable implementation reference. Production mode uses the existing `prodCom`. Development mode swaps it to `devCom`:

```typescript
// packages/core/src/com.ts

let comImpl: typeof prodCom = prodCom

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function com(component: (...args: any[]) => any): typeof component {
  return comImpl(component)
}

/** INTERNAL: used by @rasenjs/core/hot to swap com() in dev mode */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function __setComImpl(impl: typeof prodCom): void {
  comImpl = impl
}
```

### 5.2 Module Context Stack

`devCom` needs to know which module is currently being executed to generate stable component keys. This is done via a global context stack:

```typescript
// packages/core/src/hot/context.ts

interface HmrModuleCtx {
  id: string          // e.g. "src/Counter.tsx"
  nextIndex: number   // incremented per com() call in this module
}

let moduleContextStack: HmrModuleCtx[] = []

/**
 * Called by Vite plugin at top of each hot module.
 * Pushes module context, com() calls will read it.
 */
export function enterHmrModule(id: string): void {
  moduleContextStack.push({ id, nextIndex: 0 })
}

/**
 * Called by Vite plugin at end of each hot module.
 */
export function exitHmrModule(): void {
  moduleContextStack.pop()
}

/** Get current module ID, or null if not in HMR context */
function currentModuleId(): string | null {
  return moduleContextStack.length > 0
    ? moduleContextStack[moduleContextStack.length - 1].id
    : null
}

/** Get and increment the call index for the current module */
function nextCallIndex(): number {
  if (moduleContextStack.length === 0) return -1
  const ctx = moduleContextStack[moduleContextStack.length - 1]
  return ctx.nextIndex++
}
```

### 5.3 Component Registry (Per-Key Instance Tracking)

The core data structure. Each `com()` invocation in a module maps to a registry key:

```typescript
// packages/core/src/hot/registry.ts

interface HotComponentEntry {
  impl: Function                          // Current implementation (swappable)
  wrapper: Function                       // Stable wrapper returned to parent
  instances: Map<symbol, HotInstance>     // All mounted instances
}

interface HotInstance {
  uid: symbol
  host: unknown
  args: unknown[]
  unmount: (() => void) | null
  preservedState: Map<string, { value: unknown }>
}

const registry = new Map<string, HotComponentEntry>()

export function getRegistryEntry(key: string): HotComponentEntry | undefined {
  return registry.get(key)
}

export function setRegistryEntry(key: string, entry: HotComponentEntry): void {
  registry.set(key, entry)
}

export function deleteRegistryEntry(key: string): void {
  registry.delete(key)
}

export function getRegistrySize(): number {
  return registry.size
}
```

### 5.4 `devCom()` — Development Mode `com()` Implementation

This is swapped in as `comImpl` when HMR is active. It handles both first-time component creation and HMR updates:

```typescript
// packages/core/src/hot/com.ts

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function devCom(component: (...args: any[]) => any): typeof component {
  const moduleId = currentModuleId()

  if (!moduleId) {
    // Not in a hot module context — fall back to production behavior.
    // This happens for components in node_modules or files not wrapped by plugin.
    return prodCom(component)
  }

  const idx = nextCallIndex()
  const key = `${moduleId}#${idx}`

  // === HMR UPDATE PATH ===
  // Key already registered → this is a module re-execution
  const existing = getRegistryEntry(key)
  if (existing) {
    // 1. Replace implementation pointer
    existing.impl = component

    // 2. Re-mount all existing instances
    for (const [uid, inst] of existing.instances) {
      inst.unmount?.()                     // Clean up old
      try {
        const newMountable = component(...inst.args) as (...args: unknown[]) => unknown
        inst.unmount = newMountable(inst.host) as (() => void) | null
      } catch (e) {
        console.error(`[rasen/hot] Error remounting ${key}:`, e)
        // Keep old instance alive on failure
      }
    }

    console.log(
      `[rasen/hot] ✨ ${moduleId} hot updated (${existing.instances.size} instances)`
    )

    return existing.wrapper  // Return same wrapper — parent reference stable
  }

  // === FIRST CREATE PATH ===
  let impl = component
  const instances = new Map<symbol, HotInstance>()

  // Stable wrapper that delegates to the current impl
  const wrapper = function(this: unknown, ...args: unknown[]) {
    const uid = Symbol(key)
    const inst: HotInstance = {
      uid, host: null, args, unmount: null,
      preservedState: new Map()
    }
    instances.set(uid, inst)

    return (host: unknown) => {
      inst.host = host
      try {
        const mountFn = impl(...inst.args) as (host: unknown) => (() => void) | undefined
        inst.unmount = mountFn(host) ?? null
      } catch (e) {
        console.error(`[rasen/hot] Error mounting ${key}:`, e)
      }

      return () => {
        inst.unmount?.()
        instances.delete(uid)
      }
    }
  }

  setRegistryEntry(key, { impl, wrapper, instances })
  return wrapper as typeof component
}
```

### 5.5 `hotRef()` — State Preservation

Opt-in mechanism for preserving `ref` values across HMR cycles:

```typescript
// packages/core/src/hot/ref.ts

// Boundary context stack — set by devCom before calling impl(), read by hotRef
const boundaryContextStack: Array<Map<string, { value: unknown }>> = []

/** INTERNAL: called by devCom to set up preservation context */
export function pushBoundaryContext(ctx: Map<string, { value: unknown }>): void {
  boundaryContextStack.push(ctx)
}

/** INTERNAL: called by devCom after impl() returns */
export function popBoundaryContext(): void {
  boundaryContextStack.pop()
}

export function getCurrentPreservedState(): Map<string, { value: unknown }> | null {
  return boundaryContextStack.length > 0
    ? boundaryContextStack[boundaryContextStack.length - 1]
    : null
}

/**
 * Create a ref that preserves its value across HMR updates.
 *
 * @param key - Stable identifier (unique within the component)
 * @param initialValue - Initial value (used on first creation)
 * @returns A Ref whose value survives HMR
 *
 * @example
 * ```typescript
 * const Form = com(() => {
 *   const name = hotRef('name', '')    // preserved across HMR
 *   const dirty = ref(false)            // reset on HMR
 *   return (host) => { /* render */  }
 * })
 * ```
 */
export function hotRef<T>(key: string, initialValue: T): Ref<T> {
  const state = getCurrentPreservedState()
  if (state) {
    if (!state.has(key)) {
      state.set(key, { value: initialValue })
    }
    return state.get(key) as Ref<T>
  }
  // Fallback
  return getReactiveRuntime().ref(initialValue) as Ref<T>
}
```

In `devCom`, push/pop the preservation context:

```typescript
// Inside devCom's wrapper:
const wrapper = function(this: unknown, ...args: unknown[]) {
  // ...
  return (host: unknown) => {
    inst.host = host
    pushBoundaryContext(inst.preservedState)
    try {
      const mountFn = impl(...inst.args)
      // ...
    } finally {
      popBoundaryContext()
    }
  }
}
```

### 5.6 Activation Entry Point

```typescript
// packages/core/src/hot/activate.ts

import { __setComImpl } from '../com'
import { devCom } from './com'

/**
 * Activate HMR mode.
 * Swaps com() implementation to devCom.
 * Called once in the app entry point (injected by Vite plugin or manual).
 *
 * @example
 * ```typescript
 * // main.tsx (injected by Vite plugin automatically)
 * import '@rasenjs/core/hot/activate'
 * ```
 */
export function activateHMR(): void {
  __setComImpl(devCom)
  console.log('[rasen/hot] HMR activated')
}

// Auto-activate on import
activateHMR()
```

### 5.7 Package Structure

```
packages/core/src/hot/
├── index.ts       # Public API: enterHmrModule, exitHmrModule, acceptHmr, hotRef
├── activate.ts    # Auto-activates HMR on import
├── com.ts         # devCom() — development com() with instance tracking + swap
├── context.ts     # Module context stack (enterHmrModule/exitHmrModule)
├── registry.ts    # HotComponentRegistry (per-key entries)
└── ref.ts         # hotRef() state preservation
```

Subpath export in `packages/core/package.json`:

```json
{
  "exports": {
    ".": { ... },
    "./hot": {
      "types": "./dist/hot/index.d.ts",
      "import": "./dist/hot/index.js",
      "require": "./dist/hot/index.cjs"
    },
    "./hot/activate": {
      "types": "./dist/hot/activate.d.ts",
      "import": "./dist/hot/activate.js",
      "require": "./dist/hot/activate.cjs"
    }
  }
}
```

### 5.8 Package Structure

```
packages/core/src/hot/
├── index.ts       # Public API: enterHmrModule, exitHmrModule, acceptHmr, hotRef
├── activate.ts    # Auto-activates HMR on import (import '@rasenjs/core/hot/activate')
├── com.ts         # devCom() — development com() with instance tracking + swap
├── context.ts     # Module context stack (enterHmrModule/exitHmrModule)
├── registry.ts    # HotComponentRegistry (per-key entries)
└── ref.ts         # hotRef() state preservation
```

Subpath export in `packages/core/package.json`:

```json
{
  "exports": {
    ".": { ... },
    "./hot": {
      "types": "./dist/hot/index.d.ts",
      "import": "./dist/hot/index.js",
      "require": "./dist/hot/index.cjs"
    }
  }
}
```

---

## 6. Package: `@rasenjs/vite-plugin-rasen` — Vite Plugin

New package that handles file transformation and Vite HMR integration.

### 6.1 What the Plugin Does

For each `.ts`/`.tsx`/`.jsx` file that exports component functions:

1. **Injects HMR runtime import** at the top
2. **Generates module ID** from file path (relative to project root)
3. **Creates HotContext** for the module
4. **Wraps exported component functions** with `hotBoundary()`
5. **Injects `import.meta.hot.accept()`** handler
6. **Preserves non-component exports** as-is

### 6.2 Transformation Example

**Input:**
```tsx
// src/components/Counter.tsx
import { com, ref } from '@rasenjs/core'

const Counter = com((props: { initial: number }) => {
  const count = ref(props.initial)
  return (host) => {
    const el = document.createElement('div')
    el.textContent = String(count.value)
    host.appendChild(el)
    watch(count, (v) => el.textContent = String(v))
    return () => el.remove()
  }
})

export default Counter
export const Label = com(() => { /* ... */ })
```

**Output:**
```tsx
// src/components/Counter.tsx (transformed)
import { com, ref } from '@rasenjs/core'
import { createHotContext, hotBoundary, isHotEnabled } from '@rasenjs/core/hot'

const __hmrId__ = 'src/components/Counter.tsx'
const __hot__ = createHotContext(__hmrId__)

const Counter = hotBoundary(__hmrId__, com((props: { initial: number }) => {
  const count = ref(props.initial)
  return (host) => {
    const el = document.createElement('div')
    el.textContent = String(count.value)
    host.appendChild(el)
    watch(count, (v) => el.textContent = String(v))
    return () => el.remove()
  }
}))

export default Counter

const Label = hotBoundary(__hmrId__, com(() => { /* ... */ }))
export { Label }

// HMR acceptance — injected by plugin
if (import.meta.hot && isHotEnabled()) {
  import.meta.hot.accept((newModule) => {
    __hot__.invalidate()
    // HotContext handles the actual component swap
  })
}
```

### 6.3 Plugin Implementation Sketch

```typescript
// packages/vite-plugin-rasen/src/index.ts

import type { Plugin } from 'vite'
import { createFilter } from '@rollup/pluginutils'
import MagicString from 'magic-string'

const HOT_RUNTIME_IMPORT = '@rasenjs/core/hot'

export function rasenHMR(): Plugin {
  const filter = createFilter(
    /\.(tsx?|jsx)$/,
    /node_modules/
  )

  // Regex to find exported component declarations
  // Matches: export default X, export const X = ..., export function X() {}
  const EXPORT_RE = /export\s+(default\s+)?(?:const|let|var|function\s+\w+)?\s*(\w+)?\s*[=:]?\s*/g

  return {
    name: 'rasen:hmr',

    transform(code: string, id: string) {
      if (!filter(id)) return null
      if (!isComponentFile(code)) return null

      const s = new MagicString(code)
      const hmrId = getHmrId(id)  // relative path

      // 1. Add HMR runtime import (if not already present)
      // 2. Add __hmrId__ and __hot__ declarations
      // 3. Wrap component exports with hotBoundary()
      // 4. Add import.meta.hot.accept() block

      return {
        code: s.toString(),
        map: s.generateMap({ hires: true })
      }
    }
  }
}

function isComponentFile(code: string): boolean {
  // Check if file exports functions that are likely components
  // Heuristic: export + com() call or export + arrow/function that returns Mountable
  return /\bcom\s*\(/.test(code) || /\bhotBoundary\b/.test(code)
}

function getHmrId(filePath: string): string {
  // Convert absolute path to project-relative path
  // e.g., /project/src/Counter.tsx → src/Counter.tsx
  const root = process.cwd()
  return path.relative(root, filePath)
}
```

### 6.4 Plugin Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { rasenHMR } from '@rasenjs/vite-plugin-rasen'

export default defineConfig({
  plugins: [
    rasenHMR({
      // Options
      include: ['src/**/*.tsx', 'src/**/*.jsx'],
      exclude: ['node_modules'],
      // Auto-wrap all com() calls? (default: true)
      autoWrap: true,
    })
  ],
  define: {
    __DEV__: 'true'
  }
})
```

### 6.5 Package Structure

```
packages/vite-plugin-rasen/
├── package.json
├── tsup.config.ts
└── src/
    ├── index.ts           # Plugin entry
    ├── transform.ts       # Source transformation logic
    ├── detection.ts       # Component detection heuristics
    └── utils.ts           # Path utilities, ID generation
```

---

## 7. JSX Dev Runtime Enhancement

The existing `jsx-dev-runtime` is a placeholder that re-exports production code. We enhance it with dev-mode features.

### 7.1 Enhanced `jsxDEV`

```typescript
// packages/jsx-runtime/src/jsx-dev-runtime.ts

import { jsx } from './index'
import type { Mountable } from '@rasenjs/core'

// Track component creation for debugging
let componentStack: string[] = []

/**
 * Dev-mode JSX transform.
 * 
 * In addition to normal jsx(), jsxDEV provides:
 * - Component stack traces for warnings
 * - Validation of hot boundary usage
 * - Source location annotations
 */
export function jsxDEV(
  type: any,
  props: Record<string, any>,
  key: string | undefined,
  source?: { fileName: string; lineNumber: number }
): Mountable<any> {
  // Track component creation
  if (typeof type === 'function') {
    componentStack.push(type.name || '(anonymous)')
  }

  try {
    // Perform dev-mode validation
    if (typeof type === 'function' && !isHotBoundary(type) && !isPrimitive(type)) {
      const sourceStr = source
        ? ` at ${source.fileName}:${source.lineNumber}`
        : ''
      console.warn(
        `[rasen/dev] Component "${type.name || '(anonymous)'}" is not wrapped ` +
        `with hotBoundary(). Hot reload may not work correctly.${sourceStr}`
      )
    }

    return jsx(type, props, key)
  } finally {
    if (typeof type === 'function') {
      componentStack.pop()
    }
  }
}

function isHotBoundary(fn: any): boolean {
  return typeof fn === 'function' && fn.__isHotBoundary === true
}

function isPrimitive(type: any): boolean {
  return typeof type === 'string'  // HTML tags
}

/**
 * Get the current component stack (for error reporting).
 */
export function getComponentStack(): string[] {
  return [...componentStack]
}

export { jsx as jsxs, Fragment } from './index'
```

### 7.2 Configuration for `tsconfig.json`

```json
{
  "compilerOptions": {
    "jsx": "react-jsxdev",
    "jsxImportSource": "@rasenjs/web"
  }
}
```

With `react-jsxdev`, TypeScript automatically uses `jsxDEV` from `jsx-dev-runtime`, which we've enhanced.

---

## 8. Integration with Render Targets

### 8.1 DOM Target

The DOM renderer (most common) integrates seamlessly with the Vite-based HMR:

```
User edits .tsx file
  → Vite rebuilds module
  → Vite sends update to browser
  → import.meta.hot.accept() fires
  → HotContext.invalidate()
    → For each hotBoundary instance:
      → Capture hotRef state
      → Call old unmount()
      → Mount new instance with saved host
      → Restore hotRef state
```

The `mount()` function in `@rasenjs/dom` needs no changes — it just calls `Mountable(host)`, and the hot boundary wrapper handles the rest.

For **root-level HMR** (when the app root component changes):

```typescript
// src/main.tsx
import { mount } from '@rasenjs/dom'
import App from './App'

const container = document.getElementById('app')!
const unmount = mount(App(), container)

// Root-level HMR
if (import.meta.hot) {
  import.meta.hot.accept('./App', (newApp) => {
    unmount?.()           // Unmount old
    App = newApp.default  // Update reference
    mount(App(), container)  // Mount new
  })
}
```

For simpler ergonomics, we can provide a `mountHot()` helper:

```typescript
// packages/dom/src/hot-mount.ts

import { mount } from './index'
import type { Mountable } from '@rasenjs/core'

/**
 * Mount a component with HMR support.
 * 
 * @param component - Root component factory
 * @param container - DOM container
 * @param hotModule - import.meta.hot (for root HMR)
 * @returns Unmount function
 */
export function mountHot(
  component: () => Mountable<HTMLElement>,
  container: HTMLElement,
  hotModule?: ImportMetaHot
): () => void {
  let current = component
  let unmount = mount(current(), container)

  if (hotModule) {
    hotModule.accept((newModule: any) => {
      unmount?.()
      current = newModule.default || current
      unmount = mount(current(), container)
    })
  }

  return () => unmount?.()
}
```

### 8.2 React Native Target (Metro)

For RN, the bundler is Metro, not Vite. The approach differs:

1. **Metro transformer plugin** injects module-level HMR code
2. **React Native's HMRClient** handles WebSocket communication
3. **The `HotContext` pattern is shared** (same `@rasenjs/core/hot` runtime)

However, the `hotBoundary` wrapper is **agnostic to the render target** — it works with any `Mountable<Host>`. The Metro-specific work is:

- A Babel plugin that mirrors the Vite plugin's transformation
- Integration with RN's `module.hot.accept()` API (already partially done in vue-rn)

```javascript
// packages/babel-plugin-rasen-hmr/src/index.js
module.exports = function rasenHMRBabelPlugin() {
  return {
    visitor: {
      Program: {
        exit(path, state) {
          // Similar transformation as Vite plugin:
          // 1. Add import for createHotContext, hotBoundary
          // 2. Wrap exports with hotBoundary
          // 3. Add module.hot.accept()
        }
      }
    }
  }
}
```

### 8.3 Canvas 2D / WebGL

These targets use the same Vite pipeline as DOM, so the Vite plugin works unchanged. The `Mountable<CanvasRenderingContext2D>` functions are wrapped with `hotBoundary` the same way.

### 8.4 SSR

HMR for SSR is less critical (no UI to watch), but the mechanism is:
- File watcher detects changes → rebuild module
- The module-level hot swap works but SSR typically doesn't need instance tracking (no persistent DOM)
- Focus: re-export updated `renderToString` functions

---

## 9. State Preservation Strategy

### 9.1 Default: Full Remount (No State Preservation)

On HMR update, by default the component unmounts and remounts fresh:

```
Before HMR:  count = 5, input = "hello"
After HMR:   count = 0, input = ""    (reset)
```

Acceptable for many components (static displays, lists). Best for correctness.

### 9.2 Opt-In: `hotRef()` Preservation

Explicit state preservation using `hotRef()`:

```typescript
const Form = hotBoundary('Form.tsx', com(() => {
  const name = hotRef('name', '')      // preserved
  const email = hotRef('email', '')    // preserved
  const dirty = ref(false)              // NOT preserved (reset on HMR)
  
  return (host) => { /* render */ }
}))
```

`hotRef` stores values in a map keyed by the component's HMR boundary ID + key name. During HMR, values are captured before unmount and restored after remount.

### 9.3 State Preservation Lifecycle

```
1. HMR triggered
2. For each instance:
   a. captureState() → snapshot of all hotRef values
   b. oldUnmount() → cleanup
3. Module implementation updated
4. For each instance:
   a. newMountable = newImpl(args)
   b. newMountable(host) → setup runs
     - hotRef('name', '') finds saved value → restores it
   c. UI updated with preserved state
```

### 9.4 Limitations

- **Computed values** are always re-computed (they're derived, not stateful)
- **External state** (stores, context) is unaffected (survives naturally)
- **DOM state** (cursor position, scroll position, focus) is lost — the old DOM is removed
- **setTimeout/interval** timers are reset (cleanup is called)

---

## 10. Implementation Phases

### Phase 1: Core Runtime + Vite Plugin (2-3 weeks)

| Task | Package | Description |
|------|---------|-------------|
| 1.1 | `@rasenjs/core/hot` | `HotModuleRegistry`, `HotContext` |
| 1.2 | `@rasenjs/core/hot` | `hotBoundary()` wrapper |
| 1.3 | `@rasenjs/core/hot` | `hotRef()` state preservation (basic) |
| 1.4 | `@rasenjs/vite-plugin-rasen` | Source transformation |
| 1.5 | `@rasenjs/vite-plugin-rasen` | Module ID generation, `import.meta.hot.accept()` injection |
| 1.6 | Integration | Test with DOM examples |
| 1.7 | Test | Unit tests for runtime, integration tests with Vite |

**Deliverable**: HMR working for DOM renderer with Vite. State preservation opt-in.

### Phase 2: JSX Dev Runtime + Developer Experience (1 week)

| Task | Package | Description |
|------|---------|-------------|
| 2.1 | `@rasenjs/jsx` | Enhanced `jsxDEV` with stack traces |
| 2.2 | `@rasenjs/jsx` | Hot boundary validation warnings |
| 2.3 | `@rasenjs/dom` | `mountHot()` helper for root HMR |
| 2.4 | Examples | Update all web examples to use HMR |
| 2.5 | Docs | HMR usage guide, migration guide |

**Deliverable**: Developer-friendly HMR with helpful warnings and examples.

### Phase 3: React Native + Metro (2 weeks)

| Task | Package | Description |
|------|---------|-------------|
| 3.1 | `@rasenjs/babel-plugin-rasen-hmr` | Babel plugin for Metro |
| 3.2 | `@rasenjs/react-native` | Integration with RN HMRClient |
| 3.3 | `@rasenjs/rn-dom` | `RNDocument.reset()` integration |
| 3.4 | Examples | Update vue-rn-test and rn-dom-test |
| 3.5 | Test | RN HMR E2E testing |

**Deliverable**: HMR working for React Native (with Metro bundler).

### Phase 4: Advanced Features (Future)

| Task | Package | Description |
|------|---------|-------------|
| 4.1 | `@rasenjs/core/hot` | Error recovery (keep old on crash) |
| 4.2 | `@rasenjs/core/hot` | Component tree invalidation (propagate updates to parents) |
| 4.3 | DevTools | HMR status overlay, component inspector |
| 4.4 | Canvas 2D | Verify HMR works (likely already works) |

**Deliverable**: Robust, production-ready HMR with error recovery.

---

## 11. Edge Cases & Risks

### 11.1 Stale Closure Capture

**Risk**: If the component callback captures something from its closure (not through `ref`), the captured value becomes stale after HMR.

**Input:**
```typescript
const Counter = hotBoundary('id', com(() => {
  const renderCount = moduleLevelCounter++  // Captured at setup time
  return (host) => {
    host.textContent = String(renderCount)  // Stale after HMR
  }
}))
```

**Mitigation**: Documentation warning. HMR works best when all mutable state uses `ref()`.

### 11.2 Component Not Wrapped with `hotBoundary`

**Risk**: If a user forgets to configure the Vite plugin, or the plugin fails to detect a component, HMR won't work for that component.

**Mitigation**: `jsxDEV` validates that function components are wrapped and warns in the console.

### 11.3 State Loss in Complex Components

**Risk**: Components with nested state (e.g., form with many fields) lose state on HMR if the author didn't use `hotRef()`.

**Mitigation**: Phase 4 could introduce "auto-preserve" mode that saves all `ref()` values automatically (using a proxy around the reactive runtime). However, this is risky — some state SHOULD be reset.

### 11.4 Multiple Components Per File

**Risk**: One file exports multiple components that all share module-level state.

**Mitigation**: The module-level `HotContext` handles all boundaries in the file. When the module updates, ALL boundaries in that file are invalidated.

### 11.5 CSS HMR Interaction

**Risk**: When CSS changes trigger HMR, the component re-mounts and loses DOM state unnecessarily.

**Mitigation**: CSS HMR is handled by Vite at a different level (just swaps stylesheets). It must NOT trigger component re-mount. Ensure the Vite plugin only handles `.ts`/`.tsx`/`.jsx` files.

### 11.6 Performance in Development

**Risk**: Tracking all component instances has memory overhead.

**Mitigation**: The tracking structures are lightweight (Maps of Symbols). They're only active in `__DEV__` mode and tree-shaken in production.

---

## 12. Appendix: Example Code

### 12.1 User-Facing API (What Developers Write)

```tsx
// Counter.tsx
import { com, ref, watch } from '@rasenjs/core'
import { div, button } from '@rasenjs/web'

// No HMR-specific code needed in most cases!
// The Vite plugin handles wrapping automatically.

export default com((props: { label: string }) => {
  const count = ref(0)

  return (host) => {
    const el = (
      div({ class: 'counter' },
        button({
          onClick: () => count.value++,
          class: 'btn'
        }, `Count: ${count.value}`)
      )
    )

    return () => {
      // cleanup
    }
  }
})
```

### 12.2 With State Preservation

```tsx
// Form.tsx
import { com, watch } from '@rasenjs/core'
import { hotRef } from '@rasenjs/core/hot'

export default com(() => {
  // These values survive HMR
  const name = hotRef('name', '')
  const email = hotRef('email', '')

  return (host) => {
    // Render form with current values
    // ...
  }
})
```

### 12.3 Manual HMR (Without Plugin)

If not using the Vite plugin, developers can manually set up HMR:

```tsx
// App.tsx
import { com, ref } from '@rasenjs/core'
import { createHotContext, hotBoundary } from '@rasenjs/core/hot'

const __hot__ = createHotContext('src/App.tsx')

const App = hotBoundary('src/App.tsx', com(() => {
  const count = ref(0)
  return (host) => { /* ... */ }
}))

export default App

if (import.meta.hot) {
  import.meta.hot.accept((mod) => __hot__.invalidate())
}
```

### 12.4 Root-Level HMR in `main.tsx`

```tsx
// main.tsx
import { mount } from '@rasenjs/dom'
import App from './App'
import { mountHot } from '@rasenjs/dom/hot'

// Simple mount (no HMR)
// mount(App(), document.getElementById('app')!)

// HMR-enabled mount
const unmount = mountHot(
  () => App(),
  document.getElementById('app')!,
  import.meta.hot
)
```

### 12.5 Vite Plugin Options

```typescript
interface RasenHMRPluginOptions {
  /** File patterns to transform (default: ['src/**\/*.{tsx,jsx}']) */
  include?: string[]
  /** File patterns to exclude (default: ['node_modules']) */
  exclude?: string[]
  /** Auto-wrap com() components with hotBoundary (default: true) */
  autoWrap?: boolean
  /** Generate source maps (default: true) */
  sourcemap?: boolean
  /** Log level (default: 'info') */
  logLevel?: 'silent' | 'info' | 'verbose'
}
```

---

## Summary

| Layer | What | Who |
|-------|------|-----|
| **HMR Runtime** | `HotModuleRegistry`, `HotContext`, `hotBoundary()`, `hotRef()` | `@rasenjs/core/hot` |
| **Build Plugin** | Source transformation, `import.meta.hot.accept()` injection | `@rasenjs/vite-plugin-rasen` (new) |
| **JSX Dev Runtime** | Enhanced `jsxDEV` with component tracking, validation | `@rasenjs/jsx` (enhance) |
| **DOM Integration** | `mountHot()` helper | `@rasenjs/dom` (enhance) |
| **RN Integration** | Babel plugin for Metro, RN HMRClient | `@rasenjs/babel-plugin-rasen-hmr` (new) |

### Key Design Decisions

1. **Mutable implementation reference** — component function is stored in a mutable variable, enabling hot swap without changing the parent's Mountable reference
2. **Instance tracking** — `hotBoundary` tracks all mounted instances (host, args, unmount) for re-mount on HMR
3. **Opt-in state preservation** — `hotRef()` API for preserving ref values; default is full remount (safe and predictable)
4. **Bundler-agnostic core** — the runtime (`@rasenjs/core/hot`) doesn't depend on Vite or Metro; integration is via plugins
5. **`__DEV__` guarded** — all HMR code is tree-shaken in production builds
6. **Plugin-driven transformation** — manual HMR setup is possible without the plugin, but the plugin provides seamless zero-config experience
