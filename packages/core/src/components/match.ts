import { getReactiveRuntime } from '../reactive'
import { com } from '../com'
import { type Mountable, type PropValue } from '../types'

/**
 * Host operation hooks - consistent with when/each
 */
export interface MatchHostHooks<Host = unknown, N = unknown> {
  /** Create a marker node for positioning (receives host to ensure correct document context) */
  createMarker?: (host: Host, content: string) => N
  /** Append marker node to host */
  appendMarker?: (host: Host, marker: N) => void
  /** Insert node before specified position */
  insertBefore?: (host: Host, node: N, before: N | null) => void
  /** Remove marker node */
  removeMarker?: (marker: N) => void
}

/**
 * match component configuration
 */
export interface MatchConfig<
  Host,
  K extends string = string,
  N = unknown
> extends MatchHostHooks<Host, N> {
  /** Reactive value for matching cases */
  value: PropValue<K | null | undefined>

  /** Branch mapping - supports both object and array forms */
  /** Object form: value matching (key -> component) */
  /** Array form: condition matching [[condition, component], ...] */
  cases: Partial<Record<K, (key: K) => Mountable<Host>>> | Array<[() => boolean, () => Mountable<Host>]>

  /** Default branch (when no match) */
  default?: () => Mountable<Host>

  /**
   * Whether to cache created branches
   * - false (default): destroy old branch on switch
   * - true: keep created branches, only hide/show on switch (requires platform support)
   */
  cache?: boolean
}

/**
 * match component - multi-branch conditional rendering
 *
 * Renders the corresponding case branch based on the value.
 * Only switches branches when value actually changes, performance optimized.
 *
 * @example
 * // Object form - value matching
 * match({
 *   value: () => currentTab,
 *   cases: {
 *     home: () => HomeView(),
 *     profile: () => ProfileView(),
 *     settings: () => SettingsView(),
 *   },
 *   default: () => NotFoundView()
 * })
 *
 * // Array form - condition matching [[condition, component], ...]
 * match({
 *   value: () => status,
 *   cases: [
 *     [() => status === 'loading', () => Loading()],
 *     [() => status === 'error', () => ErrorMsg()],
 *     [() => status === 'success', () => SuccessContent()],
 *   ],
 *   default: () => DefaultContent()
 * })
 *
 * // Router scenario with key parameter
 * match({
 *   value: () => router.current?.key,
 *   cases: {
 *     home: () => HomePage(),
 *     user: (key) => UserPage({ key }),
 *   },
 *   default: () => NotFound()
 * })
 */
export const match = com(
  <Host = unknown, K extends string = string, N = unknown>(
    config: MatchConfig<Host, K, N>
  ): Mountable<Host> => {
    return (host: Host) => {
      const runtime = getReactiveRuntime()

      // Create marker (optional)
      const marker = config.createMarker?.(host, 'm')
      if (marker && config.appendMarker) {
        config.appendMarker(host, marker)
      }

      // Use Symbol to mark "uninitialized" state
      const UNINITIALIZED = Symbol('uninitialized')

      // Current active key (use Symbol to distinguish "uninitialized" from undefined)
      let currentKey: K | null | undefined | typeof UNINITIALIZED =
        UNINITIALIZED
      // Current branch unmount function
      let currentUnmount: (() => void) | void

      // Cleanup current branch
      const cleanup = () => {
        if (currentUnmount) {
          currentUnmount()
          currentUnmount = undefined
        }
      }

      // Mount branch
      const mountBranch = (key: K | null | undefined) => {
        let factory:
          | ((key: K) => Mountable<Host>)
          | (() => Mountable<Host>)
          | undefined

        if (Array.isArray(config.cases)) {
          const pair = config.cases.find(([condition]) => condition())
          if (pair) {
            factory = pair[1]
          }
        } else if (key != null && config.cases[key]) {
          factory = config.cases[key]
        }

        if (!factory && config.default) {
          factory = config.default
        }

        if (!factory) return

        let targetHost = host

        if (marker && config.insertBefore) {
          targetHost = new Proxy(host as object, {
            get(target, prop, receiver) {
              if (prop === 'appendChild') {
                return (node: N) => {
                  config.insertBefore!(host, node, marker)
                  return node
                }
              }
              if (prop === 'insertBefore') {
                return (node: N, ref: N | null) => {
                  config.insertBefore!(host, node, ref || marker)
                  return node
                }
              }
              return Reflect.get(target, prop, receiver)
            },
          }) as Host
        }

        const mountable =
          key != null && factory !== config.default && !Array.isArray(config.cases)
            ? (factory as (key: K) => Mountable<Host>)(key)
            : (factory as () => Mountable<Host>)()

        currentUnmount = mountable(targetHost)
      }

      // Unwrap PropValue
      const unref = <T>(value: PropValue<T>): T => {
        if (typeof value === 'function') {
          return (value as () => T)()
        }
        if (value && typeof value === 'object' && 'value' in value) {
          return (value as { value: T }).value
        }
        return value as T
      }

      // Watch value changes (automatically cleaned by com)
      runtime.watch(
        () => unref(config.value),
        (newKey) => {
          // If key hasn't changed, no need to do anything (key performance optimization)
          if (currentKey === newKey) return

          // Cleanup old branch
          cleanup()

          // Update currentKey
          currentKey = newKey

          // Mount new branch
          mountBranch(newKey)
        },
        { immediate: true }
      )

      return () => {
        cleanup()
        if (marker && config.removeMarker) {
          config.removeMarker(marker)
        }
      }
    }
  }
)

// Deprecated alias for backwards compatibility
/** @deprecated Use `match` instead */
export const switchCase = match
