/**
 * Element ref cells for runtime-agnostic components.
 *
 * `@rasenjs/dom`'s `ref` prop accepts any `{ value }` holder and writes the
 * element into it through the active reactive runtime. Core's `Ref<T>` is an
 * empty placeholder interface that only gains its `value` member when a
 * reactive adapter's `declare module` augmentation is in the program — which
 * a runtime-agnostic component library (this package) cannot rely on: it must
 * not import Vue/alien/signals types.
 *
 * So the cell is created through the runtime (real reactivity, real writes)
 * and typed structurally here. Reads go through `cell.value`, which is what
 * the reactive runtime tracks.
 */
import type { ReactiveRuntime } from '@rasenjs/core'

/** A cell an element factory can write its element into. */
export interface ElementRef<T extends HTMLElement> {
  value: T | null
}

/**
 * Create an element ref cell bound to the active reactive runtime.
 */
export function createElementRef<T extends HTMLElement>(
  rt: ReactiveRuntime
): ElementRef<T> {
  return rt.ref<T | null>(null) as unknown as ElementRef<T>
}
