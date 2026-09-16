/**
 * NIKKE character viewer on Perry.
 *
 * Import order is the whole program here, so it is stated rather than implied:
 *
 *   1. `./bootstrap` installs the reactive runtime. It must complete before any
 *      other module's top-level code, because the viewer creates its refs and
 *      builds its component tree at module scope. ES imports run in source order,
 *      which is what makes this deterministic — a `setReactiveRuntime(...)`
 *      statement in this file would run too late (imports are hoisted above it).
 *   2. `./viewer/app` then builds the UI, starts the asset load, and calls
 *      `App()`, which blocks on the native run loop for the life of the program.
 *
 * Everything after step 2's `App()` call is unreachable, which is why the viewer
 * registers its frame callback before mounting.
 */
import "./bootstrap";
import "./viewer/app";
