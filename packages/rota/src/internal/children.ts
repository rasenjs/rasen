/**
 * Child-slot helpers.
 *
 * A part's `children` may produce one mountable or several; the element
 * factories take either an array of mountables or a single one, so the
 * composite helpers normalize here instead of every component repeating it.
 */
import type { Mountable } from '@rasenjs/core'

export type ChildSlot = Mountable<HTMLElement> | Mountable<HTMLElement>[]

/** Normalize a children result into the array shape element factories take. */
export function toMountables(
  value: ChildSlot | undefined
): Mountable<HTMLElement>[] | undefined {
  if (value === undefined) return undefined
  return Array.isArray(value) ? value : [value]
}
