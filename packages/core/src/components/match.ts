import { getReactiveRuntime, toValue } from '../reactive'
import { com, getHostContext } from '../com'
import { MARKERS } from '../marker-constants'
import { type Mountable, type PropValue, type HostContext, type HostHooks } from '../types'

/**
 * match component configuration
 */
export interface MatchConfig<
  Host,
  K extends string = string,
  N = unknown
> {
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

  /** 显式宿主钩子（缺省时从 HostContext 继承） */
  hooks?: HostHooks<Host, N>
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

      // 宿主上下文：com 挂载时已压栈。优先用 ctx.hooks，config.hooks 作为显式 fallback。
      const ctx = getHostContext() as HostContext<Host, N> | undefined
      const hooks = ctx?.hooks ?? config.hooks

      // 定位标记：分支内容始终插在标记之前（有界宿主保证）。
      let marker: N | undefined
      if (hooks?.createMarker && hooks.insert) {
        marker = hooks.createMarker(host, MARKERS.MATCH_START)
        hooks.insert(host, marker, null)
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

        // 有界宿主：子树的所有追加都落在标记之前。
        const targetHost =
          marker && hooks?.boundedHost ? hooks.boundedHost(host, marker) : host

        const mountable =
          key != null && factory !== config.default && !Array.isArray(config.cases)
            ? (factory as (key: K) => Mountable<Host>)(key)
            : (factory as () => Mountable<Host>)()

        currentUnmount = mountable(targetHost)
      }

      // Unwrap PropValue (function / ref / plain) via the active runtime.
      const unwrap = <T>(value: PropValue<T>): T => toValue(value)

      // Watch value changes (automatically cleaned by com)
      runtime.watch(
        () => unwrap(config.value),
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
        if (marker && hooks?.detach) {
          hooks.detach(marker)
        }
      }
    }
  }
)

// Deprecated alias for backwards compatibility
/** @deprecated Use `match` instead */
export const switchCase = match
