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
import type { ElementProps, HTMLTagName } from './components'

configureTags({ '': tags as unknown as Record<string, TagComponent> })

export { jsx, jsxs, jsx as jsxDEV, Fragment }

export namespace JSX {
  export type IntrinsicElements = {
    [K in HTMLTagName]: Omit<ElementProps<K>, 'tag'>
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type Element = Mountable<any>
  export interface ElementChildrenAttribute { children: unknown }
  export interface IntrinsicAttributes { key?: string | number }
}
