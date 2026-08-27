import type { PropValue, Ref } from '@rasenjs/core'
import { getReactiveRuntime } from '@rasenjs/core'

/**
 * 解包 Ref 或 Getter
 *
 * Deep unwrap: the JSX compiler emits attribute getters (`() => expr`) and
 * `expr` may ITSELF be a ref/computed, so keep unwrapping refs and getters
 * until a plain value settles.
 */
export function unref<T>(value: PropValue<T>): T {
  let v: unknown = value
  const rt = getReactiveRuntime()
  for (let depth = 0; depth < 5; depth++) {
    if (v !== null && typeof v === 'object' && rt.isRef(v)) {
      v = rt.unref(v as Ref<unknown>)
    } else if (typeof v === 'function') {
      v = (v as () => unknown)()
    } else {
      break
    }
  }
  return v as T
}
