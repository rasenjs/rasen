/**
 * Shared JSX namespace boilerplate.
 *
 * Every host package's `jsx-runtime.ts` declares an `export namespace JSX`
 * that TypeScript resolves when `jsxImportSource` points at that host. Three
 * members are identical across all hosts — `Element`, `ElementChildrenAttribute`
 * and `IntrinsicAttributes` — so they live here once and hosts reference them.
 *
 * Only `IntrinsicElements` is host-specific (each host's own tag set) and is
 * declared in the host's own namespace.
 */

import type { Mountable } from '../types'

/** The type of a JSX expression — a Mountable in Rasen. */
export type JSXElement = Mountable<any>

/** Marks `children` as the JSX children attribute. */
export interface JSXElementChildrenAttribute {
  children: unknown
}

/** Attributes available on every JSX element. */
export interface JSXIntrinsicAttributes {
  key?: string | number
}