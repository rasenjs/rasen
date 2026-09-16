/**
 * JSX runtime entry for @rasenjs/web (Browser).
 *
 * Thin re-export of @rasenjs/dom's JSX runtime (DOM intrinsic elements).
 * Kept as a package entry so `jsxImportSource: "@rasenjs/web"` resolves; the
 * package's conditional export swaps in jsx-runtime-ssr for the node build.
 */
export * from '@rasenjs/dom/jsx-runtime'
