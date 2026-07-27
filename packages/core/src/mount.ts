/**
 * mount — renderer 无关的挂载入口
 *
 * 只是 mountable(host) 的类型安全调用。
 * effectScope 的生命周期由 com() 内部管理。
 */

import type { Mountable } from './types'

export function mount<T extends object>(
  mountable: Mountable<T>,
  host: T
): (() => void) | undefined {
  return mountable(host)
}
