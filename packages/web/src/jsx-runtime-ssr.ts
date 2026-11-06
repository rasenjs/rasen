/**
 * Runtime arm of `@rasenjs/web`'s `jsx-runtime` subpath for the `node`
 * condition (the SSR/HTML host).
 *
 * Types only in a working build — `@rasenjs/compiler` eliminates every JSX
 * node. This module gives the subpath a runtime target so a build that skipped
 * the compiler fails with the actionable message instead of an unresolvable
 * export.
 */
export {
  jsx,
  jsxs,
  jsxDEV,
  NO_JSX_RUNTIME_MESSAGE,
} from '@rasenjs/core/jsx-runtime-stub'
