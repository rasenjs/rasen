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
 *
 * The cell is a runtime ref, but it is *read and written through the runtime*
 * rather than by touching `.value` on the ref itself. That distinction is what
 * makes this work on every adapter:
 *
 * - `@rasenjs/reactive-vue`'s ref is an object, so `ref.value` happens to work.
 * - the builtin runtime's ref is a **callable** (`typeof ref === 'function'`,
 *   read by calling it), so `ref.value` is `undefined` - writes still land
 *   (element.ts uses `setValue`, which handles both shapes) but reads return
 *   nothing, and an element ref silently degrades to write-only.
 *
 * Routed through `unref`/`setValue`, both shapes behave the same, so a cell
 * written by the DOM renderer is readable by the component under any runtime.
 */
export function createElementRef<T extends HTMLElement>(
  rt: ReactiveRuntime
): ElementRef<T> {
  const cell = rt.ref<T | null>(null)
  return {
    get value(): T | null {
      return rt.unref(cell) as T | null
    },
    set value(next: T | null) {
      rt.setValue(cell, next)
    }
  }
}
