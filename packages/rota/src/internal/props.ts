/**
 * Reading component props.
 *
 * A prop that carries a value is a `PropValue<T>`: a plain value, a ref, or a
 * getter — the JSX transform wraps dynamic expressions in a getter
 * (`checked={count > 2}` arrives as `() => count > 2`), and a signal-based
 * adapter may hand over a ref. Reading such a prop directly would compare or
 * render the *function*.
 *
 * So values are read through `toValue`, which unwraps a ref, calls a getter
 * and passes plain values through. Reads have to stay inside the getters the
 * bindings call, otherwise the dependency is collected at the wrong time.
 */
import { toValue, type PropValue } from '@rasenjs/core'

/** Read a value prop that may be plain, a ref, or a getter. */
export function readProp<T>(value: PropValue<T> | undefined, fallback: T): T {
  return value === undefined ? fallback : toValue(value)
}
