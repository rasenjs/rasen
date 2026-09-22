/**
 * Roving focus for a set of parts that share one tab stop.
 *
 * Composite widgets (accordion triggers, toggle groups, radio groups) all need
 * the same three things: an ordered set of enabled items, one element cell per
 * item for moving focus, and arrow-key handling that skips disabled items.
 *
 * Items are addressed by value, and the element is reached through a ref cell,
 * so nothing here queries the DOM. Liveness is read from the element
 * (`isConnected`), which means an unmounted item drops out of the order on its
 * own — no unregister bookkeeping to get wrong.
 */
import type { ReactiveRuntime } from '@rasenjs/core'
import { createElementRef, type ElementRef } from './element-ref'

export type Orientation = 'horizontal' | 'vertical'

export interface RovingFocus<T extends HTMLElement = HTMLElement> {
  /** An item announces its value and whether it is disabled. */
  registerItem: (value: string, disabled: boolean) => void
  /** An item withdraws again when it unmounts. */
  unregisterItem: (value: string) => void
  isItemDisabled: (value: string) => boolean
  /** Element cell for one item; bind it as the part's `ref`. */
  itemRef: (value: string) => ElementRef<T>
  /** Enabled values, in mount order. */
  enabledValues: () => string[]
  /** Position of a value among the enabled items, or -1. */
  indexOf: (value: string) => number
  /**
   * Position among *all* registered items, or -1. This is the one to use for
   * naming, because a disabled item still occupies a position and still needs
   * a stable identity (`indexOf` skips it, so it would shift the numbering).
   */
  valueIndex: (value: string) => number
  /** Focus the n-th enabled item. */
  focusItem: (index: number) => void
  /**
   * Map a raw index onto the enabled range: wraps when `loop` is on, clamps
   * otherwise. Callers that need to act on the same target as `focusItem`
   * (radio groups select what they focus) use this.
   */
  resolveIndex: (index: number) => number
  /**
   * Handle arrow / Home / End on an item. Returns true when the event was
   * consumed, so callers can layer their own keys on top.
   */
  handleArrows: (
    event: KeyboardEvent,
    value: string,
    orientation: Orientation
  ) => boolean
}

export interface RovingFocusOptions {
  rt: ReactiveRuntime
  /** The whole group can be disabled on top of per-item flags. */
  isGroupDisabled?: () => boolean
  /** Whether arrow navigation wraps around (default `true`). */
  loop?: boolean
}

export function createRovingFocus<T extends HTMLElement = HTMLElement>(
  options: RovingFocusOptions
): RovingFocus<T> {
  const { rt } = options
  const isGroupDisabled = options.isGroupDisabled ?? (() => false)
  const loop = options.loop ?? true

  const stated: string[] = []
  const disabledItems = new Map<string, boolean>()
  const refs = new Map<string, ElementRef<T>>()

  const isItemDisabled = (value: string): boolean =>
    isGroupDisabled() || (disabledItems.get(value) ?? false)

  /**
   * Enabled values in mount order. Membership is explicit — an item joins on
   * register and leaves on unregister — so a widget works before it is in the
   * document (SSR, a detached container) and still forgets removed items.
   */
  const enabledValues = (): string[] =>
    stated.filter((value) => !isItemDisabled(value))

  const resolveIndex = (index: number): number => {
    const values = enabledValues()
    if (values.length === 0) return -1
    return loop
      ? ((index % values.length) + values.length) % values.length
      : Math.min(Math.max(index, 0), values.length - 1)
  }

  /** Move focus to the n-th enabled item. */
  const focusItem = (index: number): void => {
    const values = enabledValues()
    const target = resolveIndex(index)
    if (target === -1) return
    refs.get(values[target]!)?.value?.focus()
  }

  const indexOf = (value: string): number => enabledValues().indexOf(value)
  const valueIndex = (value: string): number => stated.indexOf(value)

  const handleArrows = (
    event: KeyboardEvent,
    value: string,
    orientation: Orientation
  ): boolean => {
    const position = indexOf(value)
    if (position === -1) return false

    const vertical = orientation === 'vertical'
    const nextKey = vertical ? 'ArrowDown' : 'ArrowRight'
    const prevKey = vertical ? 'ArrowUp' : 'ArrowLeft'

    switch (event.key) {
      case nextKey:
      case prevKey:
        event.preventDefault()
        focusItem(position + (event.key === nextKey ? 1 : -1))
        return true
      case 'Home':
        event.preventDefault()
        focusItem(0)
        return true
      case 'End':
        event.preventDefault()
        focusItem(enabledValues().length - 1)
        return true
      default:
        return false
    }
  }

  return {
    registerItem: (value, disabled) => {
      if (!stated.includes(value)) stated.push(value)
      disabledItems.set(value, disabled)
    },
    unregisterItem: (value) => {
      const at = stated.indexOf(value)
      if (at !== -1) stated.splice(at, 1)
      disabledItems.delete(value)
    },
    isItemDisabled,
    itemRef: (value) => {
      let ref = refs.get(value)
      if (!ref) {
        ref = createElementRef<T>(rt)
        refs.set(value, ref)
      }
      return ref
    },
    enabledValues,
    indexOf,
    valueIndex,
    focusItem,
    resolveIndex,
    handleArrows
  }
}
