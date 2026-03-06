/**
 * HTML match component for SSR
 */
import { match as coreMatch, type MatchConfig, type Mountable } from '@rasenjs/core'
import { matchHostHooks } from '../host-hooks'
import type { StringHost } from '../types'

/**
 * match - multi-branch conditional rendering for SSR
 */
export function match<K extends string = string>(
  config: Omit<MatchConfig<StringHost, K>, keyof typeof matchHostHooks>
): Mountable<StringHost> {
  return coreMatch({
    ...config,
    ...matchHostHooks
  })
}

/**
 * @deprecated Use `match` instead. Will be removed in future versions.
 */
export const switchCase = match
