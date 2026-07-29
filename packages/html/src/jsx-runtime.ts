/**
 * JSX runtime entry for @rasenjs/html (SSR/SSG)
 *
 * Configured with HTML string intrinsic elements as lowercase JSX tags.
 * SSR serialises known HTML props to attributes and ignores unknown ones.
 * Use as `jsxImportSource` in tsconfig.json:
 *
 * ```json
 * { "jsxImportSource": "@rasenjs/html" }
 * ```
 */
import { jsx, jsxs, Fragment, configureTags, type TagComponent } from '@rasenjs/core'
import type { Mountable } from '@rasenjs/core'
import type { ElementProps, HTMLTagName } from '@rasenjs/dom'
import * as tags from './components'

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
