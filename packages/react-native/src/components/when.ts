/**
 * when - 条件渲染组件
 * 
 * 在 core 的 when 基础上，提供 RN 特定优化：
 * - 使用 RNCommentNode 作为标记
 * - 精确控制插入位置
 */

import { when as coreWhen, type Mountable, type PropValue } from '@rasenjs/core'

export type { PropValue }
import { hostHooks } from '../host-hooks'
import type { RNNode } from '../node'

/**
 * when 组件 - 条件渲染（RN 优化版）
 *
 * 在 core 的 when 基础上，提供 RN 特定优化
 *
 * @example
 * // 基础用法
 * when({
 *   condition: isLoggedIn,
 *   then: () => UserPanel(),
 *   else: () => LoginForm()
 * })
 */
export function when(config: {
  condition: PropValue<boolean>
  then: () => Mountable<RNNode>
  else?: () => Mountable<RNNode>
}): Mountable<RNNode> {
  return coreWhen<RNNode>({
    ...config,
    ...hostHooks as any
  })
}
