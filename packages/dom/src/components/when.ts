import { when as coreWhen, type Mountable, type PropValue } from '@rasenjs/core'
import { hostHooks } from '../host-hooks'

/**
 * when 组件 - 条件渲染（DOM 优化版）
 *
 * 在 core 的 when 基础上，提供 DOM 特定优化：
 * - 使用 Comment 节点作为标记
 * - 精确控制插入位置
 *
 * @example
 * // 基础用法
 * when({
 *   condition: isLoggedIn,
 *   then: () => UserPanel(),
 *   else: () => LoginForm()
 * })
 *
 * // 简化用法（无 else 分支）
 * when({
 *   condition: showDetails,
 *   then: () => DetailsPanel()
 * })
 */
export function when(config: {
  condition: PropValue<boolean>
  then: () => Mountable<HTMLElement>
  else?: () => Mountable<HTMLElement>
}): Mountable<HTMLElement> {
  return coreWhen<HTMLElement, Node>({
    ...config,
    ...hostHooks
  })
}
