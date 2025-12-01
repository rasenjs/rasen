import {
  when as coreWhen,
  type MountFunction,
  type PropValue
} from '@rasenjs/core'

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
  then: () => MountFunction<HTMLElement>
  else?: () => MountFunction<HTMLElement>
}): MountFunction<HTMLElement> {
  return coreWhen<HTMLElement, Node>({
    ...config,
    ...domHooks
  })
}

/**
 * DOM 宿主操作钩子
 */
const domHooks = {
  // 创建标记节点
  createMarker: () => document.createComment('when') as Node,

  // 将标记添加到宿主
  appendMarker: (host: HTMLElement, marker: Node) => {
    host.appendChild(marker)
  },

  // 在指定位置之前插入节点
  insertBefore: (host: HTMLElement, node: Node, before: Node | null) => {
    host.insertBefore(node, before)
  },

  // 移除标记节点
  removeMarker: (marker: Node) => {
    marker.parentNode?.removeChild(marker)
  }
}
