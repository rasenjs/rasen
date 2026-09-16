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
import {
  jsx,
  jsxs,
  Fragment,
  configureTags,
  type TagComponent,
  type JSXElement,
  type JSXElementChildrenAttribute,
  type JSXIntrinsicAttributes,
} from '@rasenjs/core'
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
   * for '2d', GfxNode for webgl/webgl2/webgpu).
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
          renderOptions?: import('@rasenjs/gfx').RenderContextOptions
          /** Camera configuration for WebGL rendering */
          camera?: PropValue<import('@rasenjs/gfx').CameraConfig>
          children?:
            | Mountable<import('@rasenjs/gfx').GfxNode>
            | Array<Mountable<import('@rasenjs/gfx').GfxNode>>
        }
      | {
          contextType: 'webgpu'
          /** The GPUDevice, created by the caller before mounting (see the
           * canvas component's webgpuDevice prop). */
          webgpuDevice?: GPUDevice
          dpr?: number
          renderOptions?: import('@rasenjs/gfx').WebGPURendererOptions
          camera?: PropValue<{ x?: number; y?: number; zoom?: number }>
          children?:
            | Mountable<import('@rasenjs/gfx').GfxNode>
            | Array<Mountable<import('@rasenjs/gfx').GfxNode>>
        }
    )
}

export namespace JSX {
  export interface IntrinsicElements extends HTMLIntrinsicElements {}
  export type Element = JSXElement
  export interface ElementChildrenAttribute extends JSXElementChildrenAttribute {}
  export interface IntrinsicAttributes extends JSXIntrinsicAttributes {}
}
