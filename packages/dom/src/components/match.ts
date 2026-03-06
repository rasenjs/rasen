import {
  match as coreMatch,
  type Mountable,
  type PropValue
} from '@rasenjs/core'
import { hostHooks } from '../host-hooks'

/**
 * match component - multi-branch conditional rendering (DOM optimized)
 *
 * Provides DOM-specific optimizations on top of core match:
 * - Uses Comment nodes as markers
 * - Precise control over insertion points
 *
 * @example
 * // Basic usage
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
 * // Routing scenario
 * match({
 *   value: () => router.current?.key,
 *   cases: {
 *     home: () => HomePage(),
 *     user: (key) => UserPage({ key }),
 *   },
 *   default: () => NotFound()
 * })
 */
export function match<K extends string = string>(config: {
  /** Reactive value used for matching cases */
  value: PropValue<K | null | undefined>

  /** Branch mapping: key -> component factory */
  cases: Partial<Record<K, (key: K) => Mountable<HTMLElement>>>

  /** Default branch (when no match) */
  default?: () => Mountable<HTMLElement>

  /**
   * Whether to cache created branches
   * - false (default): destroy old branch on switch
   * - true: keep created branches, only hide/show on switch (platform support required)
   */
  cache?: boolean
}): Mountable<HTMLElement> {
  return coreMatch<HTMLElement, K, Node>({
    ...config,
    ...hostHooks
  })
}

/**
 * @deprecated Use `match` instead. Will be removed in future versions.
 */
export const switchCase = match
