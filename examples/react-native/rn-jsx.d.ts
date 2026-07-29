/**
 * Global JSX type declarations for Rasen RN
 *
 * This file provides the global `JSX` namespace that TypeScript
 * uses when resolving JSX types with `jsxImportSource`.
 * The IntrinsicElements index signature makes any tag name valid.
 */

interface _Attr {
  [key: string]: unknown
  key?: string | number
  children?: unknown
  style?: Record<string, unknown> | (() => Record<string, unknown>)
}

declare namespace JSX {
  interface Element {}
  interface IntrinsicElements {
    [tag: string]: _Attr
  }
  interface ElementChildrenAttribute { children: unknown }
  interface IntrinsicAttributes { key?: string | number }
}
