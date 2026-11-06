/**
 * The runtime arm of a host's `jsx-runtime` subpath — deliberately a stub.
 *
 * Rasen compiles JSX away (@rasenjs/compiler turns every node into a factory
 * call; bindings are the app's `unplugin-auto-import` config), so a working
 * build never imports this module. What it exists for is the build that did
 * NOT run the compiler: a bare `tsc`, a `vitest` run, an swc/esbuild pipeline
 * with no rasen plugin. Those resolve `jsx-runtime` at runtime, and without a
 * `default` export condition the subpath has no runtime entry at all — the
 * failure is a bare `ERR_PACKAGE_PATH_NOT_EXPORTED` that names neither the
 * cause nor the fix.
 *
 * Importing is harmless. Calling throws with the fix.
 */

export const NO_JSX_RUNTIME_MESSAGE =
  'Rasen has no JSX runtime: JSX is compiled away, not interpreted. ' +
  'Add `rasenCompile()` (from @rasenjs/compiler) to your bundler plugins and ' +
  'bind tag names with `unplugin-auto-import`; the recipe is ' +
  'www/guide/advanced/jsx. If this call came from a tool that compiles JSX ' +
  'itself (a bare tsc / swc / vitest run), compile the module through the ' +
  'plugin instead.'

function noRuntime(): never {
  throw new Error(NO_JSX_RUNTIME_MESSAGE)
}

export function jsx(): never {
  return noRuntime()
}

export function jsxs(): never {
  return noRuntime()
}

export function jsxDEV(): never {
  return noRuntime()
}
