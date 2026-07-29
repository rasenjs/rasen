/**
 * JSX runtime entry for @rasenjs/web (Browser)
 *
 * Configured with DOM intrinsic elements via @rasenjs/dom.
 * Use as `jsxImportSource` in tsconfig.json for client-side apps.
 */
import { jsx, jsxs, Fragment, configureTags, type TagComponent } from '@rasenjs/core'
import type { Mountable } from '@rasenjs/core'
import type { ElementProps, HTMLTagName } from '@rasenjs/dom'
import * as tags from '@rasenjs/dom'

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
