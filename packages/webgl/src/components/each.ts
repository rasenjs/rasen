/**
 * each — reactive list rendering for WebGL scenes.
 *
 * Renders a dynamic list of WebGL components (mesh, billboard, group, …) that
 * can grow/shrink at runtime (e.g. hit impacts, particles, spawned entities).
 * Items are tracked by object reference (WeakMap): the same object reference
 * keeps the same instance; removing an object unmounts its component.
 *
 * Implemented on top of the core `eachImpl` (same as the DOM host) so the API
 * and behavior stay consistent across hosts. The WebGL host needs no marker /
 * node hooks — children mount directly against the GL context and register
 * their draw functions with the render context.
 *
 * @example
 * ```tsx
 * <each of={() => impacts.value.filter(i => i.alive.value)}>
 *   {(impact) => <billboard x={impact.x} y={impact.y} z={impact.z} ... />}
 * </each>
 * ```
 */

import { eachImpl, type Mountable, type Ref } from '@rasenjs/core'

export interface EachProps<T extends object> {
  of: T[] | Ref<T[]> | (() => T[])
  children: (item: T, index: number) => Mountable<WebGLRenderingContext | WebGL2RenderingContext>
}

const isProps = <T extends object>(v: unknown): v is EachProps<T> =>
  v !== null && typeof v === 'object' && 'of' in v && 'children' in v

const isRef = (v: unknown): v is Ref<unknown[]> =>
  v !== null && typeof v === 'object' && 'value' in v

/**
 * each — reactive list rendering for WebGL scenes.
 *
 * Supports both call forms:
 * 1. `each(items, render)` — items is an array, a ref array, or a getter fn.
 * 2. `each({ of, children })` — JSX/component form.
 */
export function each<T extends object>(
  props: EachProps<T>
): Mountable<WebGLRenderingContext | WebGL2RenderingContext>
export function each<T extends object>(
  items: T[] | Ref<T[]> | (() => T[]),
  render: (item: T, index: number) => Mountable<WebGLRenderingContext | WebGL2RenderingContext>
): Mountable<WebGLRenderingContext | WebGL2RenderingContext>
export function each<T extends object>(
  itemsOrProps: EachProps<T> | T[] | Ref<T[]> | (() => T[]),
  render?: (item: T, index: number) => Mountable<WebGLRenderingContext | WebGL2RenderingContext>
): Mountable<WebGLRenderingContext | WebGL2RenderingContext> {
  let items: T[] | Ref<T[]> | (() => T[])
  let renderFn: (item: T, index: number) => Mountable<WebGLRenderingContext | WebGL2RenderingContext>

  if (isProps<T>(itemsOrProps)) {
    items = itemsOrProps.of
    renderFn = itemsOrProps.children
  } else {
    items = itemsOrProps
    renderFn = render!
  }

  return eachImpl({
    items:
      typeof items === 'function'
        ? items
        : isRef(items)
          ? () => items.value as T[]
          : () => items,
    render: renderFn,
  })
}