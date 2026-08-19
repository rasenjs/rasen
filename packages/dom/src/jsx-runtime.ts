/**
 * JSX runtime entry for @rasenjs/dom
 *
 * Configured with DOM intrinsic elements as lowercase JSX tags.
 * Use as `jsxImportSource` in tsconfig.json:
 *
 * ```json
 * { "jsxImportSource": "@rasenjs/dom" }
 * ```
 */
import { jsx, jsxs, Fragment, configureTags, type TagComponent } from '@rasenjs/core'
import type { Mountable } from '@rasenjs/core'
import * as tags from './components'
import type { CanvasContextOptions, ElementProps, HTMLTagName } from './components'

configureTags({ '': tags as unknown as Record<string, TagComponent> })

export { jsx, jsxs, jsx as jsxDEV, Fragment }

// Mapped intrinsic elements kept as a named type so `IntrinsicElements` can
// be an `interface` — host packages and apps can then augment it with their
// own lowercase tags (e.g. canvas-2d components) via declaration merging.
type HTMLIntrinsicElements = {
  [K in Exclude<HTMLTagName, 'canvas'>]: Omit<ElementProps<K>, 'tag'>
} & {
  /**
   * The `canvas` JSX tag maps to the Rasen canvas component (which creates the
   * element itself and mounts host-specific children onto its context), so it
   * additionally accepts `contextType` / `contextOptions`.
   */
  canvas: Omit<ElementProps<'canvas'>, 'tag'> & {
    contextType?: '2d' | 'webgl' | 'webgl2' | 'webgpu'
    contextOptions?: CanvasContextOptions
  }
}

export namespace JSX {
  export interface IntrinsicElements extends HTMLIntrinsicElements {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type Element = Mountable<any>
  export interface ElementChildrenAttribute { children: unknown }
  export interface IntrinsicAttributes { key?: string | number }
}
