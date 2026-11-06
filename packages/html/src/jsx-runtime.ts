/**
 * Runtime arm of `@rasenjs/html`'s `jsx-runtime` subpath.
 *
 * Types only in a working build (the hand-written `jsx-runtime.d.ts` beside
 * this file) — `@rasenjs/compiler` eliminates every JSX node. This module only
 * gives the subpath a runtime target so a build that skipped the compiler
 * fails with the actionable message instead of an unresolvable export.
 */
export {
  jsx,
  jsxs,
  jsxDEV,
  NO_JSX_RUNTIME_MESSAGE,
} from '@rasenjs/core/jsx-runtime-stub'
