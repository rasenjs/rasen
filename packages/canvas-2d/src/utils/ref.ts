import type { ReadonlyRef, Ref } from '@rasenjs/core'
import { unrefValue } from '@rasenjs/core'

/**
 * 解包 Ref 或 ReadonlyRef
 */
export function unref<T>(value: T | Ref<T> | ReadonlyRef<T>): T {
  return unrefValue(value)
}
