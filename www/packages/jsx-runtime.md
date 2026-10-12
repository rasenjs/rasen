# JSX runtime

::: info Moved
`@rasenjs/jsx` no longer exists as a package. JSX support now lives where it
belongs:

- **The compiler** — [`@rasenjs/compiler`](/packages/compiler) transforms JSX
  (attribute getters, static hoisting, structural rewrites, HMR).
- **The JSX runtime** — each host package exposes `jsx-runtime` /
  `jsx-dev-runtime` entries (`@rasenjs/dom`, `@rasenjs/html`,
  `@rasenjs/web`, `@rasenjs/react-native`), all built on the host-agnostic
  runtime in [`@rasenjs/core`](/packages/core).
- **Tag registration** — `registerTag` / `configureTags` / `findTag` from
  `@rasenjs/core` tell the runtime which component a lowercase tag maps to.

See [JSX & the Compiler](/guide/advanced/jsx) for the setup and the full list of
rewrites.
:::
