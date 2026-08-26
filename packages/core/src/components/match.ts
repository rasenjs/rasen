import { toValue, getReactiveRuntime } from '../reactive'
import { com } from '../com'
import { MARKERS } from '../marker-constants'
import { type Mountable, type PropValue, type HostHooks } from '../types'

/**
 * match component configuration
 */
export interface MatchConfig<
  K extends string = string,
  N = unknown
> {
  /** Reactive value for matching cases */
  value: PropValue<K | null | undefined>

  /** Branch mapping - supports both object and array forms */
  /** Object form: value matching (key -> component) */
  /** Array form: condition matching [[condition, component], ...] */
  cases: Partial<Record<K, (key: K) => Mountable<N>>> | Array<[() => boolean, () => Mountable<N>]>

  /** Default branch (when no match) */
  default?: () => Mountable<N>

  /**
   * Whether to cache created branches
   * - false (default): destroy old branch on switch
   * - true: keep created branches, only hide/show on switch (requires platform support)
   */
  cache?: boolean

  /** 显式宿主钩子（缺省时从 HostContext 继承） */
  hooks?: HostHooks<N>
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
  <K extends string = string, N = unknown>(
    config: MatchConfig<K, N>
  ): Mountable<N> => {
    return (node: N, mountHooks?: HostHooks<N>) => {
      const hooks = mountHooks ?? config.hooks
      const runtime = getReactiveRuntime()


      // 定位标记：分支内容始终插在标记之前（有界宿主保证）。
      let marker: N | undefined
      if (hooks?.createMarker && hooks.insert) {
        marker = hooks.createMarker(node, MARKERS.MATCH_START)
        hooks.insert(node, marker, null)
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
          | ((key: K) => Mountable<N>)
          | (() => Mountable<N>)
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
          marker && hooks?.boundedHost ? hooks.boundedHost(node, marker) : node

        const mountable =
          key != null && factory !== config.default && !Array.isArray(config.cases)
            ? (factory as (key: K) => Mountable<N>)(key)
            : (factory as () => Mountable<N>)()

        currentUnmount = mountable(targetHost, hooks)
      }

      // Unwrap PropValue (function / ref / plain) via the active runtime.
      const unwrap = <T>(value: PropValue<T>): T => toValue(value)

      // Subscribe value changes (automatically cleaned by com)
      runtime.subscribe(
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
        }
      )

      // immediate 语义：以当前值同步执行一次分支决策（与回调逻辑一致，
      // currentKey 初始为 UNINITIALIZED，因此首次必然挂载）
      {
        const newKey = unwrap(config.value)
        if ((currentKey as unknown) !== (newKey as unknown)) {
          cleanup()
          currentKey = newKey
          mountBranch(newKey)
        }
      }

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
