/**
 * Reactive runtime bootstrap.
 *
 * This module exists to be the FIRST import of the entry point, so that the
 * runtime is installed before any other module's top-level code runs.
 *
 * ── Why a module and not a call in the entry ──────────────────────────────
 * ES module imports are hoisted and executed in source order, while statements
 * are not. A `setReactiveRuntime(...)` call written above `import "./viewer/app"`
 * in the same file would run AFTER the viewer had already created its refs and
 * built its component tree. Importing this module first is what makes the
 * ordering hold.
 *
 * ── Why the ordering matters ──────────────────────────────────────────────
 * `getReactiveRuntime()` falls back to a built-in runtime when nothing was
 * installed. A ref created under one runtime and subscribed under another
 * collects no dependencies, so the subscription is dropped as a static source:
 * the initial value renders and every later update is silently lost. There is no
 * error and no warning — just a frozen UI.
 *
 * `@rasenjs/reactive-alien-signals` is the runtime the GPU example already
 * proved on this host (`examples/perry-spine`), so it is the known-good choice.
 */
import { setReactiveRuntime } from "@rasenjs/core";
import { createReactiveRuntime } from "@rasenjs/reactive-alien-signals";

setReactiveRuntime(createReactiveRuntime());

export {};
