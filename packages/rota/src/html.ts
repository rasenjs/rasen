/**
 * Server-side entry point.
 *
 * ⚠️ Not implemented yet: this re-exports the same components as the main
 * entry, and those are built on @rasenjs/dom element factories, so they
 * create real DOM nodes. Rendering to an HTML string needs a parallel part
 * tree (the state logic in each component is already host-agnostic, the view
 * layer is not).
 *
 * It is kept as the promised entry point so the import path does not change
 * when SSR lands — but it will not server-render today, and saying otherwise
 * would be worse than saying this.
 */
export * from './index'
