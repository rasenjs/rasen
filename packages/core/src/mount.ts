/**
 * mount — renderer 无关的挂载入口
 *
 * 只是 mountable(host) 的类型安全调用。
 * effectScope 的生命周期由 com() 内部管理。
 * 宿主上下文由宿主入口（如 dom 的 mount）内部提供，用户无需感知。
 */

import type { Mountable } from './types'
import { provideHostContext, getHostContext } from './com'

export function mount<T extends object>(
  mountable: Mountable<T>,
  host: T
): (() => void) | undefined {
  // 保持当前宿主上下文（继承栈顶），不改变
  return provideHostContext(getHostContext(), () => mountable(host))
}
