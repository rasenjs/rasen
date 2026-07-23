/**
 * match - 多分支条件渲染组件
 * 
 * 直接使用 core 的 match
 * RNNode 有 appendChild，不需要 marker
 */

import { match as coreMatch, type Mountable, type PropValue } from '@rasenjs/core'
import type { RNNode } from '../node'

/**
 * match - 多分支条件渲染
 * 
 * 根据 value 的值渲染对应的分支
 * 
 * @example
 * ```ts
 * match({
 *   value: () => currentTab,
 *   cases: {
 *     home: () => HomeView(),
 *     profile: () => ProfileView(),
 *     settings: () => SettingsView(),
 *   },
 *   default: () => NotFoundView()
 * })
 * ```
 */
export function match<K extends string = string>(config: {
  value: PropValue<K | null | undefined>
  cases: Partial<Record<K, (key: K) => Mountable<RNNode>>>
  default?: () => Mountable<RNNode>
  cache?: boolean
}): Mountable<RNNode> {
  return coreMatch<RNNode, K>(config)
}

export type { PropValue }
