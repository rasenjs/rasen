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
import type { Mountable, PropValue } from '@rasenjs/core'
import * as tags from './components'
import type { ElementProps, HTMLTagName } from './components'

configureTags({ '': tags as unknown as Record<string, TagComponent> })

export { jsx, jsxs, jsx as jsxDEV, Fragment }

// Mapped intrinsic elements kept as a named type so `IntrinsicElements` can
// be an `interface` — host packages and apps can then augment it with their
// own lowercase tags (e.g. canvas-2d components) via declaration merging.
type HTMLIntrinsicElements = {
  [K in Exclude<HTMLTagName, 'canvas'>]: Omit<ElementProps<K>, 'tag'>
} & {
  /**
   * The `canvas` JSX tag maps to the Rasen canvas component. contextType is a
   * discriminant: children/renderOptions are typed per renderer (CanvasNode
   * for '2d', GlNode for webgl/webgl2).
   */
  canvas: Omit<ElementProps<'canvas'>, 'tag' | 'children'> &
    (
      | {
          contextType?: '2d'
          /** Device pixel ratio for the backing store. Higher = crisper render
           * (supersampling) at the cost of fill cost. Defaults to
           * window.devicePixelRatio. */
          dpr?: number
          renderOptions?: import('@rasenjs/canvas-2d').RenderContextOptions
          /** Camera configuration for 2D rendering */
          camera?: PropValue<{ x?: number; y?: number; zoom?: number }>
          children?:
            | Mountable<import('@rasenjs/canvas-2d').CanvasNode>
            | Array<Mountable<import('@rasenjs/canvas-2d').CanvasNode>>
        }
      | {
          contextType: 'webgl' | 'webgl2'
          /** Device pixel ratio for the backing store. Higher = crisper render
           * (supersampling) at the cost of fill cost. Defaults to
           * window.devicePixelRatio. */
          dpr?: number
          contextOptions?: WebGLContextAttributes
          renderOptions?: import('@rasenjs/webgl').RenderContextOptions
          /** Camera configuration for WebGL rendering */
          camera?: PropValue<import('@rasenjs/webgl').CameraConfig>
          children?:
            | Mountable<import('@rasenjs/webgl').GlNode>
            | Array<Mountable<import('@rasenjs/webgl').GlNode>>
        }
    )
}

export namespace JSX {
  export interface IntrinsicElements extends HTMLIntrinsicElements {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type Element = Mountable<any>
  export interface ElementChildrenAttribute { children: unknown }
  export interface IntrinsicAttributes { key?: string | number }
}
