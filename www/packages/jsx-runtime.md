# JSX runtime

::: info Moved
`@rasenjs/jsx` no longer exists as a package. JSX support now lives where it
belongs:

- **The compiler** — [`@rasenjs/compiler`](/packages/compiler) transforms JSX
  (attribute getters, static hoisting, structural rewrites, JSX elimination,
  HMR).
- **The JSX runtime** — each host package exposes `jsx-runtime` /
  `jsx-dev-runtime` entries (`@rasenjs/dom`, `@rasenjs/html`,
  `@rasenjs/web`, `@rasenjs/react-native`): a types-only `.d.ts` carrying the
  `JSX` namespace for type checking. Rasen compiles JSX away, so nothing
  resolves tags at runtime; the runtime stub beside the types only exists so
  the subpath stays resolvable, and calling it throws with the fix.
- **Tag bindings** — the app's `unplugin-auto-import` config binds the bare
  names the compiled output calls (`div`, `canvas`, `Fragment`, …) to their
  host module; see [JSX & the Compiler](/guide/advanced/jsx) for the recipe.

See [JSX & the Compiler](/guide/advanced/jsx) for the setup and the full list of
rewrites.
:::
