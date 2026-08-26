/**
 * mount — renderer 无关的挂载入口
 *
 * mountable(node, hooks) 的类型安全调用。hooks 缺省为 undefined
 * （组件内部按能力降级）。effectScope 生命周期由 com() 内部管理。
 */

import type { Mountable, HostHooks } from './types'

export function mount<Node extends object>(
  mountable: Mountable<Node>,
  node: Node,
  hooks?: HostHooks<Node>
): (() => void) | undefined {
  return mountable(node, hooks)
}
