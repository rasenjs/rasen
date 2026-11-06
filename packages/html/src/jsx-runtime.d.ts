/**
 * JSX runtime entry for @rasenjs/html (SSR/SSG) — TYPES ONLY (a hand-written
 * `.d.ts`).
 *
 * Rasen compiles JSX away (@rasenjs/compiler + the app's auto-import), so no
 * `jsx()` call exists in a working build; this module only has to resolve for
 * `jsxImportSource` type checking and carry the string host's
 * `IntrinsicElements`.
 *
 * Use as `jsxImportSource` in tsconfig.json:
 *
 * ```json
 * { "jsxImportSource": "@rasenjs/html" }
 * ```
 *
 * The tag types come from THIS package's own `BaseProps` (and core's canonical
 * name list), never from `@rasenjs/dom`: that package is a dev dependency
 * here, so a published `@rasenjs/html` must typecheck without the DOM renderer.
 */
import type {
  JSXElement,
  JSXElementChildrenAttribute,
  JSXIntrinsicAttributes,
} from '@rasenjs/core'
import type { HtmlTag } from '@rasenjs/core/html-tags'
// `./index` resolves in both layouts: `src/index.ts` while developing this
// package, `dist/index.d.ts` in a published tree.
import type { BaseProps } from './index'

/** Every tag this host serialises — `canvas` included, as a plain element. */
type HTMLIntrinsicElements = {
  [K in HtmlTag | 'canvas']: BaseProps
}

export declare function jsx(
  type: unknown,
  props: Record<string, unknown> | null,
  key?: string
): JSXElement

export declare function jsxs(
  type: unknown,
  props: Record<string, unknown> | null,
  key?: string
): JSXElement

export declare function jsxDEV(
  type: unknown,
  props: Record<string, unknown> | null,
  key?: string
): JSXElement

/** This host's text-capable `<>…</>` — binds to `@rasenjs/html`'s root export. */
export declare const Fragment: (
  props: { children?: unknown },
) => JSXElement

export namespace JSX {
  export type IntrinsicElements = HTMLIntrinsicElements
  export type Element = JSXElement
  export interface ElementChildrenAttribute extends JSXElementChildrenAttribute {}
  export interface IntrinsicAttributes extends JSXIntrinsicAttributes {}
}
