/**
 * Runtime arm of `@rasenjs/dom`'s `jsx-runtime` subpath.
 *
 * The entry is TYPES ONLY for a working build (`jsx-runtime.d.ts` next to it):
 * `@rasenjs/compiler` eliminates every JSX node, so nothing ever calls these.
 * They exist so the subpath has a runtime target at all — a bare `tsc`/`swc`
 * run that compiles JSX itself resolves this module and gets the actionable
 * error below instead of `ERR_PACKAGE_PATH_NOT_EXPORTED`.
 *
 * Re-exported from core so every host reports the same message.
 */
export {
  jsx,
  jsxs,
  jsxDEV,
  NO_JSX_RUNTIME_MESSAGE,
} from '@rasenjs/core/jsx-runtime-stub'
